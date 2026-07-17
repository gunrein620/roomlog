BEGIN;

-- Both columns are nullable so existing repairs and attachments remain valid.
-- IF NOT EXISTS keeps the migration safe when a prototype database was
-- partially prepared with prisma db push before migrate deploy.
ALTER TABLE "RepairRequest"
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3);

ALTER TABLE "Attachment"
  ADD COLUMN IF NOT EXISTS "repairId" TEXT;

-- IF NOT EXISTS must not mask a hand-written or partial schema with a
-- different type/nullability. Fail closed before installing constraints.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'RepairRequest'
      AND column_name = 'startedAt'
      AND data_type = 'timestamp without time zone'
      AND datetime_precision = 3
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'RepairRequest.startedAt has an incompatible shape';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Attachment'
      AND column_name = 'repairId'
      AND data_type = 'text'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'Attachment.repairId has an incompatible shape';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "Attachment_repairId_idx"
  ON "Attachment"("repairId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Attachment_repairId_fkey'
      AND conrelid = 'public."Attachment"'::regclass
  ) THEN
    ALTER TABLE "Attachment"
      ADD CONSTRAINT "Attachment_repairId_fkey"
      FOREIGN KEY ("repairId") REFERENCES "RepairRequest"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
      NOT VALID;
  END IF;
END
$$;

-- Validate every non-null value before the migration commits. Existing rows
-- are null, while any pre-provisioned value must already reference a repair.
ALTER TABLE "Attachment"
  VALIDATE CONSTRAINT "Attachment_repairId_fkey";

CREATE OR REPLACE FUNCTION "guard_repair_started_at_immutable"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."startedAt" IS NOT NULL
     AND NEW."startedAt" IS DISTINCT FROM OLD."startedAt" THEN
    RAISE EXCEPTION 'RepairRequest.startedAt is immutable once recorded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'RepairRequest_startedAt_immutable'
      AND tgrelid = 'public."RepairRequest"'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER "RepairRequest_startedAt_immutable"
      BEFORE UPDATE OF "startedAt" ON "RepairRequest"
      FOR EACH ROW
      EXECUTE FUNCTION "guard_repair_started_at_immutable"();
  END IF;
END
$$;

COMMIT;
