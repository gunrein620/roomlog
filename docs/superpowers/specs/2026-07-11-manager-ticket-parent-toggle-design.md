# Manager Ticket Parent Toggle Design

## Goal

관리자 사이드바의 `민원·하자` 상위 행 어디를 눌러도 하위 메뉴가 접히고 펼쳐지게 한다.

## Interaction

- 렌치 아이콘, `민원·하자` 텍스트, 화살표를 하나의 버튼으로 묶는다.
- 버튼은 클릭, Enter, Space로 접힘·펼침 상태를 전환한다.
- 버튼은 `aria-expanded`, `aria-controls`, 상태에 맞는 접근성 이름을 제공한다.
- 상위 행은 페이지 이동을 수행하지 않는다.
- 실제 이동은 하위 `민원 대시보드`, `민원 대응`, `하자 관리` 링크가 담당한다.

## State Behavior

- 민원·하자 경로에 진입하면 하위 메뉴는 기본적으로 펼쳐진다.
- 다른 관리자 화면에서도 상위 행을 누르면 하위 메뉴를 펼쳐 목적 화면을 선택할 수 있다.
- 사용자가 현재 화면에서 접은 상태는 경로가 바뀌기 전까지 유지한다.
- 다른 사이드바 항목의 링크 동작은 변경하지 않는다.

## Component Boundary

- 변경은 `ManagerSidebar.tsx`의 ticket 항목 렌더링과 해당 스타일에 한정한다.
- `MANAGER_NAV_GROUPS`의 ticket 링크와 하위 경로 데이터는 유지한다.
- 공용 `ManagerAppShell`과 다른 관리자 도메인은 수정하지 않는다.

## Testing

- 소스 회귀 테스트에서 ticket 상위 행이 링크가 아닌 단일 버튼인지 확인한다.
- 버튼의 `aria-expanded`, `aria-controls`, 상태 전환과 비활성 경로에서도 하위 메뉴 렌더링이 가능한지 확인한다.
- 기존 하위 링크 세 개가 유지되는지 검증한다.
- `bash scripts/verify.sh` 후 Docker 브라우저에서 전체 행 클릭, 반복 접힘·펼침, 하위 링크 이동을 확인한다.

## Scope

- 수정: `apps/web/src/app/manager/_components/ManagerSidebar.tsx`
- 수정: `apps/web/src/app/manager/globals.css`
- 수정: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`
- 인프라 파일은 수정하지 않는다.
