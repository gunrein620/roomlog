# Vendor Management and Credit Delivery Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 업체관리·업체 작업·크레딧 설계를 기존 `vendorId`, 수리 이력, 관리자 셸을 보존하면서 네 개의 독립 슬라이스로 안전하게 구현한다.

**Architecture:** 전역 업체 원장과 계정 링크, 관리자별 업체 관계, 견적·완료·결제요청, 크레딧 금융 원장을 서로 다른 영속성 경계로 분리한다. 상태를 바꾸는 핵심 명령은 awaited Prisma transaction을 사용하고, 기존 `RoomlogStore`와 비동기 projector는 금융 판정이나 견적 version 판정에 사용하지 않는다. 각 슬라이스는 공유 타입 → migration → repository/domain → API → web 순서의 수직 절단으로 완성하고 다음 슬라이스로 넘어간다.

**Tech Stack:** TypeScript 5.9, pnpm monorepo, Next.js 16 App Router, React 19, NestJS, Prisma, PostgreSQL, Toss Payments test API, Node test runner, Docker Compose

## Global Constraints

- 기준 설계는 `docs/superpowers/specs/2026-07-14-vendor-management-credit-design.md`다. 설계와 충돌하는 구현 판단은 임의로 진행하지 않고 설계 문서를 먼저 갱신해 다시 승인받는다.
- 각 슬라이스를 시작하기 직전에 `git fetch origin dev`와 `git log --oneline --left-right HEAD...origin/dev`로 최신 `dev`를 확인한다. 새 변경이 있으면 해당 슬라이스 브랜치에 먼저 병합하고 대상 테스트를 다시 실행한다.
- 구현은 이 master 계획의 순서대로 진행한다. 슬라이스 4는 선택 범위이며 슬라이스 1~3의 병합을 막지 않는다.
- 화면/도메인 계약은 `packages/types`부터 변경하고 현재 source-export 패키지의 실제 script인 `pnpm --filter @roomlog/types typecheck`를 통과한 뒤 API와 web을 수정한다. 이 패키지에는 현재 `build` script나 dist 소비 경로가 없으므로 존재하지 않는 명령을 계획에 사용하지 않는다.
- CSS는 `packages/ui/src/tokens.css`의 `var(--...)`만 사용하고 raw hex를 추가하지 않는다.
- 업체·임차인 표면은 `PhoneFrame`, 관리인 표면은 기존 `ManagerAppShell`/`ManagerShell`을 유지한다.
- 읽기 API만 데모 fallback을 허용한다. 활성화 claim, 업체 등록, 견적 제출, 완료보고, 충전, 결제, 연락 기록 같은 mutation은 실패를 성공처럼 반환하지 않는다.
- AI 책임 판단, 요약, 음성, 프롬프트, 전체 책임 분기 UI는 수정하지 않는다. 확정된 `caseId`, `repairId`, 수리 분야, 비용 부담자, 검색어, 공개 위치 범위만 소비한다.
- 임차인 청구 결제 `BillPaymentTransaction`, 임대 수금 `Deposit`, 비용 read model `Cost`, 크레딧 원장 `CreditLedgerEntry`를 합치지 않는다.
- 과거 migration은 수정하지 않는다. 신규 migration은 아래 경로로 고정한다.
  - `prisma/migrations/20260714100000_vendor_catalog_activation/migration.sql`
  - `prisma/migrations/20260714101000_vendor_account_link_authority/migration.sql`
  - `prisma/migrations/20260714110000_vendor_workflow/migration.sql`
  - `prisma/migrations/20260714120000_vendor_credit/migration.sql`
  - `prisma/migrations/20260714130000_external_vendor_contact/migration.sql`
- 기본 개발·검증 환경은 Docker Compose다. 호스트 `pnpm dev:*`를 표준 실행 경로로 사용하지 않는다.
- 한 Task의 RED 확인, 최소 구현, GREEN 확인, 집중 커밋이 끝나기 전에 다음 Task로 넘어가지 않는다.

---

## Delivery Documents

| 순서 | 필수 여부 | 계획 문서 | 완료 산출물 |
| --- | --- | --- | --- |
| 1 | 필수 | `2026-07-14-vendor-foundation-activation.md` | 전역 업체 원장, 활성 계정 링크, 등록 키, 업체 진입 게이트 |
| 2 | 필수 | `2026-07-14-vendor-management-workflow.md` | 내 업체·업체 찾기, 배정 가드, 견적 version, 완료보고·결제요청 |
| 3 | 필수 | `2026-07-14-manager-credit-payments.md` | 크레딧 계정·원장, Toss 충전·재조정, 정책·정산·취소, 전역 UI |
| 4 | 선택 | `2026-07-14-external-vendor-contact-bridge.md` | 공개 업체 projection, 가짜 외부 검색, 전화 연락 시도 기록 |

## Dependency Graph

```mermaid
flowchart LR
  A["슬라이스 1\n업체 원장·활성화"] --> B["슬라이스 2\n관리자 업체·작업"]
  B --> C["슬라이스 3\n크레딧·결제"]
  A --> D["슬라이스 4\n공개·외부 연결"]
  B --> D
```

- 슬라이스 2는 슬라이스 1의 `VendorCatalogRecord`, `VendorAccountLink`, `resolveActiveVendorId()`와 schema를 사용한다.
- 슬라이스 3은 슬라이스 2의 `RepairCompletionDecision`과 `VendorPaymentRequest`를 결제 증거로 사용한다.
- 슬라이스 4는 슬라이스 1의 전역 업체 원장을 공개 projection으로 읽고, 세입자 하자 AI 결과는 읽기 전용 입력으로만 사용한다.

## Cross-Slice Ownership Matrix

| 대상 | 소유 슬라이스 | 쓰기 경계 | 다른 슬라이스의 허용 동작 |
| --- | --- | --- | --- |
| `VendorProfile` catalog row | 1 | seed/internal script + activation repository | 2·4 read only |
| `VendorAccountLink`, `VendorActivation` | 1 | activation transaction | 2는 active link 확인만 |
| `ManagerVendor` | 2 | manager vendor repository | 3은 manager 범위 확인만 |
| `VendorEstimate`, completion report/decision | 2 | workflow transaction | 3은 승인 스냅샷 재검증 |
| `VendorPaymentRequest` | 2/3 | 2가 생성·완료결정 연결, 3이 결제 상태·attempt 처리 | 동일 행의 필드 소유권을 schema와 repository로 분리 |
| `CreditAccount`, topup, ledger, policy, attempt | 3 | credit command transaction | 다른 슬라이스 직접 쓰기 금지 |
| 금융 연동 `Cost` | 3 | 결제·취소 transaction | projector가 금융 소유 row를 덮어쓰지 않음 |
| `ExternalVendorContactAttempt` | 4 | tenant-scoped contact repository | 전화 앱 실행과 독립 |
| domain event + delivery | 2가 immutable event/consumer receipt 기반 생성, 3이 금융 event 사용 | 원 상태 transaction 내부 event+delivery insert | 알림과 credit consumer가 독립 lease/retry/CAS 처리 |

`VendorPaymentRequest` 필드 소유권은 더 좁게 고정한다. Workflow는 `repairId/vendorId/managerId/approvedEstimateId/completionReportId/amount`, 최초 `WAITING_COMPLETION`, 완료 승인·반려 audit만 쓴다. Credit은 manager 승인 뒤 `completionDecisionId`, `status`, `failureReason`, `lastAttemptMode`, `ledgerEntryId`, `costId`, `processedAt`과 금융 audit를 쓴다. `WAITING_COMPLETION`은 완료 반려로 처리하고 Credit cancel 대상이 아니며, Credit cancel은 `PENDING_APPROVAL`/`INSUFFICIENT_CREDIT`만 허용한다.

## Shared Contract Freeze

슬라이스별 공유 타입 파일을 분리해 병렬 충돌을 줄인다.

```text
packages/types/src/vendor.ts           # catalog, account link, activation
packages/types/src/vendor-workflow.ts  # manager relation, job, estimate, completion, payment request
packages/types/src/vendor-credit.ts    # account, ledger, topup, policy, settlement
packages/types/src/vendor-public.ts    # public profile, external search, contact attempt
packages/types/src/domain-event.ts     # workflow/credit shared outbox event codes and optional resource IDs
```

`packages/types/src/index.ts`는 각 파일을 명시적으로 re-export한다. 기존 `vendor-mgmt.ts`는 슬라이스 2가 모든 consumer를 새 계약으로 바꾼 뒤 `rg`로 참조 0개를 확인하고 제거한다.

## Required Service Boundaries

```ts
export interface VendorAccountResolver {
  resolveActiveVendorId(userId: string): Promise<string | undefined>;
}

export interface VendorCompletionCreditBoundary {
  readonly availability: "DEFERRED" | "READY";
  evaluateAfterCompletion(input: {
    managerId: string;
    paymentRequestId: string;
    completionDecisionId: string;
    actorUserId: string;
  }): Promise<VendorPaymentSettlementResult>;
}

export interface DomainEventRepository {
  enqueue(transaction: PrismaTransaction, input: {
    event: RoomlogDomainEvent;
    consumers: readonly ("NOTIFICATION" | "CREDIT_EVALUATION")[];
  }): Promise<{ eventId: string }>;
}

export interface DomainEventDispatcher {
  dispatchPending(limit?: number): Promise<number>; // NOTIFICATION delivery only
}

export interface CompletionCreditDeliveryWorker {
  dispatchPending(limit?: number): Promise<number>; // CREDIT_EVALUATION delivery only
}
```

- 슬라이스 2는 승인 transaction에서 알림+credit delivery를 만들고 worker/`VendorCompletionCreditBoundary` port를 소유하지만 결제 알고리즘은 구현하지 않는다. deferred provider는 credit delivery를 claim하지 않는다.
- 슬라이스 3은 READY 경계를 구현하고 기존 backlog를 drain하며 최신 관리자 승인 결정, 승인 견적, 금액, 상태를 transaction 안에서 다시 검증한다.
- module 방향은 `Roomlog -> Credit -> DomainEvents -> Realtime`로 고정하고 `DomainEventsModule`은 Credit/Roomlog를 import하지 않는다.
- 이벤트 payload에는 안정적인 ID와 상태 코드만 둔다. AI 문구는 넣지 않는다.

---

### Task 1: Baseline and branch safety gate

**Files:**
- Read: `AGENTS.md`
- Read: `docs/superpowers/specs/2026-07-14-vendor-management-credit-design.md`
- Read: all four detailed plan documents
- Create: `apps/api/scripts/run-ts-unit-tests.mjs`
- Modify: `apps/api/package.json`
- Verify: repository worktree only

**Interfaces:**
- Consumes: latest `origin/dev`, approved design commit, clean focused worktree
- Produces: reproducible baseline record before schema or code changes

- [ ] **Step 1: Fetch and compare the exact base**

```bash
git fetch origin dev
git status --short --branch
git log --oneline --decorate -8
git log --oneline --left-right HEAD...origin/dev
```

Expected: unrelated local changes are identified before merge; the implementation branch contains the approved design/plan commits and the latest `origin/dev` history.

- [ ] **Step 2: Merge current dev before implementation**

```bash
git merge --no-edit origin/dev
```

Expected: clean merge, or conflicts resolved by keeping current `origin/dev` UI and reapplying only the vendor/credit contracts from these plans. Never discard another contributor's OCR or unrelated UI.

- [ ] **Step 3: Record the untouched baseline**

```bash
bash scripts/verify.sh
pnpm test:api
pnpm test:web
```

Expected: all commands pass. If a pre-existing failure exists, save its exact command/output in the implementation handoff and prove each slice does not add a new failure; do not silently relabel it as passing.

- [ ] **Step 4: Create the slice branch**

Use one branch per detailed plan if the team wants independent review, or one branch with the four documented commit groups if one PR is required. Do not mix implementation with unrelated worktree changes.

- [ ] **Step 5: Prove and repair recursive API test discovery before adding deep specs**

The current `node --test -r ts-node/register src/**/*.spec.ts` shell glob does not collect deeper paths such as `src/roomlog/services/*.spec.ts`. First record the mismatch:

```bash
cd apps/api
node -e 'const fs=require("node:fs"),p=require("node:path");let n=0;const w=d=>fs.readdirSync(d,{withFileTypes:true}).forEach(e=>e.isDirectory()?w(p.join(d,e.name)):e.name.endsWith(".spec.ts")&&n++);w("src");console.log(n)'
sh -c 'set -- src/**/*.spec.ts; echo "$#"'
```

Expected: the recursive filesystem count is greater than the shell-expanded argument count.

Create `apps/api/scripts/run-ts-unit-tests.mjs` using the same recursive `readdirSync(..., {withFileTypes:true})`, sorted relative path list, and `spawnSync(process.execPath, ["--test", "-r", "ts-node/register", ...specFiles])` pattern already used by `apps/web/scripts/run-ts-unit-tests.mjs`. Change API's `test` script to `node scripts/run-ts-unit-tests.mjs`.

- [ ] **Step 6: Verify and commit the test collector**

```bash
cd ../..
pnpm test:api
git add apps/api/scripts/run-ts-unit-tests.mjs apps/api/package.json
git commit -m "test(api): collect nested unit specs"
```

Expected: every recursively discovered API spec is passed to Node's test runner. If this reveals a pre-existing failure, record and repair that failure in its owning scope before using `pnpm test:api` as a green gate.

---

### Task 2: Deliver slice 1 and freeze the account contract

**Files:**
- Execute: `docs/superpowers/plans/2026-07-14-vendor-foundation-activation.md`
- Verify: `packages/types/src/vendor.ts`
- Verify: `prisma/migrations/20260714100000_vendor_catalog_activation/migration.sql`
- Verify: `prisma/migrations/20260714101000_vendor_account_link_authority/migration.sql`

**Interfaces:**
- Produces: stable existing `vendorId`, global catalog without required login user, active account resolver, atomic activation claim

- [ ] Execute every unchecked Task in the slice 1 plan in order.
- [ ] Run the slice's migration tests against a fresh Postgres test schema.
- [ ] Prove `/vendor` sends an already-linked vendor to `/vendor/job/00` and never exposes a raw key in URL/history.
- [ ] Prove a legacy cross-role account is migrated as `DISABLED`, not granted vendor capability.
- [ ] Tag the slice with a focused commit such as `feat(vendor): add catalog activation foundation`.

**Exit gate:** no slice 2 work starts until `resolveActiveVendorId(userId)` reads an ACTIVE DB link, the old `VendorProfile.userId` dependency is removed, and activation concurrency tests pass.

---

### Task 3: Deliver slice 2 and freeze payment evidence

**Files:**
- Execute: `docs/superpowers/plans/2026-07-14-vendor-management-workflow.md`
- Verify: `packages/types/src/vendor-workflow.ts`
- Verify: `prisma/migrations/20260714110000_vendor_workflow/migration.sql`

**Interfaces:**
- Produces: `ManagerVendor`, versioned approved estimate, completion report, manager decision, one payment request per repair, immutable event + per-consumer durable delivery

- [ ] Execute every unchecked Task in the slice 2 plan in order.
- [ ] Prove manager isolation and the full assignment guard matrix.
- [ ] Prove revised estimates preserve versions and approved snapshots are immutable.
- [ ] Prove LANDLORD completion creates one `WAITING_COMPLETION` payment request while TENANT/PENDING do not.
- [ ] Prove only a repair-specific `source=MANAGER` APPROVED decision can cross the credit boundary.
- [ ] Prove approval commit creates one event plus independent `NOTIFICATION`/`CREDIT_EVALUATION` receipts; deferred mode leaves credit pending and crash/lease expiry is reclaimable.
- [ ] Tag the slice with a focused commit such as `feat(vendor): add manager and job workflow`.

**Exit gate:** no slice 3 settlement work starts until the workflow repository can return an immutable `completionDecisionId`, `approvedEstimateId`, `amount`, and manager-scoped `paymentRequestId` from PostgreSQL and a deferred `CREDIT_EVALUATION` delivery survives restart without direct HTTP coupling.

---

### Task 4: Deliver slice 3 and verify financial invariants

**Files:**
- Execute: `docs/superpowers/plans/2026-07-14-manager-credit-payments.md`
- Verify: `packages/types/src/vendor-credit.ts`
- Verify: `prisma/migrations/20260714120000_vendor_credit/migration.sql`

**Interfaces:**
- Produces: direct Prisma credit command repository, topup reconciliation, auto/manual/direct settlement, reversal/void, ManagerAppShell utility

- [ ] Execute every unchecked Task in the slice 3 plan in order.
- [ ] Prove concurrent topup confirmation invokes Toss once and creates one TOPUP ledger entry.
- [ ] Prove two concurrent debits cannot make the balance negative.
- [ ] Prove auto, manual credit, and direct settlement races produce one successful attempt.
- [ ] Prove a pre-credit pending delivery drains after READY adapter installation and a crash after credit commit/before delivery CAS replays without duplicate attempt/audit/ledger/Cost.
- [ ] Prove credit reversal and direct-payment void atomically set the linked `Cost` to `VOID` and cannot be repaid.
- [ ] Prove `Deposit` and tenant billing reports are unchanged by credit transactions.
- [ ] Tag the slice with a focused commit such as `feat(credit): add manager credit settlement`.

**Exit gate:** balance, ledger sum, topup status, payment request, attempt, audit, and Cost state remain consistent after retry, timeout, and injected local commit failure tests.

---

### Task 5: Deliver optional slice 4 without coupling it to core release

**Files:**
- Execute: `docs/superpowers/plans/2026-07-14-external-vendor-contact-bridge.md`
- Verify: `packages/types/src/vendor-public.ts`
- Verify: `prisma/migrations/20260714130000_external_vendor_contact/migration.sql`

**Interfaces:**
- Produces: public-safe partner search, fake external candidate search, CONTACT_ATTEMPTED record, best-effort `tel:` launch

- [ ] Implement this slice only after the core 1~3 exit gates pass or on an independent follow-up branch.
- [ ] Prove public responses exclude account IDs, internal notes, manager relationships, credit data, and activation state secrets.
- [ ] Prove logging failure never blocks the confirmed `tel:` navigation.
- [ ] Keep real maps, real local search, call outcome tracking, and AI responsibility logic out of scope.
- [ ] Tag the slice with a focused commit such as `feat(vendor): add public contact bridge`.

---

### Task 6: Integrated golden scenario and migration rehearsal

**Files:**
- Create: `apps/api/src/credit/vendor-credit-golden-flow.spec.ts`
- Create: `apps/api/src/credit/vendor-credit-golden-flow.fixture.ts`
- Verify: all five new migrations, including the optional 130000 migration when slice 4 is present
- Modify: `apps/api/src/roomlog/scripts/seed-vendor-foundation.ts` only if its reusable core does not yet return `issuedRawKey`

**Interfaces:**
- Consumes: seeded manager, vendor, activation key, LANDLORD repair, approved estimate, Toss fake gateway
- Produces: deterministic `100,000 → +500,000 → -120,000 = 480,000` flow with idempotent retry

- [ ] **Step 1: Write the failing golden-flow test before final integration wiring**

```ts
it("keeps one ledger trail through activation, estimate, topup and auto debit", async () => {
  const harness = await createVendorCreditGoldenHarness({
    databaseUrl: process.env.ROOMLOG_TEST_DATABASE_URL!,
    now: new Date("2026-07-14T09:00:00.000Z"),
    activationKeyFactory: () => "JIPJU-VND-TEST-0001",
    toss: new FakeTossPaymentGateway({ status: "DONE", method: "카드" })
  });

  try {
    const committed = await harness.runUntilCreditCommitWithoutDeliveryAck();
    assert.equal(committed.balance, 480_000);
    assert.deepEqual(committed.ledgerAmounts, [100_000, 500_000, -120_000]);
    assert.equal(committed.paymentRequestStatus, "AUTO_PAID");
    assert.equal(committed.creditDeliveryState, "PROCESSING");

    const recovered = await harness.expireLeaseAndRestartWorker();
    assert.equal(recovered.balance, 480_000);
    assert.equal(recovered.debitEntryCount, 1);
    assert.equal(recovered.creditDeliveryState, "DELIVERED");

    const retried = await harness.retryCompletionAndSettlement();
    assert.equal(retried.balance, 480_000);
    assert.equal(retried.debitEntryCount, 1);
  } finally {
    await harness.cleanup();
  }
});
```

- [ ] **Step 2: Run RED against migrated Postgres**

```bash
docker compose up -d postgres
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm db:test:push
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register src/credit/vendor-credit-golden-flow.spec.ts
```

Expected: FAIL until all three core slice providers and the fake Toss gateway are wired.

- [ ] **Step 3: Add only the integration fixture and dependency wiring needed by the test**

`vendor-credit-golden-flow.fixture.ts` owns `FakeTossPaymentGateway`, a fixed clock, the test Prisma client, unique fixture IDs, worker crash hooks, and cleanup. Its `run()` sequence is fixed: call `seedVendorFoundation()` and use its returned raw key → preview/claim dedicated vendor user → register/assign through manager/workflow domains → submit and approve one 120,000원 estimate → create/confirm one 500,000원 topup → submit and approve completion → run the durable credit worker → let the real credit boundary auto-debit. It may insert only prerequisite User/Room/Ticket rows through named fixture builders; it must call public activation/workflow/credit contracts for every state transition and never update success status rows directly. The crash scenario stops after Credit commit but before delivery CAS, expires/reclaims the lease, restarts the worker, and asserts `ALREADY_FINAL` closes the same receipt without duplicate finance rows.

- [ ] **Step 4: Run GREEN and the concurrency suites**

```bash
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/prisma-vendor-activation.repository.spec.ts \
  src/roomlog/prisma-vendor-workflow.repository.spec.ts \
  src/credit/prisma-credit-command.repository.spec.ts \
  src/credit/vendor-credit-golden-flow.spec.ts
```

Expected: all activation, workflow, financial concurrency, and golden-flow tests pass with no skipped DB assertions while Postgres is running.

- [ ] **Step 5: Rehearse migrations from the latest dev schema and inspect constraints**

```bash
pnpm db:generate
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm db:test:push
DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm prisma migrate status
docker exec roomlog-postgres psql -U roomlog -d roomlog_test -c '\\d+ "CreditLedgerEntry"'
docker exec roomlog-postgres psql -U roomlog -d roomlog_test -c '\\d+ "VendorAccountLink"'
```

Expected: all migrations applied; CHECK and partial unique indexes appear in PostgreSQL. Credit Task 1 has already replaced `db:test:push` with guarded `prisma migrate deploy`, so this reset path includes raw migration SQL and refuses any database other than `roomlog_test`.

- [ ] **Step 6: Commit integration verification**

```bash
git add apps/api/src/credit/vendor-credit-golden-flow.spec.ts apps/api/src/credit/vendor-credit-golden-flow.fixture.ts apps/api/package.json
git commit -m "test: cover vendor credit golden flow"
```

---

### Task 7: Full verification and review handoff

**Files:**
- Verify: all files changed by slices 1~4
- Verify: no unrelated or secret files staged

**Interfaces:**
- Produces: reviewable branch with reproducible evidence and no implementation ambiguity

- [ ] **Step 1: Run complete static and unit verification**

```bash
pnpm --filter @roomlog/types typecheck
pnpm db:generate
pnpm test:api
pnpm test:web
bash scripts/verify.sh
```

- [ ] **Step 2: Rebuild the standard Docker stack**

```bash
pnpm docker:up
docker compose ps
curl -fsS http://localhost:4000/api/health
```

Expected: web `:3000`, api `:4000`, postgres `:5433` are healthy.

- [ ] **Step 3: Manually walk the core demo**

1. `/vendor` → activation → dedicated vendor account → `/vendor/job/00`.
2. 관리자 `업체 찾기` → `내 업체 등록` → repair 배정.
3. 업체 fixed estimate 제출 → 관리자 승인 → 완료보고.
4. 관리자 완료 승인 → auto debit or approval path.
5. any ManagerAppShell page에서 `충전` → Toss test flow → original page return and updated header balance.
6. `/manager/vendor-mgmt/credit`에서 ledger, payment request, policy, reversal/void status 확인.

- [ ] **Step 4: Audit scope and secrets**

```bash
git diff --check origin/dev...HEAD
git diff --stat origin/dev...HEAD
git diff --name-only origin/dev...HEAD
rg -n -e 'secretKey' -e 'JIPJU-VND-[A-Z0-9-]+' -e "paymentKey\\s*[:=]\\s*['\\\"]" apps packages prisma --glob '!**/*.spec.ts' --glob '!**/demo-*'
rg -n '#[0-9a-fA-F]{3,8}' apps/web/src packages/ui/src --glob '*.css' --glob '*.tsx'
```

Expected: no raw activation key or secret is committed, no new raw hex is introduced, and the diff contains only this feature.

- [ ] **Step 5: Request an adversarial review before merge**

Reviewer must attempt to refute:

- cross-role activation safety;
- transaction and idempotency guarantees;
- manager/vendor/tenant scope enforcement;
- projector stale-write protection;
- public projection data minimization;
- AI and billing domain non-interference.

- [ ] **Step 6: Publish only on explicit user request**

Do not push or create a PR merely because verification passed. When requested, fetch `origin/dev` once more, merge it, rerun affected tests, push the feature branch, and open a ready (non-draft) PR whose title identifies the sender.
