# 하자 흐름 2차분D 설계 — 업체 참여 티켓 채팅

## 범위

배정된 업체가 세입자·관리자와 **같은 티켓 스레드에서 채팅**할 수 있게 한다 — 방문 시간 즉석 조율("화요일 3시 어때요?")이 목적. 2C의 구조화된 일정협의(견적 버전 왕복)를 대체하는 게 아니라 **보완**한다: 공식 제안·확정은 견적 왕복, 잡담·미세 조율은 채팅.

죽은 스텁을 살리는 작업이다: `MessageSenderRole.VENDOR`·"업체 메시지" 타임라인 라벨·`AddVendorRepairMessageInput` 타입은 이미 있고, 세입자탭 입력("관리자·업체에게 메시지 보내기")과 VENDOR→"업체" 발신 라벨도 이미 배선돼 있다. 빠진 것은 업체 발신 엔드포인트, 업체 열람 경로, 스코프 규칙뿐이다.

## 메시지 스코프 모델 (프라이버시 핵심)

`TicketMessage.repairId`(기존 nullable 컬럼)로 업체 가시 범위를 가른다:

- **업체 열람**: 자기 repair의 `repairId` 스코프 메시지**만** 본다. 티켓 레벨(repairId 없는) 메시지 — 세입자↔관리자 책임 공방, 이의제기, 확정 통보 등 — 는 **업체에 절대 비노출**. 기존 "공개 위치·증상만 전달, 계약서·연락처 비표시" 원칙의 연장.
- **업체 발신**: 항상 자기 repairId 스코프로 생성, `senderRole: "VENDOR"`.
- **세입자·관리자 발신**: 해당 티켓에 **활성 repair(CLOSED 아님)가 있으면 repairId 자동 부착** — 그래야 업체가 답장을 본다. 활성 repair가 없으면 기존대로 티켓 레벨. 별도 채널 선택 UI를 만들지 않는다(1~5채 스코프, 스레드 하나).
- **세입자·관리자 열람**: 기존대로 티켓 전체 메시지(스코프 무관) — 변경 없음.

주의: repair가 여러 개(재요청 이력)면 **활성 repair 1개** 기준. 완료/취소된 repair 스코프 메시지는 업체가 계속 볼 수 있다(자기 작업 기록).

## API

- `POST vendor/jobs/:repairId/messages` — VENDOR 역할. body는 기존 `AddVendorRepairMessageInput`(`{ messageText?, attachmentUrls? }` — 실제 정의 확인 후 재사용). 게이트: **배정 업체만**(repair.vendorId ↔ 업체 계정 링크 일치, 기존 vendor job 가드 재사용), 둘 다 비면 400. CLOSED repair에는 발신 불가(완료 후엔 읽기만). 생성 후 realtime `roomlog:activity` kind `"ticket"` 브로드캐스트.
- `VendorJobDetail`에 `messages: VendorJobMessageView[]` 추가 — repairId 스코프 메시지만, `{ senderRole, messageText, attachmentUrls, createdAt }` (senderUserId·내부 식별자 비노출, 기존 VendorJobEstimateView의 Omit 패턴 준수).
- `addTenantComplaintMessage`(기존 세입자 발신)와 관리자 티켓 답변 경로: 활성 repair 존재 시 repairId 자동 부착하도록 수정. 저장 파이프라인(`addMessageInternal`→projector)은 repairId 파라미터만 통과시키면 됨(컬럼 이미 존재, 스키마 무변경).

## 화면

- **업체 (V-JOB-01 상세, PhoneFrame 유지)**: "진행 메시지" 채팅 섹션 — 스레드(발신자 라벨: 나/세입자/관리자) + 텍스트 입력 + 보내기. 활성 잡이면 입력 노출, CLOSED면 읽기 전용. 기존 V-JOB 컴포넌트 스타일(`_components.tsx`)과 토큰 준수.
- **세입자탭**: 변경 없음 — 기존 진행 메시지 스레드·입력이 그대로 동작(업체 메시지는 "업체" 라벨로 이미 렌더됨). 서버 자동 스코핑만으로 업체에게 닿는다.
- **관리자**: 기존 티켓 메시지 표시 유지. 관리자 답변(replies) 경로에 자동 스코핑 적용.

## 검증

- 서비스 회귀: ① 업체 발신이 repairId 스코프+VENDOR 롤로 저장·업체 상세에 노출, ② 비배정 업체 403, ③ CLOSED repair 발신 거부, ④ 업체 열람에 티켓 레벨(책임 공방) 메시지 미포함, ⑤ 활성 repair 존재 시 세입자/관리자 발신 자동 스코핑 → 업체에 보임, ⑥ 활성 repair 없으면 기존 동작 불변.
- 웹 계약: 업체 채팅 섹션(스레드·입력·읽기전용 조건), 발신자 라벨.
- realtime: 업체 발신 브로드캐스트.
- 스키마 무변경 — Prisma generate 불필요. 빌드·대상 스펙·`bash scripts/verify.sh`.

## 제약

- git 명령·브랜치·커밋 금지.
- `apps/web/src/app/my/flows/**`·`apps/web/src/lib/tenant-vendor-workflow-api.ts` 수정 금지(Claude 소유 — 이번엔 세입자탭 변경 자체가 없어야 정상).
- 업체에 세입자 개인정보·티켓 레벨 대화 노출 금지(위 스코프 모델이 가드).
- 자동 발송·독촉 없음. CSS는 `var(--...)` 토큰만.
