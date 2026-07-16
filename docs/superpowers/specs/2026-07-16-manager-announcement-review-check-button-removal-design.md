# Manager Announcement Review Check Button Removal Design

## 목표

관리자 공지 발송 전 검토 화면에서 동작하지 않는 `체크 완료` 버튼을 제거한다. 실제 발송 기능인 `승인하고 발송` 버튼은 현재 동작과 배치를 유지한다.

## 변경 범위

- 대상 화면: `/manager/messaging/02`
- `reviewActions`에서 `체크 완료` 정적 버튼과 이를 감싸는 레이아웃 요소를 제거한다.
- 더 이상 사용하지 않는 `StaticButton` import를 제거한다.
- `AnnouncementSendForm`과 발송 버튼의 너비, 우측 정렬, 상태 문구는 유지한다.
- 긴급 공지는 최종 발송 언어 카드 아래, 일반 공지는 수신자 명단 아래에 기존 `reviewActions`가 표시되는 구조를 유지한다.

## 유지 동작

- 수신자가 있으면 `승인하고 발송`을 표시한다.
- 발송 처리 중에는 `발송 중...`을 표시한다.
- 수신자가 없으면 비활성화된 `수신자 없음` 버튼을 표시한다.
- 수정 버튼, 공지 내용, 수신자 명단, 최종 발송 언어 영역은 변경하지 않는다.
- 서버 액션, API 요청, 공지 상태 변경 로직은 변경하지 않는다.

## 테스트

- `apps/web/property-shell.spec.mjs`의 검토 화면 계약에 `체크 완료`와 `StaticButton`이 없다는 단언을 추가한다.
- 기존 `reviewActions` 위치와 `AnnouncementSendForm` 단언은 유지한다.
- 관련 테스트를 RED에서 확인한 후 최소 구현으로 GREEN을 확인한다.
- web 프로덕션 빌드와 Docker 기반 실제 검토 화면을 확인한다.

## 비범위

- 다른 버튼이나 카드 제거
- 검토 화면 전체 레이아웃 재설계
- 발송 정책 및 수신자 계산 변경
- 인프라 및 Docker 설정 변경
