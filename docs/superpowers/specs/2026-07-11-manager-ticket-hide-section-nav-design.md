# Manager Ticket Section Navigation Removal Design

## Goal

관리자 민원·하자 대시보드에서 `민원 대시보드`, `민원 대응`, `하자 관리`로 구성된 상단 하위 메뉴 줄을 제거한다.

## Approach

- `apps/web/src/app/manager/ticket/dash/layout.tsx`에서 `ManagerAppShell`의 기본 하위 메뉴 대신 렌더링되지 않는 명시적 값을 전달한다.
- 변경은 `/manager/ticket/dash/**` 레이아웃에만 적용한다.
- `ManagerAppShell`, `ManagerSectionNav`, `MANAGER_NAV_GROUPS`는 변경하지 않는다.

## Preserved Navigation

- 좌측 사이드바의 `민원·하자` 및 하위 링크는 유지한다.
- `?type=complaint`, `?type=defect` 필터 경로와 화면 내부 필터 동작은 유지한다.
- 메시징, 계약, 비용 등 다른 관리자 영역의 상단 하위 메뉴는 유지한다.

## Testing

- 회귀 테스트는 `ticket/dash/layout.tsx`가 상단 하위 메뉴를 명시적으로 숨기는지 확인한다.
- 기존 네비게이션 데이터에 세 링크가 계속 존재하는지도 함께 잠가 좌측 사이드바 회귀를 방지한다.
- `bash scripts/verify.sh`와 Docker 브라우저 확인을 수행한다.

## Scope

- 수정: `apps/web/src/app/manager/ticket/dash/layout.tsx`
- 수정: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- 인프라 파일과 다른 관리자 도메인은 수정하지 않는다.
