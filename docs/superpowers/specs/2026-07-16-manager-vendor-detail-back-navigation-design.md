# Manager Vendor Detail Back Navigation Design

## Goal

관리자 `내 업체 상세` 화면에서 사용자가 브라우저 이력에 의존하지 않고 `내 업체` 목록으로 즉시 돌아갈 수 있게 한다.

## Decision

- 상세 헤더 오른쪽 액션 그룹의 첫 번째 항목으로 `← 내 업체` 링크 버튼을 둔다.
- 기존 `수치 성과 보기` 버튼은 그 오른쪽에 유지한다.
- 링크는 `MANAGER_VENDOR_MGMT_PATHS.vendors`를 사용해 항상 정식 목록 경로로 이동한다.
- 정상 상세와 조회 실패 상세 모두 동일한 복귀 버튼을 제공한다.
- 기존 `LinkButton`의 secondary 스타일을 재사용하고 공통 헤더나 CSS는 변경하지 않는다.

## Alternatives Considered

1. 제목 위 breadcrumb: 계층 표현은 좋지만 한 개 복귀 동작에 새 레이아웃과 스타일이 필요하다.
2. 브라우저 `history.back()`: 딥링크나 새 탭 진입 시 업체 목록이 아닌 페이지로 이동할 수 있다.
3. 헤더 액션 링크: 기존 컴포넌트와 반응형을 그대로 사용하면서 가장 명확하다. 이 방식을 선택한다.

## Error Handling

업체 조회가 실패해도 헤더의 `← 내 업체`는 렌더되어 사용자가 오류 화면에서 빠져나올 수 있다.

## Testing

기존 `vendor-mgmt-workflow.spec.ts`에 정상·오류 헤더 모두 목록 정식 경로를 사용하는지 검증하는 소스 계약 테스트를 추가한다. 이후 focused test와 web production build를 실행한다.
