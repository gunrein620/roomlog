# Free Scale Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the Scale tool to store exact clicks anywhere inside the plan image instead of requiring a nearby wall corner.

**Architecture:** Keep the existing screen-to-image conversion, image-boundary guard, calibration calculation, and dimension refresh. Replace only the scale-tool snap lookup with direct storage of the already validated image point, remove the now-unused snap helpers/state, and update user-facing copy from wall corners to generic points.

**Tech Stack:** Vanilla JavaScript ES modules, HTML, Node.js built-in test runner, Python `unittest`/pytest shell tests.

## Global Constraints

- Store the exact clamped image coordinate for every Scale click inside the 1024 × 1024 plan.
- Ignore clicks that start outside the plan image.
- Ignore a second click at the same coordinate so zero-length calibration remains impossible.
- A third click starts a new measurement and clears the previous manual calibration and cached wall dimensions.
- Do not change wall masks, opening detection, wall-face dimension calculation, 3D generation, or serialized calibration fields.
- Do not commit, push, merge, or discard the existing dirty working tree.
- Write each behavior test before its production change and observe the intended failure.

---

### Task 1: Replace corner snapping with exact Scale clicks

**Files:**
- Modify: `tests_js/review-editor.test.mjs:6-89, 330-380`
- Modify: `viewer/review-editor.mjs:7-120, 377-455, 490-503, 1024-1047`

**Interfaces:**
- Consumes: `ReviewEditor.handlePointerDown(event)`, `isPointInsideImage(point)`, `calibrationFromMeasurement(start, end, actualMillimeters)`.
- Produces: `ReviewEditor.scalePoints` containing exact `{ x: number, y: number }` image coordinates with no dependency on wall polygons.

- [ ] **Step 1: Add failing free-click behavior tests**

Remove `extractWallVertices` and `nearestVertex` from the test import destructuring and delete the three snap-specific tests. Rename the calibration test to `two selected points and a real length calculate millimeters per pixel`.

Add these tests after `outside image starts can be rejected before clamping`:

```js
const createScalePointerProbe = () => {
  const calls = [];
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = {};
  editor.tool = "scale";
  editor.gesture = null;
  editor.spacePressed = false;
  editor.scalePoints = [];
  editor.calibration = { millimetersPerPixel: 10 };
  editor.wallDimensionSegments = [{ lengthPixels: 10 }];
  editor.pointerScreenPoint = event => ({ x: event.clientX, y: event.clientY });
  editor.screenToImage = (x, y) => ({ x, y });
  editor.clampImagePoint = point => ({ ...point });
  editor.render = () => calls.push("render");
  editor.onChange = () => calls.push("change");
  return { editor, calls };
};

test("scale tool stores exact free click coordinates inside the image", () => {
  const { editor } = createScalePointerProbe();

  editor.handlePointerDown(pointerEvent(1, { clientX: 123.25, clientY: 456.75 }));
  editor.handlePointerDown(pointerEvent(1, { clientX: 800.5, clientY: 700.125 }));

  assert.deepEqual(editor.scalePoints, [
    { x: 123.25, y: 456.75 },
    { x: 800.5, y: 700.125 },
  ]);
});

test("scale tool ignores duplicate points and a third click starts a new measurement", () => {
  const { editor } = createScalePointerProbe();

  editor.handlePointerDown(pointerEvent(1, { clientX: 100, clientY: 200 }));
  editor.handlePointerDown(pointerEvent(1, { clientX: 100, clientY: 200 }));
  assert.deepEqual(editor.scalePoints, [{ x: 100, y: 200 }]);

  editor.handlePointerDown(pointerEvent(1, { clientX: 300, clientY: 400 }));
  editor.handlePointerDown(pointerEvent(1, { clientX: 500, clientY: 600 }));

  assert.deepEqual(editor.scalePoints, [{ x: 500, y: 600 }]);
  assert.equal(editor.calibration, null);
  assert.deepEqual(editor.wallDimensionSegments, []);
});

test("scale tool ignores clicks that start outside the image", () => {
  const { editor, calls } = createScalePointerProbe();

  editor.handlePointerDown(pointerEvent(1, { clientX: -0.25, clientY: 500 }));

  assert.deepEqual(editor.scalePoints, []);
  assert.deepEqual(calls, []);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests_js/review-editor.test.mjs
```

Expected: `scale tool stores exact free click coordinates inside the image` fails because the current handler returns when no wall vertex is within the snap radius.

- [ ] **Step 3: Remove the snap-only editor code**

In `viewer/review-editor.mjs`, delete:

```js
const SCALE_SNAP_RADIUS_PX = 18;
```

Delete the complete exported `extractWallVertices()` and `nearestVertex()` functions. Delete both `this.wallVertices = [];` constructor/load state and this load assignment:

```js
this.wallVertices = extractWallVertices(payload.polygons);
```

Change the calibration guard copy to:

```js
throw new Error("Choose two points before applying scale");
```

- [ ] **Step 4: Store the exact validated point**

Replace the current `if (this.tool === "scale")` block with:

```js
if (this.tool === "scale") {
  const selectedPoint = { ...point };
  if (this.scalePoints.length >= 2) {
    this.scalePoints = [selectedPoint];
    this.calibration = null;
    this.wallDimensionSegments = [];
  } else if (
    this.scalePoints.length === 1 &&
    Math.hypot(
      selectedPoint.x - this.scalePoints[0].x,
      selectedPoint.y - this.scalePoints[0].y,
    ) < 0.01
  ) {
    return;
  } else {
    this.scalePoints.push(selectedPoint);
  }
  this.render();
  this.onChange(this.document);
  return;
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --test tests_js/review-editor.test.mjs
```

Expected: all `review-editor` tests pass with zero failures.

- [ ] **Step 6: Inspect the task diff without committing**

Run:

```powershell
git diff --check -- viewer/review-editor.mjs tests_js/review-editor.test.mjs
rg -n "SCALE_SNAP_RADIUS_PX|extractWallVertices|nearestVertex|wallVertices" viewer/review-editor.mjs tests_js/review-editor.test.mjs
```

Expected: `git diff --check` exits 0 and `rg` returns no matches.

---

### Task 2: Update Scale instructions and verify the complete viewer

**Files:**
- Modify: `tests/test_viewer_shell.py:34-40`
- Modify: `viewer/index.html:535, 1924-1935`

**Interfaces:**
- Consumes: `updateScaleControls()` and the static `#scale-summary` element.
- Produces: Scale instructions that consistently say `point` rather than `wall corner`.

- [ ] **Step 1: Add a failing copy regression test**

Extend `test_scale_calibration_controls_are_present` with:

```python
self.assertIn("Choose two points.", self.html)
self.assertIn("First point selected. Choose the second point.", self.html)
self.assertIn("Choose Scale, then click two points.", self.html)
self.assertNotIn("wall corner", self.html.lower())
```

- [ ] **Step 2: Run the shell test and verify RED**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q tests/test_viewer_shell.py
```

Expected: the new assertions fail because the current HTML still says `wall corners`.

- [ ] **Step 3: Replace the Scale instruction copy**

In the static control, use:

```html
<div class="scale-summary" id="scale-summary">Choose two points.</div>
```

In `updateScaleControls()`, use:

```js
} else if (points.length === 1) {
  scaleSummary.textContent = "First point selected. Choose the second point.";
} else {
  scaleSummary.textContent = "Choose Scale, then click two points.";
}
```

- [ ] **Step 4: Run the copy test and verify GREEN**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q tests/test_viewer_shell.py
```

Expected: all `test_viewer_shell.py` tests pass.

- [ ] **Step 5: Run full regression verification**

Run:

```powershell
node --test tests_js/*.test.mjs
.\.venv\Scripts\python.exe -m pytest -q tests/test_viewer_shell.py tests/test_review_edits.py
```

Expected: all JavaScript tests and all selected Python tests pass with zero failures.

- [ ] **Step 6: Verify the live 3000 proxy serves the change**

Run:

```powershell
$editor = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/floor-plan-3d/mitunet-assets/review-editor.mjs' -TimeoutSec 20
$page = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/floor-plan-3d/mitunet' -TimeoutSec 20
$editor.StatusCode
$page.StatusCode
([string]$editor.Content).Contains('const selectedPoint = { ...point };')
([string]$page.Content).Contains('Choose Scale, then click two points.')
```

Expected: both status codes are `200` and both content checks are `True`. No 8012 restart is required because these are dynamically served viewer files.

- [ ] **Step 7: Review final scope without committing**

Run:

```powershell
git diff --check -- viewer/review-editor.mjs viewer/index.html tests_js/review-editor.test.mjs tests/test_viewer_shell.py
git status --short -- viewer/review-editor.mjs viewer/index.html tests_js/review-editor.test.mjs tests/test_viewer_shell.py
```

Expected: no whitespace errors; only the intended already-dirty viewer/test files are reported. Leave the branch and working tree in place.
