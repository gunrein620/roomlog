# roomlog.service.ts 도메인 분리 — 실행계획 & 진행상황

`apps/api/src/roomlog/roomlog.service.ts`(약 7,380줄 god object, 66개 엔드포인트 위임)를 **동작 불변**으로 도메인별 협력 클래스로 점진 분리한다. 병렬 분석(6 서브에이전트: auth/ticket/complaint/vendor/misc/infra) + 검증된 패턴 기록.

## 하드 제약 (게이트)

- **spec 계약**: `roomlog.service.spec.ts`가 `new RoomlogService({ seedDemoData, storeFilePath, storeProjector })`를 **30회+ 직접 인스턴스화**, `flushPersistence()` 호출, **`(service as any).<private>`로 내부 멤버 접근**. →
  - store 소유권을 별도 NestJS DI 프로바이더로 빼면 깨진다.
  - `RoomlogService`가 **생성자·store 소유·public 표면·flushPersistence·private 멤버명**을 그대로 유지해야 한다. (이동 전 spec에서 `as any` 접근하는 필드 grep으로 확정·보존.)
- **매 추출 게이트**: `pnpm --filter api build` 통과 + `roomlog.service.spec.ts` **61 pass / 0 fail**. 실패 시 그 스텝 revert.
- 외부 API 라우트/응답 shape/프론트/Prisma·공유타입 불변. DB모델·인증정책·신규기능·대규모 포맷팅 금지.

## 검증된 패턴 — "협력 클래스 facade" (DI 분리 아님)

RoomlogService는 생성자·store 소유·public 표면 유지. 도메인 로직만 **plain 협력 클래스**(NestJS 프로바이더 아님)로 빼고, RoomlogService 생성자에서 `new`로 만들어 공유 표면을 주입. DI 그래프는 지금과 동일(`RoomlogService` 하나), `roomlog.module.ts` 무변경.

```ts
// 공유 표면 (DI 아님)
export interface RoomlogContext {
  readonly store: Store; readonly storageAdapter: FileStorageAdapter;
  readonly publicUploadBaseUrl: string; persist(): void;   // = RoomlogService.persistStore
}
// 횡단 헬퍼 plain class
export class RoomlogCommon {
  constructor(private readonly ctx: RoomlogContext) {}
  get store() { return this.ctx.store; }
  findTicket(id){/*원본 그대로*/} transitionTicket(...){} presentTicket(t){} presentRoomTimeline(...){} /* 등 */
}
// 도메인 협력 클래스
export class FloorPlanService {
  constructor(private readonly ctx: RoomlogContext, private readonly common: RoomlogCommon) {}
  createFloorPlanDraft(...) { /* 본문 verbatim, 말미 this.ctx.persist() */ }
}
// RoomlogService: 생성자·public 표면 그대로, 내부만 위임
constructor(...) {
  /* 기존 생성자 본문 100% 그대로(store 초기화) */
  const ctx = { store: this.store, storageAdapter: this.storageAdapter,
                publicUploadBaseUrl: this.publicUploadBaseUrl, persist: () => this.persistStore() };
  this.common = new RoomlogCommon(ctx);
  this.floorPlans = new FloorPlanService(ctx, this.common);
}
createFloorPlanDraft(a,b){ return this.floorPlans.createFloorPlanDraft(a,b); }  // 66개 1:1 위임
```

메서드 본문은 **verbatim 복사**(주입 필드명을 동일하게 해 `this.store`/`this.persist()` 참조 보존). auth는 최소 3개(store/persistStore/findRoom) 직접 주입으로 처리했고, 공유 헬퍼를 많이 쓰는 도메인(계약/티켓)은 `RoomlogCommon` 경유 권장.

### 함정 (실제 겪음/분석)
- **타입 출처**: `Store/SignupInput/AuthResult/VendorInvite/TenantInvite` 등은 roomlog.types가 아니라 **roomlog.service.ts에서 정의**. 도메인 파일은 service에서 `export` 후 **`import type ... from "../roomlog.service"`**(타입-only 순환 무해). Room/UserAccount/UserRole 등만 `../roomlog.types`.
- **공유 순수함수**: `id/now/hashPassword/...`는 여러 도메인·createDemoStore 공유 → **`roomlog-support.ts`**로 분리(완료). 도메인 파일은 여기서 import.
- **`normalizeStoreSnapshot`이 `emptyPhotoAnalysis`/`cloneReceiptOcr` 의존** → 이 둘을 자유함수화(0단계)해야 store 잔류부가 intake/cost 협력자를 역참조 안 함.
- `noUnusedLocals` 꺼짐 → 이동 후 미사용 import는 빌드 실패 안 시킴(정리 선택).

## 공유 토대 (RoomlogService/Common 잔류 — 선행)

- **store 코어(RoomlogService 잔류)**: `store`(단일 가변, 복사 금지·동일 참조 필수), `storageAdapter`, `persistStore`(34 호출부)·`projectStore`·`loadStore`·`normalizeStoreSnapshot`·`flushPersistence`, 영속화 큐(`pendingPersistence`/`persistenceError`). projector는 **전체 store 스냅샷 통째 투영**이라 도메인별 분할 불가.
- **RoomlogCommon(횡단 헬퍼)**: 파인더 `findTicket`(31)·`findComplaint`(16)·`findRoom`(9)·`findIntakeSession`·`resolveVendor`·`findVendorRepair`; 접근제어 `assertManagerCanAccessTicket/Room`·`canManagerAccessRoom`; **티켓/수리 뮤테이터 `transitionTicket`(15)·`addMessageInternal`(17)·`pushHistory`·`assertTicketStatus`·`assertRepairStatus`**(단일 구현·재구현 금지); 공유 프레젠터 `presentTicket`(16)·`presentComplaint`(8)·`presentTicketMessage`·`presentRoomTimeline`(4, 횡단집계)·`presentIntakeSession`·`displayStatus`·`displayUnitId`; 순수유틸 `timeOf`·`currentMonth`·`median`·`average` 등.

## 결합 지도 (최대 난관)

- **프리젠터 = 횡단 허브**: `presentTicket`(10소스 집계), `presentRoomTimeline`(전 컬렉션), `presentComplaint`. **`presentTicket↔presentComplaint` 순환** + `presentAiFeedback`가 양쪽에 임베드 → complaint↔aiFeedback↔ticket 프리젠터 순환.
- **`createComplaintRecord`(1700) — 최대 난관**: complaint 생성=Ticket 생성(`tickets.unshift`)+`analyses[ticketId]`+`pushHistory`+초기메시지를 원자적으로. 호출 3곳(createComplaint/createComplaintFromCall/finalizeIntakeSession). → 티켓 도메인 소유로 두고 intake/complaint가 위임 권장.
- **`transitionTicket` 조인쓰기**: ticket.status 변경 시 complaint.status 동시 변경+history. tenant/manager 양쪽 사용.
- **교차 쓰기**: `assignVendor`(→`vendor.activeJobs++`·`repairs` 생성), `approveCompletion`·`confirmTenantCompletion`(→repairs mutate). vendor/repair 소유권 인터페이스 합의 필요.

## 권장 추출 순서 (가장 독립 → 강결합)

- **0. 공유 순수 유틸 → `roomlog-support.ts`** ✅ **완료(f42a9f4)**
- **auth** → `services/roomlog-auth.domain.ts` ✅ **완료(894e55c)** — 5 public+헬퍼9, ~419줄
- **0.5. (다음) 공유 토대**: `emptyPhotoAnalysis`/`cloneReceiptOcr` 자유함수화 + `RoomlogContext`/`RoomlogCommon` 도입(계약·티켓 추출 전 배리어). floorplan/cost는 Common 없이도 가능.
- **1. FloorPlan(+Attachment)** — **최우선·최독립**. 자체 validator 무리 완전 자기완결(`validFloorPlan*`/`optional*`/`assertFloorPlanOwner`/`presentFloorPlanDraft`), `store.floorPlans`+`attachments`+storageAdapter만. 티켓/수리 무관. ⚠️ `attachments`가 타 도메인 업로드 참조 가능성 → `saveAttachment` 묶기 전 확인.
- **2. 계약(Contract)** — 자기완결 서브시스템. `contract*` 헬퍼 통째 이동, 티켓 무관. ⚠️ `getManagerDisclosureSetting`은 계약 아닌 **비용**으로(maintenance cost 의존).
- **3. 비용(Cost)** — 쓰기 없어 안전. ⚠️ `cloneReceiptOcr`는 store 역직렬화(3397)도 호출 → **shared 유지**(비용으로 이동 금지).
- **4. 체크리스트** — 소형·응집(`moveInChecklistGuidance`/`presentMoveInChecklistItem`). 타임라인 래퍼(`getTenantRoomTimeline`)는 Common의 `presentRoomTimeline` 위임뿐이라 단독화 실익 없음.
- **5. 업체(Vendor/mgmt/invite)** — `repairs`를 read로만 참조. ⚠️ 초대는 signup 흐름(`getSignupInvitePreview`+`tenantInvites`+`assertPendingTenantInvite`)과 경계 공유 → 초대 일괄 이동 조율.
- **6~9. 코어(Repairs→Intake/Complaint→Tickets/Manager)** — **맨 마지막·감독 필요**. `createComplaintRecord`·`transitionTicket`·프리젠터 순환 선해소(RoomlogCommon) 후. 무인 자동화 비권장.

## 리스크 (동작 불변 — 코어 진입 전 필독)
1. 단일 가변 store 동일 참조(복사 금지)가 최우선 불변식. `ctx.store === this.store`.
2. spec `(service as any).<private>` 호환 — private 멤버명 보존.
3. `persistStore` 34개 호출부 누락·중복 금지. 파일저장→projectStore 순서·`pendingPersistence` 순차성 보존.
4. `unshift` 최신순 정렬 의존(complaints/tickets/repairs) 그대로.
5. `transitionTicket`/`pushHistory`/`addMessageInternal` 단일 구현(RoomlogCommon). 재구현 금지.
6. 기본인자 보존: `getManagerContractDetail(m, contractId="ct_0001")`, `getManagerMonthlyCostSummary(..., month=currentMonth())`, `getManagerDisclosureSetting(..., month=currentMonth())`, `decideManagerContractDeletion` 4인자 언팩 등.
7. 데드코드 `presentRepair`(6643, 호출0) — 이동 제외/삭제 후보(별도 커밋).

## 현재 상태
- baseline green(61 tests + build). 재부팅 후 stale Prisma는 `prisma generate`로 복구(워킹트리 무영향).
- 커밋: `f42a9f4`(support), `894e55c`(auth), 본 문서. roomlog.service.ts **7,380 → 6,961줄**.
- 다음: FloorPlan(1순위). 코어(6~9)는 감독 하 진행.
