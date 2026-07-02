# floor-plan-3d — 3D 도면 편집기

도면 이미지를 업로드해 벽을 추출하고, 2D로 편집한 뒤 3D로 확인/가구 배치까지 하는 기능 영역.
**3명이 병렬로 작업할 수 있도록 책임 기준으로 3개 폴더로 분할**되어 있다.

> AI(Claude, Codex 등)에게 작업을 시킬 때는 **이 파일 + 본인 담당 폴더의 README.md**를 먼저 읽게 하세요.
> 예: "apps/web/src/app/floor-plan-3d/README.md 와 plan-extraction/README.md 를 읽고 시작해"

## 구조

```
floor-plan-3d/
├── page.tsx                      # 라우트 진입점 (얇음, 건드릴 일 거의 없음)
├── RoomlogFloorPlanEditor.tsx    # ⚠️ 공유 컨테이너 — 상태 + 2D 캔버스 + API 저장 + 조립
├── plan-extraction/              # [담당 A] 도면 이미지 → 벽/치수/문창문/설비 후보 추출
├── room-model/                   # [담당 B] 방 데이터 모델 + 좌표 변환 + 공유 타입(계약)
└── room-scene/                   # [담당 C] Three.js 3D 렌더링/인터랙션
```

## 데이터 흐름

```
이미지 파일
  → plan-extraction (worker/OpenCV → DetectedLine[] → 필터링 → Wall[])
  → RoomlogFloorPlanEditor 상태 (walls, candidates, scale …)
  → room-model (좌표 변환: px → mm → m, 2D Wall → WheretoputWall3D)
  → room-scene (3D 렌더링, 클릭 이벤트는 콜백으로 컨테이너에 반환)
  → 저장 payload (컨테이너가 조립해서 API 전송)
```

## 의존성 규칙 (충돌 방지의 핵심 — 반드시 지킬 것)

| 폴더 | import 가능한 것 | import 금지 |
|---|---|---|
| `room-model` | 폴더 내부 파일만 | plan-extraction, room-scene, React, three.js, DOM |
| `plan-extraction` | `room-model` + 폴더 내부 | room-scene, React |
| `room-scene` | `room-model` + 폴더 내부 | plan-extraction |
| `RoomlogFloorPlanEditor.tsx` | 세 폴더 모두 | — |

- **plan-extraction ↔ room-scene 은 서로 직접 import 금지.** 둘 사이 데이터는 반드시 room-model 타입으로 컨테이너를 거쳐 흐른다.
- 타입 계약은 `room-model/types.ts` 와 `plan-extraction/types.ts` 두 파일뿐이다. **계약 타입을 바꾸면 다른 두 사람에게 영향이 가므로 변경 전에 공유할 것.**

## 공유 컨테이너(RoomlogFloorPlanEditor.tsx) 수정 규칙

이 파일은 세 사람 모두의 코드가 만나는 곳이라 충돌 1순위 지점이다.

1. **로직은 본인 폴더에 export 함수로 만들고, 컨테이너에는 배선(import + 호출)만 추가한다.** 컨테이너 안에 새 계산 로직을 직접 작성하지 않는다.
2. 컨테이너 수정은 최소 diff로. 대규모 리팩토링(상태 구조 변경 등)은 사전 합의 후 단독 PR로.
3. 새 상태가 필요하면 기존 useState 목록 끝에 추가 (중간 삽입 금지 — diff 최소화).

## 테스트 / 검증

```bash
cd apps/web
npm test                          # node --test property-shell.spec.mjs
./node_modules/.bin/tsc --noEmit  # 타입체크
npm run build                     # 번들 검증 (worker 경로 등)
```

- 스펙(`property-shell.spec.mjs`)은 **floor-plan-3d 폴더 아래 모든 .ts/.tsx/.mjs 소스를 합쳐서 검사**하므로, 폴더 안에서 파일을 추가/이동하는 것은 자유다. 단 **함수/문자열을 삭제·리네임하면 스펙이 깨질 수 있으니 npm test로 확인**할 것.
- 순수 로직(.mjs) 단위 테스트는 스펙 파일 하단의 "floor plan editor model …" 테스트 패턴을 따라 추가한다.

## 커밋/PR 규칙

- 브랜치는 폴더 담당 기준으로: `feat/plan-extraction-*`, `feat/room-model-*`, `feat/room-scene-*`
- 계약 타입(`types.ts`) 변경과 컨테이너 배선 변경이 섞인 PR은 리뷰어 2명(영향 받는 담당자) 지정.
