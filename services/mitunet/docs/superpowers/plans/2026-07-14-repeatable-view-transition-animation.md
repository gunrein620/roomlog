# Repeatable View Transition Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original 600 ms camera glide while replaying the wall/door/window rise every time the user enters `Show 3D`.

**Architecture:** Put reusable animation-reset logic in a small browser-independent ES module, then call it from the existing viewer lifecycle. Reuse the current Three.js meshes and cached composed plan; view switching must not trigger another API request.

**Tech Stack:** Vanilla JavaScript ES modules, CSS keyframes, Three.js, Node built-in test runner, Playwright CLI, FastAPI/Uvicorn.

## Global Constraints

- Do not rerun inference or `/compose-edits` for an unchanged review.
- Repeated view changes restart the original camera glide and existing 3D rise animation.
- Respect `prefers-reduced-motion`.
- Do not create a Git commit unless the user explicitly requests one.

---

### Task 1: Testable Animation Reset Helpers

**Files:**
- Create: `viewer/view-transition.mjs`
- Create: `tests_js/view-transition.test.mjs`

**Interfaces:**
- Produces: `replayRiseAnimations(animations, now, reducedMotion)`.

- [ ] **Step 1: Write failing Node tests**

Test that rise metadata receives a new start time and collapsed scale on every replay and reduced motion finishes immediately.

- [ ] **Step 2: Verify RED**

Run: `node --test tests_js/view-transition.test.mjs`

Expected: FAIL because `viewer/view-transition.mjs` does not exist.

- [ ] **Step 3: Implement the minimal helpers**

Create pure functions that mutate only the supplied animation entries and element class list. Use `0.001` as the non-degenerate collapsed Three.js scale and `1` for reduced motion.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests_js/view-transition.test.mjs`

Expected: all view-transition tests pass.

### Task 2: Wire Every View Entrance

**Files:**
- Modify: `viewer/index.html`
- Modify: `tests/test_viewer_shell.py`

**Interfaces:**
- Consumes: the Task 1 helper exports.
- Produces: `showOriginalView()` glides to the overhead camera before opening the editor; `setView("3d")` glides back to perspective and restarts the existing mesh rise.

- [ ] **Step 1: Add failing shell assertions**

Assert that the viewer imports the helper module, adds no canvas fade, reuses the original 600 ms overhead-camera glide, respects reduced motion, and invokes rise replay from the 3D branch.

- [ ] **Step 2: Verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests/test_viewer_shell.py -q`

Expected: new repeatable-transition assertions fail.

- [ ] **Step 3: Implement viewer wiring and CSS**

Import the rise helper, detect reduced motion, add the original cubic-out camera tween, and restart the rise when entering 3D from the original view.

- [ ] **Step 4: Verify GREEN and regressions**

Run: `node --test tests_js/*.test.mjs`

Run: `.\.venv\Scripts\python.exe -m pytest -q`

Expected: both suites pass.

### Task 3: Browser Verification and Server Startup

**Files:**
- Runtime only; no source files.

**Interfaces:**
- Consumes: completed viewer behavior and the existing FastAPI application.
- Produces: a live local viewer at `http://127.0.0.1:8012/`.

- [ ] **Step 1: Start the server without a startup-service registration**

Run the repository virtual environment with `python -m uvicorn server.main:app --host 127.0.0.1 --port 8012` as a background process, loading the existing Roboflow environment variable without printing it.

- [ ] **Step 2: Verify health**

Request `http://127.0.0.1:8012/healthz` and expect HTTP 200.

- [ ] **Step 3: Exercise repeated transitions**

Use Playwright to open a demo, run `Original -> 3D -> Original -> 3D`, verify the camera moves during both 600 ms transitions, confirm no canvas fade is present, and confirm the collapsed-to-raised mesh state restarts on both 3D visits.

- [ ] **Step 4: Check layout and errors**

Capture a desktop screenshot in `output/playwright/`, confirm the canvases do not overlap incorrectly, and confirm there are no browser console errors.
