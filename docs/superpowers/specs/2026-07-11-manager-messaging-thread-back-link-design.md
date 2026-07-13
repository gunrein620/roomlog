# Manager Messaging Thread Back Link Design

## Goal

관리자 채팅 상세(`/manager/messaging/04`)의 관리자 셸 제목에서 소통 허브(`/manager/messaging/00`)로 명확하게 돌아갈 수 있게 한다.

## Interaction

- 관리자 셸 상단의 `소통` 제목 바로 왼쪽에 뒤로가기 화살표 링크를 배치한다.
- 링크 대상은 브라우저 방문 기록이 아니라 `/manager/messaging/00`으로 고정한다. 직접 URL로 진입하거나 새로고침한 경우에도 앱 밖으로 이탈하지 않는다.
- 상세 본문의 기존 화살표와 우측 `허브` 버튼은 동일 기능이 중복되므로 표시하지 않는다.
- 우측 `삭제` 버튼은 유지한다.
- 화살표는 현재 경로가 `/manager/messaging/04`일 때만 표시한다. `/00`, `/01`, `/02`, `/03`, `/e0`의 셸 제목은 기존 `소통` 표시를 유지한다.

## Visual and Accessibility

- 화살표와 `소통`은 셸 제목 안에서 한 행에 정렬한다.
- 클릭 영역은 최소 44×44px로 만든다.
- 색상과 간격은 기존 CSS 토큰만 사용한다.
- 링크에 `aria-label="소통 허브로 돌아가기"`를 제공한다.

## Component Boundary

- 메시징 레이아웃은 경로를 인식하는 메시징 전용 제목 컴포넌트를 `ManagerAppShell`의 `title`로 전달한다.
- 제목 컴포넌트는 `usePathname()`으로 `/manager/messaging/04` 여부만 판단하고, 상세 화면에서 링크와 `소통` 텍스트를 함께 렌더링한다.
- 공용 `ManagerAppShell`과 `@roomlog/ui`의 `ManagerShell` 계약은 변경하지 않는다.

## Scope

- 수정: `apps/web/src/app/manager/messaging/04/page.tsx`
- 수정: `apps/web/src/app/manager/messaging/layout.tsx`
- 생성: `apps/web/src/app/manager/messaging/MessagingShellTitle.tsx`
- 회귀 테스트: `apps/web/property-shell.spec.mjs`
- `/manager/messaging/00`, `/01`, `/02`, `/03`, 공용 관리자 셸 및 인프라 파일은 수정하지 않는다.
