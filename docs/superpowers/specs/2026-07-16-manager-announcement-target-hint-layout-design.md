# Manager Announcement Target Hint Layout Design

## Goal

관리자 공지 작성 화면의 `공지 대상을 선택하세요.` 안내 박스를 대상 결과 박스 오른쪽으로 옮기고, 문구에 맞는 너비로 줄인다.

## Layout

- 대상 결과 박스와 안내 박스를 `targetSummary` 행으로 묶는다.
- 데스크톱에서는 `targetSummary`를 `minmax(0, 1fr) max-content` 2열로 배치한다.
- 대상 결과 박스는 남은 너비를 사용하고, 안내 박스는 문구 너비만 사용한다.
- 안내 문구는 한 줄로 유지한다.
- `640px` 이하에서는 `targetSummary`를 1열로 전환해 안내 박스를 대상 결과 아래로 내린다.
- 모바일에서도 안내 박스는 콘텐츠 너비를 유지하고 화면 전체로 불필요하게 늘어나지 않는다.

## Scope

- `AnnouncementComposer.tsx`에서 기존 `targetBox`와 `targetHint`를 새 `targetSummary` wrapper로 묶는다.
- `AnnouncementComposer.module.css`에 데스크톱과 모바일 배치 규칙을 추가한다.
- 대상 범위 선택, 건물 선택, 호실 선택, 대상 계산 로직은 변경하지 않는다.
- 다른 카드와 메시징 화면의 레이아웃은 변경하지 않는다.

## Testing

기존 `apps/web/property-shell.spec.mjs` 관리자 공지 작성 계약 테스트에 다음 조건을 추가한다.

- `targetBox`와 `targetHint`가 `targetSummary` 안에서 형제 요소로 렌더된다.
- 데스크톱 `targetSummary`는 `minmax(0, 1fr) max-content`를 사용한다.
- 안내 박스는 콘텐츠 너비와 한 줄 문구를 유지한다.
- `640px` 이하에서는 `targetSummary`가 1열로 전환된다.
- 기존 대상 선택과 검토 이동 계약은 계속 유지된다.

관련 회귀 테스트를 RED→GREEN으로 실행하고 web 프로덕션 빌드와 Docker web 재빌드, 로컬 응답을 확인한다. 이번 작업 검증이 통과한 경우에만 `kms-manager-chat` 브랜치에 커밋하고 푸시한다.

## Non-goals

- 대상 선택 기능 또는 데이터 변경
- 안내 문구 변경
- 공지 작성 화면의 전체 레이아웃 재설계
- 인프라 설정 변경
