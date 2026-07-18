# Label-Free Entrance Floor Zone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 방 이름이 없는 도면에서도 주 출입문 안쪽만 현관 타일로 분리하고, 벽 없이 이어진 거실·식당·주방은 기존 대표 바닥재를 유지한다.

**Architecture:** 현관 전용 순수 모듈이 확정된 문 목록과 실내 마스크를 읽어 외벽 출입문 후보를 찾고, AI 현관 polygon을 검증하거나 문 안쪽의 보수적 사각형을 생성한다. 기존 `room-floor-zones.mjs`는 이 모듈이 반환한 픽셀만 `STONE_TILE` zone으로 추가하며, 벽·문·창문 polygon과 3D 벽 메시 생성 경로는 변경하지 않는다.

**Tech Stack:** JavaScript ES modules, Node.js built-in test runner, Next.js route proxy, MitUNet viewer, Docker Compose

## Global Constraints

- 외벽에 연결된 주 출입문을 현관 추정의 기준점으로 사용한다.
- 열린 거실과 식당을 강제로 서로 다른 공간으로 나누지 않는다.
- 현관 타일은 실내 연결 성분의 15%와 6m²를 넘지 않는다.
- AI 근거와 안전한 문 기반 대체 영역이 모두 없으면 기존 바닥재를 유지한다.
- 벽, 문, 창문 탐지 결과와 3D 벽 메시 생성은 변경하지 않는다.
- 기존 `floorMaterials` 직렬화 형식과 렌더러는 변경하지 않는다.

## File Structure

- Create: `services/mitunet/viewer/entrance-floor-zone.mjs`
  - 외벽 문 후보 탐색, AI 현관 polygon 검증, 문 기반 대체 영역 생성을 담당하는 순수 함수 모듈.
- Create: `services/mitunet/tests_js/entrance-floor-zone.test.mjs`
  - 현관 전용 모듈의 기하 및 안전 제한 단위 테스트.
- Modify: `services/mitunet/viewer/room-floor-zones.mjs`
  - 기존 room component 라벨링 이후 현관 override 결과만 zone으로 합성.
- Modify: `services/mitunet/tests_js/room-floor-zones.test.mjs`
  - 열린 공간 유지, 현관 단일 분리, 입력 구조 불변 회귀 테스트.
- Modify: `services/mitunet/viewer/index.html`
  - 기존 호출부에서 `openings`와 `millimetersPerPixel`을 바닥 zone 함수로 전달. 벽 생성부는 수정하지 않음.
- Modify: `apps/web/src/app/floor-plan-3d/room-materials/route.ts`
  - 글자 없는 도면도 설비와 주 출입문으로 분석하도록 AI 지시문 보강.
- Modify: `apps/web/src/app/floor-plan-3d/room-materials/route.spec.ts`
  - 새 지시문 계약 테스트.
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`
  - viewer가 실측 비율을 바닥 zone 호출에 전달하는 정적 회귀 테스트.

---

### Task 1: 외벽 출입문 후보 탐색

**Files:**
- Create: `services/mitunet/viewer/entrance-floor-zone.mjs`
- Create: `services/mitunet/tests_js/entrance-floor-zone.test.mjs`

**Interfaces:**
- Consumes: `openings`, `interiorMask: Uint8Array`, `width`, `height`.
- Produces: `findExteriorDoorCandidates({ height, interiorMask, openings, width }) -> Array<{ opening, center, inward, inwardPoint, spanPixels, tangent, clearance }>`.

- [ ] **Step 1: 외벽 문과 내부 방문을 구분하는 실패 테스트 작성**

```js
import assert from "node:assert/strict";
import test from "node:test";

import { findExteriorDoorCandidates } from "../viewer/entrance-floor-zone.mjs";

function rectangularInterior(width, height, left, top, right, bottom) {
  const mask = new Uint8Array(width * height);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) mask[y * width + x] = 1;
  }
  return mask;
}

test("finds an exterior door and rejects an internal door", () => {
  const width = 64;
  const height = 48;
  const interiorMask = rectangularInterior(width, height, 8, 6, 56, 42);
  const openings = [
    { id: "front", kind: "door", valid: true, axis: "horizontal", center_x: 32, center_y: 42, width: 12, height: 2 },
    { id: "inside", kind: "door", valid: true, axis: "vertical", center_x: 32, center_y: 24, width: 2, height: 10 },
    { id: "window", kind: "window", valid: true, axis: "horizontal", center_x: 20, center_y: 6, width: 8, height: 2 },
  ];

  const candidates = findExteriorDoorCandidates({ height, interiorMask, openings, width });

  assert.deepEqual(candidates.map(({ opening }) => opening.id), ["front"]);
  assert.deepEqual(candidates[0].inward, { x: 0, y: -1 });
  assert.equal(candidates[0].spanPixels, 12);
});
```

- [ ] **Step 2: 테스트가 모듈 부재로 실패하는지 확인**

Run: `node --test services/mitunet/tests_js/entrance-floor-zone.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `entrance-floor-zone.mjs`.

- [ ] **Step 3: 최소 외벽 문 후보 탐색 구현**

```js
const SAMPLE_OFFSETS = [-0.25, 0, 0.25];

function maskValue(mask, width, height, x, y) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return 0;
  return mask[py * width + px] ? 1 : 0;
}

function openingGeometry(opening) {
  const horizontal = opening?.axis === "horizontal";
  const center = { x: Number(opening?.center_x), y: Number(opening?.center_y) };
  const spanPixels = horizontal ? Number(opening?.width) : Number(opening?.height);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(spanPixels) || spanPixels < 2) {
    return null;
  }
  return {
    center,
    normal: horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 },
    spanPixels,
    tangent: horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 },
  };
}

function sideHits(geometry, sign, interiorMask, width, height) {
  const distance = Math.max(3, Math.round(geometry.spanPixels * 0.35));
  return SAMPLE_OFFSETS.reduce((sum, offset) => {
    const x = geometry.center.x
      + geometry.tangent.x * geometry.spanPixels * offset
      + geometry.normal.x * distance * sign;
    const y = geometry.center.y
      + geometry.tangent.y * geometry.spanPixels * offset
      + geometry.normal.y * distance * sign;
    return sum + maskValue(interiorMask, width, height, x, y);
  }, 0);
}

function clearanceScore(geometry, inward, interiorMask, width, height) {
  let score = 0;
  for (let depth = 0.5; depth <= 3; depth += 0.5) {
    for (let tangent = -1.5; tangent <= 1.5; tangent += 0.5) {
      const x = geometry.center.x
        + inward.x * geometry.spanPixels * depth
        + geometry.tangent.x * geometry.spanPixels * tangent;
      const y = geometry.center.y
        + inward.y * geometry.spanPixels * depth
        + geometry.tangent.y * geometry.spanPixels * tangent;
      score += maskValue(interiorMask, width, height, x, y);
    }
  }
  return score;
}

export function findExteriorDoorCandidates({ height, interiorMask, openings = [], width }) {
  if (!(interiorMask instanceof Uint8Array) || interiorMask.length !== width * height) return [];
  return openings
    .filter((opening) => opening?.kind === "door" && opening?.valid !== false)
    .map((opening) => ({ geometry: openingGeometry(opening), opening }))
    .filter(({ geometry }) => geometry)
    .map(({ geometry, opening }) => {
      const positive = sideHits(geometry, 1, interiorMask, width, height);
      const negative = sideHits(geometry, -1, interiorMask, width, height);
      if (Math.max(positive, negative) < 2 || Math.min(positive, negative) > 1) return null;
      const sign = positive > negative ? 1 : -1;
      const inward = { x: geometry.normal.x * sign, y: geometry.normal.y * sign };
      const distance = Math.max(3, Math.round(geometry.spanPixels * 0.35));
      return {
        opening,
        center: geometry.center,
        inward,
        inwardPoint: {
          x: Math.round(geometry.center.x + inward.x * distance),
          y: Math.round(geometry.center.y + inward.y * distance),
        },
        spanPixels: geometry.spanPixels,
        tangent: geometry.tangent,
        clearance: clearanceScore(geometry, inward, interiorMask, width, height),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.clearance - left.clearance || right.spanPixels - left.spanPixels);
}
```

- [ ] **Step 4: 단위 테스트 통과 확인**

Run: `node --test services/mitunet/tests_js/entrance-floor-zone.test.mjs`

Expected: PASS 1 test, 0 failures.

- [ ] **Step 5: 외벽 문 탐색만 커밋**

```bash
git add services/mitunet/viewer/entrance-floor-zone.mjs services/mitunet/tests_js/entrance-floor-zone.test.mjs
git commit -m "feat(floor-plan): detect exterior entrance doors"
```

---

### Task 2: AI 현관 검증과 문 기반 대체 영역 생성

**Files:**
- Modify: `services/mitunet/viewer/entrance-floor-zone.mjs`
- Modify: `services/mitunet/tests_js/entrance-floor-zone.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `findExteriorDoorCandidates`, 기존 floor labels, AI `rooms`, `millimetersPerPixel`, `permanentSolid`.
- Produces: `buildEntranceFloorOverride(options) -> null | { baseLabel, confidence, label, pixels, seed }`.

- [ ] **Step 1: 의미 polygon, 글자 없는 fallback, 안전 거부 테스트 작성**

```js
import { buildEntranceFloorOverride, findExteriorDoorCandidates } from "../viewer/entrance-floor-zone.mjs";

function normalizedBox(left, top, right, bottom, width, height) {
  return [
    { x: left / width * 1000, y: top / height * 1000 },
    { x: right / width * 1000, y: top / height * 1000 },
    { x: right / width * 1000, y: bottom / height * 1000 },
    { x: left / width * 1000, y: bottom / height * 1000 },
  ];
}

function entranceFixture() {
  const width = 80;
  const height = 60;
  const interiorMask = rectangularInterior(width, height, 8, 6, 72, 52);
  const labels = new Uint8Array(width * height);
  for (let index = 0; index < labels.length; index += 1) labels[index] = interiorMask[index] ? 1 : 0;
  return {
    height,
    interiorMask,
    labels,
    openings: [{ id: "front", kind: "door", valid: true, axis: "horizontal", center_x: 40, center_y: 52, width: 12, height: 2 }],
    permanentSolid: new Uint8Array(width * height),
    width,
  };
}

test("uses a validated entrance polygon next to the front door", () => {
  const fixture = entranceFixture();
  const result = buildEntranceFloorOverride({
    ...fixture,
    millimetersPerPixel: 100,
    rooms: [{ confidence: 0.92, label: "현관", polygon: normalizedBox(32, 38, 48, 52, fixture.width, fixture.height) }],
  });
  assert.ok(result);
  assert.equal(result.label, "현관");
  assert.equal(result.baseLabel, 1);
  assert.ok(result.pixels.length > 80);
  assert.ok(result.pixels.every((index) => fixture.labels[index] === 1));
});

test("creates a conservative entrance zone when the drawing has no room names", () => {
  const fixture = entranceFixture();
  const result = buildEntranceFloorOverride({ ...fixture, millimetersPerPixel: 100, rooms: [] });
  assert.ok(result);
  assert.equal(result.label, "현관");
  assert.ok(result.pixels.length > 80);
  assert.ok(result.pixels.length < fixture.interiorMask.reduce((sum, value) => sum + value, 0) * 0.15);
});

test("returns null when no exterior entrance can be proven", () => {
  const fixture = entranceFixture();
  fixture.openings[0] = { ...fixture.openings[0], center_y: 30 };
  assert.equal(buildEntranceFloorOverride({ ...fixture, millimetersPerPixel: 100, rooms: [] }), null);
});
```

- [ ] **Step 2: 새 API가 없어 실패하는지 확인**

Run: `node --test services/mitunet/tests_js/entrance-floor-zone.test.mjs`

Expected: FAIL because `buildEntranceFloorOverride` is not exported.

- [ ] **Step 3: 현관 후보 선택과 픽셀 생성 구현**

Add these constants and helpers to `entrance-floor-zone.mjs`:

```js
const ENTRANCE_LABEL = /현관|entrance|foyer/i;
const BALCONY_LABEL = /발코니|베란다|balcony|veranda/i;
const MIN_CONFIDENCE = 0.60;
const MAX_COMPONENT_RATIO = 0.15;
const MIN_AREA_MM2 = 800_000;
const MAX_AREA_MM2 = 6_000_000;

function normalizedRing(polygon, width, height) {
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 16) return null;
  const ring = polygon.map((point) => [Number(point?.x) / 1000 * width, Number(point?.y) / 1000 * height]);
  return ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) ? ring : null;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentX, currentY] = ring[index];
    const [previousX, previousY] = ring[previous];
    const crosses = (currentY > y) !== (previousY > y)
      && x < ((previousX - currentX) * (y - currentY)) / ((previousY - currentY) || Number.EPSILON) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pixelsInRing(ring, labels, baseLabel, interiorMask, permanentSolid, width, height) {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  const pixels = [];
  for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(height - 1, Math.ceil(Math.max(...ys))); y += 1) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(width - 1, Math.ceil(Math.max(...xs))); x += 1) {
      const index = y * width + x;
      if (labels[index] === baseLabel && interiorMask[index] && !permanentSolid[index] && pointInRing(x + 0.5, y + 0.5, ring)) {
        pixels.push(index);
      }
    }
  }
  return pixels;
}

function nearestLabel(labels, point, width, height) {
  for (let radius = 0; radius <= 8; radius += 1) {
    for (let y = Math.max(0, point.y - radius); y <= Math.min(height - 1, point.y + radius); y += 1) {
      for (let x = Math.max(0, point.x - radius); x <= Math.min(width - 1, point.x + radius); x += 1) {
        const value = labels[y * width + x];
        if (value) return value;
      }
    }
  }
  return 0;
}

function componentPixelCount(labels, baseLabel) {
  return labels.reduce((sum, value) => sum + Number(value === baseLabel), 0);
}

function validArea(pixels, componentSize, millimetersPerPixel) {
  if (!pixels.length || pixels.length > componentSize * MAX_COMPONENT_RATIO) return false;
  const scale = Number(millimetersPerPixel);
  if (!Number.isFinite(scale) || scale <= 0) return true;
  const areaMm2 = pixels.length * scale * scale;
  return areaMm2 >= MIN_AREA_MM2 && areaMm2 <= MAX_AREA_MM2;
}

function connectedPixelsContainingSeed(pixels, seed, width, height) {
  if (!pixels.length) return [];
  const allowed = new Uint8Array(width * height);
  for (const index of pixels) allowed[index] = 1;
  let start = pixels[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const index of pixels) {
    const x = index % width;
    const y = Math.floor(index / width);
    const distance = Math.hypot(x - seed.x, y - seed.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      start = index;
    }
  }
  const visited = new Uint8Array(width * height);
  const queue = [start];
  const connected = [];
  visited[start] = 1;
  while (queue.length) {
    const index = queue.shift();
    connected.push(index);
    const x = index % width;
    const y = Math.floor(index / width);
    for (const next of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1, y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
      if (next >= 0 && allowed[next] && !visited[next]) {
        visited[next] = 1;
        queue.push(next);
      }
    }
  }
  return connected;
}

function ringArea(ring) {
  let doubleArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    doubleArea += x1 * y2 - x2 * y1;
  }
  return Math.abs(doubleArea) / 2;
}

function rectangleRing(candidate, millimetersPerPixel) {
  const scale = Number(millimetersPerPixel);
  const physical = Number.isFinite(scale) && scale > 0;
  const depth = physical ? 1350 / scale : candidate.spanPixels * 1.5;
  const width = physical
    ? Math.min(2400 / scale, Math.max(1200 / scale, candidate.spanPixels + 600 / scale))
    : candidate.spanPixels * 1.67;
  const start = candidate.inwardPoint;
  const end = { x: start.x + candidate.inward.x * depth, y: start.y + candidate.inward.y * depth };
  const half = width / 2;
  return [
    [start.x - candidate.tangent.x * half, start.y - candidate.tangent.y * half],
    [start.x + candidate.tangent.x * half, start.y + candidate.tangent.y * half],
    [end.x + candidate.tangent.x * half, end.y + candidate.tangent.y * half],
    [end.x - candidate.tangent.x * half, end.y - candidate.tangent.y * half],
  ];
}
```

Then add the public function:

```js
export function buildEntranceFloorOverride({
  height,
  interiorMask,
  labels,
  millimetersPerPixel = null,
  openings = [],
  permanentSolid,
  rooms = [],
  width,
}) {
  const candidates = findExteriorDoorCandidates({ height, interiorMask, openings, width });
  const balconyRooms = rooms.filter((room) => BALCONY_LABEL.test(String(room?.label ?? "")));
  const entranceRooms = rooms
    .filter((room) => ENTRANCE_LABEL.test(String(room?.label ?? "")) && Number(room?.confidence) >= MIN_CONFIDENCE)
    .sort((left, right) => Number(right.confidence) - Number(left.confidence));

  const notInsideBalcony = candidates.filter((candidate) => !balconyRooms.some((room) => {
    const ring = normalizedRing(room.polygon, width, height);
    return ring && pointInRing(candidate.inwardPoint.x, candidate.inwardPoint.y, ring);
  }));
  if (!notInsideBalcony.length) return null;

  let selected = notInsideBalcony[0];
  let selectedRoom = null;
  for (const room of entranceRooms) {
    const ring = normalizedRing(room.polygon, width, height);
    if (!ring) continue;
    const matchingDoor = notInsideBalcony.find((candidate) => {
      const threshold = Number.isFinite(Number(millimetersPerPixel)) && Number(millimetersPerPixel) > 0
        ? 750 / Number(millimetersPerPixel)
        : candidate.spanPixels;
      return ring.some(([x, y]) => Math.hypot(x - candidate.inwardPoint.x, y - candidate.inwardPoint.y) <= threshold)
        || pointInRing(candidate.inwardPoint.x, candidate.inwardPoint.y, ring);
    });
    if (matchingDoor) {
      selected = matchingDoor;
      selectedRoom = room;
      break;
    }
  }

  const baseLabel = nearestLabel(labels, selected.inwardPoint, width, height);
  if (!baseLabel) return null;
  const componentSize = componentPixelCount(labels, baseLabel);
  const semanticRing = selectedRoom ? normalizedRing(selectedRoom.polygon, width, height) : null;
  let pixels = semanticRing
    ? pixelsInRing(semanticRing, labels, baseLabel, interiorMask, permanentSolid, width, height)
    : [];
  pixels = connectedPixelsContainingSeed(pixels, selected.inwardPoint, width, height);

  if (!validArea(pixels, componentSize, millimetersPerPixel)) {
    const fallbackRing = rectangleRing(selected, millimetersPerPixel);
    pixels = connectedPixelsContainingSeed(pixelsInRing(
      fallbackRing,
      labels,
      baseLabel,
      interiorMask,
      permanentSolid,
      width,
      height,
    ), selected.inwardPoint, width, height);
    if (pixels.length < ringArea(fallbackRing) * 0.5) return null;
  }
  if (!validArea(pixels, componentSize, millimetersPerPixel)) return null;

  return {
    baseLabel,
    confidence: selectedRoom ? Number(selectedRoom.confidence) : 0.5,
    label: "현관",
    pixels,
    seed: [selected.inwardPoint.x, selected.inwardPoint.y],
  };
}
```

- [ ] **Step 4: 현관 모듈 전체 테스트 통과 확인**

Run: `node --test services/mitunet/tests_js/entrance-floor-zone.test.mjs`

Expected: PASS 4 tests, 0 failures.

- [ ] **Step 5: 현관 영역 생성 기능 커밋**

```bash
git add services/mitunet/viewer/entrance-floor-zone.mjs services/mitunet/tests_js/entrance-floor-zone.test.mjs
git commit -m "feat(floor-plan): infer label-free entrance floors"
```

---

### Task 3: 기존 바닥 zone 파이프라인에 현관 override 연결

**Files:**
- Modify: `services/mitunet/viewer/room-floor-zones.mjs`
- Modify: `services/mitunet/tests_js/room-floor-zones.test.mjs`
- Modify: `services/mitunet/viewer/index.html`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

**Interfaces:**
- Consumes: Task 2의 `buildEntranceFloorOverride`.
- Produces: 기존 형식의 `floor_materials`에 최대 하나의 추가 `STONE_TILE` zone.

- [ ] **Step 1: 글자 없는 현관 통합과 입력 불변 실패 테스트 작성**

Update the existing open-kitchen entrance test so it includes a valid exterior door and passes `openings`. Add this test after it:

```js
test("adds one door-anchored entrance tile without mutating structural inputs", () => {
  const width = 60;
  const height = 40;
  const interiorMask = new Uint8Array(width * height);
  for (let y = 4; y < 36; y += 1) {
    for (let x = 4; x < 56; x += 1) interiorMask[y * width + x] = 1;
  }
  const sourceRgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const openings = [
    { id: "front", kind: "door", valid: true, axis: "horizontal", center_x: 30, center_y: 36, width: 10, height: 2 },
  ];
  const polygons = { door: [], wall: [], window: [] };
  const before = structuredClone({ openings, polygons });

  const map = buildRoomFloorMaterialMap({
    height,
    interiorMask,
    millimetersPerPixel: 100,
    openings,
    polygons,
    rooms: [{ confidence: 0.94, label: "거실/식당", polygon: normalizedBox(4, 4, 56, 36, width, height) }],
    sourceRgba,
    width,
  });

  assert.equal(map.zones.filter((zone) => zone.material === "STONE_TILE").length, 1);
  assert.equal(map.zones.filter((zone) => zone.material !== "STONE_TILE").length, 1);
  assert.deepEqual({ openings, polygons }, before);
});
```

In `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`, add this source next to the other `readFileSync` declarations:

```ts
const viewerSource = readFileSync(
  join(process.cwd(), "../../services/mitunet/viewer/index.html"),
  "utf8",
);
```

Then add this assertion to the first viewer route test:

```ts
assert.match(viewerSource, /millimetersPerPixel:\s*currentComposedPlan\.calibration\?\.millimetersPerPixel/);
```

- [ ] **Step 2: 기존 함수가 현관 fallback을 만들지 못해 실패하는지 확인**

Run: `node --test services/mitunet/tests_js/room-floor-zones.test.mjs`

Expected: FAIL because no `STONE_TILE` zone is created without an AI entrance room.

Run: `pnpm.cmd --filter web exec node --test src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

Expected: FAIL because `millimetersPerPixel` is not passed to the builder.

- [ ] **Step 3: 현관 override를 기존 zone 결과에 한 번만 추가**

At the top of `room-floor-zones.mjs` add:

```js
import { buildEntranceFloorOverride } from "./entrance-floor-zone.mjs";
```

Extend the builder signature:

```js
export function buildRoomFloorMaterialMap({
  height,
  interiorMask,
  millimetersPerPixel = null,
  openings = [],
  polygons = {},
  rooms,
  sourceRgba,
  width,
}) {
```

Replace the current loop that directly overlays every non-representative `STONE_TILE` room polygon with one validated override after `fillTemporaryBarriers(...)`:

```js
  const entrance = buildEntranceFloorOverride({
    height,
    interiorMask,
    labels,
    millimetersPerPixel,
    openings,
    permanentSolid,
    rooms,
    width,
  });
  if (
    entrance
    && zones[entrance.baseLabel - 1]?.material !== "STONE_TILE"
    && zones.length < 255
  ) {
    const label = zones.length + 1;
    for (const index of entrance.pixels) labels[index] = label;
    zones.push({
      confidence: entrance.confidence,
      id: `room-${label}`,
      label: entrance.label,
      material: "STONE_TILE",
      roomType: "현관",
      seed: entrance.seed,
    });
  }
```

Delete `roomPolygonPixels` if it is no longer referenced. Do not modify `permanentSolid`, `polygons`, `openings`, or any wall-generation function.

- [ ] **Step 4: 실측 비율을 기존 호출부에서 전달**

In the existing `buildRoomFloorMaterialMap` call in `services/mitunet/viewer/index.html`, add exactly one property:

```js
    millimetersPerPixel: currentComposedPlan.calibration?.millimetersPerPixel ?? null,
```

Keep every wall, opening, animation, renderer, and mesh statement outside this call unchanged.

- [ ] **Step 5: 통합 테스트 통과 확인**

Run: `node --test services/mitunet/tests_js/room-floor-zones.test.mjs services/mitunet/tests_js/entrance-floor-zone.test.mjs`

Expected: PASS all entrance and room-floor-zone tests, 0 failures.

Run: `pnpm.cmd --filter web exec node --test src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

Expected: PASS, 0 failures.

- [ ] **Step 6: 바닥 zone 통합 변경 커밋**

```bash
git add services/mitunet/viewer/room-floor-zones.mjs services/mitunet/tests_js/room-floor-zones.test.mjs services/mitunet/viewer/index.html apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts
git commit -m "feat(floor-plan): anchor entrance tiles to exterior doors"
```

---

### Task 4: 글자 없는 도면용 AI 분석 지시문 보강

**Files:**
- Modify: `apps/web/src/app/floor-plan-3d/room-materials/route.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-materials/route.spec.ts`

**Interfaces:**
- Consumes: 기존 `/floor-plans/ai-analysis`와 `RoomMaterialAnalysis` 계약.
- Produces: 동일한 `rooms[]` 계약. 새 응답 필드는 추가하지 않음.

- [ ] **Step 1: 글자 없는 도면 분석 계약 실패 테스트 작성**

Add these assertions to the existing route test:

```ts
assert.match(source, /공간명이 없어도/);
assert.match(source, /주 출입문 안쪽/);
assert.match(source, /가구와 치수선은 polygon에서 제외/);
```

- [ ] **Step 2: 기존 prompt에서 실패하는지 확인**

Run: `pnpm.cmd --filter web exec node --test src/app/floor-plan-3d/room-materials/route.spec.ts`

Expected: FAIL on the three new prompt assertions.

- [ ] **Step 3: 기존 prompt를 같은 응답 계약 안에서 구체화**

Use this prompt text in `route.ts`:

```ts
prompt:
  "도면에 표시된 모든 실내 공간의 이름과 외곽 polygon을 반환하세요. " +
  "침실, 거실, 주방/식당, 욕실, 다용도실, 현관, 발코니를 빠뜨리지 마세요. " +
  "공간명이 없어도 주 출입문, 신발장, 수납장, 침대, 주방 설비와 바닥 패턴을 근거로 공간 용도를 추정하세요. " +
  "특히 주 출입문 안쪽의 현관 polygon을 반환하되 불확실하면 confidence를 낮추세요. " +
  "가구와 치수선은 polygon에서 제외하고 실제 바닥 영역만 포함하세요.",
```

- [ ] **Step 4: route 계약 테스트 통과 확인**

Run: `pnpm.cmd --filter web exec node --test src/app/floor-plan-3d/room-materials/route.spec.ts`

Expected: PASS 2 tests, 0 failures.

- [ ] **Step 5: prompt 변경만 커밋**

```bash
git add apps/web/src/app/floor-plan-3d/room-materials/route.ts apps/web/src/app/floor-plan-3d/room-materials/route.spec.ts
git commit -m "feat(floor-plan): classify unlabeled entrance areas"
```

---

### Task 5: 전체 회귀 검증과 로컬 배포 확인

**Files:**
- Verify only: `services/mitunet/viewer/entrance-floor-zone.mjs`
- Verify only: `services/mitunet/viewer/room-floor-zones.mjs`
- Verify only: `services/mitunet/viewer/index.html`
- Verify only: `apps/web/src/app/floor-plan-3d/room-materials/route.ts`
- Update handoff: `C:\Users\smoun\Jungle\인수인계\2026-07-17-mitunet-001.md`

**Interfaces:**
- Consumes: Tasks 1-4의 커밋 결과.
- Produces: 테스트 증거, Docker 3000 반영, `high.png` 시각 확인 기록.

- [ ] **Step 1: MitUNet 전체 JavaScript 테스트 실행**

Run: `node --test services/mitunet/tests_js/*.test.mjs`

Expected: all tests PASS, 0 failures. 기존 기준 128개보다 테스트 수가 증가해야 한다.

- [ ] **Step 2: web 단위 테스트와 빌드 실행**

Run: `pnpm.cmd --filter web test:unit`

Expected: PASS, 0 failures.

Run: `pnpm.cmd --filter web build`

Expected: Next.js production build exits 0.

- [ ] **Step 3: 벽 관련 변경이 섞이지 않았는지 확인**

Run:

```powershell
git diff --name-only 83f4f7f0..HEAD
git diff --check 83f4f7f0..HEAD
```

Expected: 변경 목록은 이 계획의 File Structure에 적힌 바닥 zone, route, test 파일뿐이고 `git diff --check`는 오류 없이 종료한다. `wall-dimensions.mjs`와 3D 벽 생성 구간에는 차이가 없어야 한다.

- [ ] **Step 4: Docker web 재빌드와 재기동**

Run:

```powershell
docker compose --progress plain build web
docker compose up -d --no-deps web
docker compose ps web api
```

Expected: `roomlog-web` is Up on `0.0.0.0:3000`; `roomlog-api` is Up on `0.0.0.0:4000`.

- [ ] **Step 5: 실제 `high.png` 시각 회귀 확인**

Open `http://localhost:3000/floor-plan-3d/mitunet`, refresh the page, upload `C:\Users\smoun\Downloads\high.png`, complete scale calibration if requested, and enter furniture placement.

Expected:

- 아래쪽 주 출입문 바로 안쪽에만 `STONE_TILE`이 보인다.
- 중앙 거실과 식당은 같은 바닥재로 이어진다.
- 현관 타일이 거실 중심부까지 뻗지 않는다.
- 벽, 문, 창문 개수와 3D 모양은 변경 전과 같다.
- 페이지를 새로고침하고 도면을 다시 업로드해도 동일한 규칙으로 생성된다.

- [ ] **Step 6: 인수인계 문서에 결과와 검증 수치 기록**

Append a dated section containing:

```md
### 글자 없는 도면의 현관 바닥 예외처리 (2026-07-18)

- 기준 이미지: `C:\Users\smoun\Downloads\high.png`
- 방식: 외벽 주 출입문 + AI 현관 polygon 검증 + 문 안쪽 보수적 fallback
- 열린 거실/식당은 하나의 바닥재 유지
- 벽/문/창문 탐지 및 3D 벽 생성 코드 변경 없음
- 테스트: 실제 최종 통과 개수 기록
- 확인 순서: 페이지 새로고침 → 도면 재업로드 → 가구 배치 진입
```

- [ ] **Step 7: 최종 상태 확인**

Run: `git status --short`

Expected: 이 계획에서 만든 코드 변경은 모두 커밋되어 있고, 기존에 있던 사용자 변경만 남아 있다. 인수인계 문서는 저장되었지만 RoomLog 저장소 밖이므로 Git 커밋 대상이 아니다.
