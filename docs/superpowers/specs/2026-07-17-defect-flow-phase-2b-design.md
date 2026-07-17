# 하자 흐름 2차분B 설계 — 관리자 직접 처리 + 자가수리 가시성

## 범위

관리자가 업체 배정 대신 하자를 **직접 처리**하는 제3의 갈래를 만든다: 시작 → 완료 보고 → 기존 세입자 완료확인 게이트 재사용 → COMPLETED. 완료 보고 시 선택적으로 비용기록(Cost, DRAFT)을 남긴다. 그리고 세입자 책임 트랙(세입자 주도 업체연결 = **자가수리**)의 진행이 관리자에게 보이게 한다: 미등록 업체 잡의 읽기전용 조회, 관리자 티켓 목록 자가수리 배지, 자가수리 이벤트 realtime 브로드캐스트.

보류/반려(TicketDisposition), 관리자 대리접수, AI 재분석 트리거, 일정협의(2C)는 이번 범위가 아니다.

## 데이터

- `Ticket`에 직접 처리 메타(2A responsibility 메타와 같은 패턴, 전부 nullable):
  - `directHandlingStartedAt DateTime?` · `directHandlingCompletedAt DateTime?` · `directHandlingNote String?`
- `RepairRequest`에 `tenantInitiated Boolean @default(false)` — 세입자 업체연결(`prisma-tenant-vendor-connection.repository.ts`의 `repairRequest.create`)에서만 true로 생성. 판별자를 `DomainEventOutbox` 휴리스틱(`isTenantVendorRequest`)에서 컬럼으로 승격하는 것.
- migration `prisma/migrations/20260717150000_ticket_direct_handling_self_repair/migration.sql`: 위 컬럼 추가 + 기존 데이터 백필(`DomainEventOutbox`에서 `eventKey = 'vendor-job-assigned:' || RepairRequest.id`이고 `managerId IS NULL`인 행 → `tenantInitiated = true`).
- store 타입(`roomlog.types.ts`)의 `Ticket`/`Repair`에 대응 필드 추가, projector(`prisma-store-projector.ts`) load/create/update 매핑 추가.

## API (서버 강제 게이트)

모두 LANDLORD 역할 + 관리 호실 범위 검사. 게이트는 클라 disabled가 아니라 서버에서 강제한다.

- `POST manager/tickets/:ticketId/direct-handling` — 직접 처리 시작.
  - 허용 상태: `RECEIVED | REVIEWING | ADDITIONAL_INFO_REQUESTED | VENDOR_ASSIGNMENT_PENDING | REOPENED`.
  - 활성 RepairRequest(CLOSED 아님)가 있으면 409(`ACTIVE_REPAIR_CONFLICT` 성격) 거부. 이미 직접 처리 중이면 거부.
  - 성공 시: `directHandlingStartedAt`/`directHandlingNote` 기록, 티켓 상태 → `REPAIR_IN_PROGRESS`(전이 사유 "관리자 직접 처리 시작"), 세입자 노출 메시지 생성("관리자가 직접 처리를 시작했습니다" + note).
- `POST manager/tickets/:ticketId/direct-handling/complete` — 완료 보고. body `{ note: string(필수, 공백 불가), cost?: { amount: number(양의 정수), item?: string } }`.
  - 직접 처리 중(`startedAt` 있고 `completedAt` 없음)이고 상태가 `REPAIR_IN_PROGRESS`일 때만.
  - 성공 시: `directHandlingCompletedAt` 기록, 상태 → `COMPLETION_REPORTED`, 세입자 노출 메시지("관리자가 처리 완료를 보고했습니다 — 확인해 주세요" + note).
  - `cost`가 오면 Cost 생성: `type: REPAIR`, `scope: UNIT`, `unitId: ticket.roomId`, `status: DRAFT`, `verified: false`, `item`은 미지정 시 "직접 처리 · {ticket.category}". **DRAFT는 기존 원칙대로 확정 전 집계에서 제외되므로 그대로 두고, 확정은 기존 `POST manager/costs/:costId/confirm` 경로를 재사용한다.**
- `POST manager/tickets/:ticketId/direct-handling/cancel` — 시작 취소. body `{ reason: string(필수) }`. 완료 보고 전에만. 상태 → `REVIEWING`, 메타 초기화, 세입자 메시지("직접 처리를 취소했습니다" + reason).
- 세입자 완료확인은 **기존 `POST tenant/complaints/:complaintId/confirm-completion`을 무변경 재사용**한다(repairs가 없어도 COMPLETION_REPORTED → COMPLETED 전이 가능함을 회귀 테스트로 못박는다). 재요청(reopen)도 기존 경로 그대로.
- `GET manager/vendor-mgmt/tickets/:ticketId/job` — 관리자-업체 등록관계(`findRelation`)가 없어도 null을 반환하지 말고, VendorProfile 공개 정보 기반 축약 뷰로 응답한다. 응답에 `partnership: "REGISTERED" | "UNREGISTERED"` 마커를 추가하고 UNREGISTERED는 읽기전용(관리자 액션 버튼 비노출)이다.

## Presenter / Realtime

- 티켓 presenter(관리자·세입자 공통 spread 유지): `directHandling: { startedAt, completedAt?, note? } | null` 추가.
- 관리자 티켓 목록 행(`presentTicketForManager`): 활성 `tenantInitiated` repair가 있으면 `selfRepair: { active: true, statusLabel }`(기존 RepairStatus 한국어 라벨 재사용), 없으면 null.
- realtime(`roomlog:activity`, kind `"ticket"`): 직접 처리 3개 엔드포인트와, 자가수리 트랙의 세입자 엔드포인트(`vendor-connection/confirm`, `estimates/:id/review`, `estimates/:id/confirm-visit`, `repairs/:repairId/completion-decisions`)에서 브로드캐스트. 이미 브로드캐스트가 있는 엔드포인트는 중복 추가하지 않는다.

## 웹

- 관리자 대시(`manager/ticket/dash/01`): "다음 행동" 카드에 직접 처리 서버 액션 3종(시작/완료 보고/취소)을 조건부로 표시. 완료 보고 폼은 note 필수 + 선택 비용(금액·항목). 직접 처리 진행/완료 상태는 배지·텍스트로 표시. 기존 `actions.ts`에 서버 액션 추가.
- 관리자 목록(`manager/ticket/dash/00`): 자가수리 배지("세입자 자가수리 진행중 · {statusLabel}") 표시.
- 관리자 업체 잡 화면(대시 04 계열): `partnership: "UNREGISTERED"`면 읽기전용 안내("세입자가 연결한 플랫폼 업체 — 조회 전용")와 진행 상태만 표시하고 관리자 액션(견적 승인 등)은 렌더하지 않는다(서버도 어차피 거부하지만 UI도 숨김).
- 세입자 상세(`tenant/defect/11`): "수리 진행" 섹션이 직접 처리 중이면 "관리자가 직접 처리 중" / 완료 보고되면 기존 완료확인 UI(`tenant/defect/10` 경로)로 이어지게 한다. 현재의 "별도 수리 단계가 없어요" 문구는 직접 처리 데이터가 없을 때만.
- 공유 타입(`packages/types/src/ticket.ts`): `TicketDirectHandling`, `TicketSelfRepairSummary` 등 도메인 접두어 타입 추가 + `index.ts` re-export 확인.

## 오류와 검증

- 상태·권한·활성수리 충돌·note 필수·cost 양수 검증은 전부 API 서비스에서. HTML required는 편의일 뿐.
- 서비스 회귀 테스트: ① 시작→완료 보고→세입자 완료확인 COMPLETED 전이(수리 레코드 0개), ② 활성 수리 존재 시 시작 거부, ③ 직접 처리 아닌 티켓의 완료 보고 거부, ④ cost 동반 완료 보고가 DRAFT Cost를 만드는 것, ⑤ 취소 후 REVIEWING 복귀.
- repository/서비스 테스트: 미등록 업체 findJobByTicket이 UNREGISTERED 축약 뷰를 반환, 등록 업체는 기존과 동일.
- projector 테스트: 새 Ticket/Repair 필드 round-trip.
- realtime 테스트: 직접 처리 시작·완료 보고 브로드캐스트.
- 웹 계약 테스트: 관리자 카드(직접 처리 액션·자가수리 배지)와 세입자 표시 문구.
- Prisma generate, 빌드, `bash scripts/verify.sh`.

## 제약

- git 명령, 브랜치, 커밋은 수행하지 않는다.
- 스타일 색상은 기존 `var(--...)` 토큰만 사용한다.
- 티켓 상태 ≠ 수리 상태: 직접 처리는 RepairRequest를 만들지 않는다. 기존 상태 머신 값만 재사용하고 TicketStatus를 확장하지 않는다.
- 자동 발송·독촉 금지: 직접 처리 메시지는 관리자 액션의 결과 통보일 뿐, 어떤 자동 발송도 새로 만들지 않는다.
- 미확정 금액 집계 제외: 직접 처리 비용은 DRAFT로만 생성하고 확정은 기존 confirm 경로를 재사용한다.
