# 관리자 대리접수 설계 — Manager Proxy Intake

## 범위

세입자가 앱이 아니라 **전화·문자·대면으로 알린 하자를 관리자가 대신 등록**하는 입구를 만든다. 현재 하자 접수는 TENANT 롤 전용(`POST tenant/complaints`)이라 관리자에게는 입구가 없다. 대리접수로 생성된 티켓은 **기존 하자→책임판단→업체배정/직접처리→결제 파이프라인에 그대로 연결**된다 — 새 흐름이 아니라 기존 흐름의 새 입구다.

**직접 입력 폼만 만든다.** AI 이용 접수(통화 녹취 붙여넣기→폼 자동 채움)는 이 위에 얹는 편의층이며 **다른 팀원의 AI 작업과 함께 나중에**(이 태스크 범위 아님, [[AI 재분석 트리거]]와 같은 라인).

## 핵심 원칙

- **세입자 귀속·투명성**: 대리접수 티켓은 해당 호실의 **실제 세입자 tenantId에 귀속**한다. 세입자가 자기 세입자탭 민원/하자 이력에서 **"관리자 대리 접수" 배지와 함께** 보게 한다(숨기지 않음 — 존엄/투명성 원칙). 호실에 연결된 세입자가 없으면 명확한 오류로 거부한다(대리접수는 기존 세입자 호실 대상).
- **AI는 가능성만**: 대리접수도 기존 `analyzeComplaint`를 그대로 태워 AI 책임 "가능성"을 붙인다. 확정은 관리자가 2A 책임 확정으로. AI가 대리접수라고 판단을 건너뛰지 않는다.
- **출처 보존**: 새 소스 채널 `MANAGER_PROXY`로 대리접수임을 원장에 남기고, 실제 접수 경로(전화/문자/대면)를 첫 메시지에 명시한다. 관리자 비서의 채널 필터·감사에서 구분된다.
- **자동 발송·독촉 없음**: 대리접수는 관리자 능동 액션의 결과일 뿐, 어떤 자동 통지도 새로 만들지 않는다.

## 데이터

- `ComplaintSourceChannel` enum에 `MANAGER_PROXY` 추가(`prisma/schema.prisma` + migration `20260718xxxxxx_manager_proxy_source_channel`). 기존 값(DIRECT_FORM/REALTIME_CHAT/VOICE_CHAT/CALLBOT) 유지.
- 스토어 타입(`roomlog.types.ts`)의 `ComplaintSourceChannel`에도 반영하고, `ManagerProxyIntakeInput`에는 선택 필드 `tenantId?: string`을 둔다. 호실에 연결된 세입자가 한 명뿐이면 생략할 수 있지만, 복수 세입자 호실에서는 반드시 선택해야 한다. 다른 스키마 변경 없음 — `Complaint.availableTimes`·urgency·attachmentUrls 재사용.
- 실제 접수 경로(전화/문자/대면)는 **별도 컬럼 없이** 첫 메시지 텍스트에 담는다(예: "관리자 대리 접수 · 전화 · {description}"). enum 최소 변경 유지.

## API

- `POST manager/tickets/proxy-intake` — LANDLORD 역할.
  - 입력 `ManagerProxyIntakeInput`: `{ roomId(필수), tenantId?, title, description, location, occurredAt?, availableTimes?, urgency?(1~4), reportedVia?("phone"|"text"|"in_person"|"other"), attachmentUrls? }`
  - 서버 게이트: 먼저 `assertManagerCanAccessRoom(managerId, roomId)`로 담당 호실만 허용한다(403). 그다음 `Object.entries(store.tenantRooms).filter(([, linkedRoomId]) => linkedRoomId === roomId)`로 해당 호실의 연결 세입자 전체를 구한다.
    - 연결 세입자가 없으면 `400 "연결된 세입자가 없는 호실입니다"`.
    - 연결 세입자가 정확히 한 명이고 `tenantId`가 생략되면 그 세입자에게 자동 귀속한다.
    - 연결 세입자가 복수이고 `tenantId`가 생략되면 `400 "세입자를 선택해 주세요"`.
    - `tenantId`가 제공되면 연결 세입자 수와 무관하게 해당 세입자가 그 `roomId`에 실제로 연결되어 있는지 서버에서 검증하고, 불일치하면 400으로 거부한다.
    - title/description/location 공백, urgency 정수 1~4, reportedVia enum도 서버에서 검증한다.
  - 처리: `analyzeComplaint(input)` 실행 후 **기존 `createComplaintRecord(tenantId, roomId, "MANAGER_PROXY", input, analysis, initialMessages)` 재사용**. 초기 메시지는 `senderUserId: managerId, senderRole: "LANDLORD"`, 텍스트에 대리접수+reportedVia 라벨 프리픽스. urgency 병합은 2A와 동일하게 처리(수동 값 vs AI 우선순위 `Math.min`).
  - 컨트롤러: realtime `roomlog:activity` kind `"ticket"` 브로드캐스트.
- `GET manager/proxy-intake/rooms` — 대리접수 폼의 호실 선택지. LANDLORD 역할. `resolveManagerBillingScope(managerId)`의 rooms를 재사용해 `{ roomId, buildingName, unitLabel, tenants: { tenantId, name }[], hasTenant }[]` 반환한다. 연결 세입자 없는 호실은 `tenants:[]`, `hasTenant:false`로 표시하되 선택 시 서버가 거부한다. 각 세입자 정보는 식별자와 이름까지만 반환하며 연락처·이메일·주소 등 다른 개인정보는 포함하지 않는다.

## 관리자 화면

- 진입점: 관리자 티켓 대시보드(`manager/ticket/dash/00`) 헤더에 **"대리 접수"** 버튼 추가(`ManagerDefectDashboard.tsx` 타이틀 옆).
- 폼(클라이언트 모달 또는 전용 라우트 — 구현 시 대시보드 패턴에 맞춤): 호실 선택(위 API), 제목·내용·위치·발생시점·긴급도(4단계 토글, 2A/2C와 같은 UI)·방문 가능 시간·접수 경로(전화/문자/대면 라디오)·사진 첨부. 호실 선택 뒤 연결 세입자 이름을 표시하고, 한 명이면 자동 귀속을 안내하며, 복수이면 세입자 선택 UI를 필수로 노출한다. 세입자 선택값은 `tenantId`로 제출한다. 제출은 서버 액션 → `POST manager/tickets/proxy-intake` → 성공 시 대시보드 갱신.
- 검증은 서버가 강제. HTML required는 편의.

## 세입자탭 (living — Claude 직접, my/flows 소유)

- 세입자 민원/하자 이력·상세 시트에서 `sourceChannel === "MANAGER_PROXY"`면 **"관리자 대리 접수" 배지** 표시. 접수 자체는 관리자가 했지만 세입자가 자기 건으로 인지·추적할 수 있게 한다. TenantMyPage 상세는 이미 `ticket`/메시지를 읽으므로 sourceChannel만 노출하면 됨.

## 검증

- 서비스 회귀 테스트: ① 복수 세입자 호실에서 명시한 실세입자 귀속 + MANAGER_PROXY 채널 + AI 분석 부착 + 관리자 발신 초기 메시지 생성, ② 복수 세입자 호실에서 `tenantId` 생략 시 정확히 `400 "세입자를 선택해 주세요"`, ③ 단일 세입자 호실에서 생략 시 자동 귀속, ④ 다른 호실의 `tenantId` 거부, ⑤ 담당 아닌 호실 403, ⑥ 세입자 미연결 호실 400, ⑦ title/description/location 공백·urgency·reportedVia 검증, ⑧ urgency 수동/AI 병합, ⑨ 대리접수 티켓이 관리자 목록·선택된 세입자 이력 양쪽에 `sourceChannel`·`tenantId`를 보존해 노출, ⑩ 호실 목록의 관리자 스코프·`tenants`·`hasTenant`와 연락처/주소 미노출.
- 웹 계약 테스트: 관리자 폼(호실 선택·연결 세입자 표시·복수 세입자 선택·필드·서버 액션 경로), 세입자탭 배지 문구.
- Prisma generate(enum 변경). 빌드·대상 스펙·`bash scripts/verify.sh`.

## 제약

- git 명령·브랜치·커밋 금지.
- 세입자 개인정보(연락처·주소)를 폼/응답에 노출 금지 — 호실·이름까지만.
- `apps/web/src/app/my/flows/**`는 Claude 직접(세입자탭 배지) — Codex 위임 시 제외.
- CSS는 `var(--...)` 토큰만. TicketStatus·기존 흐름 무변경(새 입구만).
