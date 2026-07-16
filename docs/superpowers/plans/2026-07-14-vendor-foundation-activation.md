# Vendor Catalog and Account Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 `vendorId`와 수리 이력을 보존하면서 업체 회사 원장과 로그인 계정을 분리하고, 운영측이 DB에 준비한 등록 키로 업체 전용 계정을 원자적·멱등하게 활성화한다.

**Architecture:** Prisma의 기존 `VendorProfile` row를 전역 catalog로 유지하되 필수 `userId` 결합을 제거하고 `VendorAccountLink`를 인증 capability의 유일한 출처로 만든다. 등록 키 미리보기는 해시 조회 후 짧은 서명 activation session을 발급하고, claim은 `VendorActivation ISSUED→CLAIMED`와 active OWNER link 생성을 하나의 awaited Prisma transaction으로 수행한다. 기존 store/projector는 catalog read 호환만 담당하며 account link를 복제하거나 쓰지 않는다. `/auth/me`와 모든 vendor endpoint는 awaited `VendorAccountResolver`를 사용해 claim 직후에도 재시작 없이 권한을 확인한다.

**Tech Stack:** TypeScript, `@roomlog/types`, NestJS Roomlog module, Prisma/PostgreSQL, Next.js 16 App Router, React, Node test runner, Docker Compose

## Global Constraints

- 먼저 `docs/superpowers/plans/2026-07-14-vendor-credit-delivery-master.md`의 baseline gate를 완료한다.
- foundation은 배포 안전성을 위해 두 migration으로 고정하고 과거 vendor migration을 수정하지 않는다.
  - `prisma/migrations/20260714100000_vendor_catalog_activation/migration.sql`: link/activation 생성과 backfill, 구 `userId` nullable compatibility 유지
  - `prisma/migrations/20260714101000_vendor_account_link_authority/migration.sql`: 런타임 전환 뒤 구 `userId` 제거
- 기존 `VendorProfile.id`는 그대로 `vendorId`로 사용한다. Ticket/RepairRequest FK와 기존 작업 이력을 재키잉하지 않는다.
- `VendorProfile`은 Prisma 모델 이름으로만 유지할 수 있다. 공유 API 타입에는 `VendorCatalogRecord`, `VendorAccountView`를 사용하고 같은 이름의 새 `VendorProfile`을 만들지 않는다.
- 업체 capability는 ACTIVE `VendorAccountLink`에서만 파생한다. 저장된 legacy `role=VENDOR`만으로 권한을 복구하지 않는다. 이 변경으로 기존 TENANT/LANDLORD compatibility fallback까지 제거하지 않는다.
- 동기 `deriveUserRoles()`/`rolesForUser()`는 VENDOR 권한을 부여하지 않는다. vendor 전용 API guard와 `getMe()`만 direct async resolver를 await하며, 활성 link를 RoomlogStore에 권한 캐시로 복제하지 않는다.
- 세입자 또는 관리인 capability가 있는 계정은 claim을 차단한다. 전용 업체 계정 생성은 기존 SEEKER identity를 만든 뒤 link가 VENDOR capability를 파생하는 방식으로 구현한다.
- activation 원문 키를 DB, 로그, URL, `returnTo`, client storage에 저장하지 않는다. DB에는 key hash만 저장한다.
- claim은 직접 awaited Prisma transaction을 사용한다. 먼저 in-memory user signup을 했다면 `RoomlogService.flushPersistence()`를 await한 뒤 claim한다.
- projector는 `VendorAccountLink`와 `VendorActivation`을 load/upsert하지 않는다. legacy link backfill은 migration 100000만 수행하며 stale store가 DB의 CLAIMED/DISABLED 상태를 만들거나 되돌릴 수 없어야 한다.
- read-only 업체 미리보기만 안전한 데모 표시를 허용한다. 실제 key preview/claim mutation에는 데모 성공 fallback을 두지 않는다.
- vendor/tenant 화면은 `PhoneFrame`과 기존 통합 로그인 스타일을 유지하고 모든 새 CSS 값은 `var(--...)`를 사용한다.
- 이 슬라이스에서 `ManagerVendor`, 견적, 크레딧, AI 책임 판단을 구현하지 않는다.
- 기존 `VendorInvite` table은 과거 migration 안정성을 위해 이번 슬라이스에서 삭제하지 않지만 모든 생성·수락 API와 UI를 은퇴시켜 신규 write가 없게 한다. 데이터 삭제는 별도 cleanup 범위다.

---

## File Structure

- `packages/types/src/vendor.ts`: catalog, account link, activation API의 canonical 공유 계약.
- `prisma/migrations/20260714100000_vendor_catalog_activation/migration.sql`: link/activation 생성, legacy backfill, 부분 유일 인덱스, old `userId` nullable compatibility.
- `prisma/migrations/20260714101000_vendor_account_link_authority/migration.sql`: 모든 consumer 전환 뒤 old `VendorProfile.userId` 제거.
- `apps/api/src/roomlog/vendor-activation.repository.ts`: activation 영속성 port.
- `apps/api/src/roomlog/prisma-vendor-activation.repository.ts`: PostgreSQL claim transaction과 query 구현.
- `apps/api/src/roomlog/services/vendor-activation-security.ts`: key hash, constant-time compare 대상, 서명 activation session.
- `apps/api/src/roomlog/services/roomlog-vendor-activation.domain.ts`: preview/claim 정책.
- `apps/api/src/roomlog/scripts/seed-vendor-foundation.ts`: 발표용 catalog/account/key 시드.
- `apps/web/src/lib/vendor-activation.ts`: activation client model과 validated return path.
- `apps/web/src/app/api/vendor/activation/preview/route.ts`: raw key를 server BFF에서 처리하고 HttpOnly session cookie 발급.
- `apps/web/src/app/api/vendor/activation/claim/route.ts`: authenticated claim BFF.
- `apps/web/src/app/vendor/page.tsx`: linked/unlinked/cross-role entry gate.
- `apps/web/src/app/vendor/activate/page.tsx`: activation server shell.
- `apps/web/src/app/vendor/activate/VendorActivationFlow.tsx`: key→preview→auth→claim UI.

---

### Task 1: Define canonical vendor and activation contracts

**Files:**
- Create: `packages/types/src/vendor.ts`
- Create: `apps/api/src/roomlog/vendor-activation.contract.spec.ts`
- Modify: `packages/types/src/index.ts`
- Preserve: `packages/types/src/vendor-mgmt.ts`

**Interfaces:**
- Produces: `VendorCatalogRecord`, `VendorAccountLinkRecord`, `VendorAccountView`, `VendorActivationPreview`, `VendorActivationPreviewEnvelope`, `VendorActivationClaimResult`, `VendorActivationErrorCode`, `VendorActivationErrorResponse`
- Produces enums/unions: `VendorVerificationStatus`, `VendorAccountRole`, `VendorAccountLinkStatus`, `VendorAccountStatus`, `VendorActivationStatus`

- [ ] **Step 1: Write the failing runtime-shape contract test**

Create an API-package compile/runtime fixture that imports every new public contract from `@roomlog/types` and validates the presentation-safe preview shape:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  VendorActivationPreview,
  VendorCatalogRecord,
  VendorAccountView,
} from "@roomlog/types";

test("vendor activation preview exposes no key or internal account id", () => {
  const preview: VendorActivationPreview = {
    activationSessionExpiresAt: "2026-07-14T12:05:00.000Z",
    vendor: {
      vendorId: "vendor-plumbing-01",
      businessName: "집우 배관",
      trades: ["PLUMBING"],
      serviceAreas: ["서울 마포구"],
      maskedPhone: "010-****-1234",
      verificationStatus: "VERIFIED",
    },
  };
  assert.equal("rawKey" in preview, false);
  assert.equal("keyHash" in preview, false);
  assert.equal("userId" in preview.vendor, false);
});
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-activation.contract.spec.ts
pnpm --filter @roomlog/types typecheck
```

Expected: FAIL because `vendor.ts` and its exports do not exist.

- [ ] **Step 3: Add the exact canonical contracts**

```ts
export type VendorVerificationStatus = "VERIFIED" | "PENDING" | "REJECTED";
export type VendorAccountRole = "OWNER";
export type VendorAccountLinkStatus = "ACTIVE" | "DISABLED";
export type VendorActivationStatus = "ISSUED" | "CLAIMED" | "EXPIRED" | "REVOKED";
export type VendorAccountStatus = "LINKED" | "UNLINKED" | "DISABLED";

export interface VendorCatalogRecord {
  id: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  businessNumber?: string;
  trades: string[];
  serviceAreas: string[];
  verificationStatus: VendorVerificationStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorAccountLinkRecord {
  id: string;
  vendorId: string;
  userId: string;
  role: VendorAccountRole;
  status: VendorAccountLinkStatus;
  linkedAt: string;
}

export interface VendorAccountView {
  vendor: VendorCatalogRecord;
  accountStatus: VendorAccountStatus;
  role?: VendorAccountRole;
}

export interface VendorActivationPreview {
  activationSessionExpiresAt: string;
  vendor: {
    vendorId: string;
    businessName: string;
    trades: string[];
    serviceAreas: string[];
    verificationStatus: VendorVerificationStatus;
    maskedPhone: string;
  };
}

/** API → server BFF only. The BFF stores activationSession in an HttpOnly cookie. */
export interface VendorActivationPreviewEnvelope {
  preview: VendorActivationPreview;
  activationSession: string;
}

export interface VendorActivationClaimResult {
  vendor: VendorAccountView;
  idempotent: boolean;
  nextPath: "/vendor/job/00";
}

export type VendorActivationErrorCode =
  | "INVALID_KEY"
  | "EXPIRED_KEY"
  | "UNAVAILABLE_VENDOR"
  | "ALREADY_CLAIMED"
  | "DEDICATED_ACCOUNT_REQUIRED"
  | "ACCOUNT_ALREADY_LINKED"
  | "ACTIVATION_UNAVAILABLE";

export interface VendorActivationErrorResponse {
  code: VendorActivationErrorCode;
  message: string;
}
```

Do not export a raw key, key hash, claimed user ID, full contact phone, or activation database ID to web.

- [ ] **Step 4: Run GREEN with source typecheck and API consumer compilation**

```bash
pnpm --filter @roomlog/types typecheck
pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-activation.contract.spec.ts
```

Expected: new contracts pass the source-exported `@roomlog/types` typecheck and compile through the API consumer fixture. This package has no build/dist contract.

- [ ] **Step 5: Commit the contract slice**

```bash
git add packages/types/src/vendor.ts packages/types/src/index.ts apps/api/src/roomlog/vendor-activation.contract.spec.ts
git commit -m "feat(vendor): define catalog activation contracts"
```

---

### Task 2: Migrate the vendor catalog and account-link schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260714100000_vendor_catalog_activation/migration.sql`
- Create: `apps/api/src/roomlog/fixtures/pre-vendor-catalog-baseline.sql`
- Create: `apps/api/src/roomlog/vendor-catalog-migration.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog-support.ts`
- Modify: `apps/api/src/roomlog/prisma-store-projector.ts`
- Modify: `apps/api/src/roomlog/prisma-store-projector.spec.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-repair.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Produces Prisma models: existing `VendorProfile` as catalog with temporary nullable `userId`, new `VendorAccountLink`, new `VendorActivation`
- Produces partial unique constraints: active OWNER per vendor, active vendor link per user

- [ ] **Step 1: Write a failing migration integration spec**

The spec seeds these legacy rows before applying/asserting the migration behavior:

1. real VENDOR-only account profile;
2. profile whose account also has TENANT/LANDLORD relationships;
3. profiles whose account has only stored `TENANT` or `LANDLORD` compatibility role and no relation row;
4. `userId = manual:<vendorId>` profile;
5. service area text and missing trade data.

Require:

```ts
assert.equal(realLink.status, "ACTIVE");
assert.equal(crossRoleLink.status, "DISABLED");
assert.equal(storedTenantOnlyLink.status, "DISABLED");
assert.equal(storedLandlordOnlyLink.status, "DISABLED");
assert.equal(manualVendorLinks.length, 0);
assert.equal(manualVendor.verificationStatus, "PENDING");
assert.deepEqual(existingAreaVendor.serviceAreas, ["서울 마포구"]);
assert.deepEqual(unclassifiedVendor.trades, []);
```

Also execute concurrent inserts and assert PostgreSQL rejects a second ACTIVE OWNER for one vendor and a second ACTIVE vendor link for one user.

The repository was originally baselined with `prisma db push`; its checked-in historical migrations do not create the core `UserAccount` and `Room` tables and cannot be replayed from an empty database. Do not rewrite that global history in this slice. Freeze the exact pre-Task-2 schema from commit `501a49b0` as `fixtures/pre-vendor-catalog-baseline.sql`. The spec must use `node:child_process.spawnSync` to:

1. require `ROOMLOG_VENDOR_MIGRATION_TEST_DATABASE_URL` and a decoded database name ending in `_test`;
2. drop/recreate only that dedicated database through the same server's `postgres` database;
3. remove only Prisma's `schema=public` query parameter from the copy passed to `psql`, then apply the frozen baseline with `ON_ERROR_STOP=1`;
4. mark every sorted migration directory strictly before `20260714100000_vendor_catalog_activation` as applied with `prisma migrate resolve --applied` without executing its SQL;
5. insert the legacy fixtures;
6. run `prisma migrate deploy`, which must execute only the real 100000 migration;
7. instantiate `PrismaClient` against the scratch URL only after deploy.

Use a database such as `roomlog_vendor_catalog_test`, never shared `roomlog_test`, `DATABASE_URL`, or the development database. This mirrors the project's actual db-push baseline while exercising Prisma migration bookkeeping and the real target SQL.

- [ ] **Step 2: Run RED on a migrated Postgres schema**

```bash
docker compose up -d postgres
ROOMLOG_VENDOR_MIGRATION_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_vendor_catalog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-catalog-migration.spec.ts
```

Expected: FAIL because the models, migration, and constraints do not exist.

- [ ] **Step 3: Extend Prisma without changing stable vendor IDs**

Add catalog fields to existing `VendorProfile`:

```prisma
businessNumber      String?
trades              String[]                 @default([])
serviceAreas        String[]                 @default([])
verificationStatus VendorVerificationStatus @default(PENDING)
isActive            Boolean                  @default(true)
accountLinks        VendorAccountLink[]
activations         VendorActivation[]
```

Keep `VendorProfile.userId` temporarily as nullable compatibility after the first migration. Add these exact models and the matching `UserAccount` back-relations; all stable vendor IDs remain unchanged:

```prisma
enum VendorVerificationStatus { VERIFIED PENDING REJECTED }
enum VendorAccountRole { OWNER }
enum VendorAccountLinkStatus { ACTIVE DISABLED }
enum VendorActivationStatus { ISSUED CLAIMED EXPIRED REVOKED }

model VendorAccountLink {
  id       String                  @id
  vendorId String
  userId   String
  role     VendorAccountRole       @default(OWNER)
  status   VendorAccountLinkStatus @default(ACTIVE)
  linkedAt DateTime                @default(now())
  vendor   VendorProfile           @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  user     UserAccount             @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@index([vendorId, status])
  @@index([userId, status])
}

model VendorActivation {
  id              String                 @id
  vendorId        String
  keyHash         String                 @unique
  status          VendorActivationStatus @default(ISSUED)
  expiresAt       DateTime
  claimedByUserId String?
  claimedAt       DateTime?
  createdAt       DateTime               @default(now())
  vendor          VendorProfile          @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  claimedByUser   UserAccount?            @relation(fields: [claimedByUserId], references: [id], onDelete: Restrict)

  @@index([vendorId, status, expiresAt])
  @@index([claimedByUserId])
}
```

Add `vendorAccountLinks VendorAccountLink[]` and `claimedVendorActivations VendorActivation[]` to `UserAccount`. Keep historical DISABLED links non-unique; use raw SQL partial indexes:

```sql
CREATE UNIQUE INDEX "VendorAccountLink_one_active_owner_per_vendor"
ON "VendorAccountLink" ("vendorId")
WHERE "role" = 'OWNER' AND "status" = 'ACTIVE';

CREATE UNIQUE INDEX "VendorAccountLink_one_active_vendor_per_user"
ON "VendorAccountLink" ("userId")
WHERE "status" = 'ACTIVE';
```

- [ ] **Step 4: Implement safe migration order**

Wrap the full target SQL in explicit `BEGIN`/`COMMIT`. The migration order is fixed:

1. add catalog columns with safe defaults;
2. create `VendorAccountLink` and `VendorActivation`;
3. copy normal real users to ACTIVE links;
4. copy cross-role users to DISABLED links;
5. drop only the legacy `VendorProfile.userId` NOT NULL constraint while retaining `VendorProfile_userId_key`;
6. set `manual:*` profiles' old `userId` to NULL, leave them unlinked, and set `PENDING`;
7. verify every non-manual old user reference has exactly one link, raising an exception to roll back the entire migration otherwise;
8. create partial unique indexes;
9. keep `createdByManagerId`, `serviceArea`, and active-work compatibility fields until workflow migration 110000 consumes them.

Use SQL predicates matching runtime `deriveUserRoles()`: a link is DISABLED when actual tenant/manager relations **or** stored compatibility role `TENANT`/`LANDLORD` grants either capability. Never classify from relation rows alone, and never let a stored `VENDOR` value bypass the new link status.

- [ ] **Step 5: Keep the temporary legacy runtime null-safe**

Until Task 5 removes the legacy scalar authority, change `VendorSummary.userId` and `UserRoleRelations.vendors[].userId` to optional. Project DB NULL as `undefined`, persist missing IDs as SQL NULL, and never recreate `manual:<vendorId>`. `deriveUserRoles()` must grant no relation-derived VENDOR capability for a missing ID. The two legacy vendor message paths must reject a profile without a linked actor user instead of writing a vendor ID as a message actor. Add focused projector/service regression tests proving a manual catalog row stays NULL after load/persist and cannot gain VENDOR capability or emit a vendor-user message.

- [ ] **Step 6: Run Prisma generation and GREEN migration tests**

```bash
pnpm db:generate
ROOMLOG_VENDOR_MIGRATION_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_vendor_catalog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-catalog-migration.spec.ts
pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/prisma-store-projector.spec.ts \
  src/roomlog/roomlog.service.spec.ts
bash scripts/verify.sh
```

Expected: backfill and both partial-index competition tests pass; the manual catalog row remains accountless through projection; the full repository gate remains green. Do not run `prisma migrate reset --force`: the pre-existing migration history is intentionally baselined and not replayable from empty.

- [ ] **Step 7: Commit the migration and compatibility seam**

```bash
git add prisma/schema.prisma prisma/migrations/20260714100000_vendor_catalog_activation/migration.sql apps/api/src/roomlog/fixtures/pre-vendor-catalog-baseline.sql apps/api/src/roomlog/vendor-catalog-migration.spec.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog-support.ts apps/api/src/roomlog/prisma-store-projector.ts apps/api/src/roomlog/prisma-store-projector.spec.ts apps/api/src/roomlog/services/roomlog-vendor-repair.domain.ts apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "feat(vendor): separate catalog from accounts"
```

---

### Task 3: Implement activation security and direct Prisma repository

**Files:**
- Create: `apps/api/src/roomlog/vendor-activation.repository.ts`
- Create: `apps/api/src/roomlog/prisma-vendor-activation.repository.ts`
- Create: `apps/api/src/roomlog/prisma-vendor-activation.repository.spec.ts`
- Create: `apps/api/src/roomlog/services/vendor-activation-security.ts`
- Create: `apps/api/src/roomlog/services/vendor-activation-security.spec.ts`

**Interfaces:**

```ts
export interface VendorActivationRepository {
  getByKeyHash(keyHash: string): Promise<VendorActivationRecord | undefined>;
  getById(activationId: string): Promise<VendorActivationRecord | undefined>;
  getActiveAccountLink(userId: string): Promise<VendorAccountLinkRecord | undefined>;
  claim(input: {
    activationId: string;
    userId: string;
    now: Date;
  }): Promise<{
    link: VendorAccountLinkRecord;
    vendor: VendorCatalogRecord;
    idempotent: boolean;
  }>;
  close(): Promise<void>;
}

export interface VendorActivationRecord {
  id: string;
  vendorId: string;
  keyHash: string;
  status: VendorActivationStatus;
  expiresAt: Date;
  claimedByUserId?: string;
  claimedAt?: Date;
  createdAt: Date;
}

export interface VendorAccountResolver {
  resolveActiveVendorId(userId: string): Promise<string | undefined>;
  resolveActiveVendorAccount(userId: string): Promise<VendorAccountView | undefined>;
}

export interface VendorActivationSessionClaims {
  activationId: string;
  keyFingerprint: string;
  expiresAt: string;
}

export type VendorActivationRepositoryErrorCode = Extract<
  VendorActivationErrorCode,
  "INVALID_KEY" | "EXPIRED_KEY" | "ALREADY_CLAIMED" | "ACCOUNT_ALREADY_LINKED"
>;

export class VendorActivationRepositoryError extends Error {
  constructor(readonly code: VendorActivationRepositoryErrorCode, message: string) {
    super(message);
  }
}
```

- [ ] **Step 1: Write RED security tests**

Require these exact pure helper contracts:

```ts
export interface VendorActivationSecurityConfig {
  keyPepper: string;
  sessionSecret: string;
}

export function loadVendorActivationSecurityConfig(
  env: NodeJS.ProcessEnv
): VendorActivationSecurityConfig | undefined;
export function normalizeActivationKey(rawKey: string): string;
export function hashActivationKey(rawKey: string, pepper: string): string;
export function activationKeyFingerprint(keyHash: string, sessionSecret: string): string;
export function verifyActivationKeyFingerprint(
  keyHash: string,
  claimedFingerprint: string,
  sessionSecret: string
): boolean;
export function signActivationSession(
  input: { activationId: string; keyHash: string; now: Date },
  sessionSecret: string
): { token: string; claims: VendorActivationSessionClaims };
export function verifyActivationSession(
  token: string,
  sessionSecret: string,
  now: Date
): VendorActivationSessionClaims;
```

`normalizeActivationKey()` uppercases ASCII letters and removes only ASCII hyphen plus ASCII whitespace. It rejects empty values, `_`, `/`, arbitrary punctuation, and Unicode lookalikes instead of silently deleting them. `hashActivationKey()` uses HMAC-SHA-256 with a non-empty pepper and must never equal the normalized raw key. `activationKeyFingerprint()` is HMAC-SHA-256 over the stored `keyHash` with domain separation `vendor-activation-key:` and the session secret; `verifyActivationKeyFingerprint()` recomputes and uses equal-length `timingSafeEqual`. Task 4 calls it after `getById()` so a rotated/replaced activation row invalidates an old session. `signActivationSession()` derives `expiresAt = now + 5 minutes` itself, signs base64url JSON with domain separation `vendor-activation-session:`, and returns both token and claims. Session verification also uses equal-length `timingSafeEqual`, validates the exact claims shape/ISO timestamp, and rejects `expiresAt <= now`.

```ts
assert.equal(hashActivationKey("jipju-vnd-7k9m-4q2x", pepper), hashActivationKey("JIPJUVND7K9M4Q2X", pepper));
assert.throws(() => normalizeActivationKey("JIPJU_VND_7K9M"));
assert.equal(session.claims.expiresAt, "2026-07-14T12:05:00.000Z");
assert.throws(() => verifyActivationSession(tampered, secret, now));
assert.throws(() => verifyActivationSession(expired, secret, now));
```

- [ ] **Step 2: Write RED repository concurrency tests**

Cover:

- same activation + same user returns the same link with `idempotent=true`;
- same activation + two different users concurrently has exactly one winner;
- expired/revoked/claimed-by-other records cannot create links;
- user with active link cannot claim another vendor;
- vendor with an ACTIVE OWNER cannot get a second owner;
- transaction rollback leaves both activation and link unchanged.

The repository spec must query `pg_indexes` before the race tests and require both exact Task 2 partial-index names. To prove post-insert rollback without a production test hook, install a test-only database trigger that raises on the target `VendorActivation` update, invoke `claim()`, then drop the trigger in `finally`; assert the activation remains `ISSUED` and no link row exists. Do not add `afterLinkInsertedForTest` or another test-only branch to production code.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/services/vendor-activation-security.spec.ts \
  src/roomlog/prisma-vendor-activation.repository.spec.ts
```

Expected: FAIL because repository and security modules do not exist.

- [ ] **Step 4: Implement security helpers with explicit configuration**

Use `VENDOR_ACTIVATION_KEY_PEPPER` for one-way key lookup and `VENDOR_ACTIVATION_SESSION_SECRET` for the five-minute signed session. `loadVendorActivationSecurityConfig()` trims both values, returns both only when complete, throws when either is missing under non-test `NODE_ENV=production`, and returns `undefined` in non-production when configuration is incomplete. It must not read or validate environment at module import time; Task 4 calls it from the Nest options factory after `.env` loading. Tests inject deterministic secrets. Never log either secret or the raw key.

- [ ] **Step 5: Implement the claim transaction**

`PrismaVendorActivationRepository.claim()` must execute one `$transaction` that:

1. reads activation and current link state;
2. treats same `claimedByUserId` + existing active link as idempotent success;
3. verifies `ISSUED` and `expiresAt > now` for a first claim;
4. inserts the ACTIVE OWNER link;
5. conditionally updates activation where `id` and `status=ISSUED`;
6. requires exactly one updated activation row;
7. returns catalog + link after commit.

Convert known partial-index and CAS conflicts to domain conflict codes; do not catch all DB errors as “invalid key”.

Use `randomUUID()` for link IDs and one owned `PrismaClient` constructed with `PrismaPg`; `close()` disconnects it. The exact repository error mapping is:

- missing activation → `INVALID_KEY`;
- `expiresAt <= now` → `EXPIRED_KEY`;
- REVOKED or CLAIMED by another user → `ALREADY_CLAIMED`;
- same claimed user plus the same ACTIVE vendor link → idempotent success;
- claimant already linked ACTIVE to another vendor → `ACCOUNT_ALREADY_LINKED`;
- vendor already has another ACTIVE OWNER or activation CAS count is zero → `ALREADY_CLAIMED`.

Catch only Prisma `P2002` from the attempted link insert. Re-query the active user link and active vendor owner after rollback: map the observed user conflict to `ACCOUNT_ALREADY_LINKED`, the observed vendor conflict to `ALREADY_CLAIMED`, and rethrow the original P2002 if neither state explains it. Rethrow P2003, connectivity/timeouts, unknown P2002 targets, and all programmer errors unchanged.

- [ ] **Step 6: Run GREEN with Postgres**

```bash
docker compose up -d postgres
ROOMLOG_VENDOR_MIGRATION_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_vendor_catalog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-catalog-migration.spec.ts
ROOMLOG_VENDOR_MIGRATION_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_vendor_catalog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/services/vendor-activation-security.spec.ts \
  src/roomlog/prisma-vendor-activation.repository.spec.ts
```

The first command deterministically rebuilds the dedicated database through the real Task 2 migration. The repository spec fails fast with a precise setup error if either partial index is missing; `db:test:push` alone is never accepted as proof of these constraints.

- [ ] **Step 7: Commit repository and security**

```bash
git add apps/api/src/roomlog/vendor-activation.repository.ts apps/api/src/roomlog/prisma-vendor-activation.repository.ts apps/api/src/roomlog/prisma-vendor-activation.repository.spec.ts apps/api/src/roomlog/services/vendor-activation-security.ts apps/api/src/roomlog/services/vendor-activation-security.spec.ts
git commit -m "feat(vendor): add atomic activation repository"
```

---

### Task 4: Add activation domain rules and controller boundary

**Files:**
- Create: `apps/api/src/roomlog/services/roomlog-vendor-activation.domain.ts`
- Create: `apps/api/src/roomlog/services/roomlog-vendor-activation.domain.spec.ts`
- Modify: `apps/api/src/roomlog/vendor-activation.repository.ts`
- Modify: `apps/api/src/roomlog/prisma-vendor-activation.repository.ts`
- Modify: `apps/api/src/roomlog/prisma-vendor-activation.repository.spec.ts`
- Modify: `apps/api/src/roomlog/services/vendor-activation-security.ts`
- Modify: `apps/api/src/roomlog/services/vendor-activation-security.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Modify: `apps/api/src/roomlog/roomlog.module.ts`
- Modify: `apps/api/src/roomlog/roomlog.module.spec.ts`
- Modify: `.env.example`
- Create: `apps/api/src/roomlog/unavailable-vendor-activation.repository.ts`

**Interfaces:**

```ts
export class RoomlogVendorActivationDomain {
  preview(rawKey: string): Promise<VendorActivationPreviewEnvelope>;
  claim(userId: string, activationSession: string): Promise<VendorActivationClaimResult>;
}

export class RoomlogService {
  previewVendorActivation(rawKey: string): Promise<VendorActivationPreviewEnvelope>;
  claimVendorActivation(userId: string, activationSession: string): Promise<VendorActivationClaimResult>;
  resolveActiveVendorId(userId: string): Promise<string | undefined>;
  resolveActiveVendorAccount(userId: string): Promise<VendorAccountView | undefined>;
}

export interface VendorActivationAccountContext {
  user: UserAccount;
  relations: UserRoleRelations;
}
```

API routes:

```text
POST /auth/vendor-activations/preview  { key }
POST /auth/vendor-activations/claim    { activationSession } + Bearer session
```

- [ ] **Step 1: Close the live-catalog and session-classification seams with RED tests**

`Store.vendors` is a legacy projection and must not supply activation preview data. Extend `VendorActivationRecord` with a required `vendor: VendorCatalogRecord`; make both repository reads join the live Prisma `VendorProfile`. Add repository tests proving full mapping of `trades`, `serviceAreas`, `verificationStatus`, and `isActive`.

Add `UNAVAILABLE_VENDOR` to `VendorActivationRepositoryErrorCode`. Inside the same claim transaction, reject `vendor.isActive=false` or `verificationStatus=REJECTED` before link insertion. Test the preview-to-claim TOCTOU case by changing catalog availability after preview and proving no link or claim mutation occurs. `PENDING` remains claimable for this prototype.

Add a typed security verification error with reason `INVALID_SESSION | EXPIRED_SESSION`; session parsing/signature failures use `INVALID_SESSION`, while `expiresAt <= now` uses `EXPIRED_SESSION`. Preserve the existing public-safe messages and add exact reason tests. Do not classify errors by matching message strings.

- [ ] **Step 2: Write failing domain tests**

Test exact error outcomes for malformed, unknown, expired, revoked, claimed-by-other, inactive catalog, and rejected catalog. Revoked maps to `INVALID_KEY`; expired activation/session maps to `EXPIRED_KEY`. A valid preview must return masked phone and a short-lived activation session; it must not change DB status. Pin phone masking as `010-****-5678` for an 11-digit Korean mobile and a last-four generic mask for other usable values. Before repository mutation, claim must call the same non-vendor capability policy as auth and reject TENANT/LANDLORD granted either by relation rows or stored compatibility role. Add stored-role-only TENANT and LANDLORD regression cases.

Inject an account-context loader returning the current user plus the same live relation snapshot used by auth; call `deriveUserRoles()` and remove only VENDOR before evaluating TENANT/LANDLORD. Do not duplicate role derivation or read a user ID from the request. Only `ACTIVE` users may claim; `INVITED`/`DISABLED` claimants receive `DEDICATED_ACCOUNT_REQUIRED` without repository mutation.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/services/roomlog-vendor-activation.domain.spec.ts
```

Expected: FAIL because the domain class is absent.

- [ ] **Step 4: Implement domain policy with stable error codes**

Use codes consumable by web without leaking whether an unrelated user's account exists:

```ts
const error: VendorActivationErrorResponse = {
  code: "DEDICATED_ACCOUNT_REQUIRED",
  message: "업체 전용 계정으로 다시 진행해 주세요."
};
```

The preview hashes the normalized key, loads the activation plus its joined live vendor by hash, validates current status/catalog availability without mutation, and returns only public confirmation fields plus the signed session produced from the stored activation ID/key hash. It never consults legacy `Store.vendors` for catalog fields. Claim verifies the signed session, loads the current activation plus vendor through `getById()`, and calls `verifyActivationKeyFingerprint(current.keyHash, claims.keyFingerprint, sessionSecret)` before any mutation; mismatch is `INVALID_KEY`. It then loads the authenticated user and relations, evaluates `deriveUserRoles(user, relations)` (excluding any VENDOR result), and rejects if the resulting capabilities include TENANT or LANDLORD. It never accepts a user ID from the request body.

Use a typed domain failure carrying only `VendorActivationErrorResponse`. Map `INVALID_KEY` to 400, `EXPIRED_KEY` to 410, all catalog/conflict/account-policy codes to 409, and `ACTIVATION_UNAVAILABLE` to 503. Never expose the raw key, hash, fingerprint, activation ID, user ID, or account-link ID.

- [ ] **Step 5: Delegate through RoomlogService and wire repository provider**

Call `loadVendorActivationSecurityConfig(env)` inside `createRoomlogServiceOptions()` before constructing resources—never at module import time. Instantiate exactly one `PrismaVendorActivationRepository` only when `DATABASE_URL` and a complete security config are present, and pass that same instance plus config to the activation domain/account resolver through `RoomlogServiceOptions`. Construct it only after `storeProjector.load()` succeeds, or close every already-created resource if the factory fails. Missing secrets under non-test `NODE_ENV=production` fail this options factory before Nest starts. When runtime DB configuration or non-production security configuration is absent, inject `UnavailableVendorActivationRepository`, whose repository reads/claim and account-resolution methods all throw a stable 503 `ACTIVATION_UNAVAILABLE`; its `close()` is a no-op and it must never manufacture a successful preview or claim. The service/domain must check unavailable configuration before hashing/signing rather than using dummy secrets. Domain unit tests inject deterministic fakes/config directly without registering them in a runtime module. Add empty `VENDOR_ACTIVATION_KEY_PEPPER=` and `VENDOR_ACTIVATION_SESSION_SECRET=` names to `.env.example`; never commit values.

Make `RoomlogService implements OnModuleDestroy` the single lifecycle owner for both `options.vendorActivationRepository` and the existing `storeProjector`. Memoize one shutdown promise, await queued persistence before disconnecting, attempt both cleanups even if one fails, and close the same object identity once total across repeated calls. Activation domains/controllers never close providers. Extend `roomlog.module.spec.ts` to bootstrap and close a Nest context and prove the configuration matrix, factory failure cleanup, Prisma/unavailable construction, same-object deduplication, and exactly-once cleanup.

- [ ] **Step 6: Add controller tests and routes**

Add focused controller tests requiring:

- preview accepts exactly one JSON body field `key` and never echoes it;
- claim requires authentication;
- claim rejects body `userId` and every unknown field;
- expected domain errors map to 400/409/410, and `ACTIVATION_UNAVAILABLE` maps to 503, without returning hashes or account IDs.

- [ ] **Step 7: Run GREEN**

```bash
ROOMLOG_VENDOR_MIGRATION_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_vendor_catalog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-catalog-migration.spec.ts
ROOMLOG_VENDOR_MIGRATION_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_vendor_catalog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/services/vendor-activation-security.spec.ts \
  src/roomlog/prisma-vendor-activation.repository.spec.ts \
  src/roomlog/services/roomlog-vendor-activation.domain.spec.ts \
  src/roomlog/roomlog.module.spec.ts \
  src/roomlog/roomlog.controller-realtime.spec.ts
```

- [ ] **Step 8: Commit domain and API**

```bash
git add apps/api/src/roomlog/vendor-activation.repository.ts apps/api/src/roomlog/prisma-vendor-activation.repository.ts apps/api/src/roomlog/prisma-vendor-activation.repository.spec.ts apps/api/src/roomlog/services/vendor-activation-security.ts apps/api/src/roomlog/services/vendor-activation-security.spec.ts apps/api/src/roomlog/services/roomlog-vendor-activation.domain.ts apps/api/src/roomlog/services/roomlog-vendor-activation.domain.spec.ts apps/api/src/roomlog/unavailable-vendor-activation.repository.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.controller.ts apps/api/src/roomlog/roomlog.module.ts apps/api/src/roomlog/roomlog.module.spec.ts apps/api/src/roomlog/roomlog.controller-realtime.spec.ts .env.example
git commit -m "feat(vendor): expose activation claim API"
```

---

### Task 5: Switch authentication capability and projector compatibility

**Files:**
- Modify: `apps/api/src/roomlog/roomlog-support.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-auth.domain.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-repair.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/prisma-store-projector.ts`
- Modify: `apps/api/src/roomlog/prisma-store-projector.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-mgmt.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller-realtime.spec.ts`
- Modify: `apps/api/src/roomlog/vendor-catalog-migration.spec.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260714101000_vendor_account_link_authority/migration.sql`

**Interfaces:**
- Consumes: active `VendorAccountLink`
- Produces: async `requireVendorIdentity()`, async `getMe()`, and vendor job owner resolution based on the same direct active-link source

```ts
export interface VendorRequestIdentity { userId: string; vendorId: string }

// temporary legacy repair surface until the workflow plan replaces it
listVendorRepairs(identity: VendorRequestIdentity): Promise<unknown>;
getVendorRepair(identity: VendorRequestIdentity, repairId: string): Promise<unknown>;
addVendorRepairMessage(identity: VendorRequestIdentity, repairId: string, input: AddVendorRepairMessageInput): Promise<unknown>;
submitEstimate(identity: VendorRequestIdentity, repairId: string, input: SubmitEstimateInput): Promise<unknown>;
scheduleRepair(identity: VendorRequestIdentity, repairId: string, input: ScheduleRepairInput): Promise<unknown>;
reportCompletion(identity: VendorRequestIdentity, repairId: string, input: ReportCompletionInput): Promise<unknown>;
```

- [ ] **Step 1: Add failing capability regression tests**

Require all of the following:

```ts
assert.equal((await auth.getMe(activeVendorToken)).roles.includes("VENDOR"), true);
assert.equal((await auth.getMe(disabledLegacyToken)).roles.includes("VENDOR"), false);
assert.equal((await auth.getMe(storedVendorRoleWithoutLinkToken)).roles.includes("VENDOR"), false);
await assert.rejects(() => controller.listVendorRepairs(storedVendorRoleWithoutLinkToken), /업체 계정 연결/);
```

Also require that ordinary signup never creates a `VendorProfile`, vendor invite signup is unavailable, and awaited `getMe()` returns `VendorAccountView` only for an active link. `getMe()` must perform exactly one `resolveActiveVendorAccount(user.id)` read and derive both the vendor role and vendor view from that result; do not compose two resolver reads. Pin fail-closed unavailable behavior: `getMe()` catches only `VendorActivationRepositoryError("ACTIVATION_UNAVAILABLE")` and returns the ordinary non-vendor profile, while vendor-only endpoints preserve that 503 failure. Add a claim-then-immediate-access test proving a newly claimed link opens a vendor endpoint without restarting or projecting RoomlogStore. A stored `role=VENDOR` with no ACTIVE link and a `DISABLED` **VendorAccountLink** must both receive 403; this acceptance item does not refer to `UserAccount.status`.

For all six temporary vendor repair handlers, assert `vendorId` scopes repair ownership while `userId` is preserved as the message/audit actor; neither value may come from request body/path. Include the seventh mixed-role guard, `POST /attachments`: TENANT/LANDLORD continue through synchronous role checks, while a VENDOR upload must resolve the same ACTIVE link and must not regain access from a stored role.

Add controller response tests for both `/auth/me` and `/tenant/home`. Make both handlers async and explicitly `await roomlogService.getMe(authorization)`; `getTenantHome()` must resolve `profile` before returning so no nested `Promise` reaches JSON serialization. Scan every `getMe(` call site and require all callers to await it after the signature change.

- [ ] **Step 2: Run RED against current stored-role fallback**

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/roomlog.service.spec.ts src/roomlog/prisma-store-projector.spec.ts
```

Expected: tests fail because current signup/invite/profile ownership is coupled to `VendorProfile.userId` and stored role.

- [ ] **Step 3: Remove profile creation from auth signup/invite paths**

In `roomlog-auth.domain.ts`, keep tenant invitation behavior but make every legacy VENDOR signup/invite preview/acceptance path return 410 before any store mutation. A registration-key user first becomes a normal SEEKER identity; only successful activation link yields vendor capability. Historical vendor-invite reads may remain inert; they must never grant authorization or create a profile/link.

- [ ] **Step 4: Make link resolution authoritative**

Remove VENDOR derivation from synchronous `deriveUserRoles()`/`rolesForUser()` and do not add account links to `UserRoleRelations`. Make `RoomlogAuthDomain.getMe()` and `RoomlogService.getMe()` async: compute existing SEEKER/TENANT/LANDLORD roles as today, await exactly one `VendorAccountResolver.resolveActiveVendorAccount(user.id)` call, and append VENDOR plus the vendor view only from that same result. Update `/auth/me`, `/tenant/home`, every production caller, and all direct tests to await the result; assert `tenant/home.profile` is not Promise-like.

Add async `requireVendorIdentity(authorization): Promise<VendorRequestIdentity>` and make `listVendorRepairs`, `getVendorRepair`, `addVendorRepairMessage`, `submitEstimate`, `scheduleRepair`, and `reportCompletion` await it and pass the full identity to service/domain. Update `POST /attachments` to accept an ACTIVE linked vendor through the resolver without weakening its existing TENANT/LANDLORD checks. The domain uses `vendorId` for repair ownership and `userId` for message/audit actor attribution, including transition history and generated messages. Delete dual-ID lookup by profile ID or legacy `VendorSummary.userId`. Do not leave a compatibility fallback to `UserAccount.role === "VENDOR"`, because it would reactivate DISABLED legacy cross-role links. Preserve existing TENANT/LANDLORD compatibility behavior outside this vendor-only change.

`authResult()` and `/auth/login` remain synchronous in this slice and therefore return only locally known non-vendor roles. Treat `/auth/me` as the authoritative post-login capability response; the current web flow already refetches it. Do not preserve a legacy VENDOR fallback merely to decorate the login response.

- [ ] **Step 5: Make projector catalog-only and stale-write safe**

Keep the projector catalog-only:

- remove `VendorSummary.userId` and catalog upserts must not require or write it;
- extend the catalog projection with `businessNumber`, cloned `trades`, cloned `serviceAreas`, `verificationStatus`, `isActive`, and catalog timestamps so the new catalog state survives load/persist;
- account links and activation rows are neither loaded into RoomlogStore nor written by the projector;
- the only legacy link creation is migration 100000, never projector fallback;
- a stale snapshot written after a claim cannot create, delete, or change ACTIVE/DISABLED/CLAIMED state;
- old catalog snapshots missing `trades` or `serviceAreas` normalize those fields to `[]`.

Add a full catalog-field round-trip test, an old-snapshot normalization test, and a stale-snapshot test that compares link and activation rows exactly before/after persistence. If audit assertions cover role metadata as well as actor IDs, add an explicit VENDOR actor role to history rather than deriving it from the SEEKER account row; otherwise pin the user ID and record role metadata as deferred debt.

- [ ] **Step 6: Retire manager direct-create and vendor-invite writes**

In `roomlog-vendor-mgmt.domain.ts`, `roomlog.service.ts`, and `roomlog.controller.ts`, return 410 for manager catalog POST/PATCH, `manual:${vendorId}` pseudo-account creation, vendor invite issuance, and vendor invite acceptance. Keep tenant invite creation/acceptance untouched. Add controller/domain regression tests proving no manager request can create/patch a global catalog or VendorAccountLink and that existing read-only vendor history endpoints still render.

The existing manager create/edit form will be intentionally non-functional between this atomic API cutover and the later manager vendor-management workflow task. Do not keep an unsafe compatibility write to support that interim screen; remove/replace the form in the workflow slice before final delivery verification.

- [ ] **Step 7: Await persistence before claim after signup**

When the activation web flow creates a SEEKER account and then claims, invoke the existing `RoomlogService.flushPersistence()` before direct repository claim so the UserAccount FK exists. Add a test that delays projector completion and proves claim waits.

- [ ] **Step 8: Apply and verify the destructive authority migration**

After every runtime read/write has moved to active links, remove the temporary `VendorProfile.userId` field from `prisma/schema.prisma` and add migration 101000 that drops its legacy unique index and column. Do not drop the column before the capability, `getMe()`, vendor job resolver, and projector changes are in the same commit.

Rewrite `vendor-catalog-migration.spec.ts` so one retained scratch database receives the exact `20260714100000_vendor_catalog_activation/migration.sql` and `20260714101000_vendor_account_link_authority/migration.sql` files sequentially with `psql -v ON_ERROR_STOP=1 -f`. Do not use one `prisma migrate deploy` call that silently applies both targets, and do not mark 100000 resolved without executing it. After 100000, snapshot ordered VendorProfile IDs, every VendorAccountLink column, RepairRequest `(id,vendorId)`, and Ticket `(id,assignedVendorId)`. Seed the minimal room/complaint/ticket/repair fixtures needed for the FK preservation assertions. After 101000, assert through `information_schema.columns` and `pg_indexes` that old `userId` and `VendorProfile_userId_key` are gone and compare every snapshot exactly.

- [ ] **Step 9: Run GREEN and inspect removed coupling**

```bash
pnpm db:generate
ROOMLOG_VENDOR_MIGRATION_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_vendor_catalog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-catalog-migration.spec.ts
pnpm --filter api test
rg -n -e 'VendorProfile.*userId' -e 'manual:' -e "role\\s*===\\s*['\\\"]VENDOR['\\\"]" apps/api/src/roomlog
```

Expected: tests pass; no auth/profile ownership or manual pseudo-account creation remains. A stored role may appear in migration compatibility code only if it cannot grant runtime capability.

- [ ] **Step 10: Commit the auth/projector transition atomically**

```bash
git add prisma/schema.prisma prisma/migrations/20260714101000_vendor_account_link_authority/migration.sql apps/api/src/roomlog/roomlog-support.ts apps/api/src/roomlog/services/roomlog-auth.domain.ts apps/api/src/roomlog/services/roomlog-vendor-mgmt.domain.ts apps/api/src/roomlog/services/roomlog-vendor-repair.domain.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.controller.ts apps/api/src/roomlog/roomlog.controller-realtime.spec.ts apps/api/src/roomlog/prisma-store-projector.ts apps/api/src/roomlog/prisma-store-projector.spec.ts apps/api/src/roomlog/roomlog.service.spec.ts apps/api/src/roomlog/vendor-catalog-migration.spec.ts
git commit -m "refactor(vendor): derive access from account links"
```

---

### Task 6: Add deterministic presentation seed and key issuance script

**Files:**
- Create: `apps/api/src/roomlog/scripts/seed-vendor-foundation.ts`
- Create: `apps/api/src/roomlog/scripts/seed-vendor-foundation.spec.ts`
- Modify: `apps/api/package.json`
- Modify: `.env.example` only for variable names, never values

**Interfaces:**
- Produces: 4~5 catalog vendors, 2~3 linked demo accounts, one unlinked valid activation, one expired/claimed example, raw valid key printed once to the operator

```ts
export interface SeedVendorFoundationOptions {
  now: Date;
  activationKeyFactory: () => string;
  rotateKeyForVendorId?: string;
  printIssuedKey?: (rawKey: string) => void;
}

export interface SeedVendorFoundationResult {
  unlinkedVendorId: string;
  activationId: string;
  issuedRawKey: string;
}

export function seedVendorFoundation(
  prisma: PrismaClient,
  options: SeedVendorFoundationOptions
): Promise<SeedVendorFoundationResult>;
```

- [ ] **Step 1: Write the failing catalog-idempotency and key-issuance test**

With an injected fixed key factory, run the seed twice and require stable IDs/counts, one ISSUED activation per intended unlinked vendor, the same candidate hash/result, no duplicated active owner links, and no raw key in database columns. Then rerun with a different candidate and require an explicit `ACTIVATION_KEY_ALREADY_ISSUED` failure unless `rotateKey` is true; rotation must revoke the prior row and return the new raw key once.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/scripts/seed-vendor-foundation.spec.ts
```

- [ ] **Step 3: Implement an explicit non-production script**

The reusable seed core and thin CLI wrapper must:

- refuse production unless `--allow-production-seed` is explicitly passed;
- upsert by stable demo IDs/business numbers;
- store only hashed activation keys;
- return the newly issued raw key to its caller so integration tests can claim it without reading stdout; if the candidate hash exactly matches the existing ISSUED row, the deterministic/test caller may receive that same supplied candidate again, but the function never reconstructs a raw key from DB;
- if an ISSUED row exists with a different candidate, fail with `ACTIVATION_KEY_ALREADY_ISSUED` and print nothing; only explicit `rotateKey`/CLI `--rotate-key <vendorId>` revokes it and returns a new raw key;
- let the thin CLI wrapper alone pass `printIssuedKey`, and print a successfully created/rotated raw key exactly once with a warning;
- never put key/pepper/session secret in source control;
- support `--rotate-key <vendorId>` by revoking prior ISSUED keys and issuing one new key;
- accept an injected fixed `now` and `activationKeyFactory` in tests; production CLI supplies the real clock and cryptographic generator.

Add scripts such as:

```json
{
  "seed:vendor-demo": "node -r ts-node/register src/roomlog/scripts/seed-vendor-foundation.ts"
}
```

- [ ] **Step 4: Run GREEN against the test database**

```bash
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/roomlog/scripts/seed-vendor-foundation.spec.ts
```

- [ ] **Step 5: Commit seed tooling without generated keys**

```bash
git add apps/api/src/roomlog/scripts/seed-vendor-foundation.ts apps/api/src/roomlog/scripts/seed-vendor-foundation.spec.ts apps/api/package.json .env.example
git commit -m "chore(vendor): add demo catalog seed"
```

---

### Task 7: Build the vendor entry gate and activation BFF flow

**Files:**
- Create: `apps/web/src/lib/vendor-activation.ts`
- Create: `apps/web/src/app/vendor/vendor-activation.spec.ts`
- Create: `apps/web/src/app/api/vendor/activation/preview/route.ts`
- Create: `apps/web/src/app/api/vendor/activation/claim/route.ts`
- Create: `apps/web/src/app/vendor/VendorEntryActions.tsx`
- Modify: `apps/web/src/app/vendor/page.tsx`
- Create: `apps/web/src/app/vendor/activate/page.tsx`
- Create: `apps/web/src/app/vendor/activate/VendorActivationFlow.tsx`
- Create: `apps/web/src/app/vendor/activate/VendorActivationFlow.module.css`
- Modify: `apps/web/src/app/vendor/vendor-signup.ts`
- Modify: `apps/web/src/app/vendor/vendor-signup.spec.ts`
- Modify: `apps/web/src/lib/session.ts`
- Modify: `apps/web/src/lib/unified-login.ts`
- Modify: `apps/web/src/lib/unified-login.spec.ts`
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Produces entry actions: `업체 로그인`, `등록 키로 업체 계정 만들기`
- Produces BFF cookie: short-lived HttpOnly/SameSite=Lax activation session; raw key is never retained
- Produces linked redirect: `/vendor/job/00`

- [ ] **Step 1: Write failing entry and activation contracts**

Require:

- linked vendor visiting `/vendor` redirects to `/vendor/job/00`;
- unlinked visitor sees exactly the two entry actions;
- tenant/landlord user sees dedicated-account explanation + logout action and cannot claim;
- `/vendor/login` remains a compatibility redirect to unified login;
- preview POST body contains the raw key once, but resulting URL, redirect, browser-visible state, and cookie value do not contain it;
- same activation session survives signup/login return;
- claim mutation failure remains on the confirmation step with actionable Korean copy.

- [ ] **Step 2: Run RED**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/vendor/vendor-activation.spec.ts \
  src/app/vendor/vendor-signup.spec.ts \
  src/lib/unified-login.spec.ts
node --test property-shell.spec.mjs
```

Expected: current `/vendor` auto-invite flow and missing activation routes fail the new contracts.

- [ ] **Step 3: Implement server-owned key exchange**

`POST /api/vendor/activation/preview` forwards the raw key directly to API, receives the preview/session, stores only the signed session in cookie `roomlog_vendor_activation` (`httpOnly`, `sameSite: "lax"`, `secure` in production, `path: "/"`, `maxAge: 300`), and returns the presentation-safe preview without session token. Never write the request body or upstream response to logs.

`POST /api/vendor/activation/claim` reads the HttpOnly session plus authenticated app session, calls API claim, clears the activation cookie on success, and returns `nextPath`.

- [ ] **Step 4: Implement the five-step PhoneFrame flow**

Render:

1. formatted key input;
2. business name, trade, service area, masked phone confirmation;
3. login/create dedicated account;
4. claim progress/error;
5. success and 작업함 navigation.

Use status/step text rather than exposing internal activation codes. Disable duplicate submission while pending, but rely on server idempotency for correctness.

- [ ] **Step 5: Preserve a validated internal return path**

The helper accepts only `/vendor` paths and defaults to `/vendor/activate`. The original key is never appended. After auth, return to activation page and claim with cookie session.

- [ ] **Step 6: Run GREEN and web suite**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/app/vendor/vendor-activation.spec.ts \
  src/app/vendor/vendor-signup.spec.ts \
  src/lib/unified-login.spec.ts
node --test property-shell.spec.mjs
cd ../..
pnpm test:web
```

- [ ] **Step 7: Commit the web activation flow**

```bash
git add apps/web/src/lib/vendor-activation.ts apps/web/src/app/api/vendor/activation apps/web/src/app/vendor apps/web/src/lib/session.ts apps/web/src/lib/unified-login.ts apps/web/src/lib/unified-login.spec.ts apps/web/property-shell.spec.mjs
git commit -m "feat(vendor): add registration key activation flow"
```

---

### Task 8: Verify the foundation slice and freeze downstream contract

**Files:**
- Verify: all files in Tasks 1~7
- Document only if behavior differs: `docs/superpowers/specs/2026-07-14-vendor-management-credit-design.md`

**Interfaces:**
- Produces downstream guarantees: catalog survives without a user; one active OWNER; active-link vendor resolver; no raw-key leakage

- [ ] **Step 1: Run focused API and web tests**

```bash
pnpm --filter @roomlog/types typecheck
pnpm db:generate
docker compose up -d postgres
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/services/vendor-activation-security.spec.ts \
  src/roomlog/services/roomlog-vendor-activation.domain.spec.ts \
  src/roomlog/prisma-vendor-activation.repository.spec.ts \
  src/roomlog/prisma-store-projector.spec.ts
pnpm test:web
```

- [ ] **Step 2: Run full repository verification**

```bash
pnpm test:api
bash scripts/verify.sh
git diff --check
```

- [ ] **Step 3: Rebuild the standard web/API images**

```bash
docker compose up -d --build web api
docker compose ps web api postgres
curl -fsS http://localhost:4000/api/health
```

- [ ] **Step 4: Manually prove the three account cases**

1. valid unlinked key + new dedicated account → one link, CLAIMED, `/vendor/job/00`;
2. same user retry → same link, no duplicate;
3. tenant/manager account → no mutation, dedicated-account guidance.

- [ ] **Step 5: Run leakage and coupling scans**

```bash
rg -n 'manual:|VendorProfile.*userId' apps packages prisma/schema.prisma
rg -n 'JIPJU-VND-[A-Z0-9-]+' apps packages prisma --glob '!**/*.spec.ts' --glob '!**/seed-vendor-foundation.ts'
rg -n '#[0-9a-fA-F]{3,8}' apps/web/src/app/vendor --glob '*.css' --glob '*.tsx'
```

Expected: no runtime pseudo-account/profile ownership, no committed raw key, and no new raw hex.

- [ ] **Step 6: Commit any final focused test-only corrections**

```bash
git status --short
git add apps/api/src/roomlog/vendor-activation.contract.spec.ts \
  apps/api/src/roomlog/vendor-catalog-migration.spec.ts \
  apps/api/src/roomlog/prisma-vendor-activation.repository.spec.ts \
  apps/api/src/roomlog/services/vendor-activation-security.spec.ts \
  apps/api/src/roomlog/services/roomlog-vendor-activation.domain.spec.ts \
  apps/web/src/app/vendor/vendor-activation.spec.ts
git diff --cached --name-only
git commit -m "test(vendor): verify activation foundation"
```

Skip this commit when those files have no post-verification change; never create an empty commit.

Do not begin workflow implementation until this slice's migration, active-link capability, and concurrent claim tests are green.
