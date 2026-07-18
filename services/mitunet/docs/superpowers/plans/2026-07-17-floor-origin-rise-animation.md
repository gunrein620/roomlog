# Floor-Origin Rise Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every 3D wall/window section emerge from floor level and slow each rise from 900 ms to 1200 ms without changing final wall geometry.

**Architecture:** Keep the existing meshes and extrusion logic. Store each mesh's final Y offset in its animation metadata, reset it to floor level, and use a browser-independent helper to apply the same cubic-out progress to both `position.y` and `scale.z`.

**Tech Stack:** Vanilla JavaScript ES modules, Three.js, Node built-in test runner, Python unittest/pytest shell assertions, live RoomLog viewer on port 3000.

## Global Constraints

- Do not change wall polygons, thickness, extrusion depth, final heights, materials, opening detection, or composition data.
- Do not add door headers or door meshes.
- Keep `STAGGER_MS = 28`, the section stagger, cubic-out easing, and the 600 ms camera tween unchanged.
- Set only the per-section rise duration to exactly `1200` ms.
- Preserve immediate final geometry when reduced motion is enabled.
- Do not create a Git commit unless the user explicitly requests one.

---

### Task 1: Testable Floor-Origin Animation State

**Files:**
- Modify: `tests_js/view-transition.test.mjs`
- Modify: `viewer/view-transition.mjs`

**Interfaces:**
- Consumes: animation entries with `mesh.position.y`, `mesh.scale.z`, `start`, `delay`, `duration`, and optional `finalBottom`.
- Produces: `applyRiseAnimationFrame(animation, now)` and the extended `replayRiseAnimations(animations, now, reducedMotion)`.

- [ ] **Step 1: Write failing behavior tests**

Update the import and tests to require floor reset, final-position restoration, and frame progression:

```js
import {
  applyRiseAnimationFrame,
  replayRiseAnimations,
} from "../viewer/view-transition.mjs";

test("rise animations reset raised sections to the floor on every replay", () => {
  const animation = {
    mesh: { position: { y: 0.9 }, scale: { z: 1 } },
    finalBottom: 0.9,
    start: 10,
    delay: 30,
    duration: 1200,
  };
  replayRiseAnimations([animation], 100, false);
  assert.equal(animation.start, 100);
  assert.equal(animation.mesh.position.y, 0);
  assert.equal(animation.mesh.scale.z, 0.001);
});

test("a rise frame moves and grows a raised section from the floor", () => {
  const animation = {
    mesh: { position: { y: 0 }, scale: { z: 0.001 } },
    finalBottom: 0.9,
    start: 100,
    delay: 20,
    duration: 200,
  };
  applyRiseAnimationFrame(animation, 220);
  assert.equal(animation.mesh.position.y, 0.7875);
  assert.equal(animation.mesh.scale.z, 0.875);
  applyRiseAnimationFrame(animation, 320);
  assert.equal(animation.mesh.position.y, 0.9);
  assert.equal(animation.mesh.scale.z, 1);
});

test("reduced motion shows raised geometry at its final position immediately", () => {
  const animation = {
    mesh: { position: { y: 0 }, scale: { z: 0.001 } },
    finalBottom: 2.1,
    start: 10,
    delay: 30,
    duration: 1200,
  };
  replayRiseAnimations([animation], 300, true);
  assert.equal(animation.mesh.position.y, 2.1);
  assert.equal(animation.mesh.scale.z, 1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests_js/view-transition.test.mjs`

Expected: FAIL because `applyRiseAnimationFrame` is not exported and replay does not reset/restore `position.y`.

- [ ] **Step 3: Implement the minimal animation helpers**

Add a persisted final-bottom resolver, update replay, and add the frame helper:

```js
const COLLAPSED_SCALE = 0.001;

function finalBottomFor(animation) {
  if (!Number.isFinite(animation.finalBottom)) {
    animation.finalBottom = Number.isFinite(animation.mesh?.position?.y)
      ? animation.mesh.position.y
      : 0;
  }
  return animation.finalBottom;
}

export function applyRiseAnimationFrame(animation, now) {
  const delay = Number.isFinite(animation.delay) ? animation.delay : 0;
  const duration = Number.isFinite(animation.duration) && animation.duration > 0
    ? animation.duration
    : 1;
  const start = Number.isFinite(animation.start) ? animation.start : now;
  const t = Math.min(1, Math.max(0, (now - start - delay) / duration));
  const eased = 1 - Math.pow(1 - t, 3);
  animation.mesh.position.y = finalBottomFor(animation) * eased;
  animation.mesh.scale.z = Math.max(COLLAPSED_SCALE, eased);
}

export function replayRiseAnimations(animations, now, reducedMotion = false) {
  for (const animation of animations) {
    const finalBottom = finalBottomFor(animation);
    animation.start = reducedMotion
      ? now - (animation.delay ?? 0) - (animation.duration ?? 0)
      : now;
    animation.mesh.position.y = reducedMotion ? finalBottom : 0;
    animation.mesh.scale.z = reducedMotion ? 1 : COLLAPSED_SCALE;
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests_js/view-transition.test.mjs`

Expected: all view-transition tests pass.

### Task 2: Connect Final Height Metadata to the Viewer

**Files:**
- Modify: `tests/test_viewer_shell.py`
- Modify: `viewer/index.html`

**Interfaces:**
- Consumes: `applyRiseAnimationFrame(animation, now)` from Task 1.
- Produces: viewer animation entries with exact `finalBottom` values and a `1200` ms duration.

- [ ] **Step 1: Add a failing viewer-shell assertion**

Add a test that requires the new helper, duration, floor reset, and metadata:

```python
def test_wall_and_window_sections_rise_from_floor_over_1200ms(self):
    self.assertIn(
        'import { applyRiseAnimationFrame, replayRiseAnimations } from "/viewer-assets/view-transition.mjs";',
        self.html,
    )
    self.assertIn("const RISE_DURATION_MS = 1200;", self.html)
    self.assertIn("applyRiseAnimationFrame(a, now);", self.html)
    self.assertIn("const finalBottom = mesh.position.y;", self.html)
    self.assertIn("mesh.position.y = 0;", self.html)
    self.assertIn("finalBottom,", self.html)
```

- [ ] **Step 2: Run the shell test and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_viewer_shell.py -q`

Expected: the new test fails because the viewer still uses `900` ms and scale-only animation.

- [ ] **Step 3: Apply the minimal viewer wiring**

Make only these animation changes. Replace the existing one-line transition import with:

```js
import {
  applyRiseAnimationFrame,
  replayRiseAnimations,
} from "/viewer-assets/view-transition.mjs";

const RISE_DURATION_MS = 1200;
```

Replace only the current `for (const a of animations)` block inside `tick(now)` with:

```js
for (const a of animations) {
  applyRiseAnimationFrame(a, now);
}
```

Before adding each mesh to `planGroup`, preserve its final offset and reset its animation start state:

```js
meshes.filter(Boolean).forEach((mesh, sectionIndex) => {
  const finalBottom = mesh.position.y;
  mesh.position.y = 0;
  mesh.scale.z = 0.001;
  planGroup.add(mesh);
  animations.push({
    mesh,
    finalBottom,
    start,
    delay: i * STAGGER_MS + sectionIndex * 6,
    duration: RISE_DURATION_MS,
  });
});
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests_js/view-transition.test.mjs`

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_viewer_shell.py -q`

Expected: both focused suites pass.

### Task 3: Regression and Live Verification

**Files:**
- Runtime verification only; do not modify wall-generation files.

**Interfaces:**
- Consumes: the updated viewer assets served through the existing 3000 integration.
- Produces: evidence that final geometry is unchanged and the animation now starts at floor level.

- [ ] **Step 1: Run all JavaScript tests**

Run: `node --test tests_js/*.test.mjs`

Expected: all JavaScript tests pass.

- [ ] **Step 2: Run all Python tests**

Run: `.\.venv\Scripts\python.exe -m pytest -q`

Expected: all Python tests pass.

- [ ] **Step 3: Verify the exact live target**

Request `http://127.0.0.1:3000/floor-plan-3d/mitunet` and the viewer asset endpoints. Expect HTTP 200 and confirm the served source contains `RISE_DURATION_MS = 1200` plus `applyRiseAnimationFrame`.

- [ ] **Step 4: Exercise the transition in a browser**

Open the existing composed plan, switch `Original -> 3D -> Original -> 3D`, and verify:

- glass and upper window sections start at floor level;
- all sections finish at their original final heights;
- the rise is slightly slower at 1200 ms;
- final wall count, wall shape, wall thickness, window placement, and camera behavior are unchanged;
- no browser console errors appear.
