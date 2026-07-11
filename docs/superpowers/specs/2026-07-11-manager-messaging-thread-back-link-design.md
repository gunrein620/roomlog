# Manager Messaging Thread Back Link Design

## Goal

관리자 채팅 상세(`/manager/messaging/04`) 좌상단에서 소통 허브(`/manager/messaging/00`)로 명확하게 돌아갈 수 있게 한다.

## Interaction

- 상세 제목 왼쪽에 뒤로가기 화살표 링크를 배치한다.
- 링크 대상은 브라우저 방문 기록이 아니라 `/manager/messaging/00`으로 고정한다. 직접 URL로 진입하거나 새로고침한 경우에도 앱 밖으로 이탈하지 않는다.
- 기존 우측 `허브` 버튼은 동일 기능이 중복되므로 제거한다.
- 우측 `삭제` 버튼은 유지한다.

## Visual and Accessibility

- 화살표는 텍스트 제목과 한 행에 정렬한다.
- 클릭 영역은 최소 44×44px로 만든다.
- 색상과 간격은 기존 CSS 토큰만 사용한다.
- 링크에 `aria-label="소통 허브로 돌아가기"`를 제공한다.

## Scope

- 수정: `apps/web/src/app/manager/messaging/04/page.tsx`
- 회귀 테스트: `apps/web/property-shell.spec.mjs`
- `/manager/messaging/00`, `/01`, `/02` 및 인프라 파일은 수정하지 않는다.
