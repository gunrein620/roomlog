# Manager Complaint Year-Month Picker Design

## Goal

관리자 민원 대시보드의 캘린더 아이콘으로 연도와 월만 선택하고 해당 월 전체 민원 현황을 조회할 수 있게 한다.

## Interaction

- 캘린더 아이콘은 `조회 월 선택` 버튼으로 동작한다.
- 버튼을 누르면 현재 조회 연도와 `1월`부터 `12월`까지의 월 버튼을 담은 팝오버를 연다.
- 팝오버 좌우 화살표는 이전 연도와 다음 연도로 이동한다.
- 월을 누르면 팝오버를 닫고 상단 조회 값을 `YYYY.MM` 형식으로 표시한다.
- 선택 월 버튼에는 `aria-pressed`와 시각적 선택 상태를 제공한다.
- 팝오버 바깥을 누르거나 `Escape`를 누르면 선택을 바꾸지 않고 닫는다.

## Data Behavior

- 요약 지표, 유형별 비율, 최근 민원 접수 내역은 선택한 월 전체를 기준으로 계산한다.
- 최근 6개월 추이 그래프는 선택 월을 마지막 달로 유지한다.
- CSV 다운로드는 선택 월 전체 데이터를 포함한다.
- 상단 좌우 화살표는 기존처럼 이전 달과 다음 달로 즉시 이동한다.
- 날짜 선택과 하루 단위 필터는 제공하지 않는다.

## Component Boundary

- `ComplaintDashboard.tsx`가 팝오버 연도, 열림 상태, 월 선택을 소유한다.
- 모델은 기존 월별 대시보드와 CSV 계약만 유지하며 날짜 셀 생성과 일별 필터 API를 제거한다.
- 새 외부 라이브러리나 공용 UI 계약은 추가하지 않는다.

## Testing

- 모델 테스트는 월별 요약·추이·CSV 계약만 검증한다.
- 화면 회귀 테스트는 월 선택 버튼, 연도 이동, 12개 월 버튼, 선택 이벤트와 Escape 닫기를 검증한다.
- `bash scripts/verify.sh` 후 Docker 브라우저에서 팝오버 열기, 연도 이동, 월 선택, `YYYY.MM` 반영을 확인한다.

## Scope

- 수정: `apps/web/src/app/manager/ticket/dash/00/ComplaintDashboard.tsx`
- 수정: `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.ts`
- 수정: `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts`
- 수정: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- 수정: `apps/web/src/app/manager/globals.css`
- 인프라 파일과 다른 관리자 도메인은 수정하지 않는다.
