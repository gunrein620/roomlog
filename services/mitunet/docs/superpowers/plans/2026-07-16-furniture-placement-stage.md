# MitUNet Furniture Placement Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate furnishing stage to the MitUNet viewer that hides the source plan, renders interior wood and exterior asphalt finishes, applies white wall sides with black caps, and places the existing 1,680 GLB furniture assets.

**Architecture:** Keep the existing Three.js scene, wall meshes, camera, and rise animations intact. Add pure JavaScript modules for interior-mask calculation and furniture data, then connect them to new finish, preview, and furniture groups in `viewer/index.html`; the viewer switches visibility between structure and furnishing stages without rebuilding the plan.

**Tech Stack:** Three.js 0.162, GLTFLoader, browser CanvasTexture/Raycaster, ES modules, Node `node:test`, Python `unittest`, FastAPI-served viewer assets.

## Global Constraints

- Do not change wall, door, or window extraction and geometry coordinates.
- Do not change the existing wall rise animation or original/3D camera transition.
- The original floor-plan image must be hidden in furnishing mode.
- Interior finish is light wood; exterior finish is restrained asphalt.
- Wall sides are white and wall caps are black.
- Furniture assets come from `/floor-plan-3d/furniture-assets/manifest.json` and `/floor-plan-3d/furniture-assets/<relativePath>`.
- Catalog rendering must not create 1,680 DOM cards at once; show 60 results per page.
- Invalid furniture loads must not remove the plan or already placed furniture.
- Every production behavior begins with a failing automated test.

---

### Task 1: Interior-floor mask and coordinate mapping

**Files:**
- Create: `viewer/floor-finishes.mjs`
- Create: `tests_js/floor-finishes.test.mjs`

**Interfaces:**
- Consumes: plan polygons in `{ wall, door, window }` form, image-space width/height, and the same `scale`, `cx`, `cy` used by `loadPlan()`.
- Produces: `buildInteriorMask(polygons, width, height) -> Uint8Array`, `worldToMaskPixel(point, transform) -> { x, y }`, and `maskContains(mask, width, height, x, y) -> boolean`.

- [ ] **Step 1: Write the failing interior-mask tests**

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInteriorMask,
  maskContains,
  worldToMaskPixel,
} from "../viewer/floor-finishes.mjs";

const rectangle = (x1, y1, x2, y2) => ({
  outer: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
  holes: [],
});

test("closed walls classify the room center as interior and the border as exterior", () => {
  const polygons = {
    wall: [
      rectangle(2, 2, 14, 3),
      rectangle(2, 13, 14, 14),
      rectangle(2, 2, 3, 14),
      rectangle(13, 2, 14, 14),
    ],
    door: [],
    window: [],
  };
  const mask = buildInteriorMask(polygons, 16, 16);
  assert.equal(maskContains(mask, 16, 16, 8, 8), true);
  assert.equal(maskContains(mask, 16, 16, 0, 0), false);
});

test("door polygons temporarily close openings during interior classification", () => {
  const polygons = {
    wall: [
      rectangle(2, 2, 7, 3),
      rectangle(9, 2, 14, 3),
      rectangle(2, 13, 14, 14),
      rectangle(2, 2, 3, 14),
      rectangle(13, 2, 14, 14),
    ],
    door: [rectangle(7, 2, 9, 3)],
    window: [],
  };
  const mask = buildInteriorMask(polygons, 16, 16);
  assert.equal(maskContains(mask, 16, 16, 8, 8), true);
});

test("world coordinates map back to the plan mask", () => {
  assert.deepEqual(
    worldToMaskPixel({ x: 1, z: -2 }, { scale: 0.5, cx: 10, cy: 20 }),
    { x: 12, y: 24 },
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests_js/floor-finishes.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `viewer/floor-finishes.mjs`.

- [ ] **Step 3: Implement polygon rasterization, exterior flood fill, and mapping**

Create `viewer/floor-finishes.mjs` with these exported behaviors:

```js
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonContains(x, y, polygon) {
  if (!pointInRing(x, y, polygon.outer ?? [])) return false;
  return !(polygon.holes ?? []).some(hole => pointInRing(x, y, hole));
}

function rasterize(polygons, width, height, blocked) {
  for (const polygon of polygons) {
    const xs = polygon.outer.map(([x]) => x);
    const ys = polygon.outer.map(([, y]) => y);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (polygonContains(x + 0.5, y + 0.5, polygon)) blocked[y * width + x] = 1;
      }
    }
  }
}

export function buildInteriorMask(polygons = {}, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Interior mask dimensions must be positive integers");
  }
  const blocked = new Uint8Array(width * height);
  rasterize([
    ...(polygons.wall ?? []),
    ...(polygons.door ?? []),
    ...(polygons.window ?? []),
  ], width, height, blocked);

  const outside = new Uint8Array(width * height);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (blocked[index] || outside[index]) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 0; y < height; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }

  const interior = new Uint8Array(width * height);
  for (let index = 0; index < interior.length; index += 1) {
    interior[index] = blocked[index] || outside[index] ? 0 : 1;
  }
  return interior;
}

export function maskContains(mask, width, height, x, y) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return false;
  return mask[py * width + px] === 1;
}

export function worldToMaskPixel(point, { scale, cx, cy }) {
  return {
    x: Math.round(point.x / scale + cx),
    y: Math.round(-point.z / scale + cy),
  };
}
```

- [ ] **Step 4: Run the focused test and all JavaScript tests**

Run: `node --test tests_js/floor-finishes.test.mjs`

Expected: 3 tests pass.

Run: `node --test tests_js/*.mjs`

Expected: all existing tests plus the 3 new tests pass.

- [ ] **Step 5: Commit the floor-mask unit**

```powershell
git add -- viewer/floor-finishes.mjs tests_js/floor-finishes.test.mjs
git commit -m "feat: 실내 바닥 마스크 계산 추가"
```

---

### Task 2: Furniture catalog, placement records, and filtering

**Files:**
- Create: `viewer/furniture-placement.mjs`
- Create: `tests_js/furniture-placement.test.mjs`

**Interfaces:**
- Consumes: the live furniture manifest `items` array and placement inputs.
- Produces: `normalizeFurnitureCatalog(manifest)`, `filterFurnitureCatalog(items, query, category, limit)`, `createFurniturePlacement(item, position)`, and `cloneFurniturePlacements(placements)`.

- [ ] **Step 1: Write failing catalog and serialization tests**

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneFurniturePlacements,
  createFurniturePlacement,
  filterFurnitureCatalog,
  normalizeFurnitureCatalog,
} from "../viewer/furniture-placement.mjs";

const manifest = { items: [
  { category: "chair", fileName: "oak-chair.glb", relativePath: "chair/oak-chair.glb", sizeMm: { width: 500, height: 800, depth: 520 } },
  { category: "bed", fileName: "white-bed.glb", relativePath: "bed/white-bed.glb", sizeMm: { width: 1600, height: 900, depth: 2100 } },
] };

test("normalizes manifest items into same-origin model URLs and meter dimensions", () => {
  const items = normalizeFurnitureCatalog(manifest);
  assert.equal(items[0].modelUrl, "/floor-plan-3d/furniture-assets/chair/oak-chair.glb");
  assert.deepEqual(items[0].sizeMeters, { width: 0.5, height: 0.8, depth: 0.52 });
});

test("filters by category and name without rendering beyond the requested limit", () => {
  const items = normalizeFurnitureCatalog(manifest);
  assert.deepEqual(filterFurnitureCatalog(items, "oak", "chair", 60).map(item => item.fileName), ["oak-chair.glb"]);
});

test("placement records contain only persistent data", () => {
  const item = normalizeFurnitureCatalog(manifest)[0];
  const placement = createFurniturePlacement(item, { x: 1.2, y: 0, z: -0.4 }, "chair-1");
  placement.runtimeMesh = { transient: true };
  assert.deepEqual(cloneFurniturePlacements([placement]), [{
    id: "chair-1",
    relativePath: "chair/oak-chair.glb",
    position: [1.2, 0, -0.4],
    rotationY: 0,
    sizeMm: { width: 500, height: 800, depth: 520 },
  }]);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests_js/furniture-placement.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement catalog validation, filtering, and placement cloning**

```js
export const FURNITURE_MANIFEST_URL = "/floor-plan-3d/furniture-assets/manifest.json";
export const FURNITURE_ASSET_BASE_URL = "/floor-plan-3d/furniture-assets/";

const cleanPath = value => String(value ?? "").replace(/^\/+/, "");

export function normalizeFurnitureCatalog(manifest) {
  return (Array.isArray(manifest?.items) ? manifest.items : [])
    .filter(item => item?.relativePath && item?.fileName && item?.category)
    .map(item => ({
      category: String(item.category),
      fileName: String(item.fileName),
      relativePath: cleanPath(item.relativePath),
      modelUrl: FURNITURE_ASSET_BASE_URL + cleanPath(item.relativePath),
      sizeMm: {
        width: Number(item.sizeMm?.width) || 1000,
        height: Number(item.sizeMm?.height) || 1000,
        depth: Number(item.sizeMm?.depth) || 1000,
      },
      sizeMeters: {
        width: (Number(item.sizeMm?.width) || 1000) / 1000,
        height: (Number(item.sizeMm?.height) || 1000) / 1000,
        depth: (Number(item.sizeMm?.depth) || 1000) / 1000,
      },
    }));
}

export function filterFurnitureCatalog(items, query = "", category = "all", limit = 60) {
  const term = String(query).trim().toLowerCase();
  return items.filter(item => (
    (category === "all" || item.category === category)
    && (!term || item.fileName.toLowerCase().includes(term))
  )).slice(0, limit);
}

export function createFurniturePlacement(item, position, id = crypto.randomUUID()) {
  return {
    id,
    relativePath: item.relativePath,
    position: [Number(position.x), Number(position.y), Number(position.z)],
    rotationY: 0,
    sizeMm: { ...item.sizeMm },
  };
}

export function cloneFurniturePlacements(placements = []) {
  return placements.map(item => ({
    id: String(item.id),
    relativePath: cleanPath(item.relativePath),
    position: item.position.slice(0, 3).map(Number),
    rotationY: Number(item.rotationY) || 0,
    sizeMm: { ...item.sizeMm },
  }));
}
```

- [ ] **Step 4: Run focused and full JavaScript tests**

Run: `node --test tests_js/furniture-placement.test.mjs`

Expected: 3 tests pass.

Run: `node --test tests_js/*.mjs`

Expected: all JavaScript tests pass.

- [ ] **Step 5: Commit the furniture-data unit**

```powershell
git add -- viewer/furniture-placement.mjs tests_js/furniture-placement.test.mjs
git commit -m "feat: GLB 가구 카탈로그와 배치 데이터 추가"
```

---

### Task 3: Persist furniture in JSON export and RoomLog completion

**Files:**
- Modify: `viewer/plan-export.mjs`
- Modify: `viewer/roomlog-integration.mjs`
- Modify: `tests_js/plan-export.test.mjs`
- Modify: `tests_js/roomlog-integration.test.mjs`

**Interfaces:**
- Consumes: `cloneFurniturePlacements()` from `viewer/furniture-placement.mjs` and the viewer's current placements array.
- Produces: optional `furnitures` arrays in saved project JSON and RoomLog completion payload without changing polygon fields.

- [ ] **Step 1: Add failing export tests**

Add to `tests_js/plan-export.test.mjs`:

```js
test("saved project includes furniture placements without runtime objects", () => {
  const saved = buildPlanExport({ polygons: { wall: [{}], door: [], window: [] } }, {
    furnitures: [{
      id: "chair-1",
      relativePath: "chair/oak-chair.glb",
      position: [1, 0, 2],
      rotationY: Math.PI / 2,
      sizeMm: { width: 500, height: 800, depth: 520 },
      runtimeMesh: {},
    }],
  });
  assert.equal(saved.furnitures.length, 1);
  assert.equal("runtimeMesh" in saved.furnitures[0], false);
});
```

Add to `tests_js/roomlog-integration.test.mjs`:

```js
test("completion message carries optional furniture placements", () => {
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
  const message = buildRoomLogCompletion(context, plan, "home.png", [{
    id: "chair-1",
    relativePath: "chair/oak-chair.glb",
    position: [1, 0, 2],
    rotationY: 0,
    sizeMm: { width: 500, height: 800, depth: 520 },
  }]);
  assert.equal(message.payload.furnitures[0].id, "chair-1");
});
```

- [ ] **Step 2: Run both tests and verify RED**

Run: `node --test tests_js/plan-export.test.mjs tests_js/roomlog-integration.test.mjs`

Expected: FAIL because `furnitures` is absent.

- [ ] **Step 3: Add the optional furniture arguments**

In `viewer/plan-export.mjs`, import `cloneFurniturePlacements` and add the property:

```js
import { cloneFurniturePlacements } from "./furniture-placement.mjs";

export function buildPlanExport(composedPlan, options = {}) {
  if (!composedPlan || typeof composedPlan !== "object") {
    throw new TypeError("A composed plan is required before saving");
  }
  if (!composedPlan.polygons || typeof composedPlan.polygons !== "object") {
    throw new TypeError("The composed plan has no polygon data");
  }

  const savedAt = options.savedAt ?? new Date().toISOString();
  const sourceName = String(options.sourceName ?? "").trim();
  const plan = JSON.parse(JSON.stringify(composedPlan));

  return {
    schema: PROJECT_SCHEMA,
    version: 1,
    saved_at: savedAt,
    source_name: sourceName,
    plan,
    furnitures: cloneFurniturePlacements(options.furnitures ?? []),
  };
}
```

In `viewer/roomlog-integration.mjs`, import the same helper and extend the signatures:

```js
import { cloneFurniturePlacements } from "./furniture-placement.mjs";

export function buildRoomLogCompletion(context, plan, sourceName = "", furnitures = []) {
  if (!context) throw new Error("RoomLog integration is not active");
  if (!Array.isArray(plan?.polygons?.wall) || plan.polygons.wall.length === 0) {
    throw new Error("A rendered wall plan is required");
  }

  const millimetersPerPixel = Number(plan?.calibration?.millimetersPerPixel);
  return {
    type: ROOMLOG_MESSAGE_TYPE,
    schema: ROOMLOG_MESSAGE_SCHEMA,
    version: ROOMLOG_MESSAGE_VERSION,
    requestId: context.requestId,
    payload: {
      name: String(sourceName || "MitUNet floor plan"),
      canvasSize: copyTuple(plan.canvas_size, 2, [1024, 1024]),
      contentRect: copyTuple(plan.content_rect, 4, [0, 0, 1024, 1024]),
      millimetersPerPixel:
        Number.isFinite(millimetersPerPixel) && millimetersPerPixel > 0
          ? millimetersPerPixel
          : null,
      polygons: clonePolygons(plan.polygons),
      furnitures: cloneFurniturePlacements(furnitures),
    },
  };
}

export function sendRoomLogCompletion(context, plan, sourceName, opener, furnitures = []) {
  if (!opener || opener.closed || typeof opener.postMessage !== "function") {
    throw new Error("The RoomLog window is no longer available");
  }
  const message = buildRoomLogCompletion(context, plan, sourceName, furnitures);
  opener.postMessage(message, context.returnOrigin);
  return message;
}
```

- [ ] **Step 4: Run export tests and the full JavaScript suite**

Run: `node --test tests_js/plan-export.test.mjs tests_js/roomlog-integration.test.mjs`

Expected: all focused tests pass.

Run: `node --test tests_js/*.mjs`

Expected: all JavaScript tests pass.

- [ ] **Step 5: Commit export support**

```powershell
git add -- viewer/plan-export.mjs viewer/roomlog-integration.mjs tests_js/plan-export.test.mjs tests_js/roomlog-integration.test.mjs
git commit -m "feat: 가구 배치를 저장 데이터에 포함"
```

---

### Task 4: Furnishing stage shell, finishes, and wall cap materials

**Files:**
- Modify: `tests/test_viewer_shell.py`
- Modify: `viewer/index.html`

**Interfaces:**
- Consumes: `buildInteriorMask`, `maskContains`, `worldToMaskPixel`, current composed plan, and the existing `planGroup`.
- Produces: `finishGroup`, `furnitureGroup`, `placementPreviewGroup`, `enterFurnishingStage()`, `leaveFurnishingStage()`, and structure/furnishing UI controls.

- [ ] **Step 1: Add failing shell assertions**

Add these tests to `tests/test_viewer_shell.py`:

```python
def test_furnishing_stage_has_separate_controls_and_scene_groups(self):
    self.assertIn('id="furnish-btn"', self.html)
    self.assertIn('id="furniture-panel"', self.html)
    self.assertIn('const finishGroup = new THREE.Group()', self.html)
    self.assertIn('const furnitureGroup = new THREE.Group()', self.html)
    self.assertIn('function enterFurnishingStage()', self.html)
    self.assertIn('function leaveFurnishingStage()', self.html)

def test_furnishing_stage_uses_generated_finishes_not_the_source_plan(self):
    self.assertIn('from "/viewer-assets/floor-finishes.mjs"', self.html)
    self.assertIn('child.userData.isInputImage', self.html)
    self.assertIn('inputImage.visible = !furnishing', self.html)
    self.assertIn('buildInteriorMask(', self.html)

def test_walls_use_white_sides_and_black_caps(self):
    self.assertIn('const wallCapMat = new THREE.MeshStandardMaterial({ color: COLOR_INK', self.html)
    self.assertIn('[wallCapMat, wallSideMat]', self.html)
```

- [ ] **Step 2: Run the shell tests and verify RED**

Run: `.venv\Scripts\python.exe -m pytest tests/test_viewer_shell.py -q`

Expected: the 3 new tests fail because the stage UI and groups are absent.

- [ ] **Step 3: Add stage UI and responsive catalog panel markup**

Update `viewer/index.html` so the main panel contains:

```html
<button class="btn primary with-icon" id="furnish-btn" hidden disabled>
  <i data-lucide="armchair" aria-hidden="true"></i>
  <span>다음: 가구 배치</span>
</button>
<button class="btn with-icon" id="structure-btn" hidden>
  <i data-lucide="building-2" aria-hidden="true"></i>
  <span>구조 확인</span>
</button>

<aside id="furniture-panel" hidden aria-label="가구 카탈로그">
  <input id="furniture-search" type="search" placeholder="가구 검색">
  <select id="furniture-category" aria-label="가구 종류"></select>
  <div id="furniture-results"></div>
  <button class="btn" id="furniture-more-btn">더 보기</button>
  <div id="furniture-selection-actions" hidden>
    <button class="btn" id="furniture-move-btn">이동</button>
    <button class="btn" id="furniture-rotate-btn">90° 회전</button>
    <button class="btn" id="furniture-delete-btn">삭제</button>
  </div>
</aside>
```

Add this CSS so the panel sits on the right on desktop and at the bottom below `720px`:

```css
#furniture-panel {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 12;
  width: min(360px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 36px rgba(28, 42, 54, 0.14);
  pointer-events: none;
}
body.view-furnishing #furniture-panel { pointer-events: auto; }
#furniture-results {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin: 10px 0;
}
.furniture-card {
  min-height: 48px;
  padding: 8px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: #fff;
  overflow-wrap: anywhere;
  cursor: pointer;
}
@media (max-width: 720px) {
  #furniture-panel {
    top: auto;
    right: 8px;
    bottom: 8px;
    left: 8px;
    width: auto;
    max-height: 44vh;
  }
}
```

- [ ] **Step 4: Add the finish groups and wall material groups**

In the Three.js bootstrap:

```js
const COLOR_BG = 0xdce8f2;
const COLOR_ASPHALT = 0x7b858c;
const COLOR_WHITE = 0xffffff;
const COLOR_INK = 0x111111;

const wallCapMat = new THREE.MeshStandardMaterial({ color: COLOR_INK, roughness: 0.88, metalness: 0 });
const wallSideMat = new THREE.MeshStandardMaterial({ color: COLOR_WHITE, roughness: 0.82, metalness: 0 });

const finishGroup = new THREE.Group();
const furnitureGroup = new THREE.Group();
const placementPreviewGroup = new THREE.Group();
scene.add(finishGroup, furnitureGroup, placementPreviewGroup);
finishGroup.visible = false;
furnitureGroup.visible = false;
placementPreviewGroup.visible = false;
```

Use the material array only for wall-colored sections; leave glass on `windowMat` and leave doors empty:

```js
const wallMaterials = [wallCapMat, wallSideMat];

if (item.kind === "wall") {
  meshes.push(buildVerticalSection(item.poly, scale, cx, cy, 0, wallHeight, wallMaterials, true));
} else if (item.kind === "door") {
  // Door remains an open passage from floor to wall top.
} else {
  meshes.push(buildVerticalSection(item.poly, scale, cx, cy, 0, windowSill, wallMaterials, true));
  meshes.push(buildVerticalSection(item.poly, scale, cx, cy, windowSill, windowTop, windowMat, true));
  meshes.push(buildVerticalSection(item.poly, scale, cx, cy, windowTop, wallHeight, wallMaterials, true));
}
```

- [ ] **Step 5: Build and toggle the generated floor finish**

Import the floor helpers, build an RGBA CanvasTexture from the interior mask, align it with the full plan canvas, and keep the transform for pointer validation:

```js
import {
  buildInteriorMask,
  maskContains,
  worldToMaskPixel,
} from "/viewer-assets/floor-finishes.mjs";

let floorPlacementState = null;

function createAsphaltTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = "#7b858c";
  context.fillRect(0, 0, 256, 256);
  for (let index = 0; index < 1800; index += 1) {
    const shade = 102 + Math.floor(Math.random() * 44);
    context.fillStyle = `rgba(${shade},${shade + 3},${shade + 5},0.22)`;
    context.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 18);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildWoodFinish(data, scale, cx, cy) {
  const [width, height] = data.canvas_size ?? [1024, 1024];
  const mask = buildInteriorMask(data.polygons ?? {}, width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      const offset = index * 4;
      const seam = x % 48 === 0 || y % 12 === 0;
      image.data[offset] = seam ? 158 : 205 + ((x + y) % 9);
      image.data[offset + 1] = seam ? 128 : 175 + ((x + y) % 7);
      image.data[offset + 2] = seam ? 92 : 132 + ((x + y) % 5);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(width * scale, height * scale);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    roughness: 0.82,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((width / 2 - cx) * scale, 0.004, -(height / 2 - cy) * scale);
  mesh.receiveShadow = true;
  mesh.userData.disposable = { texture };
  finishGroup.add(mesh);
  floorPlacementState = { mask, width, height, scale, cx, cy };
}

function setFurnishingVisibility(furnishing) {
  finishGroup.visible = furnishing;
  furnitureGroup.visible = furnishing;
  placementPreviewGroup.visible = furnishing;
  planGroup.children
    .filter(child => child.userData.isInputImage)
    .forEach(inputImage => { inputImage.visible = !furnishing; });
  document.body.classList.toggle("view-furnishing", furnishing);
}

function enterFurnishingStage() {
  if (!currentComposedPlan || inFlight) return;
  currentView = "furnishing";
  setFurnishingVisibility(true);
  furniturePanel.hidden = false;
  structureButton.hidden = false;
  furnishButton.hidden = true;
  updateEditorControls();
}

function leaveFurnishingStage() {
  currentView = "3d";
  setFurnishingVisibility(false);
  furniturePanel.hidden = true;
  structureButton.hidden = true;
  furnishButton.hidden = false;
  updateEditorControls();
}
```

Call `buildWoodFinish(data, scale, cx, cy)` once in `loadPlan()` after scale calculation. In `clearPlan()`, dispose each finish mesh geometry, material, and `userData.disposable.texture`, clear `finishGroup`, and set `floorPlacementState = null`. Set the existing global floor material map to `createAsphaltTexture()`; do not add sky, sun, grass, or animation objects. Extend `setView()` to accept `"furnishing"`, and route that value through `enterFurnishingStage()` instead of replaying the rise animation.

- [ ] **Step 6: Run shell, JavaScript, and existing Python tests**

Run: `.venv\Scripts\python.exe -m pytest tests/test_viewer_shell.py -q`

Expected: all shell tests pass.

Run: `node --test tests_js/*.mjs`

Expected: all JavaScript tests pass.

Run: `.venv\Scripts\python.exe -m pytest tests/ -q`

Expected: the full existing Python suite passes.

- [ ] **Step 7: Commit the furnishing-stage shell**

```powershell
git add -- viewer/index.html tests/test_viewer_shell.py
git commit -m "feat: 3D 가구 배치 단계와 바닥 마감 추가"
```

---

### Task 5: GLB loading, preview, placement, selection, rotation, and deletion

**Files:**
- Modify: `tests/test_viewer_shell.py`
- Modify: `viewer/index.html`

**Interfaces:**
- Consumes: normalized catalog items, `floorPlacementState`, `furnitureGroup`, and `placementPreviewGroup`.
- Produces: catalog rendering limited to 60 results, cached GLB templates, raycast placement, `placedFurnitures`, selected furniture controls, and serialized exports.

- [ ] **Step 1: Add failing integration-shell assertions**

```python
def test_viewer_loads_and_places_glb_furniture(self):
    self.assertIn('GLTFLoader', self.html)
    self.assertIn('FURNITURE_MANIFEST_URL', self.html)
    self.assertIn('const furnitureModelCache = new Map()', self.html)
    self.assertIn('const furnitureRaycaster = new THREE.Raycaster()', self.html)
    self.assertIn('function renderFurnitureCatalog()', self.html)
    self.assertIn('function beginFurniturePlacement(item)', self.html)
    self.assertIn('function confirmFurniturePlacement()', self.html)

def test_furniture_can_be_rotated_deleted_and_exported(self):
    self.assertIn('selectedFurniture.rotation.y += Math.PI / 2', self.html)
    self.assertIn('furnitureGroup.remove(selectedFurniture)', self.html)
    self.assertIn('furnitures: currentFurniturePlacements()', self.html)
```

- [ ] **Step 2: Run shell tests and verify RED**

Run: `.venv\Scripts\python.exe -m pytest tests/test_viewer_shell.py -q`

Expected: the 2 new tests fail because GLB interaction code is absent.

- [ ] **Step 3: Load and render the catalog**

Import `GLTFLoader` and the furniture helpers. Replace Task 4's synchronous `enterFurnishingStage()` with the async version below, fetch the manifest on first entry, derive category options from `items`, and render at most `catalogLimit` results:

```js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  FURNITURE_MANIFEST_URL,
  cloneFurniturePlacements,
  createFurniturePlacement,
  filterFurnitureCatalog,
  normalizeFurnitureCatalog,
} from "/viewer-assets/furniture-placement.mjs";

const gltfLoader = new GLTFLoader();
const furnitureModelCache = new Map();
let furnitureCatalog = [];
let catalogLimit = 60;

async function ensureFurnitureCatalog() {
  if (furnitureCatalog.length) return furnitureCatalog;
  const response = await fetch(FURNITURE_MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Furniture catalog failed (${response.status})`);
  furnitureCatalog = normalizeFurnitureCatalog(await response.json());
  return furnitureCatalog;
}

function renderFurnitureCatalog() {
  const visible = filterFurnitureCatalog(
    furnitureCatalog,
    furnitureSearch.value,
    furnitureCategory.value,
    catalogLimit,
  );
  furnitureResults.replaceChildren(...visible.map(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "furniture-card";
    button.textContent = item.fileName.replace(/\.glb$/i, "");
    button.addEventListener("click", () => beginFurniturePlacement(item));
    return button;
  }));
}

function fillFurnitureCategories() {
  const categories = ["all", ...new Set(furnitureCatalog.map(item => item.category))];
  furnitureCategory.replaceChildren(...categories.map(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category === "all" ? "전체" : category;
    return option;
  }));
}

async function enterFurnishingStage() {
  if (!currentComposedPlan || inFlight) return;
  currentView = "furnishing";
  setFurnishingVisibility(true);
  furniturePanel.hidden = false;
  structureButton.hidden = false;
  furnishButton.hidden = true;
  try {
    await ensureFurnitureCatalog();
    fillFurnitureCategories();
    renderFurnitureCatalog();
    setStatus(`${furnitureCatalog.length}개 가구를 불러왔습니다.`);
  } catch (error) {
    setStatus(`가구 목록 로딩 실패: ${error.message}`, "error");
  }
  updateEditorControls();
}

furnitureSearch.addEventListener("input", () => {
  catalogLimit = 60;
  renderFurnitureCatalog();
});
furnitureCategory.addEventListener("change", () => {
  catalogLimit = 60;
  renderFurnitureCatalog();
});
furnitureMoreButton.addEventListener("click", () => {
  catalogLimit += 60;
  renderFurnitureCatalog();
});
```

- [ ] **Step 4: Add cached model normalization and ghost preview**

Load each source GLB once, clone its scene, calculate its BoundingBox, scale it to `sizeMeters`, and wrap it so the root origin is at the floor-centered point:

```js
const furnitureRaycaster = new THREE.Raycaster();
const furniturePointer = new THREE.Vector2();
let pendingFurniture = null;
let selectedFurniture = null;
const placedFurnitures = [];

async function loadFurnitureTemplate(item) {
  if (!furnitureModelCache.has(item.modelUrl)) {
    furnitureModelCache.set(item.modelUrl, gltfLoader.loadAsync(item.modelUrl).then(gltf => gltf.scene));
  }
  return (await furnitureModelCache.get(item.modelUrl)).clone(true);
}

function normalizeFurnitureObject(source, item) {
  const initialBox = new THREE.Box3().setFromObject(source);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  source.scale.set(
    item.sizeMeters.width / Math.max(initialSize.x, 0.001),
    item.sizeMeters.height / Math.max(initialSize.y, 0.001),
    item.sizeMeters.depth / Math.max(initialSize.z, 0.001),
  );
  source.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(source);
  const center = box.getCenter(new THREE.Vector3());
  source.position.x -= center.x;
  source.position.y -= box.min.y;
  source.position.z -= center.z;
  const root = new THREE.Group();
  root.add(source);
  return root;
}

function setPreviewAppearance(object, valid) {
  object.traverse(node => {
    if (!node.isMesh) return;
    if (!node.userData.previewMaterial) {
      node.material = node.material.clone();
      node.userData.previewMaterial = true;
      node.userData.baseColor = node.material.color?.getHex() ?? 0xffffff;
    }
    node.material.transparent = true;
    node.material.opacity = 0.55;
    if (node.material.color) {
      node.material.color.set(valid ? 0x67b87a : 0xd95c5c)
        .lerp(new THREE.Color(node.userData.baseColor), 0.45);
    }
  });
}

function restorePlacedAppearance(object) {
  object.traverse(node => {
    if (!node.isMesh || !node.userData.previewMaterial) return;
    node.material.transparent = false;
    node.material.opacity = 1;
    if (node.material.color) node.material.color.setHex(node.userData.baseColor);
  });
}

async function beginFurniturePlacement(item) {
  placementPreviewGroup.clear();
  try {
    const source = await loadFurnitureTemplate(item);
    const object = normalizeFurnitureObject(source, item);
    setPreviewAppearance(object, false);
    placementPreviewGroup.add(object);
    pendingFurniture = { item, object, valid: false, existingEntry: null };
    setStatus(`${item.fileName} 배치 위치를 선택하세요.`);
  } catch (error) {
    pendingFurniture = null;
    setStatus(`가구 로딩 실패: ${error.message}`, "error");
  }
}
```

- [ ] **Step 5: Add raycast validation and editing actions**

Add the exact raycast, confirmation, selection, move, rotation, and deletion handlers below:

```js
const placementPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function updateRayFromPointer(event) {
  const rect = sceneCanvas.getBoundingClientRect();
  furniturePointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  furnitureRaycaster.setFromCamera(furniturePointer, camera);
}

function updateFurniturePreview(event) {
  if (currentView !== "furnishing" || !pendingFurniture || !floorPlacementState) return;
  updateRayFromPointer(event);
  const point = furnitureRaycaster.ray.intersectPlane(placementPlane, new THREE.Vector3());
  if (!point) return;
  const pixel = worldToMaskPixel(point, floorPlacementState);
  const valid = maskContains(
    floorPlacementState.mask,
    floorPlacementState.width,
    floorPlacementState.height,
    pixel.x,
    pixel.y,
  );
  pendingFurniture.object.position.set(point.x, 0.006, point.z);
  pendingFurniture.valid = valid;
  setPreviewAppearance(pendingFurniture.object, valid);
}

function confirmFurniturePlacement() {
  if (!pendingFurniture?.valid) {
    setStatus("실내 바닥 안쪽에만 가구를 배치할 수 있습니다.", "warning");
    return;
  }
  const { item, object, existingEntry } = pendingFurniture;
  placementPreviewGroup.remove(object);
  restorePlacedAppearance(object);
  furnitureGroup.add(object);
  const placement = createFurniturePlacement(
    item,
    object.position,
    existingEntry?.placement.id,
  );
  placement.rotationY = object.rotation.y;
  object.userData.placementId = placement.id;
  if (existingEntry) {
    existingEntry.object = object;
    existingEntry.placement = placement;
  } else {
    placedFurnitures.push({ item, object, placement });
  }
  selectedFurniture = object;
  pendingFurniture = null;
  furnitureSelectionActions.hidden = false;
  setStatus(`${item.fileName} 배치 완료.`);
}

function placedRootFromObject(object) {
  let current = object;
  while (current && current.parent !== furnitureGroup) current = current.parent;
  return current?.parent === furnitureGroup ? current : null;
}

function selectFurnitureAt(event) {
  updateRayFromPointer(event);
  const hit = furnitureRaycaster.intersectObjects(furnitureGroup.children, true)[0];
  selectedFurniture = hit ? placedRootFromObject(hit.object) : null;
  furnitureSelectionActions.hidden = !selectedFurniture;
}

function beginMoveSelectedFurniture() {
  if (!selectedFurniture) return;
  const entry = placedFurnitures.find(item => item.placement.id === selectedFurniture.userData.placementId);
  if (!entry) return;
  furnitureGroup.remove(entry.object);
  setPreviewAppearance(entry.object, true);
  placementPreviewGroup.add(entry.object);
  pendingFurniture = { item: entry.item, object: entry.object, valid: true, existingEntry: entry };
  selectedFurniture = null;
  furnitureSelectionActions.hidden = true;
}

function rotateSelectedFurniture() {
  if (!selectedFurniture) return;
  selectedFurniture.rotation.y += Math.PI / 2;
  const entry = placedFurnitures.find(item => item.placement.id === selectedFurniture.userData.placementId);
  if (entry) entry.placement.rotationY = selectedFurniture.rotation.y;
}

function deleteSelectedFurniture() {
  if (!selectedFurniture) return;
  const id = selectedFurniture.userData.placementId;
  furnitureGroup.remove(selectedFurniture);
  const index = placedFurnitures.findIndex(item => item.placement.id === id);
  if (index >= 0) placedFurnitures.splice(index, 1);
  selectedFurniture = null;
  furnitureSelectionActions.hidden = true;
}

sceneCanvas.addEventListener("pointermove", updateFurniturePreview);
sceneCanvas.addEventListener("click", event => {
  if (currentView !== "furnishing") return;
  if (pendingFurniture) confirmFurniturePlacement();
  else selectFurnitureAt(event);
});
furnitureMoveButton.addEventListener("click", beginMoveSelectedFurniture);
furnitureRotateButton.addEventListener("click", rotateSelectedFurniture);
furnitureDeleteButton.addEventListener("click", deleteSelectedFurniture);
```

Wire the export calls exactly as follows:

```js
const currentFurniturePlacements = () => cloneFurniturePlacements(
  placedFurnitures.map(entry => entry.placement),
);

const payload = buildPlanExport(currentComposedPlan, {
  sourceName: currentSourceName,
  furnitures: currentFurniturePlacements(),
});

sendRoomLogCompletion(
  roomLogContext,
  currentComposedPlan,
  currentSourceName,
  window.opener,
  currentFurniturePlacements(),
);
```

- [ ] **Step 6: Run focused and full automated tests**

Run: `.venv\Scripts\python.exe -m pytest tests/test_viewer_shell.py -q`

Expected: all shell tests pass.

Run: `node --test tests_js/*.mjs`

Expected: all JavaScript tests pass.

Run: `.venv\Scripts\python.exe -m pytest tests/ -q`

Expected: all Python tests pass.

- [ ] **Step 7: Commit GLB placement behavior**

```powershell
git add -- viewer/index.html tests/test_viewer_shell.py
git commit -m "feat: GLB 가구 배치와 편집 기능 추가"
```

---

### Task 6: Live browser verification and regression evidence

**Files:**
- Modify only if a browser-discovered defect requires a new failing regression test first.
- Evidence: `output/playwright/furnishing-stage-structure.png`
- Evidence: `output/playwright/furnishing-stage-placement.png`

**Interfaces:**
- Consumes: the live route `http://localhost:3000/floor-plan-3d/mitunet`, the existing test floor plan, and the live furniture asset route.
- Produces: verified end-to-end furnishing behavior with screenshots and zero browser console errors.

- [ ] **Step 1: Verify the asset endpoints before UI interaction**

Run:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/floor-plan-3d/furniture-assets/manifest.json
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/floor-plan-3d/mitunet
```

Expected: `200` for both URLs.

- [ ] **Step 2: Run the complete automated test suites fresh**

Run:

```powershell
node --test tests_js/*.mjs
.venv\Scripts\python.exe -m pytest tests/ -q
```

Expected: all tests pass with zero failures.

- [ ] **Step 3: Verify the live user flow in the browser**

At `http://localhost:3000/floor-plan-3d/mitunet`:

1. Upload a known floor plan.
2. Confirm the original editor still shows wall, door, and window overlays.
3. Choose `Show 3D` and confirm the existing wall rise animation and camera glide still run.
4. Confirm wall sides are white and visible top caps are black.
5. Choose `다음: 가구 배치`.
6. Confirm the source plan image disappears, interior wood appears, and exterior asphalt remains visible.
7. Search for a chair, load one GLB, and place it inside.
8. Confirm exterior placement is rejected.
9. Rotate the chair 90 degrees, move it, and delete it.
10. Place it again, return to structure view, then return to furnishing and confirm it remains.
11. Confirm the browser console has no errors.

- [ ] **Step 4: Capture final visual evidence**

Capture one structure-stage screenshot and one furnishing-stage screenshot after placing a chair. Store them under `output/playwright/` with the filenames listed above.

- [ ] **Step 5: Final verification commit only if implementation files remain uncommitted**

```powershell
git status --short
git diff --check
```

Expected: no unintended files staged, no whitespace errors, and only known pre-existing worktree changes outside this feature.
