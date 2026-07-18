# Wall Dimensions And Room Areas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every calibrated wall length with compact black collision-aware dimension lines and display the calculated area of each enclosed room of at least `1 m²` in the 2D review view.

**Architecture:** Keep measurement geometry derived and browser-local. A focused room-area module reuses the existing temporary wall/opening structure mask and empty-region classifier, while a separate screen-layout module assigns deterministic label lanes; `ReviewEditor` owns only lifecycle and canvas drawing.

**Tech Stack:** Browser JavaScript ES modules, Canvas 2D, `Uint8Array` raster masks, Node.js built-in test runner, Python `pytest` shell checks.

## Global Constraints

- Do not modify the reviewed wall mask, opening objects, mask-to-polygon conversion, or 3D wall generation.
- Keep every wall dimension; collision handling may move a label but may not hide it.
- Show measurements only after explicit manual calibration, never from the estimated door-width scale.
- Exclude enclosed regions smaller than exactly `1 m²`.
- Format wall lengths in millimetres and room areas to one decimal place in square metres.
- Keep all line widths, arrow sizes, label sizes, and lane offsets in screen pixels so zoom does not scale the UI styling.
- Add no runtime dependency.

---

### Task 1: Derive room areas from the reviewed 2D structure

**Files:**
- Create: `services/mitunet/viewer/room-areas.mjs`
- Create: `services/mitunet/tests_js/room-areas.test.mjs`

**Interfaces:**
- Consumes: `buildDimensionStructureMask(wallMask, openings, width, height)` and `classifyEmptyRegions(structureMask, width, height)` from `viewer/wall-dimensions.mjs`.
- Produces: `extractRoomAreas(wallMask, openings, width, height, millimetersPerPixel, options) -> Array<{ regionId, pixelCount, areaM2, anchor: { x, y } }>`.
- Produces: `formatRoomArea(areaM2) -> string`.

- [ ] **Step 1: Write failing region and formatting tests**

Create `tests_js/room-areas.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { extractRoomAreas, formatRoomArea } from "../viewer/room-areas.mjs";

const fill = (mask, width, left, top, right, bottom, value = 1) => {
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) mask[y * width + x] = value;
  }
};

const twoRoomPlan = () => {
  const width = 60;
  const height = 40;
  const mask = new Uint8Array(width * height);
  fill(mask, width, 4, 4, 56, 6);
  fill(mask, width, 4, 34, 56, 36);
  fill(mask, width, 4, 4, 6, 36);
  fill(mask, width, 54, 4, 56, 36);
  fill(mask, width, 29, 6, 31, 18);
  fill(mask, width, 29, 22, 31, 34);
  return { width, height, mask };
};

test("a valid door footprint separates two enclosed room areas", () => {
  const { width, height, mask } = twoRoomPlan();
  const rooms = extractRoomAreas(mask, [{
    id: "door-1",
    kind: "door",
    axis: "vertical",
    center_x: 30,
    center_y: 20,
    width: 2,
    height: 4,
    valid: true,
  }], width, height, 100, { minimumAreaM2: 1 });

  assert.equal(rooms.length, 2, JSON.stringify(rooms));
  assert.ok(rooms.every(room => room.areaM2 >= 1));
  assert.ok(rooms.every(room => room.anchor.x > 5 && room.anchor.x < 55));
  assert.ok(rooms.every(room => room.anchor.y > 5 && room.anchor.y < 35));
});

test("an invalid door does not invent a room boundary", () => {
  const { width, height, mask } = twoRoomPlan();
  const rooms = extractRoomAreas(mask, [{
    id: "door-invalid",
    kind: "door",
    axis: "vertical",
    center_x: 30,
    center_y: 20,
    width: 2,
    height: 4,
    valid: false,
  }], width, height, 100, { minimumAreaM2: 1 });

  assert.equal(rooms.length, 1);
});

test("regions below one square metre and exterior pixels are excluded", () => {
  const width = 30;
  const height = 30;
  const mask = new Uint8Array(width * height);
  fill(mask, width, 10, 10, 20, 11);
  fill(mask, width, 10, 19, 20, 20);
  fill(mask, width, 10, 10, 11, 20);
  fill(mask, width, 19, 10, 20, 20);

  assert.deepEqual(
    extractRoomAreas(mask, [], width, height, 100, { minimumAreaM2: 1 }),
    [],
  );
});

test("the chosen anchor is always a pixel inside its concave component", () => {
  const width = 40;
  const height = 40;
  const mask = new Uint8Array(width * height);
  fill(mask, width, 5, 5, 35, 7);
  fill(mask, width, 5, 33, 22, 35);
  fill(mask, width, 5, 5, 7, 35);
  fill(mask, width, 20, 18, 22, 35);
  fill(mask, width, 20, 18, 35, 20);
  fill(mask, width, 33, 5, 35, 20);

  const [room] = extractRoomAreas(mask, [], width, height, 100, { minimumAreaM2: 1 });
  assert.ok(room);
  assert.ok(Number.isInteger(room.anchor.x));
  assert.ok(Number.isInteger(room.anchor.y));
});

test("room areas use one decimal square-metre formatting", () => {
  assert.equal(formatRoomArea(10.24), "10.2 m²");
  assert.equal(formatRoomArea(10.25), "10.3 m²");
  assert.equal(formatRoomArea(Number.NaN), "");
  assert.equal(formatRoomArea(-1), "");
});
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run from `services/mitunet`:

```powershell
node --test tests_js/room-areas.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `viewer/room-areas.mjs`.

- [ ] **Step 3: Implement room extraction and formatting**

Create `viewer/room-areas.mjs`:

```js
import {
  buildDimensionStructureMask,
  classifyEmptyRegions,
} from "./wall-dimensions.mjs";

const validateScale = millimetersPerPixel => {
  const numeric = Number(millimetersPerPixel);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new RangeError("Millimeters per pixel must be a positive number");
  }
  return numeric;
};

export function extractRoomAreas(
  wallMask,
  openings,
  width,
  height,
  millimetersPerPixel,
  { minimumAreaM2 = 1 } = {},
) {
  const scale = validateScale(millimetersPerPixel);
  const minimum = Number(minimumAreaM2);
  if (!Number.isFinite(minimum) || minimum < 0) {
    throw new RangeError("Minimum room area must be a non-negative number");
  }

  const structure = buildDimensionStructureMask(wallMask, openings, width, height);
  const classification = classifyEmptyRegions(structure, width, height);
  const aggregates = new Map();

  for (let index = 0; index < classification.regionIds.length; index += 1) {
    const regionId = classification.regionIds[index];
    if (regionId < 0 || classification.regions[regionId]?.exterior) continue;
    const current = aggregates.get(regionId) ?? { regionId, pixelCount: 0, sumX: 0, sumY: 0 };
    current.pixelCount += 1;
    current.sumX += index % width;
    current.sumY += Math.floor(index / width);
    aggregates.set(regionId, current);
  }

  const squareMetersPerPixel = scale * scale / 1_000_000;
  const accepted = new Map();
  for (const aggregate of aggregates.values()) {
    const areaM2 = aggregate.pixelCount * squareMetersPerPixel;
    if (areaM2 < minimum) continue;
    accepted.set(aggregate.regionId, {
      regionId: aggregate.regionId,
      pixelCount: aggregate.pixelCount,
      areaM2,
      centroidX: aggregate.sumX / aggregate.pixelCount,
      centroidY: aggregate.sumY / aggregate.pixelCount,
      bestDistance: Number.POSITIVE_INFINITY,
      anchor: null,
    });
  }

  for (let index = 0; index < classification.regionIds.length; index += 1) {
    const room = accepted.get(classification.regionIds[index]);
    if (!room) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const distance = (x - room.centroidX) ** 2 + (y - room.centroidY) ** 2;
    if (distance < room.bestDistance) {
      room.bestDistance = distance;
      room.anchor = { x, y };
    }
  }

  return [...accepted.values()]
    .map(({ centroidX, centroidY, bestDistance, ...room }) => room)
    .sort((first, second) => first.regionId - second.regionId);
}

export function formatRoomArea(areaM2) {
  const numeric = Number(areaM2);
  if (!Number.isFinite(numeric) || numeric < 0) return "";
  return `${numeric.toFixed(1)} m²`;
}
```

- [ ] **Step 4: Run the focused room-area tests**

Run:

```powershell
node --test tests_js/room-areas.test.mjs
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit the room-area geometry**

```powershell
git add -- viewer/room-areas.mjs tests_js/room-areas.test.mjs
git commit -m "feat: derive calibrated room areas"
```

---

### Task 2: Assign compact collision-aware dimension lanes

**Files:**
- Create: `services/mitunet/viewer/measurement-layout.mjs`
- Create: `services/mitunet/tests_js/measurement-layout.test.mjs`

**Interfaces:**
- Consumes: stable ordered label candidates `{ id, anchor, normal, width, height, angle }` and reserved area-label bounds.
- Produces: `layoutDimensionLabels(candidates, reservedBounds, options) -> Array<candidate & { offset, center, bounds }>`.
- Produces: `boundsOverlap(first, second, padding) -> boolean` for deterministic unit tests.

- [ ] **Step 1: Write failing collision and completeness tests**

Create `tests_js/measurement-layout.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import { boundsOverlap, layoutDimensionLabels } from "../viewer/measurement-layout.mjs";

const candidate = (id, x, y) => ({
  id,
  anchor: { x, y },
  normal: { x: 0, y: -1 },
  width: 64,
  height: 18,
  angle: 0,
});

test("overlapping labels move to outward deterministic lanes", () => {
  const layout = layoutDimensionLabels([
    candidate("first", 100, 100),
    candidate("second", 110, 100),
  ]);

  assert.deepEqual(layout.map(item => item.id), ["first", "second"]);
  assert.equal(layout[0].offset, 14);
  assert.equal(layout[1].offset, 34);
  assert.equal(boundsOverlap(layout[0].bounds, layout[1].bounds, 2), false);
});

test("reserved room labels push dimensions outward without hiding them", () => {
  const reserved = [{ left: 60, top: 72, right: 140, bottom: 96 }];
  const layout = layoutDimensionLabels([candidate("wall", 100, 100)], reserved);

  assert.equal(layout.length, 1);
  assert.ok(layout[0].offset > 14);
  assert.equal(boundsOverlap(layout[0].bounds, reserved[0], 2), false);
});

test("all input dimensions are returned in input order", () => {
  const input = Array.from({ length: 12 }, (_, index) => candidate(`wall-${index}`, 100, 100));
  const layout = layoutDimensionLabels(input);

  assert.equal(layout.length, input.length);
  assert.deepEqual(layout.map(item => item.id), input.map(item => item.id));
  assert.ok(layout.every((item, index) => item.offset === 14 + index * 20));
});
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run:

```powershell
node --test tests_js/measurement-layout.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `viewer/measurement-layout.mjs`.

- [ ] **Step 3: Implement deterministic rotated label bounds and lanes**

Create `viewer/measurement-layout.mjs`:

```js
export function boundsOverlap(first, second, padding = 0) {
  return !(
    first.right + padding <= second.left ||
    second.right + padding <= first.left ||
    first.bottom + padding <= second.top ||
    second.bottom + padding <= first.top
  );
}

const rotatedBounds = (center, width, height, angle) => {
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  const halfWidth = (width * cosine + height * sine) / 2;
  const halfHeight = (width * sine + height * cosine) / 2;
  return {
    left: center.x - halfWidth,
    top: center.y - halfHeight,
    right: center.x + halfWidth,
    bottom: center.y + halfHeight,
  };
};

export function layoutDimensionLabels(
  candidates,
  reservedBounds = [],
  { baseOffset = 14, laneStep = 20, collisionPadding = 2 } = {},
) {
  const occupied = reservedBounds.map(bounds => ({ ...bounds }));
  return candidates.map(candidate => {
    let lane = 0;
    let offset;
    let center;
    let bounds;
    do {
      offset = baseOffset + lane * laneStep;
      center = {
        x: candidate.anchor.x + candidate.normal.x * offset,
        y: candidate.anchor.y + candidate.normal.y * offset,
      };
      bounds = rotatedBounds(center, candidate.width, candidate.height, candidate.angle);
      lane += 1;
    } while (occupied.some(item => boundsOverlap(bounds, item, collisionPadding)));
    occupied.push(bounds);
    return { ...candidate, offset, center, bounds };
  });
}
```

- [ ] **Step 4: Run the focused layout tests**

Run:

```powershell
node --test tests_js/measurement-layout.test.mjs
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the layout helper**

```powershell
git add -- viewer/measurement-layout.mjs tests_js/measurement-layout.test.mjs
git commit -m "feat: lay out measurement labels without overlap"
```

---

### Task 3: Integrate black dimensions and room labels into ReviewEditor

**Files:**
- Modify: `services/mitunet/viewer/review-editor.mjs:1-6, 313-451, 597-744, 962-976, 1207-1217`
- Modify: `services/mitunet/tests_js/review-editor.test.mjs:1-120`

**Interfaces:**
- Consumes: `extractRoomAreas`, `formatRoomArea`, and `layoutDimensionLabels` from Tasks 1 and 2.
- Preserves: `refreshWallDimensions()` and `wallDimensionSegments` so wall-face extraction remains unchanged.
- Produces: `refreshRoomAreas()`, `buildRoomAreaLabelLayout()`, `drawRoomAreaLabels(layout)`, and derived `roomAreas` state.

- [ ] **Step 1: Extend ReviewEditor tests for lifecycle, black styling, completeness, and area drawing**

In `tests_js/review-editor.test.mjs`, enhance the existing canvas probe so `stroke()` records `{ strokeStyle, lineWidth }`, then replace the wall-dimension test and add these assertions:

```js
test("manual measurements draw every wall label with thin black strokes and room areas", () => {
  const labels = [];
  const strokes = [];
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() { strokes.push({ strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }); },
    fillRect() {},
    translate() {},
    rotate() {},
    measureText(label) { return { width: label.length * 7 }; },
    fillText(label) { labels.push(label); },
  };
  const editor = Object.create(ReviewEditor.prototype);
  editor.context = context;
  editor.viewport = { scale: 1, offsetX: 0, offsetY: 0 };
  editor.wallDimensionSegments = [
    {
      start: { x: 10, y: 20 }, end: { x: 110, y: 20 }, normal: { x: 0, y: -1 },
      lengthPixels: 100, face: "exterior", regionId: 0,
    },
    {
      start: { x: 20, y: 30 }, end: { x: 120, y: 30 }, normal: { x: 0, y: -1 },
      lengthPixels: 100, face: "interior", regionId: 1,
    },
  ];
  editor.roomAreas = [{ regionId: 2, pixelCount: 250, areaM2: 10.2, anchor: { x: 70, y: 80 } }];
  editor.calibration = { millimetersPerPixel: 10 };

  const roomLayout = editor.buildRoomAreaLabelLayout();
  editor.drawWallDimensions(roomLayout.map(item => item.bounds));
  editor.drawRoomAreaLabels(roomLayout);

  assert.deepEqual(labels.sort(), ["1,000 mm", "1,000 mm", "10.2 m²"].sort());
  assert.ok(strokes.some(item => item.strokeStyle === "#111827" && item.lineWidth === 1));
  assert.ok(strokes.some(item => item.strokeStyle === "rgba(17, 24, 39, 0.55)"));
});

test("estimated calibration never draws room areas", () => {
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = { wallMask: new Uint8Array(64), openings: [] };
  editor.calibration = { millimetersPerPixel: 100, estimated: true };
  editor.roomAreas = [{ areaM2: 2, anchor: { x: 2, y: 2 } }];

  assert.deepEqual(editor.refreshRoomAreas(8, 8), []);
  assert.deepEqual(editor.roomAreas, []);
});

test("applying manual calibration refreshes wall dimensions and room areas", () => {
  const calls = [];
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = { revision: 0 };
  editor.scalePoints = [{ x: 10, y: 20 }, { x: 110, y: 20 }];
  editor.refreshWallDimensions = () => calls.push("dimensions");
  editor.refreshRoomAreas = () => calls.push("areas");
  editor.render = () => calls.push("render");
  editor.onChange = () => calls.push("change");

  editor.applyCalibration(1000);

  assert.deepEqual(calls, ["dimensions", "areas", "render", "change"]);
});
```

- [ ] **Step 2: Run the editor tests and verify the new expectations fail**

Run:

```powershell
node --test tests_js/review-editor.test.mjs
```

Expected: FAIL because `buildRoomAreaLabelLayout`, `drawRoomAreaLabels`, and `refreshRoomAreas` do not exist and the current stroke is cyan.

- [ ] **Step 3: Add imports and derived room-area state**

Add these imports at the top of `viewer/review-editor.mjs`:

```js
import { layoutDimensionLabels } from "./measurement-layout.mjs";
import { extractRoomAreas, formatRoomArea } from "./room-areas.mjs";
```

Initialize `this.roomAreas = []` immediately after every initialization or reset of `this.wallDimensionSegments = []` in the constructor, `load`, `clearCalibration`, and the scale-tool branch that starts a replacement measurement.

- [ ] **Step 4: Refresh room measurements with manual calibration lifecycle**

Add this method after `refreshWallDimensions()`:

```js
  refreshRoomAreas(width = INTERNAL_SIZE, height = INTERNAL_SIZE) {
    if (!this.document?.wallMask || !this.calibration || this.calibration.estimated) {
      this.roomAreas = [];
      return this.roomAreas;
    }
    this.roomAreas = extractRoomAreas(
      this.document.wallMask,
      this.document.openings,
      width,
      height,
      this.calibration.millimetersPerPixel,
      { minimumAreaM2: 1 },
    );
    return this.roomAreas;
  }
```

In `applyCalibration`, call `this.refreshRoomAreas()` immediately after `this.refreshWallDimensions()`. In `finishDocumentChange`, call both refresh methods inside the existing manual-calibration guard. Clearing calibration must clear both arrays.

- [ ] **Step 5: Build fixed room-label layout and collision-aware dimension candidates**

Add these methods before `drawWallDimensions()`:

```js
  buildRoomAreaLabelLayout() {
    if (!this.calibration || this.calibration.estimated || !this.roomAreas?.length) return [];
    const context = this.context;
    context.save();
    context.font = "600 12px system-ui, sans-serif";
    const layout = this.roomAreas.map(room => {
      const label = formatRoomArea(room.areaM2);
      const center = this.imageToScreen(room.anchor.x, room.anchor.y);
      const width = context.measureText(label).width + 12;
      const height = 20;
      return {
        room,
        label,
        center,
        bounds: {
          left: center.x - width / 2,
          top: center.y - height / 2,
          right: center.x + width / 2,
          bottom: center.y + height / 2,
        },
      };
    });
    context.restore();
    return layout;
  }

  dimensionLabelLayout(reservedBounds = []) {
    const context = this.context;
    context.save();
    context.font = "600 11px system-ui, sans-serif";
    const candidates = this.wallDimensionSegments.map((segment, index) => {
      const start = this.imageToScreen(segment.start.x, segment.start.y);
      const end = this.imageToScreen(segment.end.x, segment.end.y);
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const screenLength = Math.hypot(deltaX, deltaY);
      if (!Number.isFinite(screenLength) || screenLength < 2) return null;
      let angle = Math.atan2(deltaY, deltaX);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
      const rawNormalX = Number(segment.normal?.x);
      const rawNormalY = Number(segment.normal?.y);
      const normalLength = Math.hypot(rawNormalX, rawNormalY);
      const normal = Number.isFinite(normalLength) && normalLength > 0
        ? { x: rawNormalX / normalLength, y: rawNormalY / normalLength }
        : { x: -deltaY / screenLength, y: deltaX / screenLength };
      const label = formatWallLength(
        segment.lengthPixels * Number(this.calibration.millimetersPerPixel),
      );
      return {
        id: `${segment.regionId}:${index}`,
        segment,
        start,
        end,
        tangent: { x: deltaX / screenLength, y: deltaY / screenLength },
        normal,
        anchor: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        width: context.measureText(label).width + 10,
        height: 18,
        angle,
        label,
        screenLength,
      };
    }).filter(Boolean);
    context.restore();
    return layoutDimensionLabels(candidates, reservedBounds, {
      baseOffset: 14,
      laneStep: 20,
      collisionPadding: 2,
    });
  }
```

- [ ] **Step 6: Replace cyan drawing with compact black drawing and add area labels**

Replace `drawWallDimensions()` with this complete method:

```js
  drawWallDimensions(reservedBounds = []) {
    if (
      !this.calibration ||
      this.calibration.estimated ||
      this.visibility?.wall === false ||
      !this.wallDimensionSegments?.length
    ) return;

    const millimetersPerPixel = Number(this.calibration.millimetersPerPixel);
    if (!Number.isFinite(millimetersPerPixel) || millimetersPerPixel <= 0) return;

    const context = this.context;
    const layout = this.dimensionLabelLayout(reservedBounds);
    context.save();
    context.font = "600 11px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (const item of layout) {
      const dimensionStart = {
        x: item.start.x + item.normal.x * item.offset,
        y: item.start.y + item.normal.y * item.offset,
      };
      const dimensionEnd = {
        x: item.end.x + item.normal.x * item.offset,
        y: item.end.y + item.normal.y * item.offset,
      };
      const arrowLength = Math.min(6, item.screenLength / 4);
      const arrowHalfWidth = 3;

      context.beginPath();
      context.strokeStyle = "rgba(17, 24, 39, 0.55)";
      context.lineWidth = 0.75;
      context.moveTo(item.start.x, item.start.y);
      context.lineTo(dimensionStart.x, dimensionStart.y);
      context.moveTo(item.end.x, item.end.y);
      context.lineTo(dimensionEnd.x, dimensionEnd.y);
      context.stroke();

      context.beginPath();
      context.strokeStyle = "#111827";
      context.lineWidth = 1;
      context.moveTo(dimensionStart.x, dimensionStart.y);
      context.lineTo(dimensionEnd.x, dimensionEnd.y);
      context.moveTo(dimensionStart.x, dimensionStart.y);
      context.lineTo(
        dimensionStart.x + item.tangent.x * arrowLength + item.normal.x * arrowHalfWidth,
        dimensionStart.y + item.tangent.y * arrowLength + item.normal.y * arrowHalfWidth,
      );
      context.moveTo(dimensionStart.x, dimensionStart.y);
      context.lineTo(
        dimensionStart.x + item.tangent.x * arrowLength - item.normal.x * arrowHalfWidth,
        dimensionStart.y + item.tangent.y * arrowLength - item.normal.y * arrowHalfWidth,
      );
      context.moveTo(dimensionEnd.x, dimensionEnd.y);
      context.lineTo(
        dimensionEnd.x - item.tangent.x * arrowLength + item.normal.x * arrowHalfWidth,
        dimensionEnd.y - item.tangent.y * arrowLength + item.normal.y * arrowHalfWidth,
      );
      context.moveTo(dimensionEnd.x, dimensionEnd.y);
      context.lineTo(
        dimensionEnd.x - item.tangent.x * arrowLength - item.normal.x * arrowHalfWidth,
        dimensionEnd.y - item.tangent.y * arrowLength - item.normal.y * arrowHalfWidth,
      );
      context.stroke();

      context.save();
      context.translate(item.center.x, item.center.y);
      context.rotate(item.angle);
      context.fillStyle = "rgba(255, 255, 255, 0.9)";
      context.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
      context.fillStyle = "#111827";
      context.fillText(item.label, 0, 0);
      context.restore();
    }
    context.restore();
  }
```

Add this complete room-label renderer:

```js
  drawRoomAreaLabels(layout) {
    if (!layout?.length) return;
    const context = this.context;
    context.save();
    context.font = "600 12px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const item of layout) {
      context.fillStyle = "rgba(255, 255, 255, 0.9)";
      context.fillRect(
        item.bounds.left,
        item.bounds.top,
        item.bounds.right - item.bounds.left,
        item.bounds.bottom - item.bounds.top,
      );
      context.fillStyle = "#111827";
      context.fillText(item.label, item.center.x, item.center.y);
    }
    context.restore();
  }
```

At the end of `render()`, replace `this.drawWallDimensions();` with:

```js
    const roomAreaLayout = this.buildRoomAreaLabelLayout();
    this.drawWallDimensions(roomAreaLayout.map(item => item.bounds));
    this.drawRoomAreaLabels(roomAreaLayout);
```

- [ ] **Step 7: Run focused integration tests**

Run:

```powershell
node --test tests_js/room-areas.test.mjs tests_js/measurement-layout.test.mjs tests_js/review-editor.test.mjs tests_js/wall-dimensions.test.mjs
```

Expected: all focused tests PASS, including every pre-existing wall-face extraction test.

- [ ] **Step 8: Commit ReviewEditor integration**

```powershell
git add -- viewer/review-editor.mjs tests_js/review-editor.test.mjs
git commit -m "feat: show clean wall dimensions and room areas"
```

---

### Task 4: Add shell regression checks and verify the complete viewer

**Files:**
- Modify: `services/mitunet/tests/test_viewer_shell.py:30-55`
- Verify: `services/mitunet/viewer/index.html`
- Verify: `services/mitunet/viewer/review-editor.mjs`

**Interfaces:**
- Consumes: the completed overlay modules and ReviewEditor integration.
- Produces: static regression coverage that the browser bundle references the black dimension and room-area paths without changing 3D construction.

- [ ] **Step 1: Add a failing viewer-shell regression test**

Extend `tests/test_viewer_shell.py` setup to also read `viewer/review-editor.mjs`, then add:

```python
    def test_manual_measurements_use_black_dimensions_and_room_area_overlay(self):
        self.assertIn('from "./room-areas.mjs"', self.editor)
        self.assertIn('from "./measurement-layout.mjs"', self.editor)
        self.assertIn('strokeStyle = "#111827"', self.editor)
        self.assertIn('strokeStyle = "rgba(17, 24, 39, 0.55)"', self.editor)
        self.assertIn("refreshRoomAreas()", self.editor)
        self.assertIn("drawRoomAreaLabels(roomAreaLayout)", self.editor)
        self.assertIn("{ minimumAreaM2: 1 }", self.editor)
```

In `setUpClass`, define:

```python
        cls.editor = (Path(__file__).parents[1] / "viewer" / "review-editor.mjs").read_text(
            encoding="utf-8"
        )
```

- [ ] **Step 2: Run the shell integration regression**

Run:

```powershell
& '.\.venv\Scripts\python.exe' -m pytest tests/test_viewer_shell.py -q -p no:cacheprovider
```

Expected: all viewer-shell tests PASS because Task 3 already provides the exact imports, styles, lifecycle calls, and `minimumAreaM2: 1` literal. A failure blocks completion and must be corrected only in the planned measurement files; do not edit `viewer/index.html` or any 3D mesh-building function.

- [ ] **Step 3: Run the full JavaScript and viewer-shell suites**

Run from `services/mitunet`:

```powershell
node --test tests_js/*.test.mjs
& '.\.venv\Scripts\python.exe' -m pytest tests/test_viewer_shell.py -q -p no:cacheprovider
```

Expected: every JavaScript test and every viewer-shell test PASS.

- [ ] **Step 4: Check scope and source cleanliness**

Run from the repository root:

```powershell
git diff --check -- services/mitunet/viewer/review-editor.mjs services/mitunet/viewer/room-areas.mjs services/mitunet/viewer/measurement-layout.mjs services/mitunet/tests_js/room-areas.test.mjs services/mitunet/tests_js/measurement-layout.test.mjs services/mitunet/tests_js/review-editor.test.mjs services/mitunet/tests/test_viewer_shell.py
git status --short
```

Expected: no whitespace errors; only the planned measurement files plus pre-existing untracked runtime directories appear.

- [ ] **Step 5: Manually verify the reference flow**

Open the local RoomLog page, upload the supplied apartment plan, choose two arbitrary Scale points, enter their real length, and verify:

- every former cyan wall dimension remains present in black;
- overlapping labels occupy adjacent outward lanes instead of covering one another;
- each enclosed region of at least `1 m²` shows one `m²` label;
- no area appears before manual calibration;
- Show 3D and return to Show Original preserve the overlay;
- the 3D wall geometry is unchanged.

- [ ] **Step 6: Commit the regression coverage**

```powershell
git add -- tests/test_viewer_shell.py
git commit -m "test: protect measurement overlay integration"
```
