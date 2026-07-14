# 관리자 사이드바 상위 메뉴 Hover 색상 통일 설계

## 문제

`민원·하자`와 `소통·공지`는 동일한 `manager-sidebar__parent-toggle`을 사용하고 hover 배경도 같다. 다만 현재 경로에서 활성화된 `민원·하자`에는 `is-active` 전경색이 남기 때문에 hover 시 비활성 `소통·공지`와 글자·아이콘 색이 다르게 보인다.

## 접근 비교

1. `민원·하자` 전용 hover selector를 추가하면 즉시 해결되지만 동일 컴포넌트에 도메인별 예외가 생긴다.
2. 메뉴 ID를 data attribute로 노출해 색상을 나누면 확장 가능하지만 현재 요구에는 불필요한 구조가 추가된다.
3. 공통 parent toggle hover 규칙에 전경색과 배경색을 함께 선언하면 모든 상위 접이식 메뉴가 동일한 hover 상태를 갖는다.

3번을 채택한다.

## 변경 범위

- `apps/web/src/app/manager/globals.css`의 `.manager-sidebar__parent-toggle:hover`에 `color: var(--on-surface)`를 추가한다.
- 기존 `background: var(--surface-container-high)`는 유지한다.
- active, focus-visible, 펼침 상태 로직과 하위 메뉴 스타일은 변경하지 않는다.

## 검증

- 관리자 워크스페이스 계약 테스트에서 공통 hover 규칙이 전경색과 배경색을 모두 선언하는지 확인한다.
- 웹 단위 테스트와 저장소 표준 검증을 실행한다.
- raw hex 및 인프라 파일은 추가하거나 수정하지 않는다.
