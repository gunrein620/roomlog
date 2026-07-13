# Trade Contract Billing Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수락된 거래 계약을 정확한 임대인·호실의 청구용 계약 초안으로 멱등 연결하고, 관리자가 필수 계약값을 확인·확정한 뒤에만 해당 호실에서 청구서를 생성할 수 있게 한다.

**Architecture:** `TradeContractBillingBridge`가 거래 계약 수락과 API 기동 시 기존 수락 계약을 하나의 보정 경로로 처리한다. 이 서비스는 기존 `assignTenantRoomFromContract`가 반환한 `roomId`를 `RoomlogContractDomain.ensureTradeContractDraft`에 전달한다. 청구 계약은 `ct_trade_<tradeContractId>` 결정적 ID와 `analyzing/pending/unverified` 상태로 생성되며, 관리자 확정 게이트가 기간·금액·납부일·명시적 확인을 서버에서 검증한 뒤 `active/confirmed/confirmed`로 전환한다. web은 같은 계약 ID를 검토·수동값 화면 사이에 유지하고 거래 계약 출처와 누락값 입력을 명확히 표시한다.

**Tech Stack:** NestJS 11, Next.js 16 App Router, React 19, TypeScript, Node test runner, pnpm monorepo, `@roomlog/types`, `@roomlog/ui`

## Global Constraints

- 작업 브랜치는 `yong`이다.
- Docker, 운영 데이터, API 키, 결제 위젯, 인프라 파일은 변경하지 않는다.
- 사용자 소유 미추적 경로 `docs/technical-challenges/`, `tmp/`, `tools/`는 스테이징하거나 수정하지 않는다.
- 거래 계약의 월세와 보증금만 초안에 복사한다. 관리비·납부일·계약 기간은 임의 기본값을 만들지 않는다.
- 실제 계약서 파일이나 업로드 문서 레코드를 만들지 않는다. 출처는 `trade_acceptance`로만 표현한다.
- 거래 계약 수락은 청구 계약 초안까지만 만든다. 청구서 생성·발송은 기존 관리자 동작으로 남긴다.
- 관리자·건물·호실 권한 검사는 서버에서 유지하며 다른 임대인의 계약을 조회나 청구 옵션에 노출하지 않는다.
- 스타일 추가가 필요하면 `packages/ui/src/tokens.css`의 기존 CSS 변수만 사용하고 raw hex를 쓰지 않는다.
- 각 작업은 실패 테스트 확인 → 최소 구현 → 대상 테스트 통과 → 회귀 테스트 → 독립 커밋 순서로 진행한다.

---

## File Structure

- `apps/api/src/roomlog/roomlog.types.ts`: 거래 계약 초안 생성 입력과 관리자 수동값의 계약 기간 필드를 정의한다.
- `apps/api/src/roomlog/services/roomlog-contract.domain.ts`: 청구용 계약 초안 생성, 출처 표시, 필수값 검증, 계약 활성화를 담당한다.
- `apps/api/src/roomlog/roomlog.service.ts`: 거래 계약 초안 도메인 메서드를 노출하고 청구서 생성 옵션을 강화한다.
- `apps/api/src/roomlog/contract-billing-bridge.spec.ts`: 초안 생성·멱등성·확정 게이트·청구 가능 여부·권한 범위를 검증한다.
- `apps/api/src/trade/trade.service.ts`: 동일 수락 재시도를 멱등 처리하고 기동 보정용 수락 계약 목록을 제공한다.
- `apps/api/src/trade/trade-contract-billing-bridge.service.ts`: 신규 수락과 기존 수락 계약을 Roomlog 계약 초안으로 연결한다.
- `apps/api/src/trade/trade-contract-billing-bridge.service.spec.ts`: 수락 계약 기동 보정과 정확한 호실 연결을 검증한다.
- `apps/api/src/trade/trade.controller.ts`: 수락 후 직접 호실 연결 대신 공용 브리지 보정을 호출한다.
- `apps/api/src/trade/trade.controller.spec.ts`: 수락 응답이 브리지를 호출하는지 검증한다.
- `apps/api/src/trade/trade.module.ts`: 브리지 서비스를 Nest 모듈 생명주기에 등록한다.
- `apps/api/src/trade/trade.service.spec.ts`: 같은 수락 요청 재시도 시 상태·메시지가 중복되지 않는지 검증한다.
- `apps/web/src/lib/contract-manager-api.ts`: 거래 계약 출처, 명시적 확인값, 계약 기간 수동 입력을 API 계약에 반영한다.
- `apps/web/src/app/manager/contract/_components.tsx`: `trade_acceptance`를 `거래 계약`으로 표시한다.
- `apps/web/src/app/manager/contract/01/page.tsx`: 누락값 편집 진입과 명시적 대조 체크를 확정 폼에 추가한다.
- `apps/web/src/app/manager/contract/03/page.tsx`: 선택한 계약 ID를 유지하고 시작일·종료일을 입력한다.
- `apps/web/src/app/manager/contract/contract-billing-bridge.spec.ts`: web API 및 화면 연결의 소스 회귀를 검증한다.

### Task 1: 거래 계약을 청구용 계약 초안으로 만드는 Roomlog 도메인 기능

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-contract.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Create: `apps/api/src/roomlog/contract-billing-bridge.spec.ts`

**Interfaces:**
- Produces: `EnsureTradeContractDraftInput`
- Produces: `RoomlogService.ensureTradeContractDraft(input): Contract`
- Produces: `ManagerContractOrigin` variant `trade_acceptance`
- Consumes: `assignTenantRoomFromContract(...)`가 반환한 `Room.id`

- [ ] **Step 1: 청구 계약 초안 실패 테스트 작성**

`apps/api/src/roomlog/contract-billing-bridge.spec.ts`를 만들고 실제 `RoomlogService`의 데모 임대인·임차인을 이용한다.

```ts
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { RoomlogService } from "./roomlog.service";

function createTradeRoom(service: RoomlogService, title = "거래연결빌라") {
  return service.assignTenantRoomFromContract("tenant-demo", "landlord-demo", {
    title,
    location: "서울 서초구 방배동 101호",
  });
}

describe("trade contract billing bridge", () => {
  it("creates one unverified billing contract draft on the exact assigned room", () => {
    const service = new RoomlogService();
    const room = createTradeRoom(service);
    const input = {
      tradeContractId: "trade-contract-1",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    };

    const first = service.ensureTradeContractDraft(input);
    const second = service.ensureTradeContractDraft(input);
    const rows = service.getManagerContractDashboard("landlord-demo").rows
      .filter((row) => row.contract.id === "ct_trade_trade-contract-1");

    assert.equal(first.id, "ct_trade_trade-contract-1");
    assert.equal(first.roomId, room.id);
    assert.equal(first.tenantId, "tenant-demo");
    assert.equal(first.lifecycle, "analyzing");
    assert.equal(first.review, "pending");
    assert.equal(first.valueSource, "unverified");
    assert.equal(first.monthlyRent, 650_000);
    assert.equal(first.maintenanceFee, undefined);
    assert.equal(first.paymentDay, undefined);
    assert.equal(first.startDate, undefined);
    assert.equal(first.endDate, undefined);
    assert.equal(second.id, first.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].origin, "trade_acceptance");

    const detail = service.getManagerContractDetail("landlord-demo", first.id);
    assert.equal(detail.manualValues.deposit, "10,000,000원");
    assert.equal(detail.extraction.items.find((item) => item.label === "보증금")?.needsCheck, true);
    const store = (service as unknown as {
      store: { contractDocuments: Array<{ contractId: string }> };
    }).store;
    assert.equal(store.contractDocuments.some((document) => document.contractId === first.id), false);
  });
});
```

같은 파일에 다음 권한·충돌 테스트를 추가한다.

```ts
it("does not expose another landlord's trade draft and rejects an active different tenant", () => {
  const service = new RoomlogService();
  const room = createTradeRoom(service, "권한검증빌라");
  const draft = service.ensureTradeContractDraft({
    tradeContractId: "scope-1",
    roomId: room.id,
    tenantId: "tenant-demo",
    landlordId: "landlord-demo",
    landlordName: "박관리",
    depositKrw: 10_000_000,
    monthlyRent: 650_000,
  });

  assert.equal(service.getManagerContractDashboard("tenant-demo").rows.some(
    (row) => row.contract.id === draft.id,
  ), false);

  const store = (service as unknown as { store: { contracts: Array<Record<string, unknown>> } }).store;
  const storedDraft = store.contracts.find((contract) => contract.id === draft.id)!;
  storedDraft.lifecycle = "active";
  storedDraft.review = "confirmed";
  storedDraft.valueSource = "confirmed";

  const sameParty = service.ensureTradeContractDraft({
    tradeContractId: "scope-same-party",
    roomId: room.id,
    tenantId: "tenant-demo",
    landlordId: "landlord-demo",
    landlordName: "박관리",
    depositKrw: 10_000_000,
    monthlyRent: 650_000,
  });
  assert.equal(sameParty.id, draft.id);

  assert.throws(() => service.ensureTradeContractDraft({
    tradeContractId: "scope-2",
    roomId: room.id,
    tenantId: "other-tenant",
    landlordId: "landlord-demo",
    landlordName: "박관리",
    depositKrw: 5_000_000,
    monthlyRent: 500_000,
  }), /다른 임차인의 활성 계약/);
});
```

- [ ] **Step 2: 대상 테스트가 API 부재로 실패하는지 확인**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/contract-billing-bridge.spec.ts
```

Expected: FAIL — `RoomlogService.ensureTradeContractDraft`가 존재하지 않는다.

- [ ] **Step 3: 입력 타입과 서비스 퍼사드 추가**

`apps/api/src/roomlog/roomlog.types.ts`에 다음 타입을 추가한다.

```ts
export type EnsureTradeContractDraftInput = {
  tradeContractId: string;
  roomId: string;
  tenantId: string;
  landlordId: string;
  landlordName: string;
  depositKrw: number;
  monthlyRent: number;
};
```

`apps/api/src/roomlog/roomlog.service.ts`의 타입 import에 이를 추가하고 퍼사드 메서드를 노출한다.

```ts
ensureTradeContractDraft(input: EnsureTradeContractDraftInput) {
  return this.contract.ensureTradeContractDraft(input);
}
```

두 API/web `ManagerContractOrigin` 유니온 중 이 작업에서는 API 쪽만 먼저 확장한다.

```ts
export type ManagerContractOrigin =
  | "tenant_upload"
  | "manager_upload"
  | "manual"
  | "trade_acceptance";
```

- [ ] **Step 4: 결정적 ID와 안전장치를 가진 최소 도메인 구현**

`apps/api/src/roomlog/services/roomlog-contract.domain.ts`에 `ConflictException`, `ForbiddenException`, `EnsureTradeContractDraftInput`을 import하고 공개 메서드를 추가한다.

```ts
ensureTradeContractDraft(input: EnsureTradeContractDraftInput): Contract {
  const room = this.findRoom(input.roomId);
  if (room.landlordId !== input.landlordId) {
    throw new ForbiddenException("거래 계약 임대인의 호실만 계약으로 연결할 수 있습니다.");
  }

  const contractId = `ct_trade_${input.tradeContractId}`;
  const deterministic = this.store.contracts.find((contract) => contract.id === contractId);
  const active = this.store.contracts.find(
    (contract) =>
      contract.id !== deterministic?.id &&
      contract.roomId === room.id &&
      contract.lifecycle === "active",
  );
  if (active?.tenantId === input.tenantId) return this.presentContract(active);
  if (active) {
    throw new ConflictException("해당 호실에 다른 임차인의 활성 계약이 있습니다.");
  }
  if (deterministic) {
    if (
      deterministic.roomId !== room.id ||
      deterministic.managerId !== input.landlordId ||
      deterministic.tenantId !== input.tenantId
    ) {
      throw new ConflictException("동일한 거래 계약 ID가 다른 계약 관계에 연결돼 있습니다.");
    }
    return this.presentContract(deterministic);
  }

  const createdAt = now();
  const contract: Contract = {
    id: contractId,
    roomId: room.id,
    tenantId: input.tenantId,
    managerId: input.landlordId,
    unitId: this.displayUnitId(room).replace(/호$/, ""),
    landlordName: input.landlordName.trim() || "관리자",
    lifecycle: "analyzing",
    review: "pending",
    deletion: "none",
    valueSource: "unverified",
    monthlyRent: this.requireNonNegativeInteger(input.monthlyRent, "월세"),
    optionInventory: [],
    createdAt,
    updatedAt: createdAt,
  };

  this.store.contracts.push(contract);
  const extraction = this.ensureContractExtraction(contract);
  this.upsertExtractionItem(
    extraction,
    "보증금",
    `${this.requireNonNegativeInteger(input.depositKrw, "보증금").toLocaleString("ko-KR")}원`,
    "money",
    false,
    "거래 계약 수락값",
  );
  contract.extractionId = extraction.id;
  this.ensureContractPrivacy(contract);
  this.persistStore();
  return this.presentContract(contract);
}
```

기존 `upsertExtractionItem`의 마지막 인자에 선택적 `evidence = "관리자 수동 입력"`을 추가해 거래 초안만 `거래 계약 수락값`을 기록한다. `requireNonNegativeInteger`는 유한수·정수·0 이상을 모두 검사하고 실패 시 `BadRequestException("<필드>는 0 이상의 원 단위 정수여야 합니다.")`를 던진다.

`contractOrigin`은 문서가 없는 결정적 거래 계약을 업로드 계약으로 오인하지 않게 가장 먼저 판별한다.

```ts
private contractOrigin(contract: Contract): ManagerContractOrigin {
  if (contract.id.startsWith("ct_trade_")) return "trade_acceptance";
  const document = this.store.contractDocuments.find(
    (item) => item.id === contract.documentId || item.contractId === contract.id,
  );
  return document?.origin ?? (contract.valueSource === "manual" ? "manual" : "tenant_upload");
}
```

거래 초안에서는 `createContractRecord`와 `addContractDocument`를 호출하지 않는다.

- [ ] **Step 5: 초안 대상 테스트 통과 확인**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/contract-billing-bridge.spec.ts
```

Expected: PASS — 초안 필드, 보증금 근거, 멱등성, 관리자 범위, 충돌 검사가 통과한다.

- [ ] **Step 6: API 타입·전체 테스트 확인**

Run:

```bash
pnpm --filter api build
pnpm test:api
```

Expected: PASS.

- [ ] **Step 7: 기능 커밋**

```bash
git add apps/api/src/roomlog/roomlog.types.ts apps/api/src/roomlog/services/roomlog-contract.domain.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/contract-billing-bridge.spec.ts
git commit -m "feat(contract): add trade acceptance draft"
```

### Task 2: 신규·기존 거래 계약 수락을 공용 브리지로 연결

**Files:**
- Modify: `apps/api/src/trade/trade.service.ts`
- Modify: `apps/api/src/trade/trade.service.spec.ts`
- Create: `apps/api/src/trade/trade-contract-billing-bridge.service.ts`
- Create: `apps/api/src/trade/trade-contract-billing-bridge.service.spec.ts`
- Modify: `apps/api/src/trade/trade.controller.ts`
- Modify: `apps/api/src/trade/trade.controller.spec.ts`
- Modify: `apps/api/src/trade/trade.module.ts`

**Interfaces:**
- Produces: `TradeService.listAcceptedContracts(): TradeContract[]`
- Produces: `TradeContractBillingBridge.ensure(contract): Contract | undefined`
- Produces: `TradeContractBillingBridge.onModuleInit(): void`
- Changes: `TradeService.respondContract(..., true)`를 동일 세입자의 이미 수락된 계약에 대해 멱등 처리한다.

- [ ] **Step 1: 같은 수락 요청 재시도 실패 테스트 작성**

`apps/api/src/trade/trade.service.spec.ts`에 매물 → 문의 → 계약 제안 → 수락을 만드는 로컬 헬퍼를 추가하고 다음을 검증한다.

```ts
it("returns an already accepted contract without duplicating its acceptance message", () => {
  const service = serviceWithTempStore();
  const listing = service.createListing(owner, input);
  const tenant = { id: "tenant-1", name: "세입자" };
  const thread = service.createInquiry(tenant, {
    listingId: listing.id,
    listingTitle: listing.title,
    message: "계약하고 싶어요",
  });
  const proposed = service.proposeContract(owner, thread.id).contract;

  const first = service.respondContract(tenant, proposed.id, true).contract;
  const messageCount = service.getThread(tenant.id, thread.id).messages.length;
  const second = service.respondContract(tenant, proposed.id, true).contract;

  assert.equal(first.status, "accepted");
  assert.equal(second.id, first.id);
  assert.equal(service.getThread(tenant.id, thread.id).messages.length, messageCount);
  assert.deepEqual(service.listAcceptedContracts().map((contract) => contract.id), [first.id]);
});
```

- [ ] **Step 2: 브리지·컨트롤러 실패 테스트 작성**

`apps/api/src/trade/trade-contract-billing-bridge.service.spec.ts`에서 실제 `TradeService`와 `RoomlogService`를 사용해, 브리지 `onModuleInit()`이 기존 accepted 계약을 `ct_trade_<id>` 계약으로 보정하고 두 번 호출해도 한 건인지 확인한다. accepted 계약 하나를 충돌 상태로 둔 뒤 그 다음 정상 accepted 계약도 처리되는 별도 테스트를 추가해, 기동 보정의 개별 오류 격리가 실제로 다음 항목 처리를 계속하는지 검증한다.

```ts
const bridge = new TradeContractBillingBridge(tradeService, roomlogService);
bridge.onModuleInit();
bridge.onModuleInit();

const rows = roomlogService.getManagerContractDashboard("landlord-demo").rows
  .filter((row) => row.contract.id === `ct_trade_${accepted.id}`);
assert.equal(rows.length, 1);
assert.equal(rows[0].contract.tenantId, "tenant-demo");
assert.equal(rows[0].origin, "trade_acceptance");
```

거래 매물의 임대인은 `landlord-demo`, 문의자는 `tenant-demo`를 사용하고, 수락 전까지는 브리지를 호출하지 않는다. 같은 테스트에서 생성된 Roomlog 계약의 `roomId`가 `roomlogService.assignTenantRoomFromContract(...)`를 재호출해 얻은 호실과 같은지도 검증한다.

`apps/api/src/trade/trade.controller.spec.ts`의 모든 `new TradeController(...)` 호출에 네 번째 인자 브리지 대역을 추가한다. 새 테스트는 `respondContract`가 accepted 계약을 반환할 때 `bridge.ensure(contract)`를 정확히 한 번 호출하는지 검증한다.

- [ ] **Step 3: 대상 테스트가 구현 부재로 실패하는지 확인**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register src/trade/trade.service.spec.ts src/trade/trade-contract-billing-bridge.service.spec.ts src/trade/trade.controller.spec.ts
```

Expected: FAIL — `listAcceptedContracts`와 브리지 서비스가 없고 컨트롤러 생성자 시그니처가 다르다.

- [ ] **Step 4: 거래 수락 멱등 처리 구현**

`TradeService.respondContract`에서 권한 확인 후 상태 분기를 다음 순서로 둔다.

```ts
if (contract.tenantId !== user.id) {
  throw new ForbiddenException("제안받은 사람만 응답할 수 있습니다.");
}
const thread = this.getThread(user.id, contract.threadId);
if (accept && contract.status === "accepted") {
  return { contract, thread };
}
if (contract.status !== "proposed") {
  throw new BadRequestException("이미 처리된 계약 제안입니다.");
}
```

서비스 끝에 기동 보정용 내부 조회를 추가한다. 외부 사용자 필터 API인 `listContracts`와 혼용하지 않는다.

```ts
listAcceptedContracts(): TradeContract[] {
  return this.store.contracts
    .filter((contract) => contract.status === "accepted")
    .map((contract) => ({ ...contract }));
}
```

- [ ] **Step 5: 공용 브리지 서비스 구현**

`apps/api/src/trade/trade-contract-billing-bridge.service.ts`를 만든다.

```ts
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Contract } from "../roomlog/roomlog.types";
import { RoomlogService } from "../roomlog/roomlog.service";
import { TradeService, type TradeContract } from "./trade.service";

@Injectable()
export class TradeContractBillingBridge implements OnModuleInit {
  private readonly logger = new Logger(TradeContractBillingBridge.name);

  constructor(
    private readonly tradeService: TradeService,
    private readonly roomlogService: RoomlogService,
  ) {}

  onModuleInit(): void {
    for (const contract of this.tradeService.listAcceptedContracts()) {
      try {
        this.ensure(contract);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`거래 계약 ${contract.id} 청구 초안 보정 실패: ${message}`);
      }
    }
  }

  ensure(contract: TradeContract): Contract | undefined {
    if (contract.status !== "accepted") return undefined;
    const room = this.roomlogService.assignTenantRoomFromContract(
      contract.tenantId,
      contract.landlordId,
      { title: contract.listingTitle, location: contract.location },
    );
    return this.roomlogService.ensureTradeContractDraft({
      tradeContractId: contract.id,
      roomId: room.id,
      tenantId: contract.tenantId,
      landlordId: contract.landlordId,
      landlordName: contract.landlordName,
      depositKrw: contract.depositManwon * 10_000,
      monthlyRent: contract.monthlyRentManwon * 10_000,
    });
  }
}
```

기동 보정은 개별 오류를 경고로 기록하고 다음 계약을 계속 처리한다. 반면 HTTP 수락 경로의 `ensure` 오류는 컨트롤러에서 삼키지 않아 다른 임차인의 활성 계약 충돌을 호출자에게 전달한다.

- [ ] **Step 6: 컨트롤러와 모듈 연결**

`TradeController` 생성자에 `TradeContractBillingBridge`를 추가하고 accepted 분기의 직접 `assignTenantRoomFromContract` 호출을 다음 한 줄로 교체한다.

```ts
if (contract.status === "accepted") this.contractBillingBridge.ensure(contract);
```

`apps/api/src/trade/trade.module.ts` providers에 `TradeContractBillingBridge`를 추가한다. `RoomlogModule` import는 기존 것을 재사용한다.

- [ ] **Step 7: 거래 대상 테스트와 API 전체 테스트 확인**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register src/trade/trade.service.spec.ts src/trade/trade-contract-billing-bridge.service.spec.ts src/trade/trade.controller.spec.ts
pnpm test:api
pnpm --filter api build
```

Expected: PASS — 신규 수락, 중복 수락, 기동 보정, 컨트롤러 연결이 통과한다.

- [ ] **Step 8: 기능 커밋**

```bash
git add apps/api/src/trade/trade.service.ts apps/api/src/trade/trade.service.spec.ts apps/api/src/trade/trade-contract-billing-bridge.service.ts apps/api/src/trade/trade-contract-billing-bridge.service.spec.ts apps/api/src/trade/trade.controller.ts apps/api/src/trade/trade.controller.spec.ts apps/api/src/trade/trade.module.ts
git commit -m "feat(trade): bridge accepted contracts"
```

### Task 3: 관리자 확정 게이트와 청구서 생성 자격 강화

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.types.ts`
- Modify: `apps/api/src/roomlog/services/roomlog-contract.domain.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/contract-billing-bridge.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`

**Interfaces:**
- Changes: `UpdateManagerContractManualValuesInput`에 `startDate`, `endDate` 추가
- Changes: `confirmManagerContractReview` 성공 시 `lifecycle=active`
- Changes: `getManagerBillCreationOptions`는 양수 총액과 명시적 납부일을 요구

- [ ] **Step 1: 확정 전후·청구 자격 실패 테스트 작성**

`apps/api/src/roomlog/contract-billing-bridge.spec.ts`의 첫 테스트 뒤에 다음 흐름을 추가한다.

```ts
assert.equal(
  service.getManagerBillCreationOptions("landlord-demo", room.buildingName, "2026-08")
    .options.some((option) => option.contractId === first.id),
  false,
);

assert.throws(() => service.confirmManagerContractReview("landlord-demo", first.id, {
  confirmNeedsCheck: true,
}), /계약 시작일/);

service.updateManagerContractManualValues("landlord-demo", first.id, {
  deposit: "10,000,000원",
  monthlyRent: 650_000,
  maintenanceFee: 0,
  paymentDay: 10,
  startDate: "2026-07-13",
  endDate: "2099-07-12",
});

assert.throws(() => service.confirmManagerContractReview("landlord-demo", first.id, {
  confirmNeedsCheck: false,
}), /원문과 대조/);

const confirmed = service.confirmManagerContractReview("landlord-demo", first.id, {
  confirmNeedsCheck: true,
});
assert.equal(confirmed.row.contract.lifecycle, "active");
assert.equal(confirmed.row.contract.review, "confirmed");
assert.equal(confirmed.row.contract.valueSource, "confirmed");

const option = service.getManagerBillCreationOptions(
  "landlord-demo",
  room.buildingName,
  "2026-08",
).options.find((candidate) => candidate.contractId === first.id);
assert.equal(option?.monthlyRent, 650_000);
assert.equal(option?.maintenanceFee, 0);
assert.equal(option?.dueDate, "2026-08-10");
```

별도 테스트에서 다음을 검증한다.

- 종료일이 시작일보다 빠르면 확정 실패
- 종료일이 현재보다 과거면 확정 실패
- 월세 또는 관리비가 `undefined`이면 확정 실패
- 월세와 관리비가 모두 0이면 확정은 가능하되 청구 옵션에서는 제외
- 총액이 양수인데 납부일이 없으면 확정 실패 및 청구 옵션 제외
- 다른 임대인 조회에서는 확정 계약이 계속 보이지 않음

기존 `roomlog.service.spec.ts`의 `wires contract document APIs...` 테스트에는 확정 후 `lifecycle === "active"` assertion을 추가한다. 시드 계약에 필수값이 빠져 새 게이트가 실패하면 테스트 내부에서 먼저 `updateManagerContractManualValues`로 시작일·종료일·월세·관리비·납부일을 명시한다.

- [ ] **Step 2: 새 게이트 기대가 실패하는지 확인**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/contract-billing-bridge.spec.ts src/roomlog/roomlog.service.spec.ts
```

Expected: FAIL — 현재 확정은 필수값을 검사하거나 `lifecycle`을 활성화하지 않고 청구 옵션은 기본 납부일 25일을 사용한다.

- [ ] **Step 3: 계약 기간 수동 입력과 서버 검증 구현**

`UpdateManagerContractManualValuesInput`에 다음 필드를 추가한다.

```ts
startDate?: string;
endDate?: string;
```

`updateManagerContractManualValues`는 값이 전달된 경우 `YYYY-MM-DD` 형식을 검사하고 그대로 저장한다. 빈 문자열은 기존 날짜를 조용히 유지하지 말고 `undefined`로 저장해 확정 게이트가 누락으로 판단하게 한다. 월세·관리비도 `0`을 보존해야 하므로 null 병합을 사용한다.

```ts
const monthlyRent = this.optionalNonNegativeInteger(input.monthlyRent, "월세");
const maintenanceFee = this.optionalNonNegativeInteger(input.maintenanceFee, "관리비");
if (input.monthlyRent !== undefined) contract.monthlyRent = monthlyRent;
if (input.maintenanceFee !== undefined) contract.maintenanceFee = maintenanceFee;
if (input.paymentDay !== undefined) contract.paymentDay = this.requirePaymentDay(input.paymentDay);
if (input.startDate !== undefined) contract.startDate = this.optionalContractDate(input.startDate, "계약 시작일");
if (input.endDate !== undefined) contract.endDate = this.optionalContractDate(input.endDate, "계약 종료일");
```

추출 항목과 `getManagerContractDetail().manualValues`의 월세·관리비 표시는 truthy 검사가 아닌 `!== undefined`를 사용해 `0원`을 유지한다. `ensureContractExtraction`의 초기 항목 생성도 같은 기준으로 바꾼다. 기간 변경 시 `계약 기간` 추출 항목도 갱신하고 `needsCheck=true`로 둔다.

- [ ] **Step 4: 확정 게이트에서 계약 활성화 구현**

`confirmManagerContractReview`에서 기존 `needsCheck` 명시 확인 뒤, 상태 변경 전에 다음을 순서대로 검증한다.

```ts
if (!contract.startDate) throw new BadRequestException("계약 시작일을 입력해주세요.");
if (!contract.endDate) throw new BadRequestException("계약 종료일을 입력해주세요.");
if (contract.monthlyRent === undefined) throw new BadRequestException("월세를 입력해주세요.");
if (contract.maintenanceFee === undefined) throw new BadRequestException("관리비를 입력해주세요.");
if (this.timeOf(contract.endDate) < this.timeOf(contract.startDate)) {
  throw new BadRequestException("계약 종료일은 시작일보다 빠를 수 없습니다.");
}
if (this.contractDateKey(contract.endDate) < this.todayInSeoulKey()) {
  throw new BadRequestException("이미 종료된 계약은 활성화할 수 없습니다.");
}
if (contract.monthlyRent + contract.maintenanceFee > 0 && contract.paymentDay === undefined) {
  throw new BadRequestException("납부일을 입력해주세요.");
}
```

`contractDateKey`는 검증된 `YYYY-MM-DD`를 그대로 반환하고, `todayInSeoulKey`는 `Intl.DateTimeFormat`의 `Asia/Seoul` 기준 현재 날짜를 `YYYY-MM-DD`로 만든다. 날짜 문자열을 비교해 종료일 당일은 유효하고 전날부터 과거 계약으로 판단한다.

검증을 통과한 같은 저장 단위에서 `contract.lifecycle = "active"`, `review = "confirmed"`, `valueSource = "confirmed"`, 확인 시각·확인자를 설정한다. 날짜 형식 검증은 수동값 저장 시점과 확정 시점 양쪽에서 수행해 기존 저장 데이터도 방어한다.

- [ ] **Step 5: 청구서 생성 옵션 자격 강화**

`getManagerBillCreationOptions`의 계약 필터에 다음 두 조건을 더한다.

```ts
(contract.monthlyRent ?? 0) + (contract.maintenanceFee ?? 0) > 0 &&
contract.paymentDay !== undefined
```

매핑에서는 기본값 25일을 제거한다.

```ts
dueDate: this.billingDueDate(month, contract.paymentDay!),
```

기존 동일 청구월 중복 청구서 제외 로직은 변경하지 않는다.

- [ ] **Step 6: 대상·전체 API 테스트 확인**

Run:

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/contract-billing-bridge.spec.ts src/roomlog/roomlog.service.spec.ts
pnpm test:api
pnpm --filter api build
```

Expected: PASS — 초안은 제외되고 확정된 유효 계약만 정확한 납부일로 청구 옵션에 포함된다.

- [ ] **Step 7: 기능 커밋**

```bash
git add apps/api/src/roomlog/roomlog.types.ts apps/api/src/roomlog/services/roomlog-contract.domain.ts apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/contract-billing-bridge.spec.ts apps/api/src/roomlog/roomlog.service.spec.ts
git commit -m "fix(contract): activate confirmed contracts"
```

### Task 4: 관리자 화면에서 거래 출처·필수값·선택 계약 문맥 유지

**Files:**
- Modify: `apps/web/src/lib/contract-manager-api.ts`
- Modify: `apps/web/src/app/manager/contract/_components.tsx`
- Modify: `apps/web/src/app/manager/contract/01/page.tsx`
- Modify: `apps/web/src/app/manager/contract/03/page.tsx`
- Create: `apps/web/src/app/manager/contract/contract-billing-bridge.spec.ts`

**Interfaces:**
- Changes: `confirmManagerContract(id, confirmNeedsCheck)`가 체크 값을 그대로 전송
- Changes: `updateManagerContractManualValues`가 `startDate`, `endDate` 전송
- Changes: M-DOC-01 ↔ M-DOC-03 링크와 저장 redirect가 `?id=<contractId>` 유지

- [ ] **Step 1: web 연결 실패 테스트 작성**

`apps/web/src/app/manager/contract/contract-billing-bridge.spec.ts`를 만든다.

```ts
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const api = read("src/lib/contract-manager-api.ts");
const components = read("src/app/manager/contract/_components.tsx");
const review = read("src/app/manager/contract/01/page.tsx");
const detail = read("src/app/manager/contract/03/page.tsx");

test("shows trade acceptance as a contract source", () => {
  assert.match(api, /"trade_acceptance"/);
  assert.match(components, /trade_acceptance:\s*"거래 계약"/);
});

test("requires an explicit review confirmation instead of hard-coding true", () => {
  assert.match(api, /confirmManagerContract\(id: string, confirmNeedsCheck: boolean\)/);
  assert.match(api, /JSON\.stringify\(\{ confirmNeedsCheck \}\)/);
  assert.match(review, /name="confirmNeedsCheck"/);
  assert.match(review, /formData\.get\("confirmNeedsCheck"\) === "on"/);
});

test("keeps the selected contract id while editing dates and returning to review", () => {
  assert.match(detail, /type SearchParams = Promise<\{ id\?: string \}>/);
  assert.match(detail, /getManagerContractDetail\(id\)/);
  assert.match(detail, /name="startDate"/);
  assert.match(detail, /name="endDate"/);
  assert.match(detail, /M-DOC-03.*encodeURIComponent\(contractId\)/s);
  assert.match(review, /M-DOC-03.*encodeURIComponent\(detail\.row\.contract\.id\)/s);
});
```

- [ ] **Step 2: web 대상 테스트가 실패하는지 확인**

Run:

```bash
pnpm --filter web run test:unit
```

Expected: FAIL — 거래 출처, 명시적 checkbox, M-DOC-03 계약 ID와 기간 입력이 없다.

- [ ] **Step 3: web API 계약과 출처 배지 구현**

`contract-manager-api.ts`의 `ManagerContractOrigin`에 `trade_acceptance`를 추가한다. 확정 API는 다음 시그니처와 body를 사용한다.

```ts
export function confirmManagerContract(
  id: string,
  confirmNeedsCheck: boolean,
): Promise<ManagerContractDetail> {
  return serverFetch(`/contracts/manager/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmNeedsCheck }),
  });
}
```

`updateManagerContractManualValues` 입력에는 `startDate?: string`, `endDate?: string`을 추가한다.

`_components.tsx`는 `ManagerContractOrigin`을 `@/lib/contract-manager-api`에서 type import한다. `SourceBadge`는 중첩 삼항 대신 완전한 매핑을 사용한다.

```ts
const sourceLabel: Record<ManagerContractOrigin, string> = {
  tenant_upload: "임차인 업로드",
  manager_upload: "관리자 업로드",
  manual: "관리자 수동값",
  trade_acceptance: "거래 계약",
};
```

- [ ] **Step 4: M-DOC-01 명시적 확정과 누락값 편집 링크 구현**

`confirmContractAction`은 checkbox 값을 읽어 API에 전달한다.

```ts
const confirmNeedsCheck = formData.get("confirmNeedsCheck") === "on";
await confirmManagerContract(contractId, confirmNeedsCheck);
```

확정 form 안에 필수 checkbox와 라벨 `확인 필요 항목을 거래 계약/원문과 대조했습니다.`를 추가한다. 필수값이 빠진 초안을 수정할 수 있도록 다음 URL을 사용한다.

```tsx
<LinkButton
  href={`${MANAGER_CONTRACT_ROUTES["M-DOC-03"]}?id=${encodeURIComponent(detail.row.contract.id)}`}
  variant="secondary"
>
  계약값 입력
</LinkButton>
```

거래 출처일 때 원본 영역은 실제 파일 뷰어가 있는 것처럼 표시하지 말고 `거래 계약 수락 조건을 기반으로 만든 초안이며 업로드된 원본 파일은 없습니다.`를 표시한다. 기존 업로드 계약에는 현재 원본·OCR 영역을 유지한다.

- [ ] **Step 5: M-DOC-03 계약 ID·기간 입력 유지 구현**

페이지에 `SearchParams`와 prop을 추가하고 선택 ID로 상세를 조회한다.

```ts
type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const detail = await getManagerContractDetail(id);
```

수동값 폼에 시작일·종료일을 추가한다.

```tsx
<Field name="startDate" label="계약 시작일" type="date" defaultValue={contract.startDate?.slice(0, 10) ?? ""} />
<Field name="endDate" label="계약 종료일" type="date" defaultValue={contract.endDate?.slice(0, 10) ?? ""} />
```

`Field` props에 `type?: "text" | "date"`를 추가하고 input에 전달한다. 서버 액션은 두 날짜를 API에 넘기고 수동값·인벤토리 저장 후 모두 같은 계약으로 redirect한다.

```ts
const contractHref = `${MANAGER_CONTRACT_ROUTES["M-DOC-03"]}?id=${encodeURIComponent(contractId)}`;
redirect(contractHref);
```

하단 M-DOC-01, M-DOC-04, M-DOC-05 링크에도 현재 `contract.id` query를 붙인다. M-DOC-02는 새 계약 등록이므로 query를 붙이지 않는다.

- [ ] **Step 6: web 대상·전체 테스트와 빌드 확인**

Run:

```bash
pnpm --filter web run test:unit
pnpm test:web
pnpm --filter web build
```

Expected: PASS — 출처, 명시적 확인, 날짜 입력, 선택 계약 문맥이 유지되고 web 빌드가 완료된다.

- [ ] **Step 7: 기능 커밋**

```bash
git add apps/web/src/lib/contract-manager-api.ts apps/web/src/app/manager/contract/_components.tsx apps/web/src/app/manager/contract/01/page.tsx apps/web/src/app/manager/contract/03/page.tsx apps/web/src/app/manager/contract/contract-billing-bridge.spec.ts
git commit -m "fix(contract): preserve billing review context"
```

### Task 5: 전체 회귀 검증과 변경 범위 점검

**Files:**
- Verify only: all files changed in Tasks 1–4

- [ ] **Step 1: 공유 패키지와 전체 애플리케이션 검증**

Run:

```bash
pnpm --filter @roomlog/types typecheck
pnpm --filter @roomlog/ui typecheck
pnpm test:api
pnpm test:web
pnpm --filter web build
pnpm run db:generate
pnpm --filter api build
bash scripts/verify.sh
```

Expected: 모든 명령 PASS. `scripts/verify.sh`의 DB 연동 검사가 PostgreSQL 미기동으로 명시적으로 skip되는 것은 허용하지만 types·ui·web·api 빌드와 API 스모크는 성공해야 한다.

- [ ] **Step 2: 변경 범위와 금지 항목 확인**

Run:

```bash
git diff --check
git status --short
git diff --stat origin/yong...HEAD
git diff origin/yong...HEAD -- docker-compose.yml docker-compose.prod.yml prisma apps/web/src/lib/payment-api.ts apps/api/src/roomlog/payment-gateway.ts
```

Expected:

- whitespace 오류 없음
- `docs/technical-challenges/`, `tmp/`, `tools/`는 계속 미추적이며 커밋에 포함되지 않음
- Docker·Prisma schema/migration·결제 API·결제 게이트웨이 변경 없음
- 기능 변경은 계획에 적힌 계약·거래·관리자 계약 화면 파일로 한정됨

- [ ] **Step 3: 최종 동작 점검 보고**

다음 네 흐름을 테스트 이름과 실행 결과로 보고한다.

1. 신규 거래 계약 수락 → 정확한 호실에 확인 필요 초안 1건 생성
2. 기존 accepted 계약 → API 기동 보정 시 멱등 생성
3. 누락값 입력·명시적 확인 → `active/confirmed/confirmed`
4. 확정 전 청구 제외, 확정 후 정확한 금액·납부일로 청구 옵션 포함

Docker 재빌드, 운영 데이터 보정, 원격 push, PR 갱신은 이 계획의 완료 조건에 포함하지 않으며 사용자가 별도로 요청할 때만 수행한다.
