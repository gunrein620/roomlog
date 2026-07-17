# 하자 흐름 2차분E 설계 — 관리자 상세 채팅 + 업체 거절 표시 보강

## 범위

**A. 관리자 상세 채팅**: 관리자 하자/민원 상세(`manager/ticket/dash/01`)에 세입자·업체와의 티켓 대화를 **채팅 스레드 형식**으로 표시하고, 그 자리에서 바로 답장한다. 현재는 대화 표시가 아예 없고 답변(replies)이 단발로만 나간다.

**B. 업체 거절 가시성 보강**: 업체가 배정을 거절(DECLINED 견적 + 사유)하면 백엔드는 이미 완결된다 — repair CANCELLED, ticket `VENDOR_ASSIGNMENT_PENDING`(배정 해제·재배정 가능), 세입자 화면 사유 표시. **관리자 화면에서 거절 사실·사유가 보이고 재배정으로 자연히 이어지는지**를 검증하고 빠진 표시를 보강한다. 새 상태·전이 금지(기존 전이 재사용).

세입자탭·업체 스레드의 스크롤 처리(①)는 다른 작업자 담당 — 이 태스크 범위 아님.

## A. 관리자 상세 채팅

- **API**: `GET manager/tickets/:ticketId` 응답에 티켓 메시지 스레드가 없으면 노출한다 — `presentTicketForManager`(roomlog.service.ts 13334행 부근)에 `messages: presentTicketMessage[]`(티켓 전체, 시간순) 추가. 웹 `ticket-manager-api.ts`가 이미 `ticket.messages ?? []`를 참조하므로 계약을 실제로 채우는 것. 목록(`GET manager/tickets`)에는 무게상 **포함하지 않는다**(상세만).
- **발신**: 기존 `POST manager/tickets/:ticketId/replies`(`sendManagerTicketReply`) 재사용 — 새 엔드포인트 금지. 2D 자동 스코핑(활성 repair 존재 시 repairId 부착)이 이 경로에 이미 적용돼 있는지 확인하고, 안 돼 있으면 적용(업체에게도 보여야 함).
- **UI**(`dash/01/page.tsx` + `_components/ticket-manager-ui.tsx` + `dash/01/actions.ts`):
  - "진행 메시지" 카드: 발신자 라벨(세입자/나/업체/시스템·AI) 구분 채팅 스레드 + 하단 입력·보내기(서버 액션 → replies).
  - **스레드는 max-height + `overflow-y: auto` 스크롤 컨테이너** — 메시지가 쌓여도 카드가 무한정 길어지지 않는다. 열릴 때 최신(하단)이 보이게.
  - 기존 "답변 초안 생성"(dash/03) 흐름은 유지 — 채팅은 즉답용, 초안은 정중한 장문용으로 공존.
- 자동 발송 없음 — 보내기는 관리자 명시 액션.

## B. 업체 거절 가시성

- 관리자 상세(dash/01)에서: 배정했던 업체가 거절한 경우(취소된 repair의 최신 견적 status `DECLINED`) **"업체가 배정을 거절했습니다" + declineReason**을 표시하고, 다음 행동의 업체 배정 경로(dash/04)로 안내한다. 이미 표시된다면 무변경.
- 관리자 목록(dash/00) 행: `VENDOR_ASSIGNMENT_PENDING` + 직전 거절 이력의 구분 표시는 **선택**(과하면 생략 — 1~5채 스코프).
- 세입자 쪽은 기존 표시(선택 업체 거절 사유) 확인만. 자가수리 거절 후 세입자탭 업체연결 카드 재노출은 기존 조건(REQUESTABLE 복귀)으로 이미 동작 — 회귀 테스트로 고정.
- 거절 시 세입자 노출 티켓 메시지("업체가 요청을 진행하기 어렵다고 답변했습니다 — {사유}")가 없으면 추가(있으면 무변경, 중복 금지).

## 검증

- API 회귀: ① 관리자 상세 messages 노출(시간순·전체 스레드), ② 관리자 reply의 repairId 자동 스코핑(활성 repair 유/무), ③ 거절 → 배정 해제 + 사유 보존 + (신설 시) 세입자 메시지 생성, ④ 거절 후 재배정 가능.
- 웹 계약: dash/01 채팅 스레드(발신자 라벨·스크롤 컨테이너·컴포저), 거절 사유 표시.
- 기존 실패 집합 외 신규 실패 0건. `bash scripts/verify.sh`.

## 제약

- git 명령·커밋 금지. `apps/web/src/app/my/flows/**`·`apps/web/src/lib/tenant-vendor-workflow-api.ts`·`apps/web/src/app/globals.css` 수정 금지(다른 작업자 동시 작업).
- 새 엔드포인트·새 상태·스키마 변경 금지(기존 replies·전이 재사용). CSS는 `var(--...)` 토큰만.
- 독촉·자동 발송 금지.
