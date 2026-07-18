# MitUNet Camera View Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add animated `입체 · 위 · 정면 · 왼쪽 · 오른쪽 · 자동 둘러보기` camera controls that remain available throughout MitUNet structure review and furniture placement.

**Architecture:** Put camera-direction math in a dependency-free viewer module and keep DOM, Three.js, OrbitControls, animation, and lifecycle wiring in the existing viewer shell. Reuse the existing camera tween loop for fixed presets and OrbitControls `autoRotate` for continuous orbit so there is only one render loop.

**Tech Stack:** JavaScript ES modules, Three.js 0.162, OrbitControls, HTML/CSS, Node test runner, Python unittest static shell tests.

## Global Constraints

- Apply the feature only to the MitUNet conversion viewer; do not change the saved RoomLog listing 3D viewer.
- Show presets only after a 3D model exists and keep them visible in `3d` and `furnishing` states.
- Use exactly six labels: `입체`, `위`, `정면`, `왼쪽`, `오른쪽`, `자동 둘러보기`.
- Fixed-view transitions last exactly 700ms with cubic-out interpolation; reduced-motion moves immediately.
- Starting another preset cancels the prior transition.
- Another preset, scene pointer drag, original-plan view, or plan clearing stops automatic orbit.
- Furniture selection, pending placement, transforms, wall coordinates, floor coordinates, and material coordinates must not change.
- Mobile controls use horizontal overflow rather than wrapping into multiple rows.

## File Structure

- Create `services/mitunet/viewer/camera-view-presets.mjs`: dependency-free preset names, normalized directions, and position calculation.
- Create `services/mitunet/tests_js/camera-view-presets.test.mjs`: behavioral unit tests for all fixed camera positions and invalid input.
- Modify `services/mitunet/viewer/index.html`: preset UI, camera state, animation wiring, automatic orbit, furnishing-state persistence, and lifecycle cleanup.
- Modify `services/mitunet/tests/test_viewer_shell.py`: static integration regression tests for markup and viewer wiring.

---

### Task 1: Pure camera preset position calculation

**Files:**
- Create: `services/mitunet/viewer/camera-view-presets.mjs`
- Create: `services/mitunet/tests_js/camera-view-presets.test.mjs`

**Interfaces:**
- Consumes: plain `{ x, y, z }` center objects and a positive numeric distance.
- Produces: `FIXED_CAMERA_VIEWS` and `cameraPresetPosition(view, center, distance)` returning a plain `{ x, y, z }` object.

- [ ] **Step 1: Write the failing preset-position tests**

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  FIXED_CAMERA_VIEWS,
  cameraPresetPosition,
} from "../viewer/camera-view-presets.mjs";

const center = { x: 4, y: 1, z: -3 };
const roundPoint = point => Object.fromEntries(
  Object.entries(point).map(([key, value]) => [key, Math.round(value * 1e6) / 1e6]),
);

test("publishes the five fixed camera views in UI order", () => {
  assert.deepEqual(FIXED_CAMERA_VIEWS, ["perspective", "top", "front", "left", "right"]);
});

test("places each fixed view on the requested framing sphere", () => {
  const positions = Object.fromEntries(FIXED_CAMERA_VIEWS.map(view => [
    view,
    cameraPresetPosition(view, center, 10),
  ]));

  for (const position of Object.values(positions)) {
    assert.equal(
      Math.round(Math.hypot(
        position.x - center.x,
        position.y - center.y,
        position.z - center.z,
      ) * 1e6) / 1e6,
      10,
    );
  }
  assert.ok(positions.top.y > center.y);
  assert.ok(positions.front.z > center.z);
  assert.ok(positions.left.x < center.x);
  assert.ok(positions.right.x > center.x);
  assert.notDeepEqual(roundPoint(positions.perspective), roundPoint(positions.front));
});

test("rejects unknown views and non-positive distances", () => {
  assert.throws(() => cameraPresetPosition("rear", center, 10), /Unknown camera view/);
  assert.throws(() => cameraPresetPosition("top", center, 0), /positive/);
});
```

- [ ] **Step 2: Run the test and confirm it fails because the module does not exist**

Run:

```powershell
node --test tests_js/camera-view-presets.test.mjs
```

Working directory: `services/mitunet`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `viewer/camera-view-presets.mjs`.

- [ ] **Step 3: Implement normalized preset directions**

```js
export const FIXED_CAMERA_VIEWS = Object.freeze([
  "perspective",
  "top",
  "front",
  "left",
  "right",
]);

const DIRECTIONS = Object.freeze({
  perspective: [0.55, 0.62, 0.85],
  top: [0, 1, 0.001],
  front: [0, 0.42, 1],
  left: [-1, 0.42, 0],
  right: [1, 0.42, 0],
});

export function cameraPresetPosition(view, center, distance) {
  const direction = DIRECTIONS[view];
  if (!direction) throw new RangeError(`Unknown camera view: ${view}`);
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new RangeError("Camera distance must be positive");
  }
  const length = Math.hypot(...direction);
  return {
    x: center.x + direction[0] / length * distance,
    y: center.y + direction[1] / length * distance,
    z: center.z + direction[2] / length * distance,
  };
}
```

- [ ] **Step 4: Run the new unit test and existing viewer JavaScript tests**

Run:

```powershell
node --test tests_js/camera-view-presets.test.mjs tests_js/floor-finishes.test.mjs tests_js/view-transition.test.mjs
```

Working directory: `services/mitunet`

Expected: all tests PASS with exit code 0.

- [ ] **Step 5: Commit the pure preset unit**

```powershell
git add -- services/mitunet/viewer/camera-view-presets.mjs services/mitunet/tests_js/camera-view-presets.test.mjs
git commit -m "feat(mitunet): add camera view preset geometry"
```

---

### Task 2: Animated preset controls and automatic orbit

**Files:**
- Modify: `services/mitunet/viewer/index.html`
- Modify: `services/mitunet/tests/test_viewer_shell.py`

**Interfaces:**
- Consumes: `FIXED_CAMERA_VIEWS` and `cameraPresetPosition(view, center, distance)` from Task 1.
- Produces: `applyCameraPreset(view)`, `toggleAutoOrbit()`, `stopAutoOrbit()`, and `updateCameraPresetControls()` inside the viewer shell.

- [ ] **Step 1: Add failing shell tests for the six controls and lifecycle behavior**

Add these methods to `ViewerShellTests`:

```python
def test_camera_presets_are_available_in_structure_and_furnishing_views(self):
    for label in ["입체", "위", "정면", "왼쪽", "오른쪽", "자동 둘러보기"]:
        self.assertIn(f">{label}</button>", self.html)
    self.assertIn('id="camera-view-controls" hidden', self.html)
    self.assertIn('data-camera-view="perspective"', self.html)
    self.assertIn('data-camera-view="auto"', self.html)
    self.assertIn('cameraViewControls.hidden = !hasRenderedPlan || !showingThreeDimensional', self.html)
    self.assertIn('["3d", "furnishing"].includes(currentView)', self.html)

def test_camera_presets_reuse_the_tween_and_respect_reduced_motion(self):
    self.assertIn('from "/viewer-assets/camera-view-presets.mjs"', self.html)
    self.assertIn("const CAMERA_PRESET_TWEEN_MS = 700", self.html)
    self.assertIn("async function applyCameraPreset(view)", self.html)
    self.assertIn("cameraPresetPosition(view, center, distance)", self.html)
    self.assertIn("reducedMotionQuery.matches", self.html)
    self.assertIn("await tweenCamera(toPosition, center, CAMERA_PRESET_TWEEN_MS)", self.html)

def test_auto_orbit_stops_on_direct_manipulation_and_original_view(self):
    self.assertIn("controls.autoRotate = true", self.html)
    self.assertIn("controls.autoRotateSpeed = 0.45", self.html)
    self.assertIn("function stopAutoOrbit", self.html)
    pointer_body = self.html.split('sceneCanvas.addEventListener("pointermove"', 1)[1]
    self.assertIn("if (distance > 5 && controls.autoRotate) stopAutoOrbit()", pointer_body.split("});", 1)[0])
    original_body = self.html.split("async function showOriginalView()", 1)[1]
    self.assertIn("stopAutoOrbit()", original_body.split("function syncCorrectedOpenings", 1)[0])

def test_camera_presets_do_not_clear_furniture_state(self):
    preset_body = self.html.split("async function applyCameraPreset(view)", 1)[1]
    preset_body = preset_body.split("function toggleAutoOrbit()", 1)[0]
    self.assertNotIn("cancelFurnitureInteraction", preset_body)
    self.assertNotIn("resetFurniturePlacements", preset_body)
```

- [ ] **Step 2: Run only the new shell tests and confirm the controls are missing**

Run:

```powershell
& 'C:\Users\smoun\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest `
  tests.test_viewer_shell.ViewerShellTests.test_camera_presets_are_available_in_structure_and_furnishing_views `
  tests.test_viewer_shell.ViewerShellTests.test_camera_presets_reuse_the_tween_and_respect_reduced_motion `
  tests.test_viewer_shell.ViewerShellTests.test_auto_orbit_stops_on_direct_manipulation_and_original_view `
  tests.test_viewer_shell.ViewerShellTests.test_camera_presets_do_not_clear_furniture_state
```

Working directory: `services/mitunet`

Expected: FAIL because `camera-view-controls`, the new module import, and preset functions do not exist.

- [ ] **Step 3: Add the horizontally scrollable preset UI**

Add below the existing `#view-controls` block:

```html
<div id="camera-view-controls" hidden>
  <div class="label">3D View</div>
  <div class="camera-preset-row" role="toolbar" aria-label="3D 카메라 뷰">
    <button class="camera-preset active" data-camera-view="perspective" type="button">입체</button>
    <button class="camera-preset" data-camera-view="top" type="button">위</button>
    <button class="camera-preset" data-camera-view="front" type="button">정면</button>
    <button class="camera-preset" data-camera-view="left" type="button">왼쪽</button>
    <button class="camera-preset" data-camera-view="right" type="button">오른쪽</button>
    <button class="camera-preset" data-camera-view="auto" type="button" aria-pressed="false">자동 둘러보기</button>
  </div>
</div>
```

Add CSS that keeps buttons on one line:

```css
.camera-preset-row {
  display: flex;
  gap: 6px;
  margin: 0 -2px;
  padding: 0 2px 5px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.camera-preset {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.camera-preset.active {
  border-color: var(--ink);
  background: var(--ink);
  color: #fff;
}
```

- [ ] **Step 4: Import the position helper and declare camera state**

Add the import:

```js
import {
  FIXED_CAMERA_VIEWS,
  cameraPresetPosition,
} from "/viewer-assets/camera-view-presets.mjs";
```

Add constants and state:

```js
const CAMERA_PRESET_TWEEN_MS = 700;
const cameraViewControls = document.getElementById("camera-view-controls");
const cameraViewButtons = [...document.querySelectorAll("[data-camera-view]")];
let activeCameraView = "perspective";
let cameraPresetTransitionId = 0;
```

- [ ] **Step 5: Implement active-state, fixed-view animation, and automatic orbit**

```js
function updateCameraPresetButtons() {
  cameraViewButtons.forEach(button => {
    const active = button.dataset.cameraView === activeCameraView;
    button.classList.toggle("active", active);
    if (button.dataset.cameraView === "auto") {
      button.setAttribute("aria-pressed", String(active));
    }
  });
}

function stopAutoOrbit({ clearActive = true } = {}) {
  controls.autoRotate = false;
  if (clearActive && activeCameraView === "auto") activeCameraView = null;
  updateCameraPresetButtons();
}

async function applyCameraPreset(view) {
  if (!FIXED_CAMERA_VIEWS.includes(view) || !currentFraming || currentView === "original") return;
  stopAutoOrbit();
  const transitionId = ++cameraPresetTransitionId;
  const { center, radius } = currentFraming;
  const distance = framingDistance(radius, camera.aspect);
  const point = cameraPresetPosition(view, center, distance);
  const toPosition = new THREE.Vector3(point.x, point.y, point.z);
  activeCameraView = view;
  updateCameraPresetButtons();

  if (reducedMotionQuery.matches) {
    moveCameraImmediately(toPosition, center);
    return;
  }
  controls.enabled = false;
  await tweenCamera(toPosition, center, CAMERA_PRESET_TWEEN_MS);
  if (transitionId === cameraPresetTransitionId && currentView !== "original") {
    controls.enabled = true;
    updateFurnitureInteractionUi();
  }
}

function toggleAutoOrbit() {
  if (controls.autoRotate) {
    stopAutoOrbit();
    return;
  }
  finishCameraTween(false);
  cameraPresetTransitionId += 1;
  controls.enabled = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  activeCameraView = "auto";
  updateCameraPresetButtons();
}
```

- [ ] **Step 6: Wire buttons and synchronize lifecycle visibility**

```js
function updateCameraPresetControls() {
  const showingThreeDimensional = ["3d", "furnishing"].includes(currentView);
  const hasRenderedPlan = Boolean(currentFraming && currentComposedPlan);
  cameraViewControls.hidden = !hasRenderedPlan || !showingThreeDimensional;
  cameraViewButtons.forEach(button => {
    button.disabled = !hasRenderedPlan || !showingThreeDimensional || inFlight;
  });
  updateCameraPresetButtons();
}

cameraViewButtons.forEach(button => button.addEventListener("click", () => {
  const view = button.dataset.cameraView;
  if (view === "auto") toggleAutoOrbit();
  else void applyCameraPreset(view);
}));
```

Call `updateCameraPresetControls()` from `updateEditorControls()`, after `loadPlan()` establishes `currentFraming`, after entering or leaving furnishing, and after `setView()` changes the view. Call `stopAutoOrbit()` from `clearPlan()` and `showOriginalView()`. In the existing scene-canvas `pointermove` handler, call `stopAutoOrbit()` only after pointer travel exceeds 5 pixels, so a furniture-selection click does not stop orbit but a direct scene drag does. When the existing 3D entrance animation ends at the perspective position, set `activeCameraView = "perspective"` and call `updateCameraPresetButtons()`.

- [ ] **Step 7: Run the focused shell and JavaScript tests**

Run:

```powershell
& 'C:\Users\smoun\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest tests.test_viewer_shell
node --test tests_js/camera-view-presets.test.mjs tests_js/view-transition.test.mjs tests_js/floor-finishes.test.mjs
```

Working directory: `services/mitunet`

Expected: all camera tests PASS. If unrelated pre-existing shell assertions fail, record their exact names and confirm all new camera assertions pass independently.

- [ ] **Step 8: Verify the RoomLog proxy serves the new module**

Run the web integration test:

```powershell
$env:TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'
node --test -r ts-node/register src/app/floor-plan-3d/mitunet-internal-page.spec.ts
```

Working directory: `apps/web`

Then verify live HTTP responses:

```powershell
$viewer = Invoke-WebRequest -UseBasicParsing http://localhost:3000/floor-plan-3d/mitunet
$module = Invoke-WebRequest -UseBasicParsing http://localhost:3000/floor-plan-3d/mitunet-assets/camera-view-presets.mjs
@{
  viewerStatus = $viewer.StatusCode
  moduleStatus = $module.StatusCode
  hasAutoView = $viewer.Content.Contains('data-camera-view="auto"')
  hasPresetExport = $module.Content.Contains('cameraPresetPosition')
}
```

Expected: both statuses are `200`; both booleans are `True`.

- [ ] **Step 9: Check the scoped diff and commit**

```powershell
git diff --check -- services/mitunet/viewer/index.html services/mitunet/tests/test_viewer_shell.py
git add -- services/mitunet/viewer/index.html services/mitunet/tests/test_viewer_shell.py
git commit -m "feat(mitunet): add animated camera view controls"
```

---

### Task 3: Manual interaction verification

**Files:**
- No code changes expected.

**Interfaces:**
- Consumes: completed viewer from Tasks 1 and 2.
- Produces: verified interaction behavior on the live RoomLog route.

- [ ] **Step 1: Open the exact viewer route and upload an asymmetric floor plan**

Open `http://localhost:3000/floor-plan-3d/mitunet`, upload a plan whose front/left/right orientation is visually distinguishable, and choose `Show 3D`.

- [ ] **Step 2: Exercise every fixed view**

Click `입체`, `위`, `정면`, `왼쪽`, and `오른쪽`. Confirm each transition lasts visibly less than one second, finishes with the whole model framed, and does not mirror wall, floor, door, or window alignment.

- [ ] **Step 3: Exercise automatic orbit interruption**

Start `자동 둘러보기`; confirm rotation continues. Drag the scene and confirm it stops. Start it again, click a fixed view, and confirm it stops at that fixed view.

- [ ] **Step 4: Verify furnishing-state preservation**

Enter furniture placement, select a catalog item, move it to a valid position, and switch between views before confirmation. Confirm the pending item remains selected and can still be confirmed. Repeat with an already placed item selected.

- [ ] **Step 5: Record final verification**

Report the focused automated test counts, HTTP statuses, and manual results. Do not claim the feature complete if any view is clipped, mirrored, or clears furniture state.
