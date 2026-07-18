# Interior And Exterior Wall Dimensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wall-centerline overlay with calibrated arrow dimensions for exterior wall faces and both room-facing sides of interior walls, while treating attached doors and windows as continuous wall spans.

**Architecture:** `viewer/wall-dimensions.mjs` will build a dimension-only copy of the current wall mask, bridge valid attached openings, flood-fill empty regions, and trace wall faces bordering exterior or interior space. `ReviewEditor` will cache those face segments after manual calibration or committed wall/opening edits and render fixed-screen-size extension lines, inward arrowheads, and millimeter labels without changing any 3D input.

**Tech Stack:** JavaScript ES modules, Canvas 2D, typed arrays, Node built-in test runner.

## Global Constraints

- Never mutate `ReviewDocument.wallMask` while calculating dimensions.
- Both valid attached doors and windows preserve one continuous measurement run.
- Exterior faces measure the building's outside surface; interior partitions expose and measure both room-facing surfaces.
- Show dimensions only after manual two-point calibration, never from the automatic door-width estimate.
- Do not modify wall detection, opening alignment, compose payloads, saved plans, or 3D wall generation.
- Keep all calculations browser-local with no new dependency, server call, or GPU request.
- Do not create Git commits unless the user explicitly asks.

---

### Task 1: Dimension-Only Structure Mask And Empty-Space Classification

**Files:**
- Modify: `viewer/wall-dimensions.mjs`
- Modify: `tests_js/wall-dimensions.test.mjs`

**Interfaces:**
- Consumes: `Uint8Array wallMask`, `Array<Opening> openings`, integer `width`, integer `height`.
- Produces: `buildDimensionStructureMask(wallMask, openings, width, height, options) -> Uint8Array`.
- Produces: `classifyEmptyRegions(structureMask, width, height) -> { regionIds: Int32Array, regions: Array<{ id:number, exterior:boolean }> }`.

- [ ] **Step 1: Replace centerline tests with failing virtual-mask tests**

Add a mask helper that creates two collinear wall rectangles separated by an opening. Assert all of the following:

```js
const original = Uint8Array.from(mask);
const bridged = buildDimensionStructureMask(mask, [{
  id: "door-1",
  kind: "door",
  axis: "horizontal",
  center_x: 50,
  center_y: 40,
  width: 20,
  height: 8,
  valid: true,
}], width, height);

assert.deepEqual(mask, original);
assert.equal(bridged[40 * width + 50], 1);
```

Repeat with `kind: "window"`. For `valid: false`, assert the center of the gap stays zero. Add a closed rectangular wall test and assert the border-connected empty region has `exterior: true` while the enclosed room has `exterior: false`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests_js/wall-dimensions.test.mjs
```

Expected: FAIL because `buildDimensionStructureMask` and `classifyEmptyRegions` are not exported.

- [ ] **Step 3: Implement the dimension-only mask copy**

Replace the skeletonization entry point with:

```js
export function buildDimensionStructureMask(
  wallMask,
  openings,
  width,
  height,
  { bridgeMarginPixels = 2 } = {},
) {
  validateMask(wallMask, width, height);
  const structure = Uint8Array.from(wallMask, value => value ? 1 : 0);
  for (const opening of openings ?? []) {
    if (opening?.valid !== true) continue;
    const alongHorizontal = opening.axis === "horizontal" ||
      (opening.axis !== "vertical" && Number(opening.width) >= Number(opening.height));
    const halfWidth = Math.max(1, Number(opening.width) / 2);
    const halfHeight = Math.max(1, Number(opening.height) / 2);
    const alongMargin = 1;
    const crossMargin = Number(bridgeMarginPixels);
    const left = Math.floor(Number(opening.center_x) - halfWidth - (alongHorizontal ? alongMargin : crossMargin));
    const right = Math.ceil(Number(opening.center_x) + halfWidth + (alongHorizontal ? alongMargin : crossMargin));
    const top = Math.floor(Number(opening.center_y) - halfHeight - (alongHorizontal ? crossMargin : alongMargin));
    const bottom = Math.ceil(Number(opening.center_y) + halfHeight + (alongHorizontal ? crossMargin : alongMargin));
    fillClippedRectangle(structure, width, height, left, top, right, bottom);
  }
  return structure;
}
```

`fillClippedRectangle` must clamp every bound to the image and set only the copied array.

- [ ] **Step 4: Implement four-neighbor empty-region flood fill**

Initialize `regionIds` to `-1`, scan every empty pixel, and run a typed-array queue over north/east/south/west neighbors. Mark a region exterior when any member has `x === 0`, `y === 0`, `x === width - 1`, or `y === height - 1`. Return stable numeric ids used by face extraction.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the command from Step 2.

Expected: door and window spans bridge only in the copied mask, invalid openings remain gaps, and exterior/interior regions are classified correctly.

---

### Task 2: Exterior And Interior Wall-Face Extraction

**Files:**
- Modify: `viewer/wall-dimensions.mjs`
- Modify: `tests_js/wall-dimensions.test.mjs`

**Interfaces:**
- Consumes: the Task 1 structure mask and empty-region classification.
- Produces: `extractWallFaceDimensions(wallMask, openings, width, height, options) -> Array<WallFaceDimension>`.
- `WallFaceDimension` is `{ start:{x:number,y:number}, end:{x:number,y:number}, normal:{x:number,y:number}, lengthPixels:number, face:"exterior"|"interior", regionId:number }`.

- [ ] **Step 1: Write failing face-extraction tests**

For a closed thick rectangular wall, assert four long exterior segments and four long interior segments exist. For a vertical partition inside the rectangle, locate the two long partition faces and assert their normals point into opposite room regions. Add separate door and window gaps to one wall face and assert each produces one long segment spanning across the opening rather than two short segments.

Use orientation-independent assertions:

```js
const horizontalExterior = dimensions.filter(item =>
  item.face === "exterior" &&
  Math.abs(item.end.x - item.start.x) > Math.abs(item.end.y - item.start.y),
);
assert.equal(horizontalExterior.length, 2);
assert.ok(horizontalExterior.every(item => item.lengthPixels >= 79));
```

For an invalid detached opening, assert no full-length bridged segment is emitted across its gap.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests_js/wall-dimensions.test.mjs
```

Expected: FAIL because `extractWallFaceDimensions` is not exported.

- [ ] **Step 3: Generate consistently oriented unit boundary edges**

For every structure pixel, emit an edge only when the neighboring pixel is empty. Orient all edges so the adjacent empty region stays on the left in image coordinates:

```js
const boundaryTemplates = [
  { dx: 0, dy: -1, start: [0, 0], end: [1, 0], direction: 0 },
  { dx: 1, dy: 0, start: [1, 0], end: [1, 1], direction: 1 },
  { dx: 0, dy: 1, start: [1, 1], end: [0, 1], direction: 2 },
  { dx: -1, dy: 0, start: [0, 1], end: [0, 0], direction: 3 },
];
```

Attach the neighboring `regionId` and its exterior flag to each edge. Out-of-image neighbors use a dedicated exterior region id.

- [ ] **Step 4: Trace and simplify each region's face contours**

Index edges by `regionId` and start vertex. Trace unused edges from end vertex to the next edge, preferring direction changes in this order: right turn, straight, left turn, reverse. This preserves the empty-space-left orientation at point-touch ambiguities. Simplify open chains with Ramer-Douglas-Peucker; split closed loops at a farthest vertex pair and simplify both halves.

Convert every consecutive simplified point pair into a segment. Its empty-space normal is:

```js
const deltaX = end.x - start.x;
const deltaY = end.y - start.y;
const lengthPixels = Math.hypot(deltaX, deltaY);
const normal = { x: deltaY / lengthPixels, y: -deltaX / lengthPixels };
```

Filter segments shorter than `minimumLengthPixels` and retain the region's `exterior` classification as `face`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the command from Step 2.

Expected: exterior and interior faces are distinct, both partition sides remain, attached doors/windows produce continuous runs, and invalid openings do not bridge.

---

### Task 3: Arrow Dimension Rendering And Edit Refresh

**Files:**
- Modify: `viewer/review-editor.mjs`
- Modify: `tests_js/review-editor.test.mjs`

**Interfaces:**
- Consumes: `extractWallFaceDimensions` and `formatWallLength` from Task 2.
- Produces: `ReviewEditor.refreshWallDimensions()` using both `document.wallMask` and `document.openings`.
- Produces: `ReviewEditor.drawWallDimensions()` rendering face-offset extension lines, arrowheads, and labels.

- [ ] **Step 1: Write failing editor tests for face data and arrow geometry**

Replace the old centerline drawing probe with a face segment containing `normal: { x: 0, y: -1 }`. Record canvas `moveTo` and `lineTo` calls and assert the dimension line is offset above the source face and includes more than one pair of arrowhead strokes. Keep the existing assertion that estimated calibration draws no labels and manual calibration draws `"1,000 mm"`.

Add an opening-edit lifecycle probe:

```js
editor.calibration = { millimetersPerPixel: 10 };
editor.refreshWallDimensions = () => calls.push("dimensions");
editor.finishDocumentChange(true);
assert.deepEqual(calls, ["dimensions", "render", "change"]);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --test tests_js/review-editor.test.mjs tests_js/wall-dimensions.test.mjs
```

Expected: FAIL because the editor still imports centerline extraction, ignores openings during refresh, and draws ticks instead of arrowheads offset by the face normal.

- [ ] **Step 3: Integrate face extraction and centralized refresh**

Import `extractWallFaceDimensions`, then replace the refresh body with:

```js
this.wallDimensionSegments = extractWallFaceDimensions(
  this.document.wallMask,
  this.document.openings,
  INTERNAL_SIZE,
  INTERNAL_SIZE,
);
```

Move committed-edit refresh into `finishDocumentChange(changed)` so wall edits, opening add/move/resize/type/delete, undo, redo, and reset share one refresh path. Keep the explicit refresh in `applyCalibration`. Remove the old wall-only refresh to prevent duplicate calculations.

- [ ] **Step 4: Replace centerline ticks with architectural arrows**

Transform the face endpoints to screen coordinates and offset both by `normal * 16` screen pixels. Draw extension lines from the face endpoints to the offset endpoints. Draw the main line between offset endpoints. At the start, draw two strokes from the endpoint toward `start + tangent * 8 +/- normal * 4`; mirror them at the end toward `end - tangent * 8 +/- normal * 4`. Rotate the centered white label plate only enough to follow the line while keeping text upright.

- [ ] **Step 5: Run focused and regression tests**

Run:

```powershell
node --test tests_js/wall-dimensions.test.mjs tests_js/review-editor.test.mjs tests_js/review-document.test.mjs tests_js/roomlog-integration.test.mjs tests_js/plan-export.test.mjs
```

Expected: all tests pass and no saved-plan or RoomLog integration shape changes.

---

### Task 4: Live RoomLog Verification

**Files:**
- Verify only: `viewer/wall-dimensions.mjs`
- Verify only: `viewer/review-editor.mjs`

**Interfaces:**
- Consumes: RoomLog's existing `/floor-plan-3d/mitunet-assets/*` viewer proxy and `/floor-plan-3d/mitunet-api/*` inference proxy.
- Produces: confirmed 2D-only dimensions on the supplied floor plan.

- [ ] **Step 1: Verify proxied assets without restarting services**

Request the viewer page, `review-editor.mjs`, and `wall-dimensions.mjs` from port 3000. Expect HTTP 200 and confirm the editor asset contains `extractWallFaceDimensions`.

- [ ] **Step 2: Verify the user workflow**

Open `http://localhost:3000/floor-plan-3d/mitunet`, upload `C:\Users\smoun\OneDrive\Desktop\도면\APT_FP_STR_001681862_p0.png`, choose two scale points, and apply the known millimeter distance. Confirm exterior arrows sit outside, interior arrows sit inside both room faces, and walls continue through attached doors and windows.

- [ ] **Step 3: Verify 3D isolation**

Switch to Show 3D and back. Confirm 3D wall geometry is unchanged and the 2D arrow dimensions return without a GPU-service restart.
