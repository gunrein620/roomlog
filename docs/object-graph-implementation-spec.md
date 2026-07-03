# Floor-Plan Object-Graph 구현 스펙 (확정본)

코덱스 초안 계획을 검토·수정한 확정 스펙. 아래 "결정사항"은 이미 결론이 난 것이므로 재논의하지 말고 그대로 구현한다.
목표: OpenAI 비전 모델(GPT-5.5)로 도면 이미지에서 벽/문/창문/설비/기둥/계단 객체 그래프를 받아,
아키스케치 스타일(깔끔한 벽 밴드 + 개구부 심볼이 벽 안에 배치)로 2D 표시·편집하고 3D 마커로 보여주고 저장/복원한다.
이번 슬라이스 제외: GLB 매핑, 문 열림 애니메이션, 3D에서 객체 선택.

## 0. 결정사항 (코덱스 초안 대비 변경점 포함)

1. `object-graph`는 기존 `POST /floor-plans/ai-analysis`의 `analysisMode`로 추가한다. 별도 엔드포인트 만들지 않는다.
2. **좌표는 원본 이미지 픽셀 좌표계**(origin top-left). 클라이언트가 요청에 `imageWidth`/`imageHeight`를 포함하고, 서버는 프롬프트에 주입한다. 0~1000 정규화 좌표를 쓰지 않는다 (기존 `docs/openai-wall-lines-window-as-wall-prompt.md` 방식 계승).
3. **모델은 벽을 문 위치에서 끊지 않고 연속 centerline으로 출력**하고, 문/창문은 `objects`로 별도 출력하며 `attachedWallId` + `spanOnWall`로 벽에 앵커한다. **문 위치의 벽 분할은 클라이언트 정규화 단계에서 수행**한다. (모델에게 분할을 시키면 stub 좌표 품질이 떨어짐. 초안에서 변경된 부분.)
4. 창문(`window`/`balconyWindow`)은 벽 연속 유지. 문 계열(`swingDoor`/`doubleSwingDoor`/`slidingDoor`/`pocketDoor`)은 정규화 시 벽을 분할하고, 개구부 객체가 그 갭에 배치된다. **개구부도 반드시 객체로 출력·표시한다** (초안 누락분).
5. 웹 상태: 새 `detectedObjects: FloorPlanObject[]` state를 추가한다. 기존 `openingCandidates`/`fixtureCandidates`에 흡수하지 않는다. object-graph 성공 시 기존 후보 배열은 빈 배열로 초기화하고, OpenCV fallback 경로에서는 기존 후보 흐름 그대로.
6. 3D: `PlacedFurniture` 재사용하지 않는다. 경량 `FloorPlanObject3D` 타입을 새로 만든다.
7. 저장 payload: `objects`는 **최상위 필드** (walls와 동급). `room3d.objects`에는 CONFIRMED만. `extractionMeta`에는 상태/카운트 메타만 (`aiObjectGraphStatus`, `aiObjectCount`).
8. OpenCV worker 흐름은 fallback으로 유지: OPENAI_API_KEY 없음 / object-graph 실패(status !== "ok" 또는 walls 0개) 시 기존 흐름 그대로 실행.
9. 2D 벽 렌더링을 아키스케치 스타일 밴드로 업그레이드한다 (아래 3.2). 얇은 선 + 화면고정 두께 → 월드 단위 두께 밴드 + 정션 원.

## 1. Phase 1 — API + 프롬프트 + 웹 계약 + 정규화 모듈

### 1.1 API: `apps/api/src/roomlog/roomlog.service.ts`

- `analyzeFloorPlanWithAi`(약 L2674)의 openai 분기(약 L2693, `candidate-review`/`room-structure` 분기 옆)에 추가:
  `if (input.analysisMode === "object-graph") return this.analyzeFloorPlanObjectGraphWithOpenAi(model, imageDataUrl, input);`
- `FloorPlanAiAnalysisInput` 타입(서비스 또는 컨트롤러 DTO — 실제 정의 위치를 찾아서)에 `"object-graph"` 모드와 `imageWidth?: number`, `imageHeight?: number` 추가. `apps/api/src/roomlog/roomlog.controller.ts` L144 `POST floor-plans/ai-analysis`의 body 전달도 확인.
- 새 private 메서드 `analyzeFloorPlanObjectGraphWithOpenAi`: 기존 `analyzeFloorPlanRoomStructureWithOpenAi`(약 L3029~) 패턴을 미러.
  - `https://api.openai.com/v1/responses` + structured outputs(`json_schema`, `strict: true`).
  - `OpenAI-Safety-Identifier: this.safetyIdentifier("floor-plan-object-graph", model)`.
  - 모델 id: `process.env.OPENAI_FLOOR_PLAN_OBJECT_MODEL || process.env.OPENAI_FLOOR_PLAN_MODEL || "gpt-5.5"`.
  - 이미지 입력 2장: (1) 도면 이미지 data URL, (2) 한국 기호 참조 시트. 참조 시트는 `assets/korean-floor-plan-symbols/reference-sheet.svg.png`를 `apps/api/assets/korean-floor-plan-symbols/reference-sheet.png`로 **복사해서** 번들하고 런타임에 base64로 읽는다. 파일 로딩 실패 시 참조 시트 없이 진행하고 warnings에 기록 (분석 자체를 실패시키지 말 것).
  - `imageWidth`/`imageHeight`가 없으면 status `"failed"` + "imageWidth/imageHeight가 필요합니다" summary 반환.
  - 실패/파싱 오류 시 기존 모드들과 같은 형태로 status `"failed"` + summary 반환.
- 응답(성공 시)은 기존 `FloorPlanAiAnalysisResult`를 확장해 아래 필드를 포함:

```ts
{
  model, mode, status: "ready" | "failed" | "config-required",  // 기존 모드들과 동일하게 "ready" 사용 ("ok" 신설 금지)
  analysisMode: "object-graph",
  summary: string,
  warnings: string[],
  homeRegions: Array<{ kind: "home" | "excluded"; polygon: Array<{ x: number; y: number }> }>,
  walls: Array<{
    id: string;                       // "w1", "w2"...
    start: { x: number; y: number };  // 원본 이미지 px
    end: { x: number; y: number };
    thicknessPx: number | null;
    role: "outer" | "inner" | "balcony" | "wet-area" | "unknown";
    confidence: number;               // 0~1
  }>,
  objects: Array<{
    id: string;                       // "o1"...
    type: "swingDoor" | "doubleSwingDoor" | "slidingDoor" | "pocketDoor"
        | "window" | "balconyWindow"
        | "toilet" | "sink" | "bathtub" | "showerBooth" | "floorDrain"
        | "kitchenSink" | "gasRange" | "refrigerator"
        | "stairs" | "elevator" | "column";
    center: { x: number; y: number };
    size: { width: number; height: number };   // 회전 전 axis-aligned bbox, px
    rotationDeg: number;                        // 0|90|180|270
    attachedWallId: string | null;
    spanOnWall: { start: { x: number; y: number }; end: { x: number; y: number } } | null; // 문/창문만, 벽 centerline 위 구간
    swing: { hinge: "start" | "end"; opensTowards: { x: number; y: number } } | null;      // swing 문만
    confidence: number;
    evidence: string;                           // 짧은 근거
  }>,
  dimensionTexts: Array<{ text: string; valueMm: number | null; appliesTo: string; confidence: number }>,
  scaleCandidates: [...],   // 기존 결과 제시 형태(pixelLength/realLengthMm/pixelToMmRatio/confidence/source)로 매핑해 반환 — 클라이언트 L1139~ 재사용
  rejectionSummary: { doorSymbols, windowFrameOnly, furnitureOrFixtures, dimensionOrText, textureOrHatching, uiChrome }  // number
}
```

JSON schema는 `docs/openai-wall-lines-window-as-wall-prompt.md`의 schema 작성 스타일(additionalProperties:false, required 전체 나열, nullable은 ["...","null"], maxItems 제한: walls 90 / objects 60 / homeRegions 8 / polygon 40)을 따른다.

### 1.2 프롬프트 (아래 텍스트를 그대로 사용)

서버 상수로 넣고, `assets/korean-floor-plan-symbols/prompts/korean-symbol-object-extraction.md`도 같은 내용으로 교체(동기화)한다. `{width}`/`{height}`는 요청값으로 치환.

```text
You extract a structured object graph from a Korean residential floor-plan image (apartment/villa/officetel) for a 2D/3D room modeling pipeline.
Return JSON only, following the provided schema exactly.

The original image size is {width}x{height} pixels. All coordinates use this original pixel coordinate system: origin at top-left, x to the right, y down.

A second image may be provided: a reference sheet of Korean floor-plan symbols. Use it only to learn what each symbol looks like. Never copy geometry or coordinates from the reference sheet.

## Region policy
- Use floor color/texture ONLY to separate the home unit interior from non-home areas (common corridor, stairwell, elevator core, neighboring unit, background, app UI chrome).
- homeRegions: output one "home" polygon covering the unit interior including balconies, and "excluded" polygons for adjacent non-home structures that could be mistaken for the unit.
- Do not segment individual rooms by floor color.

## Wall policy
- Output structural wall centerlines. Merge double parallel lines and filled wall masses into ONE centerline at the visual center of the wall mass.
- Prefer orthogonal horizontal/vertical segments. Split only at corners, T-junctions, and room-boundary turns.
- DO NOT split walls at door openings. Keep each wall centerline continuous through both doors and windows; report openings separately in objects. The client cuts door gaps later using your objects.
- thicknessPx: wall mass thickness in pixels, or null if unclear.
- Only include walls of the home unit. Never output walls that belong to excluded regions (neighbor unit, common core).
- Never create walls from: door leaves, swing arcs, window frame/sash lines, furniture outlines, fixtures, stair treads, hatching/tile/wood textures, dimension lines, arrows, extension lines, text, watermarks, UI chrome.

## Object policy
Detect these symbol classes (type ids are fixed):
- swingDoor: straight door leaf + quarter-circle swing arc at a wall opening (방문, 현관문).
- doubleSwingDoor: two mirrored leaves with two arcs.
- slidingDoor: overlapping thin parallel panels in an opening, no swing arc (미닫이문, 중문, 슬라이딩도어).
- pocketDoor: a leaf that slides into a wall pocket, no arc.
- window: thin double/triple frame lines drawn inside/on a wall band, no arc.
- balconyWindow: long multi-track window frame on an exterior or balcony wall (샷시).
- toilet: bowl ellipse + tank rectangle near a bathroom wall.
- sink: small wash-basin rectangle/half-round on a bathroom wall.
- bathtub: long rounded rectangle along a bathroom wall.
- showerBooth: small partitioned corner with diagonal or drain mark.
- floorDrain: small circle/square with cross or grid mark on wet-area floor.
- kitchenSink: sink bowl rectangle on a counter line.
- gasRange: rectangle containing 2-4 burner circles on a counter.
- refrigerator: large appliance box in kitchen/utility area.
- stairs: repeated parallel treads, may carry UP/DN text — only when inside the home unit.
- elevator: shaft square with X — usually in excluded region; output only if inside the home unit.
- column: small solid structural rectangle, attached to or separate from walls.

For every object:
- center and size: the axis-aligned bounding box in pixels (size measured before rotation).
- rotationDeg: 0, 90, 180 or 270 — the rotation that maps the canonical upright symbol onto the drawing.
- attachedWallId: id of the wall the object sits on or in, else null. Every door and window MUST reference a wall id when one exists; if you truly cannot match a wall, keep the object with attachedWallId null and lower confidence.
- spanOnWall: doors/windows only — the exact segment of the wall centerline covered by the opening, both endpoints lying on that wall. null for non-openings.
- swing: swingDoor/doubleSwingDoor only — hinge: which spanOnWall endpoint ("start" or "end") carries the hinge; opensTowards: a point roughly at the middle of the swept arc area, on the side the door opens into. null otherwise.
- confidence 0..1 and a short evidence string (e.g. "leaf+arc at bathroom entry").

Reject and count in rejectionSummary:
- freestanding furniture (bed, sofa, table, wardrobe) unless clearly built-in
- text labels, room-name text, area text
- dimension lines, arrows, extension lines
- hatching and floor textures
- watermarks and screenshot UI

## Dimension policy
- dimensionTexts: printed dimension labels (e.g. "2051mm"), with valueMm parsed when clear and appliesTo describing the measured span.
- scaleCandidates: when a printed dimension clearly matches a pixel span, output pixelLength, realLengthMm, pixelToMmRatio, confidence, sourceText.

## Quality
- Prefer missing a doubtful fixture over inventing one. Prefer missing a short wall over creating false geometry.
- Wall endpoints that visually meet must share nearly identical coordinates (within a few pixels) so corners close cleanly.
- When unsure, lower confidence and mention it in warnings.
```

### 1.3 웹 계약: `apps/web/src/app/floor-plan-3d/plan-extraction/types.ts`

```ts
export type FloorPlanObjectCategory = "opening" | "fixture" | "structure";
export type FloorPlanObjectType = /* 1.1의 16개 type 리터럴 union */;

export type FloorPlanObject = {
  id: string;
  type: FloorPlanObjectType;
  category: FloorPlanObjectCategory;   // type에서 유도해 채움
  label?: string;                      // 한글 라벨 (여닫이문, 변기 등 — manifest koLabel 매핑)
  center: Point;                       // 이미지 px
  size: { width: number; height: number }; // 회전 전 로컬 px
  rotationDeg: number;                 // 0|90|180|270
  attachedWallId?: string;
  spanOnWall?: { start: Point; end: Point };
  swing?: { hinge: "start" | "end"; opensTowards: Point };
  sizeMm?: { width: number; depth: number }; // 축척 확정 시 계산해 채움
  confidence?: number;
  evidence?: string;
  source: string;                      // "openai-object-graph"
  status: CandidateStatus;
};
```

- `ExtractionMeta`에 `aiObjectGraphStatus?: string; aiObjectCount?: number;` 추가.
- 에디터의 AI 요청/응답 로컬 타입(L80, L124 부근 union)에 `"object-graph"` 추가.

### 1.4 정규화 모듈 (신규): `apps/web/src/app/floor-plan-3d/plan-extraction/object-graph-normalize.mjs` + `.d.ts` + `object-graph-normalize.spec.mjs`

`wall-detection.mjs` 패턴(순수 mjs + d.ts, `node --test`로 테스트)을 그대로 따른다. worker와는 무관하므로 worker에 미러링하지 않는다.

`normalizeObjectGraph(raw, { imageWidth, imageHeight })` → `{ walls, objects, warnings, medianWallThicknessPx }`

처리 순서:
1. 입력 검증: NaN/음수/이미지 밖 좌표 clamp, 길이 0 벽 제거, 알 수 없는 type 객체는 버리고 warning.
2. 직교 스냅: 벽 각도가 수평/수직에서 7° 이내면 축 정렬(긴 축 좌표 유지, 짧은 축은 양끝 평균).
3. 정션 스냅: 끝점 간 거리 ≤ max(8px, medianThickness × 0.75)면 클러스터 평균점으로 병합 → 코너가 정확히 닫히게.
4. 공선 병합: 같은 축·겹치거나 이어지는(간격 ≤ 스냅 반경) 세그먼트 병합.
5. 문 분할: 문 계열 객체의 `spanOnWall`(없으면 center를 attachedWall에 수직 투영 + size의 벽방향 성분으로 span 산출) 구간을 벽에서 잘라낸다. 분할 후 남는 stub 길이 < 12px면 stub 제거. 분할된 벽 id는 `${원래id}-a`/`-b`.
6. 창문: 벽 분할하지 않음. attachedWallId가 분할로 사라졌으면 가장 가까운 새 벽 id로 재부착.
7. 객체 인스턴스화: `FloorPlanObject`로 변환. rotationDeg는 개구부는 벽 방향으로 강제(수평 벽=0, 수직 벽=90), status는 전부 `"CANDIDATE"`, id 접두어 `obj-`, category/label은 type에서 유도.
8. 반환 walls는 기존 `Wall` 형태(`{ id, start, end }` — id는 string 유지).

테스트(spec.mjs) 최소 케이스:
- ㄱ자 두 벽 끝점 6px 오차 → 정션 스냅으로 동일 좌표.
- 벽 중간 문 → 벽 2분할 + 갭 폭 = span 폭, 10px stub 제거 확인.
- 창문 → 벽 미분할, attachedWallId 유지.
- 기울어진(5°) 벽 → 축 정렬.
- 이미지 밖 좌표/NaN → clamp·거부 + warning.

## 2. Phase 2 — 에디터 2D 편집 + 3D 마커 + 저장/복원

### 2.1 상태/흐름: `apps/web/src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx`

- L316 부근에 `const [detectedObjects, setDetectedObjects] = useState<FloorPlanObject[]>([]);` + 선택 상태 `selectedObjectId`.
- 업로드→분석 흐름: 기존 room-structure 호출부(L1263 부근)보다 **먼저** object-graph를 시도. `runAiAnalysis`(L1119 부근)에 `analysisMode: "object-graph"`와 `imageWidth`/`imageHeight`(업로드 이미지 자연 크기) 전달.
  - 성공(status "ready" && walls ≥ 1): `normalizeObjectGraph` → `setWalls`(기존 Wall[]로), `setDetectedObjects`, scaleCandidates 반영(기존 L1139~1161 로직 재사용), `openingCandidates`/`fixtureCandidates`는 `[]`, extractionMeta에 `aiObjectGraphStatus`/`aiObjectCount` 기록.
  - 실패: 기존 워커 + room-structure 흐름 그대로 (동작 불변).
- 객체 편집 로직은 새 파일 `plan-extraction/object-editing.ts`로 분리 (컨테이너 비대화 금지):
  - 히트테스트(회전 bbox 고려), 이동 시 bounds clamp(mainPlanBounds 있으면 그것, 없으면 이미지 bounds), 90° 회전(size w/h 스왑 아님 — rotationDeg만 +90), status 토글, 삭제.
- 인터랙션: 클릭 선택 → 드래그 이동, 키/버튼으로 회전(R)·삭제(Delete)·확정/거부. 기존 후보 편집 UX(L977 `findClosestCandidate` 부근) 패턴 참고.

### 2.2 2D 캔버스 렌더링 (draw effect L582~681)

아키스케치 스타일로:
- 벽 밴드: `normal` 계열 벽은 `lineWidth = wallBandPx`(정규화가 준 medianWallThicknessPx를 8~22px로 clamp, 기본 12) — **viewScale로 나누지 않는 월드 단위 두께**, `lineCap: "butt"`, 색 `#3f3f42`. 각 벽 끝점마다 반지름 `wallBandPx/2` 원을 같은 색으로 fill → 정션이 둥글게 닫힘(아키스케치의 정션 원과 동일한 인상).
- selected/hover/hidden/ai-* variant는 기존 색상 규칙 유지하되 같은 밴드 스타일. 치수 라벨(mm 텍스트)·선택 핸들은 기존 로직 유지.
- 창문: attachedWall의 span 위에 흰 밴드(두께 = wallBandPx) + `#3f3f42` 얇은 테두리 + 중앙 평행선 1개 (전형적 창 심볼).
- 문: 벽은 이미 갭이 나 있음. 갭에 흰 프레임 밴드 + 문짝 직선(힌지 끝점에서 벽 수직 방향) + 90° 스윙 호(swing.opensTowards 쪽, 없으면 기본 안쪽). slidingDoor/pocketDoor는 호 없이 겹친 평행 패널 2개.
- 설비/구조: 흰 fill + `#44464d` 테두리 박스(rotationDeg 반영) + 위쪽에 한글 라벨. status 색: CANDIDATE 주황 점선, CONFIRMED 실선(개구부 `#00a36c`/설비 `#7a4fd6` — 기존 drawCandidate 색 재사용), REJECTED 회색 alpha 0.38. column은 `#3f3f42` 채운 사각형.
- 기존 `drawCandidate`(L649~675)는 fallback 경로용으로 유지.

### 2.3 사이드 패널

- 기존 후보 리스트(L2239 부근) 위치에 detectedObjects 리스트 추가: 라벨/타입/신뢰도(%)/상태 + 확정·거부·삭제 버튼. 요약 dd(L2080 부근)에 "감지 객체 n/m 확정" 표시.

### 2.4 저장/복원: `room-model/room-payload.ts` + 에디터 L1757~1827

- `room-payload.ts`: `CandidateLike`처럼 구조 제약 `ObjectLike = { status?: string }`로 받아서 `buildFloorPlanDraftPayload`/`buildFloorPlanLocalSnapshot`/`buildRoom3DSnapshot`/`buildResidentDesignPayload`에 `objects`(전체) 추가, `room3d.objects`에는 CONFIRMED만. (파일 헤더의 의존성 규칙 준수 — plan-extraction import 금지.)
- 에디터 저장 호출부(L1757~1827)와 로드/복원 경로에 `detectedObjects` 연결. 구버전 draft에 `objects` 없으면 `[]`.
- 서버 draft upsert(`assertPublishableFloorPlan` 사용부 L2655 부근)가 `objects` 필드를 거부/유실하지 않는지 확인하고 필요 시 passthrough 추가.

### 2.5 3D: `room-model/types.ts` + `room-scene/RoomlogThreeFloorPlanView.tsx`

- `room-model/types.ts`에:

```ts
export type FloorPlanObject3D = {
  id: string;
  type: string;
  category: "opening" | "fixture" | "structure";
  label?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  size: { width: number; height: number; depth: number }; // walls3D와 동일 단위계
  color?: string;
};
```

- 에디터에서 REJECTED 제외 detectedObjects → `convertWallsToWheretoputRoom3D`와 **동일한 스케일/좌표 변환**(room-model/units.ts 참고)으로 `FloorPlanObject3D[]` 생성 (변환 함수는 room-model에 새 파일 또는 units.ts 인접에).
- 높이 상수(mm): 문 2000(바닥부터), 창문 1200(바닥 900 위에 떠 있는 pane, opacity 0.5), 설비 850, column은 벽 높이와 동일, stairs 400.
- `RoomlogThreeFloorPlanView`(L231~)에 optional prop `objectsData?: FloorPlanObject3D[]` 추가, 카테고리별 색 박스 mesh 렌더: 문 `#b08968`, 창 `#7ec8ff`(투명), 설비 `#9aa3b2`, 구조 `#4a4a52`. prop 미전달 시 기존과 완전히 동일하게 동작.

## 3. 지켜야 할 것

- 기존 `dimension`/`candidate-review`/`room-structure` 모드와 OpenCV worker 흐름의 동작 불변. `plan-extraction/floor-plan-extraction.worker.ts`와 `wall-detection.mjs`는 수정 금지.
- 폴더 의존성 규칙: plan-extraction은 room-model/types만 import, room-model은 폴더 내부만, room-scene만 three 사용. 각 파일 헤더 주석·README 참조.
- 컨테이너(RoomlogFloorPlanEditor.tsx)에 로직을 늘어놓지 말고 새 모듈로 분리.
- 주석/문구는 기존 스타일대로 한국어.

## 4. 검증 (각 Phase 완료 시)

- `apps/api`, `apps/web` 각각 typecheck (package.json 스크립트 확인, 없으면 `npx tsc --noEmit`).
- `apps/web`에서 `node --test src/app/floor-plan-3d/plan-extraction/object-graph-normalize.spec.mjs`.
- 기존 테스트(`property-shell.spec.mjs` 등) 회귀 없음.

## 5. Phase 1 리뷰 반영사항 (Phase 2 시작 전에 먼저 수정)

1. **status "ok" → "ready"**: `FloorPlanAiAnalysisResult` union에 "ok"를 새로 넣지 말고 기존 모드들처럼 "ready"를 쓴다. `roomlog.types.ts`의 union에서 "ok" 제거, `analyzeFloorPlanObjectGraphWithOpenAi` 성공 반환을 "ready"로. 클라이언트도 "ready"로 판정.
2. **창문 span 투영**: `object-graph-normalize.mjs`에서 문(`splitDoorWalls`)처럼 창문(`window`/`balconyWindow`)도 attachedWall(없으면 nearest)의 centerline에 `spanOnWall`을 투영해 갱신한다 — 모델이 준 span이 벽에서 살짝 벗어나도 2D 창문 밴드가 정확히 벽 위에 그려지도록.
3. **attachedWallId 거리 임계값**: `instantiateObjects`의 nearestWall fallback은 개구부가 아닌 객체(fixture/structure)에는 투영 거리 ≤ max(24px, snapRadius×2)일 때만 부착하고, 멀면 attachedWallId를 남기지 않는다 (방 한가운데 변기에 엉뚱한 벽 id가 붙는 것 방지).
4. **공선 병합 후 정션 재스냅**: `mergeCollinearWalls`가 축 좌표를 평균내면서 이미 스냅된 코너가 수 px 벌어질 수 있다. merge 후 `snapJunctions`를 한 번 더 돌려 코너를 다시 닫는다.
5. **warnings 상한**: normalize 반환 warnings는 중복 제거 후 최대 30개로 자른다.
6. **벽 id 중복 방어**: 모델이 중복 id를 주면 `cutsByWall`이 다른 벽의 컷을 합쳐버린다. normalizeWall 단계에서 중복 id에 suffix를 붙여 유일하게 만든다.
