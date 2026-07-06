# room-scene — 3D 렌더링/인터랙션 (React Three Fiber)

room-model이 계산한 3D 데이터(`WheretoputWall3D[]`, `PlacedFurniture[]`)를 화면에 그리고, 클릭/선택 이벤트를 **props 콜백으로 컨테이너에 돌려주는** 영역. 상태를 직접 들지 않는다 — 전부 props로 받는 표시 계층이다.

## 파일 / 컴포넌트

`RoomlogThreeFloorPlanView.tsx`
- `RoomlogThreeFloorPlanView` (export) — Canvas + 조명 + OrbitControls 구성, 유일한 공개 진입점
- `RoomFloor` — 벽 bounds에서 바닥 크기 계산, 바닥 클릭(가구 배치) 이벤트
- `WallMesh` — 벽 박스 렌더 + 선택 하이라이트
- `FurnitureMesh` — GLB 있으면 `FurnitureGlbMesh`(Suspense), 없으면 `FurnitureBoxMesh` fallback
- `FurnitureGlbMesh` — GLB 로딩(`useGLTF`), 실측(mm) 대비 모델 스케일/바닥 오프셋 보정
- `FurnitureBoxMesh` — 단색 박스 fallback

## 규칙

- import 가능: `room-model`, three.js 생태계(@react-three/*), React. **plan-extraction import 금지.**
- 데이터 계산(좌표 변환, 치수 계산)은 여기서 하지 않는다 — room-model에 함수를 만들어 쓰고, 이 폴더는 렌더링/시각 보정만.
- 이벤트는 콜백 props(`onWallPointerDown`, `onFloorPointerDown`, `onFurniturePointerDown`)로 위로 올린다. 여기서 setState 하지 않는다.
- 새 공개 컴포넌트를 추가하면 컨테이너 배선은 최소 diff로 (README 최상위 규칙 참고).
- `floor-plan-3d-preview`, `wheretoput 3D room renderer`, 배경색 `#626260`, 바닥색 `#f3d9a0` 는 스펙 테스트가 검사한다. 바꾸면 `npm test` 확인.

## 주요 작업 (담당자 백로그)

- GLB 모델 스케일/중심점 보정 개선 (현재 Box3 기반 자동 보정)
- 선택 상태 표시 품질 (현재 wireframe 박스)
- landlord/resident 모드별 가구 잠금의 시각적 표현
- 렌더 품질: 그림자/재질 (현재 `meshBasicMaterial` — 조명 반응 없음)
