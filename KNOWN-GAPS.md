# KNOWN GAPS — 셸→실물 결선 체크리스트

적대검토(2026-07-02, Claude가 Codex-built 교차검토)에서 나온 결함 중 **셸 단계에서 안 고치고 실물(DB·인증·실기능) 단계로 이월**한 것들. 시각적으로 안 드러나거나(폴백), 실제 auth/mutation/state가 있어야 의미가 생기는 항목.

## 이미 고침 (셸에서 해소, 참고)
- M-HOME-01 가짜 큐 제거(실집계만), M-HOME-03 임의 리스크 라벨 제거("산정 전"), M-COST-03 dead-end→M-DASH-05, moveout/03 null 크래시 가드, M-VEND-01 신규 배지, M-CALL-01 2단 접힘(동급 5버튼 해소), T-PAY-02 실제 createReport 배선, M-VOX-01 확인 게이트 실작동.

## 이월 — C버킷: 서버측 강제 (실물 단계)
클라이언트 disabled 버튼/문구로만 있고 서버가 강제 안 함. 실제 API/auth 붙을 때 서버 가드 필수.
- **결제완료 게이트**: `ticket.service.ts` `processing→resolved`가 repair.stage 체크 없이 허용. API 직접 호출로 미수리 티켓 완료 가능. → 서버 전이 가드.
- **D20 1:1 독촉 금지**: `messaging.service.ts` `addThreadMessage`가 payment 컨텍스트 독촉 내용을 막지 않음(공지 경로엔 가드 있음). → 서버측 컨텍스트/내용 가드.
- **M-DASH-05 결제 승인**: 실제 링크가 canApprove 없이 항상 클릭 가능(disabled는 시각용뿐).
- **SLA override(M-OUT-02)**: 백엔드 `completeReview` override 지원하나 프론트에 어포던스 없음(DisabledButton만).
- **M-DOC 관리인 확정 액션**: 백엔드(confirmManagerReview·processManagerDeletion) 구현됐으나 프론트가 StaticButton(장식)으로 미연동. 임차인측 T-DOC-01은 실제 게이팅(D7 마찰 비대칭).
- **T-HOME-01 OTP 게이트**·**orphan 가드 기간 스코프**(호실만 됨).

## 이월 — 프론트-백엔드 배선 (실물 단계)
- **report / vendor-mgmt API 경로+shape 불일치**: 프론트가 `/reports/manager`·`/vendor-mgmt/vendors` 호출 → 백엔드는 `/reports`·`/vendors`. tryFetch가 조용히 데모 폴백해서 **항상 데모만 렌더**(서버 통신 0). 실물 전 프론트 api 클라이언트를 백엔드 라우트/shape에 맞춰 재작성 필요(허브는 여러 엔드포인트 합성). report는 생성(POST) 엔드포인트 자체가 부재.
- **T-HOME-06 안심요약**·**M-HOME-01 계약/moveout 큐**·**D19 4번째 tier(계약/퇴실)**: 실제 상태 데이터 연동 필요(지금은 fabrication 회피 위해 미표시/미연동).
- **리포트 크로스링크 payload**: 대상 세대/청구건이 하드코딩 1건으로만 연결(D24 pre-fill 미구현).

## 이월 — 라우팅 정합 (경미)
- T-OUT-04 뒤로 조건부(01/03), T-OUT-03 관리자문의→M-MSG, T-DOC-02 의견→M-DOC 큐: 진입맥락/메시징 연결 필요(T-DEF-02 뒤로와 같은 단일-DOM/맥락 클래스).

## 이월 — 커버리지 (데모 데이터)
- 단일 데모 티켓(responsibility=tenant_likely)이 전 화면 공유 → T-DEF-09의 4개 진입 사유(임대인책임/이의/업체없음/판단어려움)가 제대로 시연 안 됨. 실물 or 시나리오 데이터로 커버.

## 검증 셋업 갭
- `.spec-cache`에 tenant-defect 스펙 누락(리뷰어가 planning 원본으로 대조). 캐시 갱신 필요.
