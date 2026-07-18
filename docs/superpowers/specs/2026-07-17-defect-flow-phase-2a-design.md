# 하자 흐름 2차분A 설계

## 범위

관리자가 AI의 책임 가능성 판단과 구분되는 최종 책임 판단을 확정하고, 세입자는 책임 판단에 이의를 제기한 뒤 관리자 대화로 이어갈 수 있게 한다. 수동 하자 접수에는 선택 긴급도 1~4를 받아 AI 분석과 더 긴급한 값으로 병합한다.

## 데이터와 API

- `Ticket`에 `responsibilityDecidedById`, `responsibilityDecidedAt`, `responsibilityDecisionNote` nullable 메타를 저장한다.
- `POST manager/tickets/:ticketId/responsibility-decision`은 LANDLORD 역할과 관리 호실 범위를 검사하고, `TENANT | LANDLORD` 및 공백이 아닌 사유를 서버에서 검증한다.
- 확정 시 ticket/analysis의 기존 `responsibilityHint`를 동일한 “가능성” 문구로 맞추고, 확정 메타·세입자 메시지·OPEN RESPONSIBILITY 피드백 REVIEWED 처리를 한 번의 store 변경으로 저장한다.
- 티켓/민원 presenter는 기존 spread 필드와 별도 `responsibilityDecision` 객체를 함께 노출한다.
- DIRECT_FORM 신고의 `urgency`는 1~4만 허용한다. AI 우선순위와 `Math.min`으로 병합하고, 세입자 값을 실제로 고려한 근거를 analysis에 남긴다. 긴급 키워드가 만든 1순위는 낮아지지 않는다.

## 웹

- 공유 티켓 타입에 책임 확정과 AI 피드백 표시용 계약을 추가하고 기존 `ticket.ts` re-export를 유지한다.
- 세입자 상세는 상세 민원 응답을 읽어 확정 메타를 표시하고, 서버 액션으로 RESPONSIBILITY 이의제기를 보낸다. 성공 후 기존 세입자-관리자 대화 진입 라우트로 연결한다.
- 관리자 상세 뷰 모델은 raw `aiFeedback`와 책임 확정을 유지한다. ResponsibilityCard는 AI 가능성, OPEN 이의제기, 관리자 확정 폼, 확정 결과를 서로 다른 라벨로 표시한다.
- 수동 신고 작성 화면은 선택 긴급도 상태를 draft에 포함하고, 생성 API 입력 계약에 전달 가능한 형태로 보존한다.

## 오류와 검증

- 필수 사유, enum, 긴급도 범위는 API 서비스에서 검증한다. HTML `required`는 편의 기능일 뿐 권한·무결성 가드가 아니다.
- 서비스 회귀 테스트로 책임 확정 동기화/피드백/메시지와 긴급도 병합 두 방향을 검증한다.
- 웹 소스 계약 테스트, Prisma generate, types/ui/web/api 빌드와 전체 verify를 실행한다.

## 제약

- git 명령, 브랜치, 커밋은 수행하지 않는다.
- 스타일 색상은 기존 `var(--...)` 토큰만 사용한다.
- AI 값은 항상 “가능성”, 사람의 결정은 “관리자 확정”으로 표시한다.
