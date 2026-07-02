# room-model — 공간 데이터 모델 (순수 로직)

"방"을 데이터로 표현하고 계산하는 영역. **DOM / React / three.js import 절대 금지** — 전부 순수 함수라서 단위 테스트를 쓰기 가장 좋은 곳이다. 다른 두 영역(plan-extraction, room-scene)이 모두 이 폴더의 타입에 의존하므로, 여기가 계약의 원천이다.

## 좌표계 (중요)

| 좌표계 | 단위 | 사용처 |
|---|---|---|
| 2D 캔버스 | px (그리드 `GRID_SIZE_PX`=25) | 편집기 캔버스의 `Wall.start/end` |
| 실측 | mm | `pixelToMmRatio`(기본 20)로 px↔mm 변환, 치수 표기/저장 |
| 3D 씬 | m | `convertWallsToWheretoputRoom3D`가 px → m 변환 + 중심 정렬. y-up, 2D의 y가 3D의 z |

## 파일

| 파일 | 역할 |
|---|---|
| `types.ts` | **계약 타입의 원천**: `Point`, `Wall`, `WheretoputWall3D`, `FurnitureCatalogItem`, `PlacedFurniture` 등. 변경 전 팀 공유 필수 |
| `wall-model.mjs` | 벽 생성/스냅(`createWall`, `snapToGrid`, `snapToOrthogonal`), 거리/길이/요약, 2D→3D 변환(`convertWalls*`), 스타터 벽 |
| `wall-model.d.ts` | `wall-model.mjs` 타입 선언. mjs 수정 시 같이 갱신 |
| `wall-editing.ts` | 캔버스 편집용 순수 계산: 부분 삭제(`splitWallByEraseArea/Ratio`), 벽 위 투영, 캔버스 스냅 |
| `furniture-model.ts` | 가구 카탈로그 + 배치 모델. **임대인 옵션(`LANDLORD_OPTION`, locked) vs 임차인 배치(`RESIDENT_DESIGN`) 소유권 규칙**이 여기 있다 |

## 규칙

- import 금지: 폴더 밖의 모든 것 (plan-extraction, room-scene, React, three.js, DOM API).
  - `Date.now()` 정도는 허용, `window`/`document`는 금지.
- 함수는 입력을 변경(mutate)하지 않고 새 객체를 반환한다 — 기존 코드 전부 이 스타일.
- `furniture-model.ts`의 `LANDLORD_OPTION` 관련 리터럴(`locked: true`, `editableBy: ["LANDLORD"]`, `visibleToTenant: true`)은 스펙 테스트가 검사한다. 바꾸면 `npm test` 확인.

## 주요 작업 (담당자 백로그)

- 벽 연결/충돌/길이 계산 안정화
- API 저장 포맷(payload) 정규화 로직 — 지금은 컨테이너 `saveFloorPlanDraft`에 인라인으로 있음. 이쪽으로 옮겨오는 것이 다음 단계
- 단위 테스트 확충 (`property-shell.spec.mjs`의 "floor plan editor model …" 패턴)
