# room-model 고도화 계획

담당: 김용 (room-model)
목표: **모바일 PWA / 웹브라우저에서 느린 체감 없이 빠르고 깔끔하게** 동작하는 방 데이터 모델.
원칙: 기존 계약(타입/반환값) 유지 → 새 파일·새 함수 추가 위주 → 컨테이너 배선은 마지막에 최소 diff로.

> 진행할 때마다 체크박스 갱신. 각 Phase 끝날 때 `pnpm --filter web test` + `./node_modules/.bin/tsc --noEmit` (apps/web에서) 통과 확인.

---

## 현재 상태 요약 (2026-07-02 조사)

- `types.ts` — 계약 타입 원천. plan-extraction / room-scene / 컨테이너 모두 의존.
- `wall-model.mjs` — 스냅/생성/거리/요약, 2D→3D 변환 3종(`convertWallsTo3D`, `convertWallsToWheretoputSimulator`, `convertWallsToWheretoputRoom3D`), 스타터 벽.
- `wall-editing.ts` — 캔버스 스냅(`GRID_SIZE_PX=25`), 부분삭제(split), 투영.
- `furniture-model.ts` — 카탈로그 + 소유권 규칙(LANDLORD_OPTION/RESIDENT_DESIGN). 스펙 테스트가 리터럴을 잠그고 있음.
- 컨테이너 `saveFloorPlanDraft` / `convertTo3D` / `saveResidentFurnitureDesign`에 payload 조립이 인라인으로 존재 → room-model로 옮기는 게 README 백로그에도 있음.

### ⚠️ 발견된 정합성 문제 (Phase 2에서 처리)

| 항목 | 값 A | 값 B | 영향 |
|---|---|---|---|
| 그리드 | `wall-model.mjs` `GRID_SIZE=24` (`createWall`/`snapToGrid`) | `wall-editing.ts` `GRID_SIZE_PX=25` (`snapCanvasPoint`, 캔버스가 실제 사용) | `createWall`로 만든 벽과 캔버스 스냅 좌표가 서로 다른 격자에 붙음 |
| 축척 | 과거 `DEFAULT_PIXEL_TO_METER_RATIO = 1/48` (≈20.83mm/px), `summarizeWalls`도 24px=0.5m 가정 | 현재 `DEFAULT_PIXEL_TO_MM_RATIO = 10` (10mm/px, Room3D 변환·치수 표기 기본값) | 요약(대략 m)과 치수(mm)·3D 변환이 `units.ts` 기준을 공유 |

`summarizeWalls`의 결과값은 현재 `property-shell.spec.mjs`에서 10mm/px 기준(120px → 1.2m)으로 고정한다.

---

## Phase 0 — 기준선 확보 (반나절)

- [x] `pnpm --filter web test` 현재 통과 확인 — 2026-07-02, **60/60 통과** (셸에 pnpm이 없으면 `cd apps/web && npm test` 동일)
- [x] `./node_modules/.bin/tsc --noEmit` 통과 확인 — 2026-07-02 통과
- [x] 계약 표면 스냅샷: 문서 하단 "계약 표면 기록" 참고

**완료 조건**: 기준선 그린. 이후 모든 Phase는 이 기준선 대비 회귀 없음. ✅

## Phase 1 — 추가만 하는 고도화 (계약 불변, 안전)

새 파일 + 새 함수만. 기존 함수 삭제/리네임/시그니처 변경 없음. 다른 담당자 영향 0.

### 1a. `room-payload.ts` — 저장 payload 정규화 (README 백로그 항목)

- [x] `buildRoom3DSnapshot({ walls3D, fixtureCandidates, openingCandidates, landlordFurnitures, hiddenWallCount })` — 컨테이너 `saveFloorPlanDraft`의 `room3d` 객체와 **동일한 구조** 반환
- [x] `buildFloorPlanDraftPayload(...)` — `saveFloorPlanDraft`의 `payload`와 동일 구조
- [x] `buildFloorPlanLocalSnapshot(...)` — `convertTo3D`의 localStorage 저장 구조
- [x] `buildResidentDesignPayload(...)` — `saveResidentFurnitureDesign`의 payload 구조
- [x] 단위 테스트: 대표 입력에 대해 키 목록/구조가 기대와 일치하는지 (스펙 파일의 "floor plan editor model …" 패턴) — 테스트 2개 추가, 62/62 통과
- [x] **이 단계에서는 컨테이너를 건드리지 않는다** (배선은 Phase 3) — 준수. 후보/메타 타입은 plan-extraction import 대신 구조적 generic으로 받음 (의존성 규칙 준수)

### 1b. `wall-graph.ts` — 벽 연결/코너/끊김 탐지

- [x] `buildWallGraph(walls, tolerancePx)` — 끝점 인접 그래프 (같은 점에 모이는 벽 id 묶음)
- [x] `findDanglingEnds(walls)` — 어느 벽과도 안 만나는 끝점 (도면 추출 품질 지표로 사용 가능)
- [x] `findCorners(walls)` — 2개 이상 벽이 만나는 코너 점
- [x] `mergeCollinearWalls(walls, options)` — 같은 직선상 이어진 벽 병합. **성능 핵심**: 벽 개수 감소 = room-scene 메시 수 감소 = 모바일 체감 개선
- [x] `detectClosedLoops(walls)` — 닫힌 방(room) 감지 (바닥 폴리곤 생성의 기반)
- [x] 각 함수 단위 테스트 (ㄱ자, ㅁ자, 끊긴 벽, 겹친 벽 케이스) — 테스트 3개 추가, 65/65 통과

### 1c. `collision.ts` — 가구/벽 충돌·배치 계산

- [x] `getFurnitureFootprint(furniture)` — 회전 반영한 바닥 사각형 (m 단위)
- [x] `furnitureIntersectsWall(furniture, wall3D)` / `furnitureOverlapsFurniture(a, b)`
- [x] `clampFurnitureIntoRoom(furniture, walls3D)` — 방 밖으로 못 나가게 위치 보정
- [x] `snapFurnitureToWall(furniture, walls3D, maxDistance)` — 벽에 붙이기 (침대/옷장 UX)
- [x] 단위 테스트 (회전 0/90도, 경계 케이스) — 테스트 4개 추가, 69/69 통과

**Phase 1 완료 조건**: 새 파일 3개 + 테스트, 기존 파일 diff 0, 테스트/타입체크/빌드 통과. 브랜치 `feat/room-model-helpers`.

## Phase 2 — 정합성 정리 (팀 공유 필요)

- [x] `units.ts` 신설: 그리드/축척 상수를 한 곳에 모으고 각 상수의 의미·사용처 주석으로 문서화. 기존 export는 삭제하지 않고 re-export(별칭)로 유지
- [x] 위 표의 24 vs 25, 1/48 vs 20mm 불일치를 팀에 공유하고 통일안 결정 (제안: 캔버스 기준인 25px·20mm/px로 통일) — `3d` 통합 브랜치 공유 기준으로 선반영
- [x] 기본 축척을 더 세밀한 도면 작성 기준인 10mm/px로 조정 — `visionapi-test`에서 선반영
- [x] 합의되면 `summarizeWalls` 계산 + 스펙 기대값 수정 (같은 PR, 리뷰어: 담당 A·C) — 120px → 1.2m 기준으로 수정

**주의**: 여기만 계약에 손대는 Phase. 합의 전에는 진행하지 않는다.

## Phase 3 — 컨테이너 배선 (최소 diff, 단독 PR)

- [x] `saveFloorPlanDraft` / `convertTo3D` / `saveResidentFurnitureDesign`의 인라인 payload 조립을 Phase 1a helper 호출로 교체 (import + 호출만, 로직 추가 없음)
- [x] 교체 전후 JSON.stringify 결과가 동일한지 수동 확인 (같은 입력 → 같은 출력) — Phase 1a helper 구조 테스트와 컨테이너 배선 스펙으로 확인
- [x] 스펙의 컨테이너 문자열 검사(`room3d`, `floorPlanDraft` 등) 통과 확인
- [x] 브랜치 `feat/room-model-payload-wiring`, 컨테이너를 만지므로 diff 최소·단독 PR — `yong` → `3d` PR 흐름으로 대체

## Phase 4 — 성능/모바일 체감 (room-model 기여분)

room-model은 순수 로직이라 직접적 병목은 아니지만, **렌더링 비용을 줄이는 데이터**를 만들어 줄 수 있다:

- [x] `mergeCollinearWalls`를 3D 변환 전에 적용하는 opt-in 경로 제공 → 벽 메시 수 감소
- [x] `convertWallsToWheretoputRoom3D` id 안정화 검토: 현재 `wall-${index}`라 벽 추가/삭제 시 전체 id가 밀려 React key 재생성 → `wall_id` 기반 id 옵션 추가 (기존 동작은 기본값으로 유지)
- [x] 변환 함수 할당(allocation) 점검 — 60fps 드래그 중 불필요한 배열/객체 생성 줄이기 (반환 구조는 유지)
- [x] 닫힌 방 폴리곤(`detectClosedLoops`) 기반 바닥 생성 데이터 제공 → room-scene의 바닥을 벽 bounds 추정 대신 실제 방 모양으로

### 다른 담당자 소관 (전달할 협업 목록 — 여기서 작업하지 않음)

- room-scene: GLB clone/material 복제가 렌더마다 무거움 → 메모이제이션·`useGLTF.preload`, 모바일 DPR 상한 (`<Canvas dpr={[1, 2]}>`), shadow 비용 검토
- 컨테이너: 2D 캔버스 redraw 스로틀, 드래그 중 상태 업데이트 빈도
- plan-extraction: worker 결과 캐싱

## 검증 명령 (매 Phase)

```bash
cd apps/web
pnpm test                          # node --test property-shell.spec.mjs
./node_modules/.bin/tsc --noEmit   # 타입체크
pnpm build                         # 번들 검증
```

## 지켜야 할 규칙 (README 요약)

- room-model 안에서 폴더 밖 import 금지 (React/three/DOM 포함)
- 입력 mutate 금지, 새 객체 반환
- `wall-model.mjs` 수정 시 `wall-model.d.ts` 동시 갱신
- 함수/문자열 삭제·리네임 전 `pnpm test` — 스펙이 소스 문자열을 검사함
- `types.ts` 변경은 팀 공유 후, 컨테이너 수정은 최소 diff 단독 PR

## 계약 표면 기록 (2026-07-02 기준)

아래 심볼은 폴더 밖에서 import되고 있어 **삭제/리네임/시그니처 변경 시 즉시 파급**된다. 여기 없는 심볼은 상대적으로 자유롭게 손볼 수 있다 (단, 스펙의 소스 문자열 검사 주의).

### `RoomlogFloorPlanEditor.tsx` (컨테이너)

- `furniture-model`: `createFurnitureModel`, `createLandlordOptionFurniture`, `createResidentDesignFurniture`, `FURNITURE_CATALOG`, `isFurnitureCatalogItem`, `isLandlordOptionFurniture`, `isLockedFurnitureForResident`, `normalizeCatalogItem`
- `types` (type-only): `ExperienceMode`, `FurnitureCatalogItem`, `PlacedFurniture`, `Point`, `Wall`, `WallSummary`, `WheretoputWall3D`
- `wall-editing`: `calculateDistance`, `DEFAULT_PIXEL_TO_MM_RATIO`, `getStarterWalls`, `GRID_SIZE_PX`, `projectPointOntoWall`, `snapCanvasPoint`, `splitWallByEraseArea`, `splitWallByRatio`
- `wall-model.mjs`: `convertWallsToWheretoputRoom3D`, `convertWallsToWheretoputSimulator`, `distanceToWall`, `snapToOrthogonal`, `summarizeWalls`

### `plan-extraction/` (담당 A)

- `types.ts` → `Point` (type-only)
- `wall-detection.d.ts` → `RegisteredPlanMetadata`, `Wall` (type-only)

### `room-scene/` (담당 C)

- `furniture-model`: `FURNITURE_CATALOG`, `getFurnitureDimensions`
- `types` (type-only): `PlacedFurniture`, `WheretoputWall3D`

### `property-shell.spec.mjs` (스펙)

- `wall-model.mjs` 전체를 `floorPlanModel`로 import해 동작을 고정: `createWall`, `findNearestWall`, `removeWall`, `summarizeWalls`(120px→1.2m 고정), `convertWallsTo3D`, `convertWallsToWheretoputSimulator`, `convertWallsToWheretoputRoom3D`, `createWallsFromRegisteredPlan` 등
- `furniture-model.ts`의 `LANDLORD_OPTION` 리터럴(`locked: true`, `editableBy: ["LANDLORD"]`, `visibleToTenant: true`)을 소스 문자열로 검사
