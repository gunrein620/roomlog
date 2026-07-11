# Manager Complaint Calendar Picker Design

## Goal

관리자 민원 대시보드의 캘린더 아이콘으로 월간 달력을 열고, 날짜를 선택해 하루 단위 민원 현황을 조회할 수 있게 한다.

## Interaction

- 캘린더 아이콘을 `조회 날짜 선택` 버튼으로 변경한다.
- 버튼을 누르면 현재 조회 월을 기준으로 달력 팝오버를 연다.
- 달력은 요일 헤더와 날짜 버튼을 표시하며 이전·다음 달 탐색을 제공한다.
- 날짜를 누르면 팝오버를 닫고 상단 조회 값을 `YYYY.MM.DD` 형식으로 표시한다.
- 선택 날짜 버튼에는 `aria-pressed`와 시각적 선택 상태를 제공한다.
- 팝오버 바깥을 누르거나 `Escape`를 누르면 선택을 바꾸지 않고 닫는다.

## Data Behavior

- 초기 상태와 좌우 월 이동 상태는 기존처럼 선택 월 전체를 조회한다.
- 날짜 선택 상태에서는 요약 지표, 유형별 비율, 최근 민원 접수 내역을 선택한 하루로 제한한다.
- 최근 6개월 추이 그래프는 월별 추세 맥락을 유지한다.
- 상단 좌우 화살표로 월을 변경하면 날짜 선택을 해제하고 이동한 월 전체 조회로 돌아간다.
- CSV 다운로드는 화면과 동일하게 월 선택 상태에서는 월 전체, 날짜 선택 상태에서는 선택 날짜만 포함한다.

## Component Boundary

- 날짜 계산과 필터링은 `complaint-dashboard-model.ts`의 순수 함수로 구현한다.
- 달력 UI와 열림·닫힘·선택 상태는 `ComplaintDashboard.tsx`가 소유한다.
- 새 외부 라이브러리나 공용 UI 계약은 추가하지 않는다.

## Testing

- 모델 테스트에서 월 달력 셀 생성, 날짜 비교, 하루 필터링, 날짜 선택 CSV를 검증한다.
- 화면 회귀 테스트에서 캘린더 버튼, 팝오버, 요일 헤더, 날짜 버튼과 선택 이벤트 연결을 검증한다.
- `bash scripts/verify.sh` 후 Docker 브라우저에서 열기, 날짜 선택, 라벨 변경, 하루 목록 반영을 확인한다.

## Scope

- 수정: `apps/web/src/app/manager/ticket/dash/00/ComplaintDashboard.tsx`
- 수정: `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.ts`
- 수정: `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts`
- 수정: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- 수정: `apps/web/src/app/manager/globals.css`
- 인프라 파일과 다른 관리자 도메인은 수정하지 않는다.
