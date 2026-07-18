# Room Floor Material Zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate room-specific floor materials when the user enters the furniture-placement stage, persist them with the MitUNet plan, and render the same materials in saved RoomLog 3D views.

**Architecture:** Reuse RoomLog's authenticated OpenAI `room-structure` analysis through a small Next.js BFF route. Treat AI polygons only as semantic seeds; a pure viewer module partitions the existing interior mask without crossing confirmed wall/window/door barriers, encodes zone labels with RLE, and produces a deterministic multi-material texture. The wall mesh path remains untouched.

**Tech Stack:** Next.js 16 App Router, NestJS floor-plan AI analysis, browser ES modules, Three.js, TypeScript, Node test runner.

## Global Constraints

- Run classification only when entering furniture placement after structural review is complete.
- Do not modify wall detection, wall post-processing, wall polygon composition, or wall mesh generation.
- Use original-image room labels only for semantics and seeds; use confirmed structural geometry for flooring boundaries.
- Preserve existing plans through the whole-interior wood fallback.
- Do not persist OpenAI credentials or raw model responses.
- Keep room-material rendering deterministic across save and reopen.

---

### Task 1: Authenticated room-classification BFF

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/room-materials/route.ts`
- Create: `apps/web/src/app/floor-plan-3d/room-materials/route.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-proxy.ts`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

**Interfaces:**
- Consumes: `POST { imageDataUrl: string }` from the MitUNet viewer.
- Produces: `{ status, summary, rooms }`, where `rooms` is the validated `FloorPlanAiRoomStructure[]` returned by the existing API.
- Produces proxy rewrite: `fetch("/room-materials"` -> `fetch("/floor-plan-3d/room-materials"`.

- [ ] **Step 1: Write the failing BFF route test**

Add a source-level route contract test that requires the route to call `serverFetch`, force `analysisMode: "room-structure"`, and use `model: "openai/floor-plan-vision"`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/floor-plan-3d/room-materials/route.ts"), "utf8");

test("room material route forwards authenticated room-structure analysis", () => {
  assert.match(source, /serverFetch/);
  assert.match(source, /analysisMode:\s*"room-structure"/);
  assert.match(source, /model:\s*"openai\/floor-plan-vision"/);
  assert.match(source, /imageDataUrl/);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `pnpm --filter web run test:unit -- room-materials/route.spec.ts`

Expected: FAIL because `route.ts` does not exist.

- [ ] **Step 3: Implement the minimal BFF route**

The route must validate that `imageDataUrl` starts with `data:image/` and then call:

```ts
const result = await serverFetch<FloorPlanAiAnalysisResult>("/roomlog/floor-plans/ai-analysis", {
  method: "POST",
  body: JSON.stringify({
    analysisMode: "room-structure",
    imageDataUrl,
    model: "openai/floor-plan-vision",
    prompt: "도면에 표시된 모든 실내 공간의 이름과 대략적인 polygon을 반환하세요. 침실, 거실, 주방/식당, 욕실, 다용도실, 발코니를 빠뜨리지 마세요."
  })
});
return Response.json({ status: result.status, summary: result.summary, rooms: result.rooms ?? [] });
```

Return `400` for invalid image data. Let `serverFetch` preserve authentication and upstream errors.

- [ ] **Step 4: Add the MitUNet HTML fetch rewrite**

Extend `transformMitunetViewerHtml()` with:

```ts
.replaceAll('fetch("/room-materials"', 'fetch("/floor-plan-3d/room-materials"')
```

Add an assertion to `mitunet-internal-page.spec.ts` that the transformed HTML contains `/floor-plan-3d/room-materials`.

- [ ] **Step 5: Run tests to verify GREEN**

Run: `pnpm --filter web run test:unit -- room-materials/route.spec.ts mitunet-internal-page.spec.ts`

Expected: both test files PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/web/src/app/floor-plan-3d/room-materials apps/web/src/app/floor-plan-3d/mitunet-proxy.ts apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts
git commit -m "feat(floor-plan): proxy room material analysis"
```

---

### Task 2: Wall-constrained room-zone engine

**Files:**
- Create: `services/mitunet/viewer/room-floor-zones.mjs`
- Create: `services/mitunet/tests_js/room-floor-zones.test.mjs`
- Modify: `services/mitunet/viewer/floor-finishes.mjs`

**Interfaces:**
- Consumes: `{ rooms, polygons, openings, width, height, interiorMask, sourceRgba }`.
- Produces: `buildRoomFloorMaterialMap(input): { version: 1, width, height, encoding: "rle-u8", labels, zones }`.
- Produces: `decodeRoomFloorLabels(map): Uint8Array`.
- Produces: `buildFloorFinishRgba({ interiorMask, floorMaterials, width, height }): Uint8ClampedArray`.

- [ ] **Step 1: Write failing material-mapping and RLE tests**

Test exact mappings:

```js
assert.equal(materialForRoomLabel("침실"), "WOOD");
assert.equal(materialForRoomLabel("거실"), "WOOD");
assert.equal(materialForRoomLabel("주방/식당"), "KITCHEN_FLOOR");
assert.equal(materialForRoomLabel("욕실"), "TILE");
assert.equal(materialForRoomLabel("다용도실"), "TILE");
assert.equal(materialForRoomLabel("발코니"), "BALCONY_TILE");

const labels = Uint8Array.from([0, 0, 1, 1, 1, 2, 2, 0]);
assert.deepEqual(decodeRoomFloorLabels(encodeRoomFloorLabels(labels, 4, 2)), labels);
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test services/mitunet/tests_js/room-floor-zones.test.mjs`

Expected: FAIL with module-not-found for `room-floor-zones.mjs`.

- [ ] **Step 3: Implement material mapping and compact RLE**

Implement label normalization that removes whitespace and punctuation, then matches Korean and English room names. Encode labels as comma-separated `count:value` runs and validate decoded length against `width * height`.

```js
function normalizedRoomLabel(label) {
  return String(label ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function materialForRoomLabel(label) {
  const value = normalizedRoomLabel(label);
  if (/발코니|베란다|balcony|veranda/.test(value)) return "BALCONY_TILE";
  if (/욕실|화장실|bathroom|toilet/.test(value)) return "TILE";
  if (/다용도실|세탁실|utility|laundry/.test(value)) return "TILE";
  if (/주방|식당|부엌|kitchen|dining/.test(value)) return "KITCHEN_FLOOR";
  if (/현관|entrance|foyer/.test(value)) return "STONE_TILE";
  return "WOOD";
}

export function encodeRoomFloorLabels(labels, width, height) {
  if (!(labels instanceof Uint8Array) || labels.length !== width * height) {
    throw new RangeError("Room floor label dimensions do not match");
  }
  const runs = [];
  for (let start = 0; start < labels.length;) {
    const value = labels[start];
    let end = start + 1;
    while (end < labels.length && labels[end] === value) end += 1;
    runs.push(`${end - start}:${value}`);
    start = end;
  }
  return { version: 1, width, height, encoding: "rle-u8", labels: runs.join(",") };
}

export function decodeRoomFloorLabels(map) {
  const length = Number(map?.width) * Number(map?.height);
  if (map?.version !== 1 || map?.encoding !== "rle-u8" || !Number.isSafeInteger(length) || length < 1) {
    throw new TypeError("Invalid room floor material map");
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const run of String(map.labels).split(",")) {
    const match = /^(\d+):(\d+)$/.exec(run);
    if (!match) throw new TypeError("Invalid room floor label run");
    const count = Number(match[1]);
    const value = Number(match[2]);
    if (!count || value > 255 || offset + count > output.length) throw new RangeError("Invalid room floor label run");
    output.fill(value, offset, offset + count);
    offset += count;
  }
  if (offset !== output.length) throw new RangeError("Room floor label map is incomplete");
  return output;
}
```

- [ ] **Step 4: Verify mapping and RLE GREEN**

Run: `node --test services/mitunet/tests_js/room-floor-zones.test.mjs`

Expected: mapping and round-trip tests PASS.

- [ ] **Step 5: Write the failing wall-boundary partition test**

Create a 48x24 synthetic plan containing two rooms separated by a vertical wall with one door polygon. Provide one seed per room and assert every labeled pixel stays on its side while door pixels still receive flooring:

```js
const map = buildRoomFloorMaterialMap({
  width: 48,
  height: 24,
  interiorMask,
  polygons,
  openings: [],
  rooms: [
    { label: "침실", confidence: 0.98, polygon: normalizedBox(6, 6, 18, 18, 48, 24) },
    { label: "욕실", confidence: 0.97, polygon: normalizedBox(30, 6, 42, 18, 48, 24) }
  ]
});
const decoded = decodeRoomFloorLabels(map);
assert.equal(decoded[12 * 48 + 12], 1);
assert.equal(decoded[12 * 48 + 36], 2);
assert.equal(decoded[12 * 48 + 24] > 0, true);
assert.equal([...leftSide(decoded)].includes(2), false);
assert.equal([...rightSide(decoded)].includes(1), false);
```

- [ ] **Step 6: Verify the partition test RED**

Run: `node --test services/mitunet/tests_js/room-floor-zones.test.mjs`

Expected: FAIL because `buildRoomFloorMaterialMap` is not implemented.

- [ ] **Step 7: Implement seed relocation and multi-source region growth**

Implementation requirements:

```js
export function buildRoomFloorMaterialMap({ rooms, polygons, openings, width, height, interiorMask, sourceRgba }) {
  // 1. Convert each 0..1000 polygon centroid to source pixels.
  // 2. Mark sourceRgba pixels with RGB <= 96 as visual barriers inside the interior.
  // 3. Relocate a seed to the closest interior pixel when it lands on a wall/fixture.
  // 4. Rasterize wall + window + door polygons into the same temporary flood barrier.
  // 5. Close only 1-2 pixel seams in the temporary barrier.
  // 6. Multi-source BFS over interiorMask, never crossing the temporary barrier.
  // 7. Re-open door pixels and assign them to the nearest adjacent zone.
  // 8. Return RLE labels plus ordered zone metadata.
}
```

Reject more than 64 rooms, dimensions above 4096x4096, non-finite coordinates, or confidence below `0.45`. Never mutate `polygons`.

- [ ] **Step 8: Add deterministic texture tests**

Extend `floor-finishes.test.mjs` to assert that `buildFloorFinishRgba()` produces distinct RGB values for WOOD, TILE, and BALCONY_TILE while leaving label zero transparent. Verify the legacy call without `floorMaterials` still produces the current wood pixels.

- [ ] **Step 9: Implement deterministic floor patterns**

Move the existing wood pixel calculation from `index.html` into `buildFloorFinishRgba()` and add tile patterns selected by zone material. The output must depend only on `(x, y, material)` and not `Math.random()`.

- [ ] **Step 10: Run all MitUNet viewer tests**

Run: `node --test services/mitunet/tests_js/*.test.mjs`

Expected: all tests PASS, including existing wall, room-area, furniture, export, and view-transition tests.

- [ ] **Step 11: Commit Task 2**

```bash
git add services/mitunet/viewer/room-floor-zones.mjs services/mitunet/viewer/floor-finishes.mjs services/mitunet/tests_js/room-floor-zones.test.mjs services/mitunet/tests_js/floor-finishes.test.mjs
git commit -m "feat(floor-plan): generate wall-bound room floor zones"
```

---

### Task 3: Furniture-stage analysis and texture swap

**Files:**
- Modify: `services/mitunet/viewer/index.html`
- Create: `services/mitunet/tests_js/furnishing-floor-materials.test.mjs`
- Modify: `services/mitunet/viewer/plan-export.mjs`
- Modify: `services/mitunet/tests_js/plan-export.test.mjs`

**Interfaces:**
- Consumes: `POST /room-materials` result from Task 1.
- Consumes: `buildRoomFloorMaterialMap()` and `buildFloorFinishRgba()` from Task 2.
- Produces: `currentComposedPlan.floor_materials` before the furnishing floor becomes visible.

- [ ] **Step 1: Write the failing furnishing-stage source test**

Require `enterFurnishingStage()` to await a room-material helper before it sets furnishing visibility:

```js
assert.match(indexSource, /async function ensureRoomFloorMaterials/);
const enterBody = functionBody(indexSource, "enterFurnishingStage");
assert.ok(enterBody.indexOf("await ensureRoomFloorMaterials") < enterBody.indexOf("setFurnishingVisibility(true)"));
assert.match(indexSource, /currentComposedPlan\.floor_materials/);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test services/mitunet/tests_js/furnishing-floor-materials.test.mjs`

Expected: FAIL because the helper and persisted field are absent.

- [ ] **Step 3: Extract a reusable floor mesh rebuild function**

Replace inline wood pixel generation with:

```js
function rebuildFloorFinish(data, scale, cx, cy, hasPhysicalScale, furnitureSceneScale) {
  const interiorMask = buildInteriorMask(data.polygons ?? {}, width, height, data.openings ?? []);
  const pixels = buildFloorFinishRgba({
    floorMaterials: data.floor_materials,
    height,
    interiorMask,
    width
  });
  // Preserve existing plane alignment and floorPlacementState.
}
```

Do not touch `planGroup`, wall animation arrays, or geometry composition.

- [ ] **Step 4: Implement lazy classification before furnishing visibility**

Add:

```js
async function ensureRoomFloorMaterials() {
  if (currentComposedPlan?.floor_materials || !currentComposedPlan?.input_image_b64) return;
  const response = await fetch("/room-materials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl: `data:image/png;base64,${currentComposedPlan.input_image_b64}` })
  });
  if (!response.ok) return;
  const analysis = await response.json();
  if (analysis.status !== "ready" || !analysis.rooms?.length) return;
  const sourceRgba = await decodePngDataUrlToRgba(
    `data:image/png;base64,${currentComposedPlan.input_image_b64}`,
    currentComposedPlan.canvas_size[0],
    currentComposedPlan.canvas_size[1],
  );
  const interiorMask = buildInteriorMask(
    currentComposedPlan.polygons ?? {},
    currentComposedPlan.canvas_size[0],
    currentComposedPlan.canvas_size[1],
    currentComposedPlan.openings ?? [],
  );
  currentComposedPlan.floor_materials = buildRoomFloorMaterialMap({
    rooms: analysis.rooms,
    polygons: currentComposedPlan.polygons,
    openings: currentComposedPlan.openings,
    width: currentComposedPlan.canvas_size[0],
    height: currentComposedPlan.canvas_size[1],
    interiorMask,
    sourceRgba,
  });
  rebuildFloorFinish(currentComposedPlan, floorFinishLayout);
}
```

`floorFinishLayout` is assigned in `loadPlan()` as `{ scale, cx, cy, hasPhysicalScale, furnitureSceneScale }`. `decodePngDataUrlToRgba()` uses an `Image`, an offscreen canvas, and `getImageData()` to return a `Uint8ClampedArray` at the exact plan canvas dimensions.

In `enterFurnishingStage()`, show a status message, await the helper, then switch visibility. Catch errors and keep the existing wood fallback without blocking furniture placement.

- [ ] **Step 5: Persist `floor_materials` in JSON export**

Update project export cloning to retain a validated `floor_materials` object. Add a test asserting save/load round-trip keeps its version, dimensions, labels, and zone metadata.

- [ ] **Step 6: Run furnishing and export tests GREEN**

Run: `node --test services/mitunet/tests_js/furnishing-floor-materials.test.mjs services/mitunet/tests_js/plan-export.test.mjs`

Expected: both test files PASS.

- [ ] **Step 7: Run all MitUNet viewer tests**

Run: `node --test services/mitunet/tests_js/*.test.mjs`

Expected: all tests PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add services/mitunet/viewer/index.html services/mitunet/viewer/plan-export.mjs services/mitunet/tests_js/furnishing-floor-materials.test.mjs services/mitunet/tests_js/plan-export.test.mjs
git commit -m "feat(floor-plan): apply room materials before furnishing"
```

---

### Task 4: RoomLog payload persistence and saved 3D rendering

**Files:**
- Modify: `services/mitunet/viewer/roomlog-integration.mjs`
- Modify: `services/mitunet/tests_js/roomlog-integration.test.mjs`
- Modify: `apps/web/src/lib/mitunet-floor-plan.ts`
- Modify: `apps/web/src/lib/mitunet-floor-plan.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/mitunet-surfaces.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/mitunet-surfaces.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/mitunet-textures.ts`
- Modify: `apps/web/src/app/floor-plan-3d/room-scene/mitunet-surface-style-parity.spec.ts`

**Interfaces:**
- Consumes: `plan.floor_materials` from Task 3.
- Produces: `MitunetFloorPlan.floorMaterials?: FloorMaterialMap`.
- Produces: saved RoomLog `mitunet.floorMaterials` and a corresponding Three.js canvas texture.

- [ ] **Step 1: Write failing integration payload tests**

Add a valid floor-material fixture to `roomlog-integration.test.mjs` and assert:

```js
assert.deepEqual(message.payload.floorMaterials, plan.floor_materials);
assert.notEqual(message.payload.floorMaterials, plan.floor_materials);
```

The second assertion guarantees a clone rather than shared mutable state.

- [ ] **Step 2: Verify integration test RED**

Run: `node --test services/mitunet/tests_js/roomlog-integration.test.mjs`

Expected: FAIL because `floorMaterials` is missing.

- [ ] **Step 3: Clone the validated map into RoomLog completion payload**

Add a `cloneFloorMaterials()` validator that accepts version `1`, dimensions matching `canvas_size`, `encoding: "rle-u8"`, a bounded string label payload, and at most 64 zones. Return `undefined` for invalid maps, preserving legacy behavior.

- [ ] **Step 4: Write failing TypeScript normalization tests**

In `mitunet-floor-plan.spec.ts`, verify:

```ts
assert.equal(normalizeMitunetPayload({ ...basePlan, floorMaterials: validMap })?.floorMaterials?.version, 1);
assert.equal(normalizeMitunetPayload({ ...basePlan, floorMaterials: invalidMap })?.floorMaterials, undefined);
assert.equal(normalizeMitunetPayload(basePlan)?.floorMaterials, undefined);
```

- [ ] **Step 5: Extend `MitunetFloorPlan` with optional validated materials**

Define `FloorMaterialKind`, `FloorMaterialZone`, and `FloorMaterialMap` in `mitunet-floor-plan.ts`. Validate bounded dimensions, RLE string length, zone count, confidence, seed coordinates, and known material enum values. Do not reject the entire legacy plan when the optional map is invalid; drop only `floorMaterials`.

- [ ] **Step 6: Verify normalization GREEN**

Run: `pnpm --filter web run test:unit -- mitunet-floor-plan.spec.ts`

Expected: normalization tests PASS.

- [ ] **Step 7: Write failing saved-render texture test**

Add a test that decodes a two-zone map and asserts distinct material pixels. Also retain the existing test that a legacy plan produces a wood-only mask.

- [ ] **Step 8: Implement saved-view material texture generation**

Add a pure `buildFloorMaterialRgba(plan)` helper in `mitunet-surfaces.ts`. Change `createWoodTexture(plan)` to `createFloorTexture(plan)` in `mitunet-textures.ts`; it uses `plan.floorMaterials` when valid and otherwise calls the current `buildWoodRgba()` fallback. Update `RoomlogThreeFloorPlanView.tsx` only at the import/call name if necessary; do not change `MitunetFloorPlanMeshes`.

- [ ] **Step 9: Run focused web scene tests**

Run: `pnpm --filter web run test:unit -- mitunet-floor-plan.spec.ts mitunet-surfaces.spec.ts mitunet-surface-style-parity.spec.ts`

Expected: all focused tests PASS.

- [ ] **Step 10: Commit Task 4**

```bash
git add services/mitunet/viewer/roomlog-integration.mjs services/mitunet/tests_js/roomlog-integration.test.mjs apps/web/src/lib/mitunet-floor-plan.ts apps/web/src/lib/mitunet-floor-plan.spec.ts apps/web/src/app/floor-plan-3d/room-scene/mitunet-surfaces.ts apps/web/src/app/floor-plan-3d/room-scene/mitunet-surfaces.spec.ts apps/web/src/app/floor-plan-3d/room-scene/mitunet-textures.ts apps/web/src/app/floor-plan-3d/room-scene/mitunet-surface-style-parity.spec.ts apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx
git commit -m "feat(floor-plan): persist and render room floor materials"
```

---

### Task 5: Full regression and local browser verification

**Files:**
- Modify only if a verified regression requires a focused fix.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: verified RoomLog behavior on port 3000 with the Naver floor plan.

- [ ] **Step 1: Run the complete MitUNet viewer suite**

Run: `node --test services/mitunet/tests_js/*.test.mjs`

Expected: zero failures.

- [ ] **Step 2: Run the complete web unit suite**

Run: `pnpm --filter web run test:unit`

Expected: zero failures.

- [ ] **Step 3: Build the web application**

Run: `pnpm --filter web run build`

Expected: Next.js build exits `0` with no TypeScript errors.

- [ ] **Step 4: Start or rebuild the local services**

Run: `docker compose up -d --build web api`

Confirm: `http://localhost:3000/floor-plan-3d/mitunet` returns HTTP `200` and `http://127.0.0.1:8012/healthz` reports `ok: true`.

- [ ] **Step 5: Verify the real Naver plan in the browser**

Use `C:\Users\smoun\OneDrive\Desktop\도면\naver\naver\images\naver_125_86_63.98.jpg`:

1. Upload the image.
2. Complete the existing structural review without changing wall geometry.
3. Show 3D and record wall/window counts.
4. Enter furniture placement and wait for room-material analysis.
5. Confirm bedrooms/living use wood, bath/utility use tile, balcony uses balcony tile, and the exterior corridor remains unfilled.
6. Leave and re-enter furnishing; confirm there is no second analysis request.
7. Save back to RoomLog and reopen; confirm materials remain identical.
8. Confirm wall/window counts are unchanged from step 3.

- [ ] **Step 6: Inspect the final diff for wall isolation**

Run:

```bash
git diff --name-only HEAD~4..HEAD
git diff HEAD~4..HEAD -- services/mitunet/buildingcv apps/web/src/app/floor-plan-3d/room-model apps/web/src/app/floor-plan-3d/plan-extraction
```

Expected: the second command has no output.

- [ ] **Step 7: Record final verification status**

Report exact test counts, build exit status, local URLs, and any fallback behavior observed. Do not claim completion if the real-image furnishing-stage verification fails.
