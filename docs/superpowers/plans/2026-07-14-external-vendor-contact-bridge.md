# External Vendor Contact Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세입자와 다른 AI 작업이 내부 업체 정보나 책임 판단을 건드리지 않고 공개 협력업체를 검색하고, 지역별 가짜 외부 업체에 전화 연락을 시도한 사실만 안전하게 기록할 수 있는 선택형 브리지를 만든다.

**Architecture:** 슬라이스 1의 전역 업체 원장은 명시적 allow-list projection으로만 읽고, 외부 업체 후보는 별도의 정적 가짜 데이터셋에서 검색해 업체 원장으로 승격하지 않는다. 세입자 검색과 연락 기록은 인증 세션의 tenant와 `Ticket.id` 소유권을 awaited Prisma repository에서 검증하며, 브라우저는 기록 요청을 먼저 시작한 뒤 성공·실패와 무관하게 `tel:` navigation을 실행한다. 이 슬라이스는 core 슬라이스 1~3과 별도 브랜치·커밋·검토 단위이며 core 출시의 병합 조건이 아니다.

**Tech Stack:** TypeScript 5.9, `@roomlog/types`, NestJS 11, Prisma 7/PostgreSQL, Next.js 16 App Router, React 19, Node test runner, Docker Compose

## Global Constraints

- 기준 설계는 `docs/superpowers/specs/2026-07-14-vendor-management-credit-design.md`이며, 이 문서는 master 계획의 선택 슬라이스 4만 구현한다.
- 먼저 `docs/superpowers/plans/2026-07-14-vendor-credit-delivery-master.md`의 baseline gate를 완료한다. 슬라이스 1~3이 아직 병합 중이면 이 계획은 별도 follow-up 브랜치에서 대기하며 core PR을 막지 않는다.
- 공유 타입 경로는 `packages/types/src/vendor-public.ts`로 고정한다. 기존 관리인 전용 `packages/types/src/vendor-mgmt.ts`의 `VendorProfile`을 공개 응답 타입으로 재사용하지 않는다.
- 신규 migration 경로는 `prisma/migrations/20260714130000_external_vendor_contact/migration.sql`로 고정하며 과거 migration을 수정하지 않는다.
- 공개 협력업체 응답은 `vendorId`, 상호, 업종, 서비스 지역만 명시적으로 조립한다. `userId`, 담당자, 전화번호, 내부 메모, 관리자 관계, 계정 링크, activation, 크레딧·결제 정책을 포함하지 않는다.
- 외부 업체 후보는 코드에 고정된 가짜 데이터만 사용한다. 실제 지도·지역검색 API·크롤링을 추가하지 않고, 결과를 `VendorProfile`, `ManagerVendor`, `VendorAccountLink`로 자동 등록하거나 승격하지 않는다.
- 세입자 검색과 연락 기록의 `tenantId`는 Authorization 세션에서만 얻는다. 요청 body/query의 tenant·상호·전화·status·시각을 신뢰하지 않는다.
- 이 계획의 `caseId`는 기존 `Ticket.id`로 고정한다. 모든 tenant endpoint는 `Ticket.id + tenantId`를 함께 조회하고, 존재하지 않는 건과 다른 세입자 건을 동일한 `404`로 처리한다.
- 외부 전화 기록은 `channel=PHONE`, `status=CONTACT_ATTEMPTED`만 저장한다. 웹/PWA가 알 수 없는 연결·응답·통화시간·통화완료 상태를 생성하지 않는다.
- 연락 기록 mutation은 읽기 데모 fallback이나 성공 가장을 하지 않는다. API/DB 실패는 실제 실패로 남기되 `tel:` 실행을 막지 않는다.
- AI 책임 판단, 요약, 음성, 프롬프트, 책임 분기 UI를 수정하지 않는다. 업체 검색은 `caseId | repairId`, 수리 분야, 이미 결정된 비용 부담자, 검색어, 공개 가능한 위치 범위만 `Readonly` 입력으로 소비하고 값을 수정하거나 재판정하지 않는다.
- `apps/api/src/roomlog/roomlog.service.ts`의 책임 분석·교정 경로와 `apps/api/src/roomlog/services/roomlog-vendor-repair.domain.ts`의 비용 부담 결정 경로를 이 슬라이스에서 수정하지 않는다.
- 임차인 UI는 기존 `PhoneFrame` 하위의 `T-DEF-06`에 선택 섹션만 추가한다. 추천 지도, 책임 경로 분기, 자동 배정, 견적 생성은 추가하지 않는다.
- 스타일 값은 `packages/ui/src/tokens.css`의 `var(--...)`만 사용하고 raw hex를 추가하지 않는다.
- 기본 개발·검증 환경은 Docker Compose다. Postgres 통합 테스트는 `roomlog-postgres`가 실행 중인 상태에서 skip 없이 확인한다.
- 각 Task는 RED 확인 → 최소 구현 → GREEN 확인 → 집중 커밋 순서로 완료하고 다음 Task로 넘어간다.

---

## File Structure and Ownership

| 파일 | 책임 |
| --- | --- |
| `packages/types/src/vendor-public.ts` | 공개 업체, 외부 검색, 연락 시도 요청·응답의 유일한 공유 계약 |
| `apps/api/src/roomlog/vendor-public.repository.ts` | 공개 catalog read와 tenant case/contact repository 인터페이스 |
| `apps/api/src/roomlog/prisma-vendor-public.repository.ts` | active+verified catalog allow-list read |
| `apps/api/src/roomlog/prisma-external-vendor-contact.repository.ts` | tenant case 소유권 read와 CONTACT_ATTEMPTED insert |
| `apps/api/src/roomlog/data/demo-external-vendors.ts` | DB 업체 원장과 분리된 지역별 가짜 외부 업체 원본 |
| `apps/api/src/roomlog/services/roomlog-vendor-public.domain.ts` | 공개 projection, 외부 검색, tenant-scoped 연락 기록 정책 |
| `apps/api/src/roomlog/services/vendor-public-location.ts` | 주소를 시·도+구 수준 공개 위치로 축약하는 순수 함수 |
| `apps/api/src/roomlog/services/vendor-public-taxonomy.ts` | 실제 Ticket 한글 category와 demo trade code를 canonical 값으로 정규화 |
| `apps/web/src/lib/vendor-public-api.ts` | 서버 컴포넌트용 read API와 public-safe read fallback |
| `apps/web/src/lib/demo-vendor-public.ts` | 인증 문맥이 필요 없는 공개 협력업체 read 전용 public-safe 가짜 결과 |
| `apps/web/src/lib/external-vendor-call.ts` | 연락 기록 요청 시작과 `tel:` 실행 순서를 보장하는 브라우저 helper |
| `apps/web/src/app/tenant/defect/06/ExternalVendorCandidates.tsx` | 선택형 후보 목록과 최종 확인 dialog |

다음 기존 파일은 wiring에만 최소 수정한다.

- `packages/types/src/index.ts`: `vendor-public.ts` re-export
- `prisma/schema.prisma`: `ExternalVendorContactAttempt`와 관계 추가
- `apps/api/src/roomlog/roomlog.controller.ts`: public/tenant endpoint 세 개 추가
- `apps/api/src/roomlog/roomlog.module.ts`: 별도 domain/repository provider 추가
- `apps/web/src/lib/defect-api.ts`: complaint route id와 분리된 실제 `Ticket.id`를 server-only repair context로 반환
- `apps/web/src/app/tenant/defect/06/page.tsx`: 선택 섹션을 조립

`RoomlogVendorPublicDomain`은 controller에 Nest property injection으로 직접 주입한다. 기존 두 인자 `RoomlogController` constructor signature를 유지해 현재 controller unit tests를 깨뜨리지 않고, 이 선택 슬라이스를 기존 대형 `RoomlogService`에 delegate로 추가하지 않는다.

---

### Task 1: Freeze the public-safe shared contract

**Files:**
- Create: `packages/types/src/vendor-public.ts`
- Modify: `packages/types/src/index.ts`
- Create: `apps/api/src/roomlog/vendor-public-contract.spec.ts`

**Interfaces:**
- Consumes: stable catalog `vendorId` from slice 1; existing `LANDLORD | TENANT | PENDING` cost-bearer vocabulary
- Produces: `VendorPublicProfile`, `VendorSearchContext`, `ExternalVendorSearchQuery`, `ExternalVendorSearchResult`, `CreateExternalVendorContactAttemptInput`, `ExternalVendorContactAttemptView`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type {
  CreateExternalVendorContactAttemptInput,
  ExternalVendorContactAttemptView,
  ExternalVendorSearchResult,
  VendorPublicProfile,
  VendorSearchContext
} from "@roomlog/types";

describe("vendor public contracts", () => {
  it("keeps public partner fields on an explicit allow-list", () => {
    const vendor: VendorPublicProfile = {
      vendorId: "vendor-public-1",
      businessName: "안심 설비",
      trades: ["plumbing"],
      serviceAreas: ["서울 성동구"]
    };

    assert.deepEqual(Object.keys(vendor).sort(), [
      "businessName",
      "serviceAreas",
      "trades",
      "vendorId"
    ]);
  });

  it("separates a client request from server-owned attempt facts", () => {
    const input: CreateExternalVendorContactAttemptInput = {
      caseId: "ticket-1",
      externalVendorRef: "external-demo-1"
    };
    const view: ExternalVendorContactAttemptView = {
      id: "contact-attempt-1",
      caseId: input.caseId,
      externalVendorRef: input.externalVendorRef,
      vendorNameSnapshot: "데모 성수 설비",
      channel: "PHONE",
      status: "CONTACT_ATTEMPTED",
      attemptedAt: "2026-07-15T00:00:00.000Z"
    };

    assert.equal("tenantId" in input, false);
    assert.equal("phoneSnapshot" in input, false);
    assert.equal("tenantId" in view, false);
    assert.equal(view.status, "CONTACT_ATTEMPTED");
  });

  it("models fake search and AI input without responsibility mutation fields", () => {
    const context: VendorSearchContext = Object.freeze({
      caseId: "ticket-1",
      trade: "plumbing",
      costBearer: "TENANT",
      keyword: "누수",
      publicLocationScope: "서울 성동구"
    });
    const candidate: ExternalVendorSearchResult = {
      externalVendorRef: "external-demo-1",
      vendorName: "데모 성수 설비",
      trades: ["plumbing"],
      serviceArea: "서울 성동구",
      approximateCoordinate: { latitude: 37.5445, longitude: 127.0561 },
      estimatedDistanceMeters: 850,
      phone: "02-0000-0101",
      source: "EXTERNAL_DEMO"
    };

    assert.equal("responsibilityHint" in context, false);
    assert.equal(candidate.source, "EXTERNAL_DEMO");
  });
});
```

- [ ] **Step 2: Run RED and confirm the exports are absent**

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-public-contract.spec.ts
```

Expected: FAIL with missing exports from `@roomlog/types`.

- [ ] **Step 3: Add the exact canonical contracts**

```ts
export type VendorSearchCostBearer = "LANDLORD" | "TENANT" | "PENDING";
export type ExternalVendorSearchSource = "EXTERNAL_DEMO";
export type ExternalVendorContactChannel = "PHONE";
export type ExternalVendorContactStatus = "CONTACT_ATTEMPTED";

export interface VendorPublicProfile {
  vendorId: string;
  businessName: string;
  trades: string[];
  serviceAreas: string[];
}

export interface PublicVendorSearchQuery {
  trade?: string;
  keyword?: string;
  serviceArea?: string;
}

export interface VendorSearchContext {
  readonly caseId?: string;
  readonly repairId?: string;
  readonly trade?: string;
  readonly costBearer?: VendorSearchCostBearer;
  readonly keyword?: string;
  readonly publicLocationScope?: string;
}

export interface ExternalVendorSearchQuery {
  caseId: string;
  keyword?: string;
}

export interface ExternalVendorSearchResult {
  externalVendorRef: string;
  vendorName: string;
  trades: string[];
  serviceArea: string;
  approximateCoordinate: {
    latitude: number;
    longitude: number;
  };
  estimatedDistanceMeters: number;
  phone: string;
  source: ExternalVendorSearchSource;
}

export interface CreateExternalVendorContactAttemptInput {
  caseId: string;
  externalVendorRef: string;
}

export interface ExternalVendorContactAttemptView {
  id: string;
  caseId: string;
  externalVendorRef: string;
  vendorNameSnapshot: string;
  channel: ExternalVendorContactChannel;
  status: ExternalVendorContactStatus;
  attemptedAt: string;
}
```

Do not add `userId`, `tenantId`, contact person, partner phone, internal notes, activation/account fields, credit fields, or a responsibility verdict to `VendorPublicProfile`.

- [ ] **Step 4: Re-export the file from the package root**

```ts
export * from "./vendor-public";
```

- [ ] **Step 5: Run GREEN and typecheck both consumers**

```bash
pnpm --filter @roomlog/types typecheck
pnpm --filter api exec node --test -r ts-node/register src/roomlog/vendor-public-contract.spec.ts
pnpm --filter api build
pnpm --filter web build
```

Expected: all commands PASS; the API contract test sees only the exact shared fields above.

- [ ] **Step 6: Commit the isolated contract**

```bash
git add packages/types/src/vendor-public.ts packages/types/src/index.ts apps/api/src/roomlog/vendor-public-contract.spec.ts
git commit -m "feat(vendor): define public contact contracts"
```

---

### Task 2: Add the CONTACT_ATTEMPTED schema and awaited repository

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260714130000_external_vendor_contact/migration.sql`
- Create: `apps/api/src/roomlog/vendor-public.repository.ts`
- Create: `apps/api/src/roomlog/prisma-external-vendor-contact.repository.ts`
- Create: `apps/api/src/roomlog/prisma-external-vendor-contact.repository.spec.ts`

**Interfaces:**

```ts
export interface TenantVendorCaseRecord {
  caseId: string;
  tenantId: string;
  trade: string;
  costBearer?: "LANDLORD" | "TENANT" | "PENDING";
  roomAddress: string;
}

export interface ExternalVendorContactAttemptInsert {
  id: string;
  caseId: string;
  tenantId: string;
  externalVendorRef: string;
  vendorNameSnapshot: string;
  phoneSnapshot: string;
  attemptedAt: Date;
}

export interface StoredExternalVendorContactAttempt
  extends ExternalVendorContactAttemptInsert {
  channel: "PHONE";
  status: "CONTACT_ATTEMPTED";
}

export interface ExternalVendorContactRepository {
  findOwnedCase(
    tenantId: string,
    caseId: string
  ): Promise<TenantVendorCaseRecord | undefined>;
  createAttempt(
    input: ExternalVendorContactAttemptInsert
  ): Promise<StoredExternalVendorContactAttempt>;
  disconnect?(): Promise<void>;
}

export class ExternalVendorCaseNotOwnedError extends Error {
  constructor() {
    super("Tenant does not own case");
    this.name = "ExternalVendorCaseNotOwnedError";
  }
}
```

- [ ] **Step 1: Write a failing Postgres repository test**

Create two TENANT users, one room, one complaint, and one ticket using stable test-local IDs. The test must exercise the repository rather than inserting the attempt directly.

```ts
it("finds only the tenant-owned ticket and stores an attempted phone contact", { skip: !databaseUrl }, async () => {
  const owned = await repository.findOwnedCase(tenantId, ticketId);
  const foreign = await repository.findOwnedCase(otherTenantId, ticketId);

  assert.equal(owned?.caseId, ticketId);
  assert.equal(owned?.tenantId, tenantId);
  assert.equal(foreign, undefined);

  const created = await repository.createAttempt({
    id: attemptId,
    caseId: ticketId,
    tenantId,
    externalVendorRef: "external-demo-1",
    vendorNameSnapshot: "데모 성수 설비",
    phoneSnapshot: "02-0000-0101",
    attemptedAt: new Date("2026-07-15T00:00:00.000Z")
  });

  assert.equal(created.channel, "PHONE");
  assert.equal(created.status, "CONTACT_ATTEMPTED");
  assert.equal(
    await prisma.externalVendorContactAttempt.count({ where: { caseId: ticketId } }),
    1
  );

  await assert.rejects(
    repository.createAttempt({
      id: `${attemptId}-foreign`,
      caseId: ticketId,
      tenantId: otherTenantId,
      externalVendorRef: "external-demo-1",
      vendorNameSnapshot: "데모 성수 설비",
      phoneSnapshot: "02-0000-0101",
      attemptedAt: new Date("2026-07-15T00:00:00.000Z")
    }),
    { name: "ExternalVendorCaseNotOwnedError" }
  );
  assert.equal(
    await prisma.externalVendorContactAttempt.count({ where: { id: `${attemptId}-foreign` } }),
    0
  );
});
```

The fixture setup uses these exact existing enum values: `UserRole.TENANT`, `ComplaintSourceChannel.DIRECT_FORM`, `ComplaintStatus.SUBMITTED`, and `TicketStatus.RECEIVED`. Clean rows in FK order: attempt → ticket → complaint → room → users.

- [ ] **Step 2: Run RED against the current schema**

```bash
docker compose up -d postgres
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/prisma-external-vendor-contact.repository.spec.ts
```

Expected: FAIL because the Prisma model, repository, and generated client delegate do not exist.

- [ ] **Step 3: Add the exact Prisma model and relations**

```prisma
enum ExternalVendorContactChannel {
  PHONE
}

enum ExternalVendorContactStatus {
  CONTACT_ATTEMPTED
}

model ExternalVendorContactAttempt {
  id                 String                      @id
  caseId             String
  tenantId           String
  externalVendorRef  String
  vendorNameSnapshot String
  phoneSnapshot      String
  channel            ExternalVendorContactChannel @default(PHONE)
  status             ExternalVendorContactStatus  @default(CONTACT_ATTEMPTED)
  attemptedAt        DateTime                    @default(now())

  case   Ticket      @relation(fields: [caseId], references: [id], onDelete: Cascade)
  tenant UserAccount @relation("TenantExternalVendorContactAttempts", fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, attemptedAt])
  @@index([caseId, attemptedAt])
  @@index([externalVendorRef, attemptedAt])
}
```

Add `externalVendorContactAttempts ExternalVendorContactAttempt[] @relation("TenantExternalVendorContactAttempts")` to `UserAccount`, and `externalVendorContactAttempts ExternalVendorContactAttempt[]` to `Ticket`.

- [ ] **Step 4: Implement the fixed migration without touching earlier migrations**

```sql
CREATE TYPE "ExternalVendorContactChannel" AS ENUM ('PHONE');
CREATE TYPE "ExternalVendorContactStatus" AS ENUM ('CONTACT_ATTEMPTED');

CREATE TABLE "ExternalVendorContactAttempt" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "externalVendorRef" TEXT NOT NULL,
  "vendorNameSnapshot" TEXT NOT NULL,
  "phoneSnapshot" TEXT NOT NULL,
  "channel" "ExternalVendorContactChannel" NOT NULL DEFAULT 'PHONE',
  "status" "ExternalVendorContactStatus" NOT NULL DEFAULT 'CONTACT_ATTEMPTED',
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalVendorContactAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalVendorContactAttempt_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExternalVendorContactAttempt_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ExternalVendorContactAttempt_tenantId_attemptedAt_idx"
  ON "ExternalVendorContactAttempt"("tenantId", "attemptedAt");
CREATE INDEX "ExternalVendorContactAttempt_caseId_attemptedAt_idx"
  ON "ExternalVendorContactAttempt"("caseId", "attemptedAt");
CREATE INDEX "ExternalVendorContactAttempt_externalVendorRef_attemptedAt_idx"
  ON "ExternalVendorContactAttempt"("externalVendorRef", "attemptedAt");
```

- [ ] **Step 5: Implement direct Prisma ownership read and insert**

`findOwnedCase()` must query `ticket.findFirst({ where: { id: caseId, tenantId } })`, select only `id`, `tenantId`, `category`, room address, and the latest repair `costBearer`, then return `undefined` for both missing and foreign tickets.

`createAttempt()` must re-check `Ticket.id + tenantId` inside the same Prisma transaction as the insert. This prevents an internal caller from bypassing the domain's first ownership lookup. Use this exact server-owned write shape:

```ts
const created = await this.prisma.$transaction(async (transaction) => {
  const owned = await transaction.ticket.findFirst({
    where: { id: input.caseId, tenantId: input.tenantId },
    select: { id: true }
  });
  if (!owned) throw new ExternalVendorCaseNotOwnedError();

  return transaction.externalVendorContactAttempt.create({
    data: {
      ...input,
      channel: "PHONE",
      status: "CONTACT_ATTEMPTED"
    }
  });
});
```

The RED test in Step 1 already requires the transaction-level cross-tenant rejection. Map `ExternalVendorCaseNotOwnedError` to the same tenant-safe `404` used by `findOwnedCase()`; never expose whether the ticket exists for another tenant.

The repository input has no `channel` or `status`, so a controller or caller cannot invent a call outcome. Do not add the entity to `RoomlogStore` or `PrismaStoreProjector`.

- [ ] **Step 6: Generate Prisma, reset through migrations, and run GREEN**

```bash
pnpm db:generate
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' \
  pnpm db:test:push
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/prisma-external-vendor-contact.repository.spec.ts
```

Expected: migration applies after `20260714120000_vendor_credit`; ownership and fixed-status assertions PASS without skip.

- [ ] **Step 7: Commit schema and repository together**

```bash
git add prisma/schema.prisma prisma/migrations/20260714130000_external_vendor_contact/migration.sql apps/api/src/roomlog/vendor-public.repository.ts apps/api/src/roomlog/prisma-external-vendor-contact.repository.ts apps/api/src/roomlog/prisma-external-vendor-contact.repository.spec.ts
git commit -m "feat(vendor): persist external contact attempts"
```

---

### Task 3: Build allow-list partner search and the isolated fake dataset

**Files:**
- Modify: `apps/api/src/roomlog/vendor-public.repository.ts`
- Create: `apps/api/src/roomlog/prisma-vendor-public.repository.ts`
- Create: `apps/api/src/roomlog/prisma-vendor-public.repository.spec.ts`
- Create: `apps/api/src/roomlog/data/demo-external-vendors.ts`
- Create: `apps/api/src/roomlog/services/roomlog-vendor-public.domain.ts`
- Create: `apps/api/src/roomlog/services/roomlog-vendor-public.domain.spec.ts`
- Create: `apps/api/src/roomlog/services/vendor-public-taxonomy.ts`
- Create: `apps/api/src/roomlog/services/vendor-public-taxonomy.spec.ts`

**Interfaces:**

```ts
export interface VendorPublicCatalogRow {
  vendorId: string;
  businessName: string;
  trades: string[];
  serviceAreas: string[];
}

export interface VendorPublicCatalogRepository {
  searchActiveVerified(
    query: PublicVendorSearchQuery
  ): Promise<VendorPublicCatalogRow[]>;
  disconnect?(): Promise<void>;
}

export class RoomlogVendorPublicDomain {
  searchPartnerVendors(
    query: PublicVendorSearchQuery
  ): Promise<VendorPublicProfile[]>;
  searchExternalCandidates(
    context: Readonly<VendorSearchContext>
  ): ExternalVendorSearchResult[];
  findExternalCandidate(
    externalVendorRef: string
  ): ExternalVendorSearchResult | undefined;
}
```

- [ ] **Step 1: Write RED tests for public leakage, fake filtering, and AI immutability**

```ts
it("returns only the public allow-list even when a source row carries secrets", async () => {
  catalog.searchActiveVerified = async () => [{
    vendorId: "vendor-1",
    businessName: "안심 설비",
    trades: ["plumbing"],
    serviceAreas: ["서울 성동구"],
    userId: "secret-user",
    contactPerson: "내부 담당자",
    phone: "010-1111-2222",
    internalMemo: "관리인 메모",
    creditPolicy: { autoPay: true }
  } as never];

  const [result] = await domain.searchPartnerVendors({ trade: "plumbing" });
  assert.deepEqual(Object.keys(result).sort(), [
    "businessName",
    "serviceAreas",
    "trades",
    "vendorId"
  ]);
  assert.equal(JSON.stringify(result).includes("secret-user"), false);
});

it("filters fake candidates without mutating AI-owned context", () => {
  const context = Object.freeze({
    caseId: "ticket-1",
    trade: "plumbing",
    costBearer: "TENANT" as const,
    keyword: "누수",
    publicLocationScope: "서울 성동구"
  });
  const before = structuredClone(context);
  const results = domain.searchExternalCandidates(context);

  assert.deepEqual(context, before);
  assert.ok(results.length > 0);
  assert.equal(results.every((item) => item.source === "EXTERNAL_DEMO"), true);
  assert.equal(results.every((item) => item.serviceArea === "서울 성동구"), true);
  assert.equal(JSON.stringify(results).includes("searchKeywords"), false);
});
```

Also read `roomlog-vendor-public.domain.ts` as text and assert it does not contain `responsibilityHint`, `correctedResponsibility`, `detectResponsibility`, or an update/upsert call on `VendorProfile`/`ManagerVendor`.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/services/roomlog-vendor-public.domain.spec.ts \
  src/roomlog/prisma-vendor-public.repository.spec.ts
```

Expected: FAIL because the public repository, domain, and fake data do not exist.

- [ ] **Step 3: Add the fake external dataset as immutable API-owned data**

```ts
import type { ExternalVendorSearchResult } from "@roomlog/types";

interface DemoExternalVendorRecord extends ExternalVendorSearchResult {
  searchKeywords: readonly string[];
}

export const DEMO_EXTERNAL_VENDORS = Object.freeze([
  {
    externalVendorRef: "external-seongsu-plumbing-1",
    vendorName: "데모 성수 설비",
    trades: ["plumbing"],
    serviceArea: "서울 성동구",
    approximateCoordinate: { latitude: 37.5445, longitude: 127.0561 },
    estimatedDistanceMeters: 850,
    phone: "02-0000-0101",
    source: "EXTERNAL_DEMO",
    searchKeywords: ["누수", "배관", "수도"]
  },
  {
    externalVendorRef: "external-seongsu-hvac-1",
    vendorName: "데모 서울 냉난방",
    trades: ["hvac"],
    serviceArea: "서울 성동구",
    approximateCoordinate: { latitude: 37.5482, longitude: 127.0418 },
    estimatedDistanceMeters: 1_600,
    phone: "02-0000-0102",
    source: "EXTERNAL_DEMO",
    searchKeywords: ["에어컨", "냉난방", "물샘"]
  },
  {
    externalVendorRef: "external-mapo-general-1",
    vendorName: "데모 마포 홈케어",
    trades: ["general", "electrical"],
    serviceArea: "서울 마포구",
    approximateCoordinate: { latitude: 37.5663, longitude: 126.9014 },
    estimatedDistanceMeters: 1_150,
    phone: "02-0000-0201",
    source: "EXTERNAL_DEMO",
    searchKeywords: ["전기", "종합", "홈케어"]
  }
] satisfies readonly DemoExternalVendorRecord[]);
```

The `0000` exchange and `데모` names intentionally prevent presentation data from being mistaken for a real provider. Do not seed these rows into PostgreSQL.

- [ ] **Step 4: Implement the Prisma public read with a select allow-list**

```ts
return this.prisma.vendorProfile.findMany({
  where: {
    isActive: true,
    verificationStatus: "VERIFIED",
    ...(query.trade ? { trades: { has: query.trade } } : {}),
    ...(query.serviceArea ? { serviceAreas: { has: query.serviceArea } } : {}),
    ...(query.keyword
      ? { businessName: { contains: query.keyword, mode: "insensitive" } }
      : {})
  },
  select: {
    id: true,
    businessName: true,
    trades: true,
    serviceAreas: true
  },
  orderBy: [{ businessName: "asc" }, { id: "asc" }]
}).then((rows) => rows.map((row) => ({
  vendorId: row.id,
  businessName: row.businessName,
  trades: row.trades,
  serviceAreas: row.serviceAreas
})));
```

The repository integration spec seeds ACTIVE/VERIFIED, inactive, PENDING, and out-of-area catalogs. Assert only ACTIVE+VERIFIED matching rows return, and assert `JSON.stringify(result)` has no contact, account, manager, activation, credit, or payment values.

- [ ] **Step 5: Implement pure allow-list projection and fake filtering**

```ts
async searchPartnerVendors(query: PublicVendorSearchQuery) {
  const rows = await this.catalog.searchActiveVerified(query);
  return rows.map((row) => ({
    vendorId: row.vendorId,
    businessName: row.businessName,
    trades: [...row.trades],
    serviceAreas: [...row.serviceAreas]
  }));
}

searchExternalCandidates(context: Readonly<VendorSearchContext>) {
  const trade = normalizeVendorTrade(context.trade);
  const keyword = context.keyword?.trim().toLowerCase();
  const scope = context.publicLocationScope?.trim();

  return DEMO_EXTERNAL_VENDORS
    .filter((candidate) => !trade || candidate.trades.includes(trade))
    .filter((candidate) => !scope || candidate.serviceArea === scope)
    .filter((candidate) =>
      !keyword || `${candidate.vendorName} ${candidate.trades.join(" ")} ${candidate.searchKeywords.join(" ")}`.toLowerCase().includes(keyword)
    )
    .map((candidate) => ({
      externalVendorRef: candidate.externalVendorRef,
      vendorName: candidate.vendorName,
      trades: [...candidate.trades],
      serviceArea: candidate.serviceArea,
      approximateCoordinate: { ...candidate.approximateCoordinate },
      estimatedDistanceMeters: candidate.estimatedDistanceMeters,
      phone: candidate.phone,
      source: "EXTERNAL_DEMO" as const
    }));
}
```

`normalizeVendorTrade()` returns the canonical codes used by the fake dataset. Lock at least these real project values: `배관/수전 | 누수 | 배관 → plumbing`, `냉난방 | 에어컨 → hvac`, `전기 → electrical`, `종합 | 기타 → general`; already-canonical values pass through and unknown/blank values return `undefined`. Run an integration fixture with Ticket category `배관/수전` and Room address `서울시 성동구 ...` and require the Seongsu plumbing result so tests cannot pass only with self-consistent English fake values.

`findExternalCandidate()` is not an authorization shortcut. Contact recording must first rebuild an owned-case context and search the eligible result set; a globally valid demo ref from another trade/region is rejected.

- [ ] **Step 6: Run GREEN with the migrated test database**

```bash
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/services/roomlog-vendor-public.domain.spec.ts \
  src/roomlog/prisma-vendor-public.repository.spec.ts
```

Expected: allow-list leakage, active/verified filtering, fake search, no-upsert, and frozen AI context tests PASS.

- [ ] **Step 7: Commit the read/search domain**

```bash
git add apps/api/src/roomlog/vendor-public.repository.ts apps/api/src/roomlog/prisma-vendor-public.repository.ts apps/api/src/roomlog/prisma-vendor-public.repository.spec.ts apps/api/src/roomlog/data/demo-external-vendors.ts apps/api/src/roomlog/services/roomlog-vendor-public.domain.ts apps/api/src/roomlog/services/roomlog-vendor-public.domain.spec.ts apps/api/src/roomlog/services/vendor-public-taxonomy.ts apps/api/src/roomlog/services/vendor-public-taxonomy.spec.ts
git commit -m "feat(vendor): add public and fake search"
```

---

### Task 4: Enforce tenant ownership and expose the three API boundaries

**Files:**
- Create: `apps/api/src/roomlog/services/vendor-public-location.ts`
- Create: `apps/api/src/roomlog/services/vendor-public-location.spec.ts`
- Modify: `apps/api/src/roomlog/services/vendor-public-taxonomy.ts`
- Modify: `apps/api/src/roomlog/services/vendor-public-taxonomy.spec.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-public.domain.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-vendor-public.domain.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Modify: `apps/api/src/roomlog/roomlog.module.ts`
- Modify: `apps/api/src/roomlog/roomlog.module.spec.ts`
- Create: `apps/api/src/roomlog/roomlog-vendor-public.api.spec.ts`

**Interfaces:**

```ts
export class RoomlogVendorPublicDomain implements OnModuleDestroy {
  searchPartnerVendors(query: PublicVendorSearchQuery): Promise<VendorPublicProfile[]>;
  searchExternalCandidates(context: Readonly<VendorSearchContext>): ExternalVendorSearchResult[];
  searchTenantExternalVendors(
    tenantId: string,
    input: ExternalVendorSearchQuery
  ): Promise<ExternalVendorSearchResult[]>;
  recordTenantPhoneAttempt(
    tenantId: string,
    input: CreateExternalVendorContactAttemptInput
  ): Promise<ExternalVendorContactAttemptView>;
  onModuleDestroy(): Promise<void>;
}

export function publicLocationScope(address: string): string | undefined;
```

API routes:

```text
GET  /public/vendors?trade=&keyword=&serviceArea=
GET  /tenant/external-vendors?caseId=&keyword=       + TENANT bearer
POST /tenant/external-vendor-contact-attempts        + TENANT bearer
body: { "caseId": "ticket-demo-101", "externalVendorRef": "ext-plumber-mapogu-01" }
```

- [ ] **Step 1: Write RED location and ownership tests**

```ts
assert.equal(publicLocationScope("서울시 성동구 성수동2가 123-4"), "서울 성동구");
assert.equal(publicLocationScope("부산광역시 해운대구 우동 99"), "부산 해운대구");
assert.equal(publicLocationScope("정글빌라 301호"), undefined);
assert.equal(publicLocationScope("서울 성수동"), undefined);
assert.equal(publicLocationScope("정확한주소하나"), undefined);
```

Domain tests must require:

```ts
await assert.rejects(
  domain.searchTenantExternalVendors("other-tenant", { caseId: "ticket-1" }),
  { name: "NotFoundException" }
);

await domain.recordTenantPhoneAttempt("tenant-1", {
  caseId: "ticket-1",
  externalVendorRef: "external-seongsu-plumbing-1"
});

assert.deepEqual(repository.lastInsert, {
  id: "external-contact-fixed-id",
  caseId: "ticket-1",
  tenantId: "tenant-1",
  externalVendorRef: "external-seongsu-plumbing-1",
  vendorNameSnapshot: "데모 성수 설비",
  phoneSnapshot: "02-0000-0101",
  attemptedAt: new Date("2026-07-15T00:00:00.000Z")
});
```

Inject deterministic `createId: () => "external-contact-fixed-id"` and `now: () => new Date(...)` into the domain test. Also assert an unknown ref and a globally valid but wrong-region/wrong-trade ref both return 404 and create no row.

- [ ] **Step 2: Write RED controller/session tests**

Instantiate `RoomlogController` with its existing two arguments (`RoomlogService`, realtime stub), then assign the Nest-injected `vendorPublic` property to a domain spy in this focused unit test. Log in with `tenant@roomlog.test / password123!` and assert the controller passes `tenant-demo` from the bearer token, not a body field.

```ts
const controller = new RoomlogController(service, realtimeStub);
Object.assign(controller, { vendorPublic: domainSpy });
const auth = service.login({ email: "tenant@roomlog.test", password: "password123!" });
await controller.recordExternalVendorContactAttempt(
  `Bearer ${auth.accessToken}`,
  {
    caseId: "ticket-demo",
    externalVendorRef: "external-seongsu-plumbing-1"
  }
);
assert.equal(domainSpy.recordedTenantId, "tenant-demo");

await assert.rejects(
  controller.recordExternalVendorContactAttempt(
    `Bearer ${auth.accessToken}`,
    {
      caseId: "ticket-demo",
      externalVendorRef: "external-seongsu-plumbing-1",
      tenantId: "landlord-demo",
      phoneSnapshot: "010-9999-9999",
      status: "CALL_COMPLETED"
    } as never
  ),
  { name: "BadRequestException" }
);
```

This is a RED test because the route and exact-key guard do not exist yet. A LANDLORD bearer must receive `ForbiddenException`. Public partner search calls the domain without an authorization argument.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/services/vendor-public-location.spec.ts \
  src/roomlog/services/roomlog-vendor-public.domain.spec.ts \
  src/roomlog/roomlog-vendor-public.api.spec.ts \
  src/roomlog/roomlog.module.spec.ts
```

Expected: FAIL because tenant-scoped methods, routes, provider, and location redaction are absent.

- [ ] **Step 4: Implement coarse location derivation and tenant-scoped domain methods**

```ts
export function publicLocationScope(address: string): string | undefined {
  const parts = address.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return undefined;
  const region = canonicalRegion(parts[0]);
  const district = /(?:시|군|구)$/.test(parts[1]) ? parts[1] : undefined;
  return region && district ? `${region} ${district}` : undefined;
}
```

`canonicalRegion()` uses an explicit allow-list for Korean top-level administrative regions (for example `서울 | 서울시 | 서울특별시 → 서울`, `부산광역시 → 부산`, `경기 | 경기도 → 경기`) and returns `undefined` for building names or unknown text. Never fall back to “first two tokens.” If structured region/district fields become available later, pass those fields instead of reparsing a full address.

`searchTenantExternalVendors()` must:

1. await `contactRepository.findOwnedCase(tenantId, input.caseId)`;
2. throw `NotFoundException("하자 건을 찾을 수 없습니다.")` when absent;
3. create a new allow-listed `VendorSearchContext` from `caseId`, `normalizeVendorTrade(DB trade)`, DB `costBearer`, client keyword, and `publicLocationScope(roomAddress)`;
4. pass that fresh object to `searchExternalCandidates()`;
5. never return room address or tenant ID.

`recordTenantPhoneAttempt()` repeats the ownership lookup and rebuilds the same server-owned trade, cost-bearer, and public-location context (keyword omitted because it is only a UI narrowing hint). It calls `searchExternalCandidates(context)` and resolves `externalVendorRef` **only inside that eligible result set**; a real ref belonging to another region/trade returns tenant-safe `404` and creates no attempt. It then constructs server snapshots, awaits `createAttempt()`, maps `ExternalVendorCaseNotOwnedError` to the same tenant-safe `404`, and returns only this response:

```ts
return {
  id: stored.id,
  caseId: stored.caseId,
  externalVendorRef: stored.externalVendorRef,
  vendorNameSnapshot: stored.vendorNameSnapshot,
  channel: "PHONE",
  status: "CONTACT_ATTEMPTED",
  attemptedAt: stored.attemptedAt.toISOString()
};
```

- [ ] **Step 5: Add exact controller allow-lists and role guards**

Keep the existing constructor unchanged and add the property provider before the route methods:

```ts
@Inject(RoomlogVendorPublicDomain)
private readonly vendorPublic!: RoomlogVendorPublicDomain;
```

Import `Inject` from `@nestjs/common`. Existing controller tests that call `new RoomlogController(service, realtime)` continue compiling; the new API spec assigns a domain spy explicitly.

```ts
@Get("public/vendors")
listPublicVendors(
  @Query("trade") trade?: string,
  @Query("keyword") keyword?: string,
  @Query("serviceArea") serviceArea?: string
) {
  return this.vendorPublic.searchPartnerVendors({ trade, keyword, serviceArea });
}

@Get("tenant/external-vendors")
listTenantExternalVendors(
  @Headers("authorization") authorization: string | undefined,
  @Query("caseId") caseId: string,
  @Query("keyword") keyword?: string
) {
  const user = this.requireRole(authorization, ["TENANT"]);
  return this.vendorPublic.searchTenantExternalVendors(user.id, { caseId, keyword });
}

@Post("tenant/external-vendor-contact-attempts")
recordExternalVendorContactAttempt(
  @Headers("authorization") authorization: string | undefined,
  @Body() body: CreateExternalVendorContactAttemptInput
) {
  const user = this.requireRole(authorization, ["TENANT"]);
  assertExactBodyKeys(body, ["caseId", "externalVendorRef"]);
  return this.vendorPublic.recordTenantPhoneAttempt(user.id, body);
}
```

`assertExactBodyKeys()` rejects missing/blank required strings and every additional key. It must run before the domain call. The controller never accepts `tenantId`, name/phone snapshot, channel, status, or timestamp.

Use this exact local guard and apply `assertRequiredString(caseId, "caseId")` to the tenant GET query before the domain call:

```ts
function assertRequiredString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${field} 값이 필요합니다.`);
  }
}

function assertExactBodyKeys(body: unknown, required: readonly string[]): void {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("요청 본문 형식이 올바르지 않습니다.");
  }
  const record = body as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const allowed = [...required].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new BadRequestException("허용되지 않은 요청 필드가 있습니다.");
  }
  required.forEach((field) => assertRequiredString(record[field], field));
}
```

- [ ] **Step 6: Wire the separate provider without adding RoomlogService methods**

Export `createRoomlogVendorPublicDomain(env)` from `roomlog.module.ts`. With `DATABASE_URL`, construct `PrismaVendorPublicRepository` and `PrismaExternalVendorContactRepository`. Without `DATABASE_URL`, use an empty catalog reader and an unavailable contact repository whose ownership/contact methods throw `ServiceUnavailableException`; do not use a successful in-memory mutation fake. `RoomlogVendorPublicDomain` implements Nest `OnModuleDestroy`; `onModuleDestroy()` closes both Prisma repositories, and the module lifecycle test invokes that hook and asserts cleanup.

- [ ] **Step 7: Run GREEN**

```bash
pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/services/vendor-public-location.spec.ts \
  src/roomlog/services/roomlog-vendor-public.domain.spec.ts \
  src/roomlog/roomlog-vendor-public.api.spec.ts \
  src/roomlog/roomlog.module.spec.ts \
  src/roomlog/prisma-external-vendor-contact.repository.spec.ts
pnpm --filter api build
```

Expected: public route is anonymous and allow-listed; both tenant routes are tenant-scoped; foreign case, extra body fields, unknown ref, and no-DB mutation fail without a write.

- [ ] **Step 8: Commit API wiring**

```bash
git add apps/api/src/roomlog/services/vendor-public-location.ts apps/api/src/roomlog/services/vendor-public-location.spec.ts apps/api/src/roomlog/services/vendor-public-taxonomy.ts apps/api/src/roomlog/services/vendor-public-taxonomy.spec.ts apps/api/src/roomlog/services/roomlog-vendor-public.domain.ts apps/api/src/roomlog/services/roomlog-vendor-public.domain.spec.ts apps/api/src/roomlog/roomlog.controller.ts apps/api/src/roomlog/roomlog.module.ts apps/api/src/roomlog/roomlog.module.spec.ts apps/api/src/roomlog/roomlog-vendor-public.api.spec.ts
git commit -m "feat(vendor): expose tenant-safe contact API"
```

---

### Task 5: Add server-side read clients with truthful tenant failure handling

**Files:**
- Create: `apps/web/src/lib/demo-vendor-public.ts`
- Create: `apps/web/src/lib/vendor-public-api.ts`
- Create: `apps/web/src/lib/vendor-public-api.spec.ts`

**Interfaces:**

```ts
export const vendorPublicPaths: {
  partners(query?: PublicVendorSearchQuery): string;
  external(query: ExternalVendorSearchQuery): string;
};

export function listPublicPartnerVendors(
  query?: PublicVendorSearchQuery
): Promise<VendorPublicProfile[]>;

export function listTenantExternalVendors(
  query: ExternalVendorSearchQuery
): Promise<ExternalVendorSearchResult[]>;
```

- [ ] **Step 1: Write RED path, fallback, and mutation-separation tests**

```ts
assert.equal(
  vendorPublicPaths.partners({ trade: "plumbing", serviceArea: "서울 성동구" }),
  "/public/vendors?trade=plumbing&serviceArea=%EC%84%9C%EC%9A%B8+%EC%84%B1%EB%8F%99%EA%B5%AC"
);
assert.equal(
  vendorPublicPaths.external({ caseId: "ticket/1", keyword: "누수" }),
  "/tenant/external-vendors?caseId=ticket%2F1&keyword=%EB%88%84%EC%88%98"
);

const publicFallback = await readWithPublicFallback(
  async () => { throw new Error("API down"); },
  DEMO_PUBLIC_PARTNER_VENDORS
);
assert.deepEqual(publicFallback, DEMO_PUBLIC_PARTNER_VENDORS);

const tenantFallback = await readTenantExternalVendors(
  async () => { throw new Error("API down"); }
);
assert.deepEqual(tenantFallback, []);
```

Read the module source and assert it contains no POST, contact-attempt mutation, fake mutation success, `tenantId`, `userId`, `internalMemo`, or credit/payment fields.

- [ ] **Step 2: Run RED**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/vendor-public-api.spec.ts
```

Expected: FAIL because the read client and public-safe fallback do not exist.

- [ ] **Step 3: Add public-safe web demo rows**

`DEMO_PUBLIC_PARTNER_VENDORS` contains only `VendorPublicProfile` fields because that anonymous endpoint does not require case ownership, trade, or location context. Do not duplicate external candidate rows in web: when the tenant-scoped API is unavailable, the server cannot safely reconstruct the owned Ticket's canonical trade/location, so it must return an empty list rather than show a mismatched fake provider. The API-owned fake dataset is still used after a real tenant case passes ownership validation.

- [ ] **Step 4: Implement deterministic path builders and read-only fallback**

```ts
export async function readWithPublicFallback<T>(
  read: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.warn("[vendor-public/api] read failed; using public demo", error);
    return fallback;
  }
}

export function listPublicPartnerVendors(query: PublicVendorSearchQuery = {}) {
  return readWithPublicFallback(
    () => serverFetch<VendorPublicProfile[]>(vendorPublicPaths.partners(query)),
    filterDemoPublicPartners(query)
  );
}

export function listTenantExternalVendors(query: ExternalVendorSearchQuery) {
  return readTenantExternalVendors(
    () => serverFetch<ExternalVendorSearchResult[]>(vendorPublicPaths.external(query))
  );
}

export async function readTenantExternalVendors(
  read: () => Promise<ExternalVendorSearchResult[]>
) {
  try {
    return await read();
  } catch (error) {
    console.warn("[vendor-public/api] tenant external read failed; using empty state", error);
    return [];
  }
}
```

This file is server-only. Browser mutations use the existing `/api/tenant/[...path]` BFF in Task 6 and never call `serverFetch`.

- [ ] **Step 5: Run GREEN and web build**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/vendor-public-api.spec.ts
cd ../..
pnpm --filter web build
```

Expected: path encoding, public-safe filtering, and read fallback tests PASS; no mutation helper exists in `vendor-public-api.ts`.

- [ ] **Step 6: Commit the read bridge**

```bash
git add apps/web/src/lib/demo-vendor-public.ts apps/web/src/lib/vendor-public-api.ts apps/web/src/lib/vendor-public-api.spec.ts
git commit -m "feat(web): add external vendor read bridge"
```

---

### Task 6: Confirm, request the attempt, and launch `tel:` regardless of failure

**Files:**
- Create: `apps/web/src/lib/external-vendor-call.ts`
- Create: `apps/web/src/lib/external-vendor-call.spec.ts`
- Create: `apps/web/src/app/tenant/defect/06/ExternalVendorCandidates.tsx`
- Create: `apps/web/src/app/tenant/defect/06/ExternalVendorCandidates.module.css`
- Create: `apps/web/src/app/tenant/defect/06/external-vendor-candidates.spec.ts`
- Modify: `apps/web/src/lib/defect-api.ts`
- Modify: `apps/web/src/app/tenant/defect/06/page.tsx`

**Interfaces:**

```ts
export interface ExternalVendorPhoneCallDependencies {
  recordAttempt(input: CreateExternalVendorContactAttemptInput): Promise<void>;
  openTel(href: `tel:${string}`): void;
  onRecordError(error: unknown): void;
}

export function toTelHref(phone: string): `tel:${string}`;

export function beginExternalVendorPhoneCall(
  input: CreateExternalVendorContactAttemptInput & { phone: string },
  dependencies: ExternalVendorPhoneCallDependencies
): Promise<void>;

export function recordExternalVendorPhoneAttempt(
  input: CreateExternalVendorContactAttemptInput,
  fetcher?: typeof fetch
): Promise<void>;
```

- [ ] **Step 1: Write RED ordering and failure-independence tests**

```ts
it("starts the attempt request before opening tel", async () => {
  const order: string[] = [];
  await beginExternalVendorPhoneCall(
    { caseId: "ticket-1", externalVendorRef: "external-1", phone: "02-0000-0101" },
    {
      recordAttempt: async () => { order.push("record"); },
      openTel: (href) => { order.push(href); },
      onRecordError: () => { order.push("error"); }
    }
  );
  assert.deepEqual(order, ["record", "tel:0200000101"]);
});

it("opens tel when recordAttempt rejects or throws synchronously", async () => {
  for (const recordAttempt of [
    () => Promise.reject(new Error("API failed")),
    () => { throw new Error("sync failed"); }
  ]) {
    const opened: string[] = [];
    const errors: unknown[] = [];
    await beginExternalVendorPhoneCall(
      { caseId: "ticket-1", externalVendorRef: "external-1", phone: "02-0000-0101" },
      { recordAttempt, openTel: (href) => opened.push(href), onRecordError: (error) => errors.push(error) }
    );
    assert.deepEqual(opened, ["tel:0200000101"]);
    assert.equal(errors.length, 1);
  }
});
```

Also test that an invalid or empty phone throws before either dependency is called, and that `recordExternalVendorPhoneAttempt()` sends one POST with JSON, `credentials: "same-origin"`, and `keepalive: true` to `/api/tenant/external-vendor-contact-attempts`.

- [ ] **Step 2: Write RED UI contract tests**

Read `ExternalVendorCandidates.tsx`, its CSS module, and `page.tsx` as text. Require:

- client component marker and native `<dialog>` final confirmation;
- copy `외부 업체 직접 찾기 (선택)` and `룸로그 협력업체 또는 자동 배정이 아닙니다`;
- `beginExternalVendorPhoneCall` and `recordExternalVendorPhoneAttempt` use;
- no `통화 완료`, `연결됨`, `응답함`, map component, responsibility verdict, or auto-assignment copy;
- `defect-api.ts` exposes `getRepairCaseContext()` and returns `caseId: c.ticket.id`, never `toTicket(c).id` or the complaint route id;
- page passes that server-owned `caseId` to both the tenant search and contact component, and skips the tenant search when no real case ID exists;
- CSS contains only `var(--...)` color values and no raw hex.

- [ ] **Step 3: Run RED**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/lib/external-vendor-call.spec.ts \
  src/app/tenant/defect/06/external-vendor-candidates.spec.ts
```

Expected: FAIL because the helper and optional UI do not exist.

- [ ] **Step 4: Implement phone normalization and non-blocking ordering**

```ts
export function toTelHref(phone: string): `tel:${string}` {
  const normalized = phone.trim().replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(normalized)) {
    throw new Error("전화번호 형식이 올바르지 않습니다.");
  }
  return `tel:${normalized}`;
}

export function beginExternalVendorPhoneCall(input, dependencies) {
  const href = toTelHref(input.phone);
  let pending: Promise<void>;
  try {
    pending = dependencies
      .recordAttempt({ caseId: input.caseId, externalVendorRef: input.externalVendorRef })
      .catch((error) => dependencies.onRecordError(error));
  } catch (error) {
    dependencies.onRecordError(error);
    pending = Promise.resolve();
  } finally {
    dependencies.openTel(href);
  }
  return pending;
}
```

`recordExternalVendorPhoneAttempt()` invokes browser `fetch` before returning its Promise:

```ts
const response = await fetcher("/api/tenant/external-vendor-contact-attempts", {
  method: "POST",
  credentials: "same-origin",
  keepalive: true,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input)
});
if (!response.ok) throw new Error("연락 시도 기록을 남기지 못했습니다.");
```

The helper opens `tel:` in the same confirmed click turn after the request is started; it does not await the API response before navigation. `keepalive` gives the request a chance to finish while the phone app opens.

- [ ] **Step 5: Implement the accessible confirmation component**

`ExternalVendorCandidates` receives `{ caseId, candidates }`. Each card shows business name, trades, service area, approximate distance, and a `전화하기` button. The button opens a native modal dialog that repeats the selected name and phone, explains that Roomlog cannot know call outcome, and has `취소` and `전화 앱 열기` actions.

The confirm handler is exact:

```ts
void beginExternalVendorPhoneCall(
  {
    caseId,
    externalVendorRef: selected.externalVendorRef,
    phone: selected.phone
  },
  {
    recordAttempt: recordExternalVendorPhoneAttempt,
    openTel: (href) => window.location.assign(href),
    onRecordError: () => setRecordWarning("연락 시도 기록을 남기지 못했습니다.")
  }
);
dialogRef.current?.close();
```

The warning is truthful and never says the call connected or completed.

- [ ] **Step 6: Add the optional section to T-DEF-06 without a responsibility branch**

Add one server-only context helper beside the existing `getRepair()` implementation:

```ts
export async function getRepairCaseContext(id?: string): Promise<{
  repair?: RepairJob;
  caseId?: string;
  source: "REAL" | "EMPTY" | "DEMO";
}> {
  const lookup = await resolveComplaintContext(id);
  if (lookup.kind === "FOUND") {
    return { repair: toRepair(lookup.complaint) ?? undefined, caseId: lookup.complaint.ticket.id, source: "REAL" };
  }
  if (lookup.kind === "EMPTY") return { repair: undefined, caseId: undefined, source: "EMPTY" };
  return { repair: DEMO_REPAIR, caseId: undefined, source: "DEMO" };
}
```

Add a private tagged `resolveComplaintContext()` that treats a real response as `FOUND`, normal `[]`/404 as `EMPTY`, and only connectivity/5xx failure as `UNAVAILABLE`; it must not use the existing helper that collapses all failures to null. This Task leaves legacy `getRepair()` for other defect pages untouched, but T-DEF-06 no longer calls it. A found complaint with no assigned repair is a real empty state, never `DEMO_REPAIR`. This helper is also necessary because the public `Ticket.id` returned by `toTicket()` is `Complaint.id`; it must not be sent to an endpoint whose FK and ownership check are based on `Ticket.id`.

Use the context in the page without a second complaint fetch:

```ts
const { repair, caseId, source } = await getRepairCaseContext(id);
const externalCandidates = caseId
  ? await listTenantExternalVendors({ caseId })
  : [];
```

When `source=REAL` and `repair` is absent, render a truthful “아직 연결된 수리 접수가 없습니다” state in the existing repair/quote area instead of demo vendor/amount data; the external candidate section may still render from the owned `caseId`. Render `<ExternalVendorCandidates caseId={caseId} candidates={externalCandidates} />` only when `caseId` is defined, below that area under the explicit optional label. Show the existing demo repair only for `source=DEMO`. Add tests for FOUND-without-repair, normal empty/404, and API unavailable. Do not use `DefectAnalysis`, `responsibilityHint`, `costBearer`, or an inferred tenant/landlord branch in this page. Keep `apps/web/src/lib/defect-mapping.ts` unchanged.

- [ ] **Step 7: Run GREEN and the tenant web suite**

```bash
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/lib/external-vendor-call.spec.ts \
  src/lib/vendor-public-api.spec.ts \
  src/app/tenant/defect/06/external-vendor-candidates.spec.ts
cd ../..
pnpm test:web
pnpm --filter web build
```

Expected: ordering, rejection, synchronous throw, invalid phone, keepalive request, real `Ticket.id` context, dialog contract, token-only CSS, and existing web tests PASS.

- [ ] **Step 8: Commit the phone bridge separately from core UI**

```bash
git add apps/web/src/lib/external-vendor-call.ts apps/web/src/lib/external-vendor-call.spec.ts apps/web/src/lib/defect-api.ts apps/web/src/app/tenant/defect/06/ExternalVendorCandidates.tsx apps/web/src/app/tenant/defect/06/ExternalVendorCandidates.module.css apps/web/src/app/tenant/defect/06/external-vendor-candidates.spec.ts apps/web/src/app/tenant/defect/06/page.tsx
git commit -m "feat(tenant): add optional external vendor call"
```

---

### Task 7: Verify security boundaries and hand off the optional slice independently

**Files:**
- Verify: all files changed in Tasks 1~6
- Verify unchanged: `packages/types/src/ticket.ts`
- Verify unchanged: `apps/web/src/lib/defect-mapping.ts`
- Verify unchanged: `apps/api/src/roomlog/roomlog.service.ts`
- Verify unchanged: `apps/api/src/roomlog/services/roomlog-vendor-repair.domain.ts`
- Verify unchanged: AI model, prompt, voice, and feedback files

**Interfaces:**
- Produces: a separately reviewable optional slice with public-safe reads, tenant-owned attempt writes, and best-effort phone launch
- Does not change: core slice 1~3 release gate, responsibility results, cost-bearer decisions, catalog/account/ManagerVendor state

- [ ] **Step 1: Run all focused type, API, repository, and web tests**

```bash
pnpm --filter @roomlog/types typecheck
pnpm db:generate
docker compose up -d postgres
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' \
  pnpm db:test:push
ROOMLOG_TEST_DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' \
  pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/vendor-public-contract.spec.ts \
  src/roomlog/prisma-vendor-public.repository.spec.ts \
  src/roomlog/prisma-external-vendor-contact.repository.spec.ts \
  src/roomlog/services/vendor-public-location.spec.ts \
  src/roomlog/services/roomlog-vendor-public.domain.spec.ts \
  src/roomlog/roomlog-vendor-public.api.spec.ts
cd apps/web
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register \
  src/lib/vendor-public-api.spec.ts \
  src/lib/external-vendor-call.spec.ts \
  src/app/tenant/defect/06/external-vendor-candidates.spec.ts
cd ../..
```

Expected: every focused test PASS and DB-backed tests report no skip while Postgres is running.

- [ ] **Step 2: Inspect the migrated constraint and stored fact**

```bash
DATABASE_URL='postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public' pnpm prisma migrate status
docker exec roomlog-postgres psql -U roomlog -d roomlog_test -c '\d+ "ExternalVendorContactAttempt"'
docker exec roomlog-postgres psql -U roomlog -d roomlog_test -c 'SELECT "channel", "status", count(*) FROM "ExternalVendorContactAttempt" GROUP BY 1,2;'
```

Expected: migration `20260714130000_external_vendor_contact` is applied; the only stored pair is `PHONE / CONTACT_ATTEMPTED`.

- [ ] **Step 3: Run leakage, coupling, and style scans**

```bash
rg -n 'userId|contactPerson|internalMemo|managerId|activation|credit|paymentPolicy' \
  packages/types/src/vendor-public.ts \
  apps/api/src/roomlog/services/roomlog-vendor-public.domain.ts \
  apps/web/src/lib/demo-vendor-public.ts
rg -n 'CALL_COMPLETED|CONNECTED|ANSWERED|duration|통화 완료|연결됨|응답함' \
  packages/types/src/vendor-public.ts \
  apps/api/src/roomlog/vendor-public.repository.ts \
  apps/api/src/roomlog/prisma-external-vendor-contact.repository.ts \
  apps/api/src/roomlog/data/demo-external-vendors.ts \
  apps/api/src/roomlog/services/roomlog-vendor-public.domain.ts \
  apps/web/src/lib/external-vendor-call.ts \
  apps/web/src/app/tenant/defect/06/ExternalVendorCandidates.tsx
rg -n 'responsibilityHint|correctedResponsibility|detectResponsibility' \
  apps/api/src/roomlog/services/roomlog-vendor-public.domain.ts \
  apps/web/src/app/tenant/defect/06/ExternalVendorCandidates.tsx
rg -n '#[0-9a-fA-F]{3,8}' \
  apps/web/src/app/tenant/defect/06/ExternalVendorCandidates.module.css \
  apps/web/src/app/tenant/defect/06/ExternalVendorCandidates.tsx
```

Expected: all scans return no matches. Verification status may be used as a repository filter, but account activation state is never projected.

- [ ] **Step 4: Prove fake candidates never entered catalog/account tables**

```bash
docker exec roomlog-postgres psql -U roomlog -d roomlog_test -c \
  "SELECT count(*) FROM \"VendorProfile\" WHERE \"id\" LIKE 'external-%';"
docker exec roomlog-postgres psql -U roomlog -d roomlog_test -c \
  "SELECT count(*) FROM \"ManagerVendor\" WHERE \"vendorId\" LIKE 'external-%';"
docker exec roomlog-postgres psql -U roomlog -d roomlog_test -c \
  "SELECT count(*) FROM \"VendorAccountLink\" WHERE \"vendorId\" LIKE 'external-%';"
```

Expected: all three counts are `0`.

- [ ] **Step 5: Run the full repository gate**

```bash
pnpm test:api
pnpm test:web
bash scripts/verify.sh
git diff --check
```

Expected: all commands PASS. A failure in this optional slice is fixed on its branch and does not reopen or block already approved core slice 1~3 commits.

- [ ] **Step 6: Rebuild Docker and manually confirm the phone behavior**

```bash
docker compose up -d --build web api
docker compose ps web api postgres
curl -fsS 'http://localhost:4000/api/public/vendors?trade=plumbing'
```

In the tenant PhoneFrame, open T-DEF-06, select a fake external candidate, verify the final confirmation appears, and select `전화 앱 열기`. Repeat with API stopped: the browser reports only the record warning and still attempts the `tel:` URL. Do not report the call as connected or completed.

- [ ] **Step 7: Produce the independent review handoff**

```bash
git status --short
git log --oneline --decorate -8
git diff --stat origin/dev...HEAD
```

Expected: only the focused slice files and six focused commits are present; no secrets, generated activation keys, unrelated core edits, or AI responsibility files are staged. Open this as an optional follow-up PR titled `feat: add external vendor contact bridge`; do not add it to the merge requirements of the core vendor/credit PR.

---

## Completion Evidence

The slice is complete only when all of the following are simultaneously true:

- anonymous partner search returns an explicit public allow-list;
- tenant external search derives location and trade from a tenant-owned `Ticket.id`;
- fake candidate rows remain outside catalog, account, manager relation, estimate, and credit tables;
- each accepted phone action can create exactly a `PHONE / CONTACT_ATTEMPTED` fact with server-owned snapshots;
- a logging error or unavailable API never blocks the confirmed `tel:` request;
- no UI or API claims call connection, answer, duration, or completion;
- AI responsibility values and cost-bearer decision code are unchanged;
- `pnpm test:api`, `pnpm test:web`, and `bash scripts/verify.sh` pass;
- the optional PR can be omitted without changing the correctness or release readiness of slices 1~3.
