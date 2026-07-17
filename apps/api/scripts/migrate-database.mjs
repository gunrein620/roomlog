import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "../../..");
const apiRoot = join(repositoryRoot, "apps/api");
const prismaExecutable = join(apiRoot, "node_modules/.bin/prisma");
const migrationsRoot = join(repositoryRoot, "prisma/migrations");
const baselinePath = join(
  repositoryRoot,
  "apps/api/src/roomlog/fixtures/pre-vendor-catalog-baseline.sql"
);
// 마이그레이션 카탈로그 계약은 PostgreSQL 18 메이저 기준 — 18.3 이상, 19 미만을 허용한다.
// 정확 핀(=== 180003)은 RDS 마이너 자동 패치(예: 18.4)만으로 다음 배포가 깨지는 지뢰라 범위로 완화.
const MIN_POSTGRES_SERVER_VERSION_NUM = 180003;
const EXCLUSIVE_MAX_POSTGRES_SERVER_VERSION_NUM = 190000;

export const assertSupportedPostgresVersion = (serverVersionNum) => {
  const version = Number(serverVersionNum);
  if (
    !Number.isFinite(version) ||
    version < MIN_POSTGRES_SERVER_VERSION_NUM ||
    version >= EXCLUSIVE_MAX_POSTGRES_SERVER_VERSION_NUM
  ) {
    throw new Error(
      `Migration catalog contract requires PostgreSQL 18.3+ (18.x, server_version_num in [180003, 190000)); connected server reports ${serverVersionNum}`
    );
  }
};

const enforceCatalogContract = async (client) => {
  const version = await client.query(
    `SELECT current_setting('server_version_num') AS server_version_num`
  );
  assertSupportedPostgresVersion(version.rows[0]?.server_version_num);
  await client.query(`SET search_path = public`);
};

export const BASELINE_MIGRATIONS = Object.freeze([
  "20260703000000_add_messaging_domain",
  "20260703005000_add_contract_domain",
  "20260703010000_add_moveout_domain",
  "20260703020000_add_report_domain",
  "20260704000000_add_cost_domain",
  "20260704010000_add_vendor_mgmt_domain",
  "20260707000000_add_splat_asset",
  "20260709000000_add_billing_item_payments",
  "20260709000000_add_trade_listing",
  "20260710000000_add_trade_listing_detail_address",
  "20260711000000_link_bills_to_rooms",
  "20260711010000_backfill_bill_room_links"
]);

const BASELINE_POSTCONDITIONS = Object.freeze([
  {
    migration: BASELINE_MIGRATIONS[0],
    sql: `
      SELECT
        to_regclass('public."MessagingThread"') IS NOT NULL
        AND to_regclass('public."MessagingMessage"') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pg_type
          WHERE typname = 'MessagingThreadContext'
            AND typnamespace = 'public'::regnamespace
        ) AS ok
    `
  },
  {
    migration: BASELINE_MIGRATIONS[1],
    sql: `
      SELECT
        to_regclass('public."Contract"') IS NOT NULL
        AND to_regclass('public."ContractDocument"') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'Contract_roomId_fkey'
        ) AS ok
    `
  },
  {
    migration: BASELINE_MIGRATIONS[2],
    sql: `
      SELECT
        to_regclass('public."MoveoutRequest"') IS NOT NULL
        AND to_regclass('public."MoveoutSettlement"') IS NOT NULL
        AND to_regclass('public."MoveoutDispute"') IS NOT NULL AS ok
    `
  },
  {
    migration: BASELINE_MIGRATIONS[3],
    sql: `
      SELECT
        to_regclass('public."ManagerReport"') IS NOT NULL
        AND to_regclass('public."ManagerReportExternalShare"') IS NOT NULL
        AND to_regclass('public."ManagerReportAuditLogEntry"') IS NOT NULL AS ok
    `
  },
  {
    migration: BASELINE_MIGRATIONS[4],
    sql: `
      SELECT
        to_regclass('public."Receipt"') IS NOT NULL
        AND to_regclass('public."Cost"') IS NOT NULL
        AND to_regclass('public."ReceiptOcr"') IS NOT NULL AS ok
    `
  },
  {
    migration: BASELINE_MIGRATIONS[5],
    sql: `
      SELECT
        to_regclass('public."VendorProfile"') IS NOT NULL
        AND to_regclass('public."VendorInvite"') IS NOT NULL AS ok
    `
  },
  {
    migration: BASELINE_MIGRATIONS[6],
    sql: `
      SELECT
        to_regclass('public."SplatAsset"') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'SplatAsset_roomId_fkey'
        ) AS ok
    `
  },
  {
    migration: BASELINE_MIGRATIONS[7],
    sql: `
      SELECT
        to_regclass('public."BillPaymentTransaction"') IS NOT NULL
        AND to_regclass('public."BillPaymentAllocation"') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'BillLineItem'
            AND column_name = 'kind'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'BillLineItem'
            AND column_name = 'paidAmount'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'Deposit'
            AND column_name = 'paymentTransactionId'
        ) AS ok
    `
  },
  {
    migration: BASELINE_MIGRATIONS[8],
    sql: `SELECT to_regclass('public."TradeListing"') IS NOT NULL AS ok`
  },
  {
    migration: BASELINE_MIGRATIONS[9],
    sql: `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'TradeListing'
          AND column_name = 'detailAddress'
      ) AS ok
    `
  },
  {
    migration: BASELINE_MIGRATIONS[10],
    sql: `
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'Bill'
            AND column_name = 'roomId'
        )
        AND EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'Bill_roomId_fkey'
        )
        AND to_regclass('public."Bill_roomId_billingMonth_idx"') IS NOT NULL AS ok
    `
  },
  {
    migration: BASELINE_MIGRATIONS[11],
    sql: `
      WITH candidates AS (
        SELECT bill."id", COUNT(*)::INTEGER AS candidate_count
        FROM "Bill" AS bill
        JOIN "Room" AS room
          ON bill."roomId" IS NULL
          AND (
            TRIM(bill."unitId") = room."id"
            OR REGEXP_REPLACE(TRIM(bill."unitId"), '[[:space:]]*호[[:space:]]*$', '', 'g') =
               REGEXP_REPLACE(TRIM(room."roomNo"), '[[:space:]]*호[[:space:]]*$', '', 'g')
          )
        GROUP BY bill."id"
      )
      SELECT NOT EXISTS (
        SELECT 1 FROM candidates WHERE candidate_count = 1
      ) AS ok
    `
  }
]);

const POST_BASELINE_ARTIFACTS = Object.freeze([
  {
    migration: "20260714100000_vendor_catalog_activation",
    types: ["VendorVerificationStatus", "VendorAccountRole", "VendorAccountLinkStatus", "VendorActivationStatus"],
    columns: [
      ["VendorProfile", "businessNumber"],
      ["VendorProfile", "trades"],
      ["VendorProfile", "serviceAreas"],
      ["VendorProfile", "verificationStatus"],
      ["VendorProfile", "isActive"]
    ],
    relations: ["VendorAccountLink", "VendorActivation"],
    indexes: [
      "VendorActivation_keyHash_key",
      "VendorAccountLink_vendorId_status_idx",
      "VendorAccountLink_userId_status_idx",
      "VendorActivation_vendorId_status_expiresAt_idx",
      "VendorActivation_claimedByUserId_idx",
      "VendorAccountLink_one_active_owner_per_vendor",
      "VendorAccountLink_one_active_vendor_per_user"
    ],
    predicates: [`SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'VendorProfile'
        AND column_name = 'userId' AND is_nullable = 'YES'
    ) AS present`]
  },
  {
    migration: "20260714101000_vendor_account_link_authority",
    predicates: [`SELECT to_regclass('public."VendorProfile"') IS NOT NULL
      AND (
        to_regclass('public."VendorProfile_userId_key"') IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'VendorProfile'
            AND column_name = 'userId'
        )
      ) AS present`]
  },
  {
    migration: "20260714110000_vendor_workflow",
    types: [
      "AttachmentOrigin", "ManagerVendorStatus", "VendorEstimateResponseType",
      "VendorEstimateStatus", "VendorEstimateLineItemCategory", "VendorWorkflowRecordOrigin",
      "RepairCompletionDecisionSource", "RepairCompletionDecisionValue",
      "VendorPaymentRequestStatus", "VendorPaymentAttemptMode", "VendorPaymentAuditEventType",
      "DomainEventDeliveryConsumer", "DomainEventDeliveryState", "RoomlogDomainEventType"
    ],
    columns: [["Attachment", "origin"]],
    relations: [
      "ManagerVendor", "VendorEstimate", "VendorEstimateLineItem", "VendorCompletionReport",
      "VendorCompletionReportAttachment", "RepairCompletionDecision", "VendorPaymentRequest",
      "VendorPaymentAuditEvent", "DomainEventOutbox", "DomainEventDelivery"
    ],
    functions: [
      "assert_vendor_workflow_consistency", "protect_vendor_payment_request_identity",
      "validate_vendor_estimate_aggregate", "protect_payment_estimate_snapshot",
      "prevent_workflow_evidence_mutation", "protect_completion_evidence_attachment",
      "guard_domain_event_delivery"
    ],
    predicates: [`SELECT to_regclass('public."VendorProfile"') IS NOT NULL
      AND (
        to_regclass('public."VendorProfile_createdByManagerId_idx"') IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'VendorProfile'
            AND column_name = 'createdByManagerId'
        )
      ) AS present`]
  },
  {
    migration: "20260714120000_vendor_credit",
    types: [
      "CreditLedgerEntryType", "CreditTopupOrderStatus", "AutoPayPolicyMode",
      "VendorPaymentAttemptStatus", "VendorPaymentCommandType"
    ],
    relations: [
      "CreditAccount", "CreditLedgerEntry", "CreditTopupOrder", "AutoPayPolicy",
      "VendorPaymentAttempt", "VendorPaymentCommandReceipt"
    ],
    functions: ["guard_credit_ledger_reversal", "guard_credit_ledger_append_only"]
  },
  {
    migration: "20260715120000_vendor_completion_scope",
    columns: [["RepairRequest", "startedAt"], ["Attachment", "repairId"]],
    indexes: ["Attachment_repairId_idx"],
    constraints: ["Attachment_repairId_fkey"],
    functions: ["guard_repair_started_at_immutable"],
    triggers: ["RepairRequest_startedAt_immutable"]
  },
  {
    migration: "20260715130000_vendor_direct_payment_evidence",
    columns: [
      ["VendorPaymentRequest", "directPaidAt"],
      ["VendorPaymentRequest", "directPaymentReference"]
    ],
    constraints: ["VendorPaymentRequest_direct_payment_evidence_check"]
  },
  {
    migration: "20260715140000_repair_payment_orders",
    enumLabels: [
      ["VendorPaymentRequestStatus", "TOSS_PAID"],
      ["VendorPaymentAttemptMode", "TOSS"],
      ["VendorPaymentAuditEventType", "TOSS_PAID"]
    ],
    types: ["VendorPaymentPayerRole", "RepairPaymentFlow", "RepairPaymentInitiator", "RepairPaymentOrderStatus"],
    columns: [["VendorPaymentRequest", "payerRole"], ["VendorPaymentRequest", "payerUserId"]],
    relations: ["RepairPaymentOrder"],
    indexes: ["VendorPaymentRequest_payerRole_payerUserId_status_createdAt_idx"],
    constraints: ["VendorPaymentRequest_payerUserId_fkey"],
    functions: ["assert_vendor_payment_request_payer_consistency"],
    triggers: ["VendorPaymentRequest_payer_consistency_guard"],
    predicates: [`SELECT EXISTS (
      SELECT 1 FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = 'protect_vendor_payment_request_identity'
        AND pg_get_functiondef(procedure.oid) LIKE '%payerRole%'
        AND pg_get_functiondef(procedure.oid) LIKE '%payerUserId%'
    ) AS present`]
  },
  {
    migration: "20260715141000_repair_payment_order_retry_lineage",
    columns: [["RepairPaymentOrder", "retryOfOrderId"]],
    indexes: ["RepairPaymentOrder_retryOfOrderId_idx"],
    constraints: ["RepairPaymentOrder_retryOfOrderId_fkey"]
  },
  {
    migration: "20260715142000_repair_payment_order_integrity",
    constraints: [
      "RepairPaymentOrder_orderId_utf8_length", "RepairPaymentOrder_creationKey_utf8_length",
      "RepairPaymentOrder_paymentKey_utf8_length", "RepairPaymentOrder_returnPath_utf8_length",
      "RepairPaymentOrder_retry_not_self", "RepairPaymentOrder_retryOfOrderId_paymentRequestId_fkey"
    ],
    indexes: ["RepairPaymentOrder_id_paymentRequestId_key"],
    functions: ["assert_repair_payment_order_insert_consistency", "protect_repair_payment_order_identity"],
    triggers: ["RepairPaymentOrder_insert_consistency_guard", "RepairPaymentOrder_identity_immutable"],
    predicates: [`SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'RepairPaymentOrder'
        AND column_name = 'retryOfOrderId'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_constraint AS catalog_constraint
      JOIN pg_class AS owner ON owner.oid = catalog_constraint.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = owner.relnamespace
      WHERE namespace.nspname = 'public' AND owner.relname = 'RepairPaymentOrder'
        AND catalog_constraint.conname = 'RepairPaymentOrder_retryOfOrderId_fkey'
    ) AS present`]
  },
  {
    migration: "20260717100000_trade_listing_current_tenant_room",
    indexes: ["TenantRoom_tenantId_key"]
  }
]);

// PostgreSQL 18.3 canonical pg_get_* output with search_path=public (which
// keeps PostgreSQL's implicit pg_catalog lookup first), whitespace-normalized
// then SHA-256.
// Pinning the complete server definition catches action, order, predicate, event,
// watched-column, and function-body changes that fragment matching cannot detect.
const REQUIRED_FINAL_CONSTRAINTS = Object.freeze({
  RepairPaymentOrder_amount_positive: { tableName: "RepairPaymentOrder", sha256: "f29c0697fa8c8ea84dfe2b019f02834ea9471dd45db984311c1c82d17490ffc3" },
  RepairPaymentOrder_creationKey_utf8_length: { tableName: "RepairPaymentOrder", sha256: "1e3f270c481590b0d2cbd3c5e1705ddb78eccc797c8957883b111a1de9b90443" },
  RepairPaymentOrder_open_key_shape: { tableName: "RepairPaymentOrder", sha256: "db071ab0d34377333d09df11c7cd2eb66facd705b83e9e68772b6289a40cc000" },
  RepairPaymentOrder_orderId_utf8_length: { tableName: "RepairPaymentOrder", sha256: "40f963530ed1217e6816bf1cf88914c2289ca92d3a3c41081565f03cc7517f30" },
  RepairPaymentOrder_payerUserId_fkey: { tableName: "RepairPaymentOrder", sha256: "e141dc188c2e12657e2d5dc9159b46f87c542352cf38fabd7d3cdd53b06c235f" },
  RepairPaymentOrder_payloadHash_sha256: { tableName: "RepairPaymentOrder", sha256: "d2369f0345b1220c432b98512ef2a4bfc42431c789a496f9801c84430f2a4248" },
  RepairPaymentOrder_paymentKey_utf8_length: { tableName: "RepairPaymentOrder", sha256: "5158fab8a16819139e630ca9f4a27ab4de8a248cf1e0ab82cbe48a66f3d3c8fe" },
  RepairPaymentOrder_paymentRequestId_fkey: { tableName: "RepairPaymentOrder", sha256: "13c2f37b68e4c2228c38e4afbd7cf6cfcd6186e44ecf06d82ac0fe0cbe5ecf07" },
  RepairPaymentOrder_retry_not_self: { tableName: "RepairPaymentOrder", sha256: "60f5f66c9464197e6d3e005bfc9a3d29c90de64241babba9ec80dd54a80cc873" },
  RepairPaymentOrder_retryOfOrderId_paymentRequestId_fkey: { tableName: "RepairPaymentOrder", sha256: "df5cff902ec65cf1700c8cdbae5d8503ff936ce0b1b333976640f6d0ca0b0f55" },
  RepairPaymentOrder_returnPath_utf8_length: { tableName: "RepairPaymentOrder", sha256: "701efb8f680eaefba2b0960af4802bb692e89a3d702bb4ed048a4c7fb5a05f31" },
  RepairPaymentOrder_state_shape: { tableName: "RepairPaymentOrder", sha256: "2389de0661680a236fb8421b3e9639ca5b9873752761294faf3d2b865a34a7e2" },
  VendorPaymentRequest_payerUserId_fkey: { tableName: "VendorPaymentRequest", sha256: "e141dc188c2e12657e2d5dc9159b46f87c542352cf38fabd7d3cdd53b06c235f" }
});

const REQUIRED_FINAL_INDEXES = Object.freeze({
  RepairPaymentOrder_creationKey_key: { tableName: "RepairPaymentOrder", sha256: "d9f12f02f2c64bc2e3ea9eca97c20b4254897f4e7ba84749c14ce995fce3209a" },
  RepairPaymentOrder_id_paymentRequestId_key: { tableName: "RepairPaymentOrder", sha256: "c6ac3a228914301f7d793d86638bec99a755abb9798ba37d46e98b6f38f4ec58" },
  RepairPaymentOrder_openOrderKey_key: { tableName: "RepairPaymentOrder", sha256: "f291c1c8ffe7c6808ecf3c52306ff2b38171fb1e8f7b6bab426a2cb41e6db79a" },
  RepairPaymentOrder_orderId_key: { tableName: "RepairPaymentOrder", sha256: "52fbcc58c82234ff588223a304e1d61ab02e73122fe22fe849368cd8acf34158" },
  RepairPaymentOrder_payerRole_payerUserId_status_updatedAt_idx: { tableName: "RepairPaymentOrder", sha256: "006b4d7a866bdb6cb59962242b330625f11c517e1f7fdcaa514f036906b0c799" },
  RepairPaymentOrder_paymentKey_key: { tableName: "RepairPaymentOrder", sha256: "20cce0518ce6962394911b80d05a87065a353d50f5a3420c8c5a138d47ccaa3a" },
  RepairPaymentOrder_paymentRequestId_status_updatedAt_idx: { tableName: "RepairPaymentOrder", sha256: "ca385ba4c5bd00ce27ef503c908bf5134e7c51f6a5da234b07f8d34c48b58861" },
  RepairPaymentOrder_retryOfOrderId_idx: { tableName: "RepairPaymentOrder", sha256: "2c371bb59f319659d6c4bda3566d2141595b4e24fb1e944d927862684d2f8b8b" },
  VendorPaymentRequest_payerRole_payerUserId_status_createdAt_idx: { tableName: "VendorPaymentRequest", sha256: "54116c1df861bed5a33bb39d1a3f0ba2d1aa5d700ca14a365133dd19c34ae25d" }
});

const REQUIRED_FINAL_TRIGGERS = Object.freeze({
  RepairPaymentOrder_identity_immutable: { tableName: "RepairPaymentOrder", sha256: "af11938f4d049773727f1f033556c6a25334e239b653acff137e8cbf202a4be4" },
  RepairPaymentOrder_insert_consistency_guard: { tableName: "RepairPaymentOrder", sha256: "e089a3a97fafbd098397f0b76c983c3374845c03e0f9c78b9200ace3962689f5" },
  VendorPaymentRequest_identity_immutable: { tableName: "VendorPaymentRequest", sha256: "b252bbcc6e16329b8071cf40826339e6bb2c84280bedaf14cfb155271077fb82" },
  VendorPaymentRequest_payer_consistency_guard: { tableName: "VendorPaymentRequest", sha256: "72e6838741e2d5a5aaad23bbe71e9946feac8f5c41dbb382a11db5dece64d096" }
});

const REQUIRED_FINAL_FUNCTIONS = Object.freeze({
  assert_repair_payment_order_insert_consistency: { sha256: "5cd2330f7951fffa8242c8dce6c728558051c299da6e52fe795ac9fac7600cad" },
  assert_vendor_payment_request_payer_consistency: { sha256: "5cfc40fa00030976a4532e4781f97d1dea6094a800be92a374d52f89b2ead785" },
  protect_repair_payment_order_identity: { sha256: "72c812c882f6c2dd4858828a01e606d64ce99773ad6ada688d9c34c56b6a71e5" },
  protect_vendor_payment_request_identity: { sha256: "a669e63e780d7647556863a416a1163a3ab1687d76e7a0bfe445cbe78a7fdf13" }
});

export const analyzeMigrationHistory = (migrations, ledgerRows) => {
  if (ledgerRows.length > migrations.length) {
    throw new Error("Migration ledger contains unknown or duplicate migrations");
  }

  const migrationByName = new Map(migrations.map((migration) => [migration.name, migration]));
  const appliedNames = new Set();
  for (const row of ledgerRows) {
    const migration = migrationByName.get(row.migration_name);
    if (!migration) {
      throw new Error(`Migration ledger contains unknown migration: ${row.migration_name}`);
    }
    if (appliedNames.has(row.migration_name)) {
      throw new Error(`Migration ledger contains duplicate migration: ${row.migration_name}`);
    }
    if (!row.finished_at || row.rolled_back_at || row.logs) {
      throw new Error(`Migration ${row.migration_name} is failed or incomplete`);
    }
    if (row.checksum !== migration.checksum) {
      throw new Error(`Migration ${row.migration_name} checksum mismatch`);
    }
    appliedNames.add(row.migration_name);
  }

  return {
    applied: migrations.filter(({ name }) => appliedNames.has(name)),
    pending: migrations.filter(({ name }) => !appliedNames.has(name))
  };
};

export const redactSensitiveText = (value) =>
  String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/((?:"password"|'password'|password)\s*[:=]\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/((?:"password"|'password'|password)\s*[:=]\s*)'[^']*'/gi, "$1'[REDACTED]'")
    .replace(/(password\s*[:=]\s*)[^\s'"`]+/gi, "$1[REDACTED]");

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

const pgConnectionString = (databaseUrl) => {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
};

const targetDatabaseName = (databaseUrl) => {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!databaseName || ["postgres", "template0", "template1"].includes(databaseName)) {
    throw new Error("DATABASE_URL must name a non-system target database");
  }
  return databaseName;
};

const isLocalDatabaseHost = (hostname) =>
  ["localhost", "127.0.0.1", "::1", "[::1]", "postgres"].includes(hostname);

const createTargetDatabase = async (databaseUrl) => {
  const url = new URL(databaseUrl);
  if (!isLocalDatabaseHost(url.hostname)) {
    throw new Error("Opt-in database creation is restricted to the local Docker environment");
  }

  const databaseName = targetDatabaseName(databaseUrl);
  url.pathname = `/${process.env.ROOMLOG_MIGRATION_ADMIN_DATABASE || "postgres"}`;
  url.searchParams.delete("schema");
  const adminClient = new Client({ connectionString: url.toString() });
  await adminClient.connect();
  try {
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } catch (error) {
    if (error?.code !== "42P04") throw error;
  } finally {
    await adminClient.end();
  }
};

const connectTargetDatabase = async (databaseUrl) => {
  const connect = async () => {
    const client = new Client({ connectionString: pgConnectionString(databaseUrl) });
    await client.connect();
    return client;
  };

  try {
    return await connect();
  } catch (error) {
    const createAllowed = process.env.ROOMLOG_MIGRATION_CREATE_DATABASE === "true";
    if (error?.code !== "3D000" || !createAllowed) throw error;
    await createTargetDatabase(databaseUrl);
    return connect();
  }
};

const loadRepositoryMigrations = async () => {
  const names = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const migrations = await Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(migrationsRoot, name, "migration.sql"));
      return {
        name,
        checksum: createHash("sha256").update(sql).digest("hex")
      };
    })
  );

  const baselinePrefix = migrations.slice(0, BASELINE_MIGRATIONS.length).map(({ name }) => name);
  if (JSON.stringify(baselinePrefix) !== JSON.stringify(BASELINE_MIGRATIONS)) {
    throw new Error("Frozen baseline migration list is not the repository migration prefix");
  }
  return migrations;
};

const ledgerTableExists = async (client) =>
  (await client.query(`SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS exists`))
    .rows[0].exists;

const readMigrationLedger = async (client) => {
  if (!(await ledgerTableExists(client))) return [];
  return (
    await client.query(`
      SELECT migration_name, checksum, finished_at, rolled_back_at, logs
      FROM public."_prisma_migrations"
      ORDER BY started_at, migration_name
    `)
  ).rows;
};

const hasUserObjects = async (client) => {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_namespace AS namespace
      WHERE namespace.nspname <> 'public'
        AND namespace.nspname <> 'information_schema'
        AND namespace.nspname <> 'pg_catalog'
        AND namespace.nspname !~ '^pg_toast'
        AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname <> 'information_schema'
        AND namespace.nspname <> 'pg_catalog'
        AND namespace.nspname !~ '^pg_toast'
        AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1
      FROM pg_type AS type
      JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
      WHERE namespace.nspname <> 'information_schema'
        AND namespace.nspname <> 'pg_catalog'
        AND namespace.nspname !~ '^pg_toast'
        AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname <> 'information_schema'
        AND namespace.nspname <> 'pg_catalog'
        AND namespace.nspname !~ '^pg_toast'
        AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_collation AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.collnamespace
      WHERE namespace.nspname NOT IN ('information_schema', 'pg_catalog')
        AND namespace.nspname !~ '^pg_toast' AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_conversion AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.connamespace
      WHERE namespace.nspname NOT IN ('information_schema', 'pg_catalog')
        AND namespace.nspname !~ '^pg_toast' AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_operator AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.oprnamespace
      WHERE namespace.nspname NOT IN ('information_schema', 'pg_catalog')
        AND namespace.nspname !~ '^pg_toast' AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_opclass AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.opcnamespace
      WHERE namespace.nspname NOT IN ('information_schema', 'pg_catalog')
        AND namespace.nspname !~ '^pg_toast' AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_opfamily AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.opfnamespace
      WHERE namespace.nspname NOT IN ('information_schema', 'pg_catalog')
        AND namespace.nspname !~ '^pg_toast' AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_ts_config AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.cfgnamespace
      WHERE namespace.nspname NOT IN ('information_schema', 'pg_catalog')
        AND namespace.nspname !~ '^pg_toast' AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_ts_dict AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.dictnamespace
      WHERE namespace.nspname NOT IN ('information_schema', 'pg_catalog')
        AND namespace.nspname !~ '^pg_toast' AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_ts_parser AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.prsnamespace
      WHERE namespace.nspname NOT IN ('information_schema', 'pg_catalog')
        AND namespace.nspname !~ '^pg_toast' AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_ts_template AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.tmplnamespace
      WHERE namespace.nspname NOT IN ('information_schema', 'pg_catalog')
        AND namespace.nspname !~ '^pg_toast' AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_statistic_ext AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.stxnamespace
      WHERE namespace.nspname NOT IN ('information_schema', 'pg_catalog')
        AND namespace.nspname !~ '^pg_toast' AND namespace.nspname !~ '^pg_temp_'
      UNION ALL
      SELECT 1 FROM pg_publication
      UNION ALL
      SELECT 1 FROM pg_subscription
      WHERE subdbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      UNION ALL
      SELECT 1 FROM pg_event_trigger
      UNION ALL
      SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql'
      UNION ALL
      SELECT 1 FROM pg_foreign_data_wrapper
      UNION ALL
      SELECT 1 FROM pg_foreign_server
      UNION ALL
      SELECT 1 FROM pg_user_mappings
      UNION ALL
      SELECT 1 FROM pg_largeobject_metadata
      UNION ALL
      SELECT 1 FROM pg_default_acl
      UNION ALL
      SELECT 1 FROM pg_cast WHERE oid >= 16384
      UNION ALL
      SELECT 1 FROM pg_transform WHERE oid >= 16384
      UNION ALL
      SELECT 1 FROM pg_language
      WHERE lanname NOT IN ('internal', 'c', 'sql', 'plpgsql')
      UNION ALL
      SELECT 1 FROM pg_am WHERE oid >= 16384
      UNION ALL
      SELECT 1 FROM pg_db_role_setting
      WHERE setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
    ) AS exists
  `);
  return result.rows[0].exists;
};

const baselinePostconditions = async (client) => {
  const results = [];
  for (const postcondition of BASELINE_POSTCONDITIONS) {
    try {
      const result = await client.query(postcondition.sql);
      results.push({ migration: postcondition.migration, ok: result.rows[0]?.ok === true });
    } catch {
      results.push({ migration: postcondition.migration, ok: false });
    }
  }
  return results;
};

const verifyBaselinePostconditions = async (client) => {
  const results = await baselinePostconditions(client);
  const failed = results.filter(({ ok }) => !ok).map(({ migration }) => migration);
  if (failed.length > 0) {
    throw new Error(`Frozen baseline postconditions failed: ${failed.join(", ")}`);
  }
};

const anyNamedCatalogObject = async (client, catalog, names) => {
  if (!names?.length) return false;
  const queries = {
    relation: `SELECT EXISTS (
      SELECT 1 FROM pg_class AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
      WHERE namespace.nspname = 'public' AND object.relname = ANY($1::text[])
    ) AS present`,
    type: `SELECT EXISTS (
      SELECT 1 FROM pg_type AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.typnamespace
      WHERE namespace.nspname = 'public' AND object.typname = ANY($1::text[])
    ) AS present`,
    index: `SELECT EXISTS (
      SELECT 1 FROM pg_class AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
      WHERE namespace.nspname = 'public' AND object.relkind = 'i'
        AND object.relname = ANY($1::text[])
    ) AS present`,
    constraint: `SELECT EXISTS (
      SELECT 1 FROM pg_constraint AS object
      JOIN pg_class AS owner ON owner.oid = object.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = owner.relnamespace
      WHERE namespace.nspname = 'public' AND object.conname = ANY($1::text[])
    ) AS present`,
    function: `SELECT EXISTS (
      SELECT 1 FROM pg_proc AS object
      JOIN pg_namespace AS namespace ON namespace.oid = object.pronamespace
      WHERE namespace.nspname = 'public' AND object.proname = ANY($1::text[])
    ) AS present`,
    trigger: `SELECT EXISTS (
      SELECT 1 FROM pg_trigger AS object
      JOIN pg_class AS owner ON owner.oid = object.tgrelid
      JOIN pg_namespace AS namespace ON namespace.oid = owner.relnamespace
      WHERE namespace.nspname = 'public' AND NOT object.tgisinternal
        AND object.tgname = ANY($1::text[])
    ) AS present`
  };
  const result = await client.query(queries[catalog], [names]);
  return result.rows[0]?.present === true;
};

const anyColumns = async (client, columns) => {
  for (const [table, column] of columns || []) {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      ) AS present
    `, [table, column]);
    if (result.rows[0]?.present === true) return true;
  }
  return false;
};

const anyEnumLabels = async (client, labels) => {
  for (const [typeName, label] of labels || []) {
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum AS enum_value
        JOIN pg_type AS type ON type.oid = enum_value.enumtypid
        JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
        WHERE namespace.nspname = 'public' AND type.typname = $1
          AND enum_value.enumlabel = $2
      ) AS present
    `, [typeName, label]);
    if (result.rows[0]?.present === true) return true;
  }
  return false;
};

const migrationArtifactPresent = async (client, artifact) => {
  if (await anyEnumLabels(client, artifact.enumLabels)) return true;
  if (await anyNamedCatalogObject(client, "type", artifact.types)) return true;
  if (await anyColumns(client, artifact.columns)) return true;
  if (await anyNamedCatalogObject(client, "relation", artifact.relations)) return true;
  if (await anyNamedCatalogObject(client, "index", artifact.indexes)) return true;
  if (await anyNamedCatalogObject(client, "constraint", artifact.constraints)) return true;
  if (await anyNamedCatalogObject(client, "function", artifact.functions)) return true;
  if (await anyNamedCatalogObject(client, "trigger", artifact.triggers)) return true;
  for (const sql of artifact.predicates || []) {
    const result = await client.query(sql);
    if (result.rows[0]?.present === true) return true;
  }
  return false;
};

const detectPendingArtifacts = async (client, pendingNames) => {
  const pending = new Set(pendingNames);
  const detected = [];
  for (const artifact of POST_BASELINE_ARTIFACTS) {
    if (!pending.has(artifact.migration)) continue;
    if (await migrationArtifactPresent(client, artifact)) detected.push(artifact.migration);
  }
  return detected;
};

const runPrisma = (args, databaseUrl) => {
  const result = spawnSync(
    prismaExecutable,
    [...args, "--config", "prisma.config.mjs"],
    {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf8"
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostic = redactSensitiveText(`${result.stdout || ""}\n${result.stderr || ""}`).trim();
    throw new Error(`Prisma migration command failed${diagnostic ? `: ${diagnostic}` : ""}`);
  }
};

const resolveBaselineMigrations = async (client, databaseUrl, migrations, fromIndex) => {
  for (const migration of migrations.slice(fromIndex, BASELINE_MIGRATIONS.length)) {
    runPrisma(["migrate", "resolve", "--applied", migration.name], databaseUrl);
    const ledger = await readMigrationLedger(client);
    analyzeMigrationHistory(migrations, ledger);
  }
};

const installFrozenBaseline = async (client) => {
  const baseline = await readFile(baselinePath, "utf8");
  await client.query("BEGIN");
  try {
    await client.query(baseline);
    await verifyBaselinePostconditions(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const catalogDefinitionFingerprint = (definition) =>
  createHash("sha256")
    .update(String(definition).replace(/\s+/g, " ").trim())
    .digest("hex");

const assertCatalogDefinitions = (kind, rows, required) => {
  for (const [name, expectation] of Object.entries(required)) {
    const row = rows.find(
      (candidate) =>
        candidate.name === name &&
        (expectation.tableName === undefined || candidate.table_name === expectation.tableName)
    );
    if (!row) throw new Error(`Required ${kind} is missing: ${name}`);
    if (catalogDefinitionFingerprint(row.definition) !== expectation.sha256) {
      throw new Error(`Required ${kind} definition mismatch: ${name}`);
    }
  }
};

export const verifyFinalInvariants = async (client) => {
  const constraints = await client.query(`
    SELECT catalog_constraint.conname AS name, owner.relname AS table_name,
      pg_get_constraintdef(catalog_constraint.oid, false) AS definition
    FROM pg_constraint AS catalog_constraint
    JOIN pg_class AS owner ON owner.oid = catalog_constraint.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = owner.relnamespace
    WHERE namespace.nspname = 'public'
      AND catalog_constraint.conname = ANY($1::text[])
  `, [Object.keys(REQUIRED_FINAL_CONSTRAINTS)]);
  assertCatalogDefinitions("constraint", constraints.rows, REQUIRED_FINAL_CONSTRAINTS);

  const indexes = await client.query(`
    SELECT index_relation.relname AS name, owner.relname AS table_name,
      pg_get_indexdef(index_relation.oid) AS definition
    FROM pg_index AS catalog_index
    JOIN pg_class AS index_relation ON index_relation.oid = catalog_index.indexrelid
    JOIN pg_class AS owner ON owner.oid = catalog_index.indrelid
    JOIN pg_namespace AS namespace ON namespace.oid = owner.relnamespace
    WHERE namespace.nspname = 'public'
      AND index_relation.relname = ANY($1::text[])
  `, [Object.keys(REQUIRED_FINAL_INDEXES)]);
  assertCatalogDefinitions("index", indexes.rows, REQUIRED_FINAL_INDEXES);

  const triggers = await client.query(`
    SELECT catalog_trigger.tgname AS name, owner.relname AS table_name,
      pg_get_triggerdef(catalog_trigger.oid, false) AS definition
    FROM pg_trigger AS catalog_trigger
    JOIN pg_class AS owner ON owner.oid = catalog_trigger.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = owner.relnamespace
    WHERE namespace.nspname = 'public'
      AND NOT catalog_trigger.tgisinternal
      AND catalog_trigger.tgname = ANY($1::text[])
  `, [Object.keys(REQUIRED_FINAL_TRIGGERS)]);
  assertCatalogDefinitions("trigger", triggers.rows, REQUIRED_FINAL_TRIGGERS);

  const functions = await client.query(`
    SELECT procedure.proname AS name, pg_get_functiondef(procedure.oid) AS definition
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.prokind = 'f'
      AND procedure.pronargs = 0
      AND procedure.proname = ANY($1::text[])
  `, [Object.keys(REQUIRED_FINAL_FUNCTIONS)]);
  assertCatalogDefinitions("function", functions.rows, REQUIRED_FINAL_FUNCTIONS);

  const retiredRetryConstraint = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint AS catalog_constraint
      JOIN pg_class AS owner ON owner.oid = catalog_constraint.conrelid
      JOIN pg_namespace AS namespace ON namespace.oid = owner.relnamespace
      WHERE namespace.nspname = 'public'
        AND owner.relname = 'RepairPaymentOrder'
        AND catalog_constraint.conname = 'RepairPaymentOrder_retryOfOrderId_fkey'
    ) AS exists
  `);
  if (retiredRetryConstraint.rows[0].exists) {
    throw new Error("Retired retry lineage foreign key is still present");
  }
};

export const runDatabaseBootstrap = async (databaseUrl = process.env.DATABASE_URL) => {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  targetDatabaseName(databaseUrl);

  const migrations = await loadRepositoryMigrations();
  const client = await connectTargetDatabase(databaseUrl);
  let lockHeld = false;
  try {
    await enforceCatalogContract(client);
    await client.query(
      "SELECT pg_advisory_lock(hashtextextended('roomlog-safe-migrations-v1', 0))"
    );
    lockHeld = true;

    let ledger = await readMigrationLedger(client);
    let history = analyzeMigrationHistory(migrations, ledger);
    const userObjectsExist = await hasUserObjects(client);

    if (ledger.length === 0 && !userObjectsExist) {
      await installFrozenBaseline(client);
      await resolveBaselineMigrations(client, databaseUrl, migrations, 0);
      ledger = await readMigrationLedger(client);
      history = analyzeMigrationHistory(migrations, ledger);
    } else if (ledger.length === 0) {
      throw new Error(
        "Nonempty database has no trusted migration ledger; in-place adoption is deferred"
      );
    } else if (
      BASELINE_MIGRATIONS.some(
        (name) => !history.applied.some((migration) => migration.name === name)
      )
    ) {
      throw new Error(
        "Partial frozen baseline ledger is not safe to resume; in-place adoption is deferred"
      );
    }

    const pendingNames = history.pending.map(({ name }) => name);
    const artifacts = await detectPendingArtifacts(client, pendingNames);
    if (artifacts.length > 0) {
      throw new Error(
        `Pending migration artifacts already exist; refusing mutation: ${artifacts.join(", ")}`
      );
    }

    const alreadyCurrent = history.pending.length === 0;
    if (!alreadyCurrent) {
      runPrisma(["migrate", "deploy"], databaseUrl);
    }

    const finalLedger = await readMigrationLedger(client);
    const finalHistory = analyzeMigrationHistory(migrations, finalLedger);
    if (finalHistory.pending.length > 0) {
      throw new Error("Migration ledger does not contain every repository migration");
    }
    await verifyFinalInvariants(client);

    console.log(
      alreadyCurrent
        ? "Database migrations already current."
        : "Database migrations applied and verified."
    );
  } finally {
    if (lockHeld) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended('roomlog-safe-migrations-v1', 0))"
        );
      } catch {
        // Closing the session releases the advisory lock even if unlock fails.
      }
    }
    await client.end();
  }
};

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(currentFile);
if (invokedDirectly) {
  runDatabaseBootstrap().catch((error) => {
    console.error(`Migration bootstrap failed: ${redactSensitiveText(error?.message || error)}`);
    process.exitCode = 1;
  });
}
