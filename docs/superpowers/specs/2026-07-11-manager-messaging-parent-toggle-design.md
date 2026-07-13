# Manager Messaging Parent Toggle Design

## Goal

관리자 사이드바의 `소통·공지` 상위 행을 `민원·하자`와 동일한 접힘·펼침 버튼으로 만든다. 상위 행은 페이지 이동을 수행하지 않고, 실제 이동은 하위 메뉴가 담당한다.

## Interaction

- 말풍선 아이콘, `소통·공지` 텍스트, 우측 화살표를 하나의 전체 너비 버튼으로 묶는다.
- 버튼은 클릭, Enter, Space로 하위 메뉴의 접힘·펼침 상태를 전환한다.
- 버튼은 `aria-expanded`, `aria-controls`, 상태에 맞는 접근성 이름을 제공한다.
- 펼치면 `소통 허브`, `공지 작성` 링크가 표시된다.
- 상위 행을 눌러도 현재 페이지는 이동하지 않는다.
- `소통 허브`, `공지 작성` 링크를 눌렀을 때만 기존 경로로 이동한다.

## State Behavior

- 소통·공지 경로에 처음 진입하면 소통·공지 하위 메뉴는 펼쳐진다.
- 다른 관리자 화면에서도 소통·공지 상위 행을 눌러 하위 메뉴를 펼칠 수 있다.
- `민원·하자`와 `소통·공지`의 펼침 상태는 서로 독립적이다.
- 한 메뉴를 펼쳐도 다른 메뉴를 자동으로 접지 않는다.
- 현재 경로가 접힘 가능 메뉴로 바뀌면 해당 메뉴를 펼쳐 현재 위치를 보여준다.
- 다른 일반 사이드바 항목의 링크 동작은 변경하지 않는다.

## Component Design

- `ManagerSidebar.tsx`에서 `ticket`, `messaging`을 접힘 가능한 상위 메뉴로 취급한다.
- 두 항목은 같은 버튼 구조, 화살표, 활성 스타일, 접근성 속성을 공유한다.
- 기존 `manager-sidebar__ticket-toggle` 전용 스타일은 의미가 맞는 공용 토글 스타일로 변경한다.
- `MANAGER_NAV_GROUPS`의 상위 경로와 하위 링크 데이터는 변경하지 않는다.
- 공용 `ManagerAppShell`과 각 메시징 페이지 본문은 수정하지 않는다.

## Error and Edge Handling

- 하위 메뉴가 없는 일반 항목은 기존 링크 렌더링을 유지한다.
- 모바일 메뉴에서 상위 토글을 누르면 메뉴 패널은 닫히지 않고 하위 링크를 선택할 수 있어야 한다.
- 하위 링크를 선택하면 기존 `onNavigate`를 호출해 모바일 메뉴를 닫는다.
- 두 메뉴의 `aria-controls`는 서로 다른 하위 메뉴 ID를 참조한다.

## Testing

- 소스 회귀 테스트에서 `ticket`, `messaging`이 공용 전체 행 버튼을 사용하는지 확인한다.
- 각 버튼의 `aria-expanded`, `aria-controls`, 접근성 이름을 확인한다.
- 비활성 관리자 경로에서도 소통·공지 메뉴를 펼칠 수 있는 상태 조건을 검증한다.
- `소통 허브`, `공지 작성` 링크와 기존 경로가 유지되는지 검증한다.
- 기존 사이드바 승인 해시를 의도한 소스 변경에 맞게 갱신한다.
- web 전체 단위 테스트와 `bash scripts/verify.sh`를 실행한다.
- Docker 브라우저에서 두 메뉴의 독립 접힘·펼침, 반복 클릭, 소통 하위 링크 이동, 콘솔 오류를 확인한다.

## Scope

- 수정: `apps/web/src/app/manager/_components/ManagerSidebar.tsx`
- 수정: `apps/web/src/app/manager/globals.css`
- 수정: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`
- 수정 가능: 사이드바 파일 해시를 고정하는 기존 승인 테스트
- 신규: 구현 계획 문서
- 제외: 메시징 화면 본문, API, 공유 타입, Docker 및 배포 설정
