# Billing Durability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거래 수락 계약이 정확한 호실의 청구 계약으로 이어지는 기존 흐름을 UI·DB 스키마 변경 없이 재시도·재기동에 안전하게 만든다.

**Architecture:** Trade JSON 수락을 로컬 확정점으로 유지하고, Trade 매물 RDS와 Roomlog RDS 프로젝션은 generation으로 완료 상태를 추적해 API 경계에서 기다린다. Trade의 일반 mutation은 마지막 JSON 저장 성공 스냅샷을 공통 롤백 기준으로 사용한다.

**Tech Stack:** NestJS 11, TypeScript 5.9, Node `node:test`, 기존 JSON atomic rename, 기존 `TradeStoreProjector`·Roomlog `StoreProjector`.

## Global Constraints

- 관리자·세입자 UI와 API 응답 형태를 변경하지 않는다.
- Prisma 스키마, SQL, 마이그레이션을 변경하지 않는다.
- Trade 계약·채팅을 RDS 테이블로 이전하지 않는다.
- `origin/dev`의 OCR UI와 다른 작업자의 변경을 유지한다.
- 주소·호실 파서는 변경하지 않는다.
- 사용자 소유 미추적 폴더 `docs/technical-challenges/`, `tmp/`, `tools/`를 건드리지 않는다.
- 최종 PR은 `fix(contract): harden billing durability`, `fix(trade): roll back failed store writes` 두 커밋만 포함한다.
- PR은 `dev` 대상 하나이며 Draft가 아닌 Ready 상태로 만든다.

---

## File Map

- `apps/api/src/trade/trade.service.ts`: Trade 매물 generation, 수락 매물 복구, 공통 JSON 롤백.
- `apps/api/src/trade/trade.controller.ts`: 수락 후 Trade 매물 내구성을 Roomlog보다 먼저 await.
- `apps/api/src/trade/trade-contract-billing-bridge.service.ts`: 기동 보정에서도 Trade 매물을 먼저 복구.
- `apps/api/src/trade/trade-store.projector.spec.ts`: RDS 실패·재시도·재기동·generation 테스트.
- `apps/api/src/trade/trade.controller.spec.ts`: API 순서, Roomlog 미변경, 수락 멱등성 테스트.
- `apps/api/src/trade/trade-contract-billing-bridge.service.spec.ts`: 여러 수락 계약의 기동 복구 격리 테스트.
- `apps/api/src/roomlog/roomlog.service.ts`: Roomlog generation과 최신 실패 재시도.
- `apps/api/src/roomlog/roomlog.controller.ts`: 관리자 확정 결과 반환 전 Roomlog 내구성 await.
- `apps/api/src/roomlog/contract-billing-bridge.spec.ts`: 관리자 확정 RDS 실패·재시도 테스트.
- `apps/api/src/trade/trade.service.spec.ts`: 모든 Trade mutation의 JSON 실패 롤백 테스트.

---

### Task 1: Await and repair accepted-listing projection

**Files:**
- Modify: `apps/api/src/trade/trade.service.ts`
- Modify: `apps/api/src/trade/trade.controller.ts`
- Modify: `apps/api/src/trade/trade-contract-billing-bridge.service.ts`
- Test: `apps/api/src/trade/trade-store.projector.spec.ts`
- Test: `apps/api/src/trade/trade.controller.spec.ts`
- Test: `apps/api/src/trade/trade-contract-billing-bridge.service.spec.ts`

**Interfaces:**
- Consumes: `TradeContract.status`, `TradeContract.listingId`, `TradeStoreProjector.persist(listings)`.
- Produces: `TradeService.ensureAcceptedListingDurability(contract: TradeContract): Promise<void>`.
- Produces: 내부 `projectListings(): number`가 예약한 generation을 반환한다.

- [ ] **Step 1: 첫 매물 프로젝션 실패와 API 순서 실패 테스트 작성**

`trade.controller.spec.ts`에서 첫 Trade 프로젝션 실패 시 Trade JSON만 accepted이고 Roomlog·알림은 그대로인지 검증한다.

```ts
await assert.rejects(
  () => controller.respondContract("Bearer token", proposed.id, { accept: true }),
  /trade listing projector unavailable/,
);
assert.equal(tradeService.contractForThread(tenant.id, thread.id)?.status, "accepted");
assert.deepEqual((roomlogService as unknown as { store: Store }).store, roomlogBefore);
assert.equal(notifications, 0);
```

장애 제거 후 같은 요청을 재시도해 원래 `respondedAt`, 체결 메시지 1개, `계약완료`, Roomlog 연결, 알림 1회를 확인한다.

- [ ] **Step 2: 실패 테스트 실행**

```bash
pnpm --filter api exec node --test -r ts-node/register src/trade/trade.controller.spec.ts
```

Expected: 현재 컨트롤러가 Trade 프로젝션을 기다리지 않아 FAIL.

- [ ] **Step 3: 재기동·generation 실패 테스트 작성**

`trade-store.projector.spec.ts`에서 accepted JSON과 `노출중` RDS 매물로 재기동한 뒤 아래를 검증한다.

```ts
const accepted = service.listAcceptedContracts()[0];
await service.ensureAcceptedListingDurability(accepted);
assert.equal(service.listListings()[0].status, "계약완료");
assert.equal(persisted.at(-1)?.[0].status, "계약완료");
```

제어 가능한 Promise 프로젝터로 generation 1 실패 뒤 generation 2가 이미 예약된 경우 generation 3을 만들지 않는지 호출 횟수를 검증한다. `trade-contract-billing-bridge.service.spec.ts`에서는 첫 accepted 보정 실패가 다음 accepted 계약 보정을 막지 않는지 검증한다.

- [ ] **Step 4: 재기동·generation 테스트 실행**

```bash
pnpm --filter api exec node --test -r ts-node/register \
  src/trade/trade-store.projector.spec.ts \
  src/trade/trade-contract-billing-bridge.service.spec.ts
```

Expected: `ensureAcceptedListingDurability`가 없어 FAIL.

- [ ] **Step 5: Trade 프로젝션 generation 구현**

```ts
private projectionGeneration = 0;
private completedProjectionGeneration = 0;
private projectionFailure?: { generation: number; error: unknown };

private projectListings(): number {
  if (!this.storeProjector) return this.projectionGeneration;
  const generation = ++this.projectionGeneration;
  const snapshot = this.store.listings.map((listing) => ({ ...listing }));
  this.pendingProjection = this.pendingProjection
    .then(() => this.storeProjector!.persist(snapshot))
    .then(
      () => {
        this.completedProjectionGeneration = Math.max(this.completedProjectionGeneration, generation);
        if ((this.projectionFailure?.generation ?? -1) <= generation) this.projectionFailure = undefined;
      },
      (error) => {
        if (generation >= (this.projectionFailure?.generation ?? -1)) {
          this.projectionFailure = { generation, error };
        }
      },
    );
  return generation;
}
```

`ensureAcceptedListingDurability`는 accepted 계약의 매물을 찾고, `노출중`이면 `계약완료`로 보정해 atomic JSON 저장 후 프로젝션한다. 이미 최신 작업이 대기 중이면 중복 예약하지 않고, 직전 최신 작업이 실패한 재호출에서만 새 generation을 예약한다.

```ts
async ensureAcceptedListingDurability(contract: TradeContract): Promise<void> {
  if (contract.status !== "accepted") return;
  const listing = this.store.listings.find((item) => item.id === contract.listingId);
  if (!listing) throw new NotFoundException("매물을 찾을 수 없습니다.");
  if (listing.status !== "계약완료") {
    listing.status = "계약완료";
    this.persistAcceptance();
    this.projectListings();
  } else if (this.projectionFailure?.generation === this.projectionGeneration) {
    this.projectListings();
  }
  const requiredGeneration = this.projectionGeneration;
  await this.pendingProjection;
  if (this.completedProjectionGeneration < requiredGeneration) {
    throw this.projectionFailure?.error ?? new Error("매물 저장을 완료하지 못했습니다.");
  }
}
```

No-projector 환경은 즉시 성공하고, 더 최신 generation이 이미 대기 중이면 그 결과를 기다리게 조건을 보정한다.

- [ ] **Step 6: 컨트롤러와 기동 브리지 순서 연결**

```ts
if (body.accept) {
  await this.tradeService.ensureAcceptedListingDurability(contract);
  await this.contractBillingBridge.ensure(contract);
}
```

`TradeContractBillingBridge.onModuleInit`도 계약별로 아래 순서를 사용하고 기존 try/catch로 실패를 격리한다.

```ts
await this.tradeService.ensureAcceptedListingDurability(contract);
await this.ensure(contract);
```

- [ ] **Step 7: Task 1 테스트 통과 확인**

```bash
pnpm --filter api exec node --test -r ts-node/register \
  src/trade/trade-store.projector.spec.ts \
  src/trade/trade.controller.spec.ts \
  src/trade/trade-contract-billing-bridge.service.spec.ts
```

Expected: 모든 테스트 PASS.

---

### Task 2: Await Roomlog generation for manager confirmation

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/api/src/roomlog/roomlog.controller.ts`
- Test: `apps/api/src/roomlog/contract-billing-bridge.spec.ts`

**Interfaces:**
- Consumes: `confirmManagerContractReview(...)`의 기존 동기 도메인 결과.
- Produces: `RoomlogService.ensurePersistenceDurability(): Promise<void>`.
- Keeps: `ensureTradeContractDurability()`는 새 generation 보장을 호출한다.

- [ ] **Step 1: 관리자 확정 프로젝션 실패·재시도 테스트 작성**

fake projector가 첫 confirmed 스냅샷에서 실패하고 다음 스냅샷에서 성공하게 한다.

```ts
await assert.rejects(
  () => controller.confirmManagerContract(header, contract.id, { confirmNeedsCheck: true }),
  /confirmation projector unavailable/,
);
assert.equal(service.getManagerContractDetail(managerId, contract.id).row.contract.review, "confirmed");
await controller.confirmManagerContract(header, contract.id, { confirmNeedsCheck: true });
assert.equal(successfulStores.at(-1)?.contracts.find((item) => item.id === contract.id)?.review, "confirmed");
assert.equal(
  successfulStores.at(-1)?.contractExtractions
    .find((item) => item.contractId === contract.id)?.items.some((item) => item.needsCheck),
  false,
);
```

- [ ] **Step 2: 실패 테스트 실행**

```bash
pnpm --filter api exec node --test -r ts-node/register src/roomlog/contract-billing-bridge.spec.ts
```

Expected: controller가 프로젝션을 기다리지 않아 FAIL.

- [ ] **Step 3: Roomlog generation 추적 구현**

```ts
private persistenceGeneration = 0;
private completedPersistenceGeneration = 0;
private persistenceFailure?: { generation: number; error: unknown };

async ensurePersistenceDurability(): Promise<void> {
  const requiredGeneration = this.persistenceGeneration;
  await this.pendingPersistence;
  if (this.completedPersistenceGeneration < requiredGeneration) {
    throw this.persistenceFailure?.error ?? new Error("저장을 완료하지 못했습니다.");
  }
}
```

`projectStore()`는 Trade와 같은 generation별 성공·실패 판정을 사용한다. `ensureTradeContractDurability()`는 이전 최신 generation 실패 뒤 새 작업이 없을 때만 `projectStore()`를 한 번 재호출한 다음 공통 보장을 기다린다.

- [ ] **Step 4: 관리자 확정 컨트롤러 async 전환**

```ts
async confirmManagerContract(...) {
  const user = this.requireRole(authorization, ["LANDLORD"]);
  const result = this.roomlogService.confirmManagerContractReview(user.id, contractId, body);
  await this.roomlogService.ensurePersistenceDurability();
  return result;
}
```

동기 JSON 실패는 기존 rollback을 유지하고, 비동기 RDS 실패에는 confirmed 상태를 되돌리지 않는다.

- [ ] **Step 5: Roomlog·Trade 연결 회귀 테스트 실행**

```bash
pnpm --filter api exec node --test -r ts-node/register \
  src/roomlog/contract-billing-bridge.spec.ts \
  src/roomlog/trade-contract-atomic-connection.spec.ts \
  src/trade/trade-contract-billing-bridge.service.spec.ts \
  src/trade/trade.controller.spec.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 6: 첫 번째 최종 커밋으로 문서와 코드를 합치기**

```bash
git add docs/superpowers/specs/2026-07-13-billing-durability-hardening-design.md \
  docs/superpowers/plans/2026-07-13-billing-durability-hardening.md \
  apps/api/src/trade/trade.service.ts apps/api/src/trade/trade.controller.ts \
  apps/api/src/trade/trade-contract-billing-bridge.service.ts \
  apps/api/src/trade/trade-store.projector.spec.ts apps/api/src/trade/trade.controller.spec.ts \
  apps/api/src/trade/trade-contract-billing-bridge.service.spec.ts \
  apps/api/src/roomlog/roomlog.service.ts apps/api/src/roomlog/roomlog.controller.ts \
  apps/api/src/roomlog/contract-billing-bridge.spec.ts
git commit --amend -m "fix(contract): harden billing durability"
```

Expected: `origin/dev..HEAD`에 커밋 1개.

---

### Task 3: Roll back every failed Trade JSON mutation

**Files:**
- Modify: `apps/api/src/trade/trade.service.ts`
- Test: `apps/api/src/trade/trade.service.spec.ts`

**Interfaces:**
- Consumes: 모든 기존 `this.persist()` 호출.
- Produces: 내부 `committedStore: TradeStore`, `cloneStore(store): TradeStore`, 공통 atomic `persist(): void`.
- Removes: 수락 전용 `persistAcceptance()`와 수락 mutation의 부분 수동 롤백.

- [ ] **Step 1: 계약 제안·취소·거절·수락 실패 테스트 작성**

정상 디스크 스냅샷 뒤 `<store>.tmp` 디렉터리로 rename을 실패시킨다.

```ts
const before = snapshotTrade(service, storePath);
mkdirSync(`${storePath}.tmp`);
assert.throws(() => service.proposeContract(owner, thread.id), /EISDIR|directory|rename|write/i);
assert.deepEqual(snapshotTrade(service, storePath), before);
```

장애 제거 후 재시도하여 제안/메시지가 하나만 생기는지 확인한다. 취소·거절 실패는 proposed와 메시지 수를 유지하고, 수락 회귀는 accepted saga 기대값을 유지한다.

- [ ] **Step 2: 계약 mutation 실패 테스트 실행**

```bash
pnpm --filter api exec node --test -r ts-node/register src/trade/trade.service.spec.ts
```

Expected: 현재 `persist()`가 오류를 삼켜 FAIL.

- [ ] **Step 3: 매물 CRUD·문의·메시지 실패 테스트 작성**

`createListing`, `updateListing`, `deleteListing`, `markListingContracted`, `createInquiry`, `sendMessage` 각각에서 throw, live rollback, disk 불변을 확인한다. 정상 rename이 성공한 상태는 이후 실패의 새 rollback 기준이 되는지도 검증한다.

- [ ] **Step 4: 전체 mutation 실패 테스트 실행**

```bash
pnpm --filter api exec node --test -r ts-node/register src/trade/trade.service.spec.ts
```

Expected: 새 rollback 테스트들이 FAIL.

- [ ] **Step 5: 공통 atomic persist와 확정 스냅샷 구현**

```ts
private committedStore: TradeStore = { listings: [], threads: [], contracts: [] };

private cloneStore(store: TradeStore): TradeStore {
  return structuredClone(store);
}
```

constructor에서 `load()`와 `hydrateListingsFromDb()` 뒤 `committedStore`를 초기화한다. `persist()`는 아래 공통 경계로 교체한다.

```ts
private persist() {
  const snapshot = this.cloneStore(this.store);
  if (!this.filePath) {
    this.committedStore = snapshot;
    return;
  }
  const tempFilePath = `${this.filePath}.tmp`;
  try {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(tempFilePath, JSON.stringify(snapshot), "utf8");
    renameSync(tempFilePath, this.filePath);
    this.committedStore = snapshot;
  } catch (error) {
    try { unlinkSync(tempFilePath); } catch {}
    this.store = this.cloneStore(this.committedStore);
    throw error;
  }
}
```

실제 구현에서는 `.tmp`가 fault fixture 디렉터리면 삭제하지 않고 원래 오류를 보존한다. `persistAcceptance()`를 제거하고 수락도 `persist()`를 사용하며 부분 수동 롤백을 제거한다.

- [ ] **Step 6: Trade 전체 회귀 테스트 실행**

```bash
pnpm --filter api exec node --test -r ts-node/register \
  src/trade/trade.service.spec.ts \
  src/trade/trade-store.projector.spec.ts \
  src/trade/trade.controller.spec.ts \
  src/trade/trade-contract-billing-bridge.service.spec.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 7: 두 번째 최종 커밋 생성**

```bash
git add apps/api/src/trade/trade.service.ts apps/api/src/trade/trade.service.spec.ts
git commit -m "fix(trade): roll back failed store writes"
```

Expected: `origin/dev..HEAD`에 요청한 커밋 2개만 존재.

---

### Task 4: Verify, review, push, and open one Ready PR

**Files:**
- Review only: Tasks 1–3의 변경 파일.

**Interfaces:**
- Consumes: 두 최종 커밋과 승인된 설계.
- Produces: 원격 `yong` 브랜치와 `dev` 대상 Ready PR 하나.

- [ ] **Step 1: 커밋과 범위 확인**

```bash
git log --oneline origin/dev..HEAD
git diff --name-status origin/dev...HEAD
git diff --check origin/dev...HEAD
```

Expected: 커밋 정확히 2개, API·설계·계획 파일만 변경, whitespace 오류 없음.

- [ ] **Step 2: API 전체 테스트와 빌드 실행**

```bash
pnpm test:api
pnpm --filter api build
```

Expected: DB 컨테이너가 필요한 테스트는 기존 규칙대로 skip될 수 있고 나머지는 PASS, API build 성공.

- [ ] **Step 3: 저장소 기본 검증 실행**

```bash
bash scripts/verify.sh
```

Expected: types·ui·web·api build와 API smoke PASS. Docker 부재 오류는 그대로 보고하고 범위를 넓혀 수정하지 않는다.

- [ ] **Step 4: 최종 diff 자체 리뷰**

```bash
git diff --stat origin/dev...HEAD
git diff origin/dev...HEAD -- apps/api/src/trade apps/api/src/roomlog
```

UI·schema 변경 없음, 알림은 durability 완료 후만 전송, 오래된 generation이 최신 결과를 덮지 않음, 모든 `persist()` 경로가 공통 rollback을 쓰는지 확인한다.

- [ ] **Step 5: `yong`에 푸시하고 Ready PR 생성**

```bash
git push --force-with-lease origin HEAD:yong
gh pr create --base dev --head yong \
  --title "fix: harden contract billing durability" \
  --body $'## 변경\n- 거래 수락 매물과 Roomlog 계약 프로젝션을 generation 단위로 기다립니다.\n- 관리자 계약 확정의 RDS 반영을 기다리고 재시도할 수 있게 합니다.\n- Trade JSON 저장 실패 시 모든 mutation을 마지막 확정 상태로 되돌립니다.\n\n## 검증\n- pnpm test:api\n- pnpm --filter api build\n- bash scripts/verify.sh'
```

기존 `yong` PR이 열려 있으면 새 PR을 만들지 않고 업데이트 여부를 확인한다. `--draft`는 사용하지 않는다.

- [ ] **Step 6: PR 상태 확인**

```bash
gh pr view --json number,url,isDraft,baseRefName,headRefName,commits
```

Expected: `isDraft=false`, `baseRefName=dev`, `headRefName=yong`, 커밋 2개.
