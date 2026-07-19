# Single Workspace Floating Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the floor plan full-screen in both modes and present controls as stable floating overlays while 2D and 3D crossfade in place.

**Architecture:** Retain the existing review editor and Three.js renderer as separate canvases, but stack both canvases over the same viewport. A small view-state helper controls opacity, pointer events, and transition completion without replacing either canvas in layout.

**Tech Stack:** HTML/CSS, browser ES modules, Three.js, Node test runner, Python unittest, Playwright.

## Global Constraints

- Preserve existing extraction, editing, camera-glide, and wall-rise behavior.
- Respect `prefers-reduced-motion`.
- Do not add dependencies.
- Do not create a Git commit.

---

### Task 1: Lock the single-workspace layout contract

**Files:**
- Modify: `tests/test_viewer_shell.py`
- Modify: `viewer/index.html`

**Interfaces:**
- Consumes: existing `#scene`, `#review-canvas`, `#ui`, and `#editor-tools` elements.
- Produces: CSS classes `view-original`, `view-3d`, and `view-transitioning` on `body`.

- [ ] **Step 1: Write failing shell tests**

Assert that both canvases use `position: fixed; inset: 0`, the review canvas does not subtract panel width, and mode-specific CSS controls opacity and pointer events.

- [ ] **Step 2: Verify the focused tests fail**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_viewer_shell -v`

Expected: FAIL because the review canvas still reserves space beside the panel and view switching still uses `hidden`.

- [ ] **Step 3: Implement minimal full-viewport CSS**

Stack both canvases, add opacity transitions, keep `#ui` fixed, and position `#editor-tools` as an overlay section without changing the canvas bounds.

- [ ] **Step 4: Verify the focused tests pass**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_viewer_shell -v`

Expected: PASS.

### Task 2: Crossfade views without replacing the workspace

**Files:**
- Modify: `viewer/index.html`
- Modify: `tests/test_viewer_shell.py`

**Interfaces:**
- Consumes: `setView(view)`, `showOriginalView()`, `tweenCamera()`, and `reducedMotionQuery`.
- Produces: `setCanvasViewState(view, transitioning)` and `waitForViewTransition()`.

- [ ] **Step 1: Write failing transition tests**

Assert that `setView()` no longer assigns canvas `.hidden`, mode changes update body classes, and Original waits for a crossfade after the overhead camera glide.

- [ ] **Step 2: Verify failure**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_viewer_shell -v`

Expected: FAIL on the old `.hidden` assignments.

- [ ] **Step 3: Implement the minimal transition state**

Use body classes for opacity and pointer events. Keep both canvases mounted, wait for the CSS transition only when motion is enabled, and preserve the current camera and wall-rise sequence.

- [ ] **Step 4: Verify focused tests pass**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_viewer_shell -v`

Expected: PASS.

### Task 3: Verify desktop and mobile behavior

**Files:**
- Modify only if verification exposes a defect: `viewer/index.html`
- Artifacts: `output/playwright/single-workspace-original.png`, `output/playwright/single-workspace-3d.png`

**Interfaces:**
- Consumes: live server at `http://127.0.0.1:8012/`.
- Produces: browser evidence for stable panel position, full-screen canvases, and working interaction states.

- [ ] **Step 1: Run all automated tests**

Run: `node --test <all tests_js/*.test.mjs>`

Run: `.\.venv\Scripts\python.exe -m unittest discover -s tests -q`

Expected: all tests pass.

- [ ] **Step 2: Exercise the live view in Playwright**

Upload a floor-plan image, capture Original, switch to 3D, return to Original, and repeat at a mobile viewport. Confirm the main card does not move and no console errors occur.

- [ ] **Step 3: Check formatting and server health**

Run: `git diff --check`

Run: `Invoke-RestMethod http://127.0.0.1:8012/healthz`

Expected: no whitespace errors and `ok: true`.
