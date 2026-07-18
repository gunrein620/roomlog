# 하자 흐름 2차분D Implementation Plan — 업체 참여 티켓 채팅

> **For agentic workers:** 테스트 우선. git 조작 금지. 설계: `docs/superpowers/specs/2026-07-18-defect-flow-phase-2d-vendor-chat-design.md`.
> **파일 소유권**: `apps/web/src/app/my/flows/**`·`apps/web/src/lib/tenant-vendor-workflow-api.ts`는 수정 금지(Claude 소유). 이번 작업은 세입자탭 변경이 **없어야 정상**이다.

**Goal:** 배정 업체가 같은 티켓 스레드에서 세입자·관리자와 채팅할 수 있게 한다(repairId 스코프로 업체 가시 범위 격리). 스키마 무변경 — 죽은 스텁(`AddVendorRepairMessageInput`, VENDOR 롤) 재사용.

## Global Constraints

- 업체는 자기 repairId 스코프 메시지만 열람 — 티켓 레벨 대화(책임 공방 등) 절대 비노출.
- 검증은 서버 강제. 새 테이블·스키마 변경·채널 선택 UI 금지.
- 확정·제안의 공식 경로는 기존 견적 왕복(2C) — 채팅이 이를 대체하지 않는다.

---

### Task 1: 서비스 회귀 계약 (RED)

**Files:**
- Modify/Test: `apps/api/src/roomlog/roomlog.service.spec.ts` 또는 vendor-workflow 도메인 스펙(기존 테스트 위치를 따름)

- [ ] 업체 발신: repairId 스코프+VENDOR 롤 저장, 업체 잡 상세 `messages`에 노출 실패 테스트.
- [ ] 게이트: 비배정 업체 403, CLOSED repair 발신 거부, 빈 본문(텍스트·사진 모두 없음) 400 실패 테스트.
- [ ] 프라이버시: 업체 열람에 티켓 레벨 메시지(repairId 없음) 미포함 실패 테스트.
- [ ] 자동 스코핑: 활성 repair 존재 시 세입자 발신(`addTenantComplaintMessage`)·관리자 답변에 repairId 부착→업체에 보임 / 활성 repair 없으면 기존 동작 불변 실패 테스트.
- [ ] transpile-only 단일 실행으로 RED 확인.

### Task 2: API 구현 (GREEN)

**Files:**
- Modify: `packages/types/src/vendor-workflow.ts` (`VendorJobDetail.messages: VendorJobMessageView[]`, `VendorJobMessageView` — senderUserId 등 내부 식별자 Omit 패턴)
- Confirm: `packages/types/src/index.ts` re-export
- Modify: `apps/api/src/roomlog/roomlog.types.ts` (`AddVendorRepairMessageInput` 정의 확인·정리)
- Modify: `apps/api/src/roomlog/roomlog.service.ts` (`addVendorRepairMessage(vendorUserId, repairId, input)`; `addMessageInternal`에 repairId 통과; `addTenantComplaintMessage`·관리자 replies 자동 스코핑)
- Modify: `apps/api/src/roomlog/roomlog.controller.ts` (`POST vendor/jobs/:repairId/messages` — VENDOR 가드, 기존 vendor job 계정 링크 검증 재사용, realtime broadcast)
- Modify: `apps/api/src/roomlog/prisma-vendor-workflow.repository.ts` 또는 잡 상세 조회 경로 (repairId 스코프 메시지 join → `messages`)
- Modify: `apps/api/src/roomlog/prisma-store-projector.ts` (TicketMessage.repairId load/persist 매핑 — 이미 매핑돼 있으면 무변경 확인)

- [ ] Task 1 GREEN. DB 스펙은 `ROOMLOG_TEST_DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog_test`.
- [ ] 스키마 무변경 확인(prisma generate 불필요).

### Task 3: 업체 화면

**Files:**
- Modify: `apps/web/src/lib/vendor-job-api.ts` 또는 업체 잡 API 클라이언트(실제 위치 확인) — 메시지 발신 mutation
- Modify: `apps/web/src/app/vendor/job/01/page.tsx` + `apps/web/src/app/vendor/job/_components.tsx` ("진행 메시지" 채팅 섹션: 스레드+발신자 라벨(나/세입자/관리자)+입력, CLOSED면 읽기 전용)
- Modify/Test: 신규 `apps/web/src/lib/vendor-job-chat.spec.ts` 소스 계약 스펙

- [ ] 웹 계약 스펙 RED → 구현 → GREEN: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/lib/vendor-job-chat.spec.ts`
- [ ] `my/flows`·`tenant-vendor-workflow-api.ts` 미수정 자체 검토(diff에 없어야 함).

### Task 4: 통합 검증

- [ ] 대상 스펙 재실행(기존 실패 집합 외 신규 실패 0건).
- [ ] `pnpm` 부재 — `node_modules/.bin/*` 직접 실행. `bash scripts/verify.sh`.
- [ ] 검증 요약: 업체 발신→세입자탭 "업체" 라벨 노출 경로, 세입자 발신 자동 스코핑→업체 상세 노출 경로를 스펙 증거로 명시.
