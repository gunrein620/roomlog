BEGIN;

-- Take the final DDL lock up front. Repository flows that already touched the
-- order table finish before this lock is granted; newly arriving flows stop at
-- their order lookup before they can invert the request -> order lock order.
-- Acquiring a weaker order lock and upgrading it later can deadlock a writer
-- that needs ROW EXCLUSIVE while retaining its earlier order-row lock.
LOCK TABLE "RepairPaymentOrder" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "VendorPaymentRequest" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RepairPaymentOrder" AS payment_order
    LEFT JOIN "VendorPaymentRequest" AS payment_request
      ON payment_request."id" = payment_order."paymentRequestId"
    WHERE payment_request."id" IS NULL
      OR payment_order."payerRole" IS DISTINCT FROM payment_request."payerRole"
      OR payment_order."payerUserId" IS DISTINCT FROM payment_request."payerUserId"
      OR payment_order."amount" IS DISTINCT FROM payment_request."amount"
  ) THEN
    RAISE EXCEPTION 'RepairPaymentOrder integrity preflight failed: payer or amount mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RepairPaymentOrder"
    WHERE NULLIF(BTRIM("orderId"), '') IS NULL
      OR octet_length("orderId") NOT BETWEEN 1 AND 64
      OR NULLIF(BTRIM("creationKey"), '') IS NULL
      OR octet_length("creationKey") NOT BETWEEN 1 AND 128
      OR (
        "paymentKey" IS NOT NULL
        AND (
          NULLIF(BTRIM("paymentKey"), '') IS NULL
          OR octet_length("paymentKey") NOT BETWEEN 1 AND 200
        )
      )
      OR NULLIF(BTRIM("returnPath"), '') IS NULL
      OR octet_length("returnPath") NOT BETWEEN 1 AND 2048
  ) THEN
    RAISE EXCEPTION 'RepairPaymentOrder integrity preflight failed: UTF-8 length';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RepairPaymentOrder" AS child
    LEFT JOIN "RepairPaymentOrder" AS parent
      ON parent."id" = child."retryOfOrderId"
    WHERE child."retryOfOrderId" IS NOT NULL
      AND (
        child."retryOfOrderId" = child."id"
        OR parent."id" IS NULL
        OR parent."paymentRequestId" IS DISTINCT FROM child."paymentRequestId"
      )
  ) THEN
    RAISE EXCEPTION 'RepairPaymentOrder integrity preflight failed: invalid retry lineage';
  END IF;

  IF EXISTS (
    WITH RECURSIVE lineage AS (
      SELECT
        payment_order."id" AS origin_id,
        payment_order."retryOfOrderId" AS next_id,
        ARRAY[payment_order."id"]::TEXT[] AS path
      FROM "RepairPaymentOrder" AS payment_order
      WHERE payment_order."retryOfOrderId" IS NOT NULL

      UNION ALL

      SELECT
        lineage.origin_id,
        parent."retryOfOrderId" AS next_id,
        lineage.path || parent."id"
      FROM lineage
      JOIN "RepairPaymentOrder" AS parent
        ON parent."id" = lineage.next_id
      WHERE lineage.next_id IS NOT NULL
        AND NOT lineage.next_id = ANY(lineage.path)
    )
    SELECT 1
    FROM lineage
    WHERE lineage.next_id = ANY(lineage.path)
  ) THEN
    RAISE EXCEPTION 'RepairPaymentOrder integrity preflight failed: retry lineage cycle';
  END IF;
END
$$;

ALTER TABLE "RepairPaymentOrder"
  ADD CONSTRAINT "RepairPaymentOrder_orderId_utf8_length"
    CHECK (
      NULLIF(BTRIM("orderId"), '') IS NOT NULL
      AND octet_length("orderId") BETWEEN 1 AND 64
    ),
  ADD CONSTRAINT "RepairPaymentOrder_creationKey_utf8_length"
    CHECK (
      NULLIF(BTRIM("creationKey"), '') IS NOT NULL
      AND octet_length("creationKey") BETWEEN 1 AND 128
    ),
  ADD CONSTRAINT "RepairPaymentOrder_paymentKey_utf8_length"
    CHECK (
      "paymentKey" IS NULL
      OR (
        NULLIF(BTRIM("paymentKey"), '') IS NOT NULL
        AND octet_length("paymentKey") BETWEEN 1 AND 200
      )
    ),
  ADD CONSTRAINT "RepairPaymentOrder_returnPath_utf8_length"
    CHECK (
      NULLIF(BTRIM("returnPath"), '') IS NOT NULL
      AND octet_length("returnPath") BETWEEN 1 AND 2048
    ),
  ADD CONSTRAINT "RepairPaymentOrder_retry_not_self"
    CHECK (
      "retryOfOrderId" IS NULL
      OR "retryOfOrderId" <> "id"
    );

CREATE UNIQUE INDEX "RepairPaymentOrder_id_paymentRequestId_key"
  ON "RepairPaymentOrder"("id", "paymentRequestId");

ALTER TABLE "RepairPaymentOrder"
  DROP CONSTRAINT "RepairPaymentOrder_retryOfOrderId_fkey",
  ADD CONSTRAINT "RepairPaymentOrder_retryOfOrderId_paymentRequestId_fkey"
    FOREIGN KEY ("retryOfOrderId", "paymentRequestId")
    REFERENCES "RepairPaymentOrder"("id", "paymentRequestId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "assert_repair_payment_order_insert_consistency"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  request_payer_role "VendorPaymentPayerRole";
  request_payer_user_id TEXT;
  request_amount INTEGER;
  parent_payment_request_id TEXT;
BEGIN
  SELECT
    payment_request."payerRole",
    payment_request."payerUserId",
    payment_request."amount"
  INTO
    request_payer_role,
    request_payer_user_id,
    request_amount
  FROM "VendorPaymentRequest" AS payment_request
  WHERE payment_request."id" = NEW."paymentRequestId"
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RepairPaymentOrder payment request does not exist';
  END IF;

  IF NEW."payerRole" IS DISTINCT FROM request_payer_role
    OR NEW."payerUserId" IS DISTINCT FROM request_payer_user_id
    OR NEW."amount" IS DISTINCT FROM request_amount THEN
    RAISE EXCEPTION 'RepairPaymentOrder payer and amount must match payment request';
  END IF;

  IF NEW."retryOfOrderId" IS NOT NULL THEN
    IF NEW."retryOfOrderId" = NEW."id" THEN
      RAISE EXCEPTION 'RepairPaymentOrder retry parent cannot reference itself';
    END IF;

    SELECT parent."paymentRequestId"
    INTO parent_payment_request_id
    FROM "RepairPaymentOrder" AS parent
    WHERE parent."id" = NEW."retryOfOrderId";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RepairPaymentOrder retry parent does not exist';
    END IF;
    IF parent_payment_request_id IS DISTINCT FROM NEW."paymentRequestId" THEN
      RAISE EXCEPTION 'RepairPaymentOrder retry parent must belong to the same payment request';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "RepairPaymentOrder_insert_consistency_guard"
BEFORE INSERT ON "RepairPaymentOrder"
FOR EACH ROW EXECUTE FUNCTION "assert_repair_payment_order_insert_consistency"();

CREATE FUNCTION "protect_repair_payment_order_identity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."paymentRequestId" IS DISTINCT FROM OLD."paymentRequestId"
    OR NEW."payerRole" IS DISTINCT FROM OLD."payerRole"
    OR NEW."payerUserId" IS DISTINCT FROM OLD."payerUserId"
    OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
    OR NEW."creationKey" IS DISTINCT FROM OLD."creationKey"
    OR NEW."payloadHash" IS DISTINCT FROM OLD."payloadHash"
    OR NEW."retryOfOrderId" IS DISTINCT FROM OLD."retryOfOrderId"
    OR NEW."flow" IS DISTINCT FROM OLD."flow"
    OR NEW."amount" IS DISTINCT FROM OLD."amount"
    OR NEW."returnPath" IS DISTINCT FROM OLD."returnPath"
    OR NEW."initiatedBy" IS DISTINCT FROM OLD."initiatedBy"
    OR NEW."confirmationId" IS DISTINCT FROM OLD."confirmationId"
    OR NEW."toolCallId" IS DISTINCT FROM OLD."toolCallId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'RepairPaymentOrder identity is immutable';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "RepairPaymentOrder_identity_immutable"
BEFORE UPDATE OF
  "id",
  "paymentRequestId",
  "payerRole",
  "payerUserId",
  "orderId",
  "creationKey",
  "payloadHash",
  "retryOfOrderId",
  "flow",
  "amount",
  "returnPath",
  "initiatedBy",
  "confirmationId",
  "toolCallId",
  "createdAt"
ON "RepairPaymentOrder"
FOR EACH ROW EXECUTE FUNCTION "protect_repair_payment_order_identity"();

COMMIT;
