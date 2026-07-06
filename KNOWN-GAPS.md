# KNOWN GAPS — 셸→실물 결선 체크리스트

적대검토(2026-07-02, Claude가 Codex-built 교차검토)에서 나온 결함 중 **셸 단계에서 안 고치고 실물(DB·인증·실기능) 단계로 이월**한 것들. 시각적으로 안 드러나거나(폴백), 실제 auth/mutation/state가 있어야 의미가 생기는 항목.

## 이미 고침 (셸에서 해소, 참고)
- M-HOME-01 가짜 큐 제거(실집계만), M-HOME-03 임의 리스크 라벨 제거("산정 전"), M-COST-03 dead-end→M-DASH-05, moveout/03 null 크래시 가드, M-VEND-01 신규 배지, M-CALL-01 2단 접힘(동급 5버튼 해소), T-PAY-02 실제 createReport 배선, M-VOX-01 확인 게이트 실작동.
- **KAN-137 리포트**: `manager/report` 레이아웃 인증 가드, `/manager/reports` API 배선, 생성/외부공유 POST 명시 액션화, production demo fallback fail-closed, 선택 리포트 `id` 스냅샷 유지, 후속 액션 메시징 연결까지 해소. Docker 배포 스모크로 생성·상세·공유 마스킹/감사로그·챗봇 `draft_only`·FAQ 메시징 연결 확인.

## 이월 — C버킷: 서버측 강제 (실물 단계)
클라이언트 disabled 버튼/문구로만 있고 서버가 강제 안 함. 실제 API/auth 붙을 때 서버 가드 필수.
- **결제완료 게이트**: `ticket.service.ts` `processing→resolved`가 repair.stage 체크 없이 허용. API 직접 호출로 미수리 티켓 완료 가능. → 서버 전이 가드.
- **D20 1:1 독촉 금지**: `messaging.service.ts` `addThreadMessage`가 payment 컨텍스트 독촉 내용을 막지 않음(공지 경로엔 가드 있음). → 서버측 컨텍스트/내용 가드. (원칙: 아래 "레퍼런스 — 납부/돈 도메인 하드 원칙" §3 독촉 가드)
- **M-DASH-05 결제 승인**: 실제 링크가 canApprove 없이 항상 클릭 가능(disabled는 시각용뿐).
- **SLA override(M-OUT-02)**: 백엔드 `completeReview` override 지원하나 프론트에 어포던스 없음(DisabledButton만).
- **M-DOC 관리인 확정 액션**: 백엔드(confirmManagerReview·processManagerDeletion) 구현됐으나 프론트가 StaticButton(장식)으로 미연동. 임차인측 T-DOC-01은 실제 게이팅(D7 마찰 비대칭).
- **T-HOME-01 OTP 게이트**·**orphan 가드 기간 스코프**(호실만 됨 — 아래 §3 독촉 가드는 호실+기간 스코프여야 함).

## 레퍼런스 — 납부/돈 도메인 하드 원칙 (횡단 규칙)
출처: `packages/types/src/payment.ts`(설계 근거). 납부 도메인의 레퍼런스인 동시에 **돈이 얽힌 모든 도메인(비용·업체 등)이 서버측에서 지켜야 할 횡단 규칙**. defect/vendor가 기계적 4단계 레퍼런스라면, 이건 '돈/가드 원칙' 레퍼런스 — 반직관적이라 예시 없이 짜면 그럴듯하게 틀린다. 서버가 강제하며, 클라 disabled로만 두지 말 것.
1. **3-트랙 분리**: 자기신고(`PaymentReport`) ≠ 실제 입금(`Deposit`) ≠ orphan(입금자명 불일치·미연결, `DepositMatchStatus.orphan`). 서로 다른 트랙 — 섞지 말 것.
2. **확정 전 집계 제외**: `confirming`·orphan 금액은 확정 수납액(`paidAmount`/`CollectionSummary.collectedAmount`)에서 제외하고 별도 표기(`confirmingAmount`/`orphanAmount`). 수금률(`collectionRate`)은 확정 기준.
3. **독촉/자동연체 전역 가드**(`DunningGuard`): 연결된 확인중(`hasConfirming`) 또는 미해소 orphan(`hasOrphan`) 존재 시 `blocked` → 자동연체·독촉 배치에서 제외. 원칙 **"낸 사람은 독촉당하지 않는다."** (C버킷 D20 1:1 독촉 금지·orphan 기간 스코프가 이 원칙의 개별 결선.)
4. **연체 존엄**: `OverdueStage`(minor/warning/severe)는 관리인 triage 전용 라벨 — 임차인에 **절대 비노출**(임차인은 `PaymentBadge` 매핑만).
5. **자동 발송 금지**: 청구 발송·독촉문(`DunningDraft`) 모두 관리인 **명시 승인 후**에만. AI는 초안만 생성.
6. **8-상태 청구머신 서버 강제**(`BillStatus`): draft→sent→confirming→partially_paid→paid→overdue→corrected→canceled. `overdue`는 confirming·orphan이 없을 때만 진입. 전이는 서버가 검증.
7. **배너 단일 슬롯**: 임차인 조건 배너는 우선순위 1개만(연체>일부납부>확인중), stacking 금지. '입금 확인 요청'(`depositConfirmationRequested`) 응답은 별개 슬롯.

## 이월 — 프론트-백엔드 배선 (실물 단계)
- **vendor-mgmt production fallback 정책**: 경로는 `/manager/vendor-mgmt/*`로 백엔드와 정합하지만, API 실패 시 데모 폴백을 계속 허용한다. report처럼 production에서는 실패를 숨기지 않는 정책 정리 필요.
- **T-HOME-06 안심요약**·**M-HOME-01 계약/moveout 큐**·**D19 4번째 tier(계약/퇴실)**: 실제 상태 데이터 연동 필요(지금은 fabrication 회피 위해 미표시/미연동).
- **리포트 크로스링크 payload**: 대상 세대/청구건이 하드코딩 1건으로만 연결(D24 pre-fill 미구현).

## 이월 — 통합 인증 (계정 identity ≠ 룸로그 관계 authorization)
단일 WOOZU 로그인(/login) + 파생 capability(roles) 전환은 완료. 남은 결선:
- **signup 통합**: /signup은 SEEKER 전용으로 남았고, 역할별 가입 검증(validateSignupInput의 LANDLORD/무초대 TENANT 건물정보 강제)은 유지 중. 방향: 가입은 SEEKER 기본, 역할별 정보는 capability 연결 시 수집.
- **LANDLORD capability 연결 경로**: /login의 "관리 중인 집 연결 필요" 안내는 마이페이지 집 내놓기로 보내지만, 집 내놓기 → Room.landlordId 실제 연결은 미배선(등록 흐름이 아직 데모 상태).
- **D18 초대+연락처 OTP**: acceptInviteForUser는 이메일 일치(강한 식별자) + phone 상호 존재 시에만 대조하는 fail-safe. OTP 검증은 후속 — 외국인/특수 연락처 하드블록 금지 원칙 유지할 것.
- **UserAccount.role 정리**: legacy 단일값은 backward compat으로 파생 roles에 항상 포함시킨다(관계 없어도). 관계 데이터가 충분히 쌓이면 이 폴백을 제거하고 관계만 믿는 방향.

## 이월 — 라우팅 정합 (경미)
- T-OUT-04 뒤로 조건부(01/03), T-OUT-03 관리자문의→M-MSG, T-DOC-02 의견→M-DOC 큐: 진입맥락/메시징 연결 필요(T-DEF-02 뒤로와 같은 단일-DOM/맥락 클래스).

## 이월 — 커버리지 (데모 데이터)
- 단일 데모 티켓(responsibility=tenant_likely)이 전 화면 공유 → T-DEF-09의 4개 진입 사유(임대인책임/이의/업체없음/판단어려움)가 제대로 시연 안 됨. 실물 or 시나리오 데이터로 커버.

## 검증 셋업 갭
- `.spec-cache`에 tenant-defect 스펙 누락(리뷰어가 planning 원본으로 대조). 캐시 갱신 필요.
