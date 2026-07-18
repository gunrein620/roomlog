# Window Wall Snap And Opening Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Snap detected windows onto the nearest compatible MitUNet wall without changing their along-wall length or center, while preserving the existing RoomLog-style opening editor flow.

**Architecture:** Add a window-specific nearest-axis band selector inside `opening_alignment.py`. It scores horizontal rows or vertical columns near the detector box, chooses the nearest wall band, and returns a rectangle whose cross-axis center and thickness match the wall while its longitudinal geometry remains detector-owned. Existing review payloads and editor commands remain the persistence boundary for Show 3D.

**Tech Stack:** Python 3.11, NumPy, unittest, FastAPI integration tests, Node test runner.

## Global Constraints

- Roboflow remains responsible only for door/window detections.
- MitUNet remains the only source of wall geometry.
- Do not change confidence thresholds or retrain either model.
- Keep unmatched detections editable and invalid instead of attaching them to unrelated walls.
- Do not create Git commits unless the user explicitly asks.

---

### Task 1: Nearest Compatible Wall Band For Windows

**Files:**
- Modify: `tests/test_opening_alignment.py`
- Modify: `src/buildingcv/opening_alignment.py`

**Interfaces:**
- Consumes: `align_openings(wall_mask, detections, match_tolerance=24)` and `OpeningDetection`.
- Produces: an accepted `AlignedOpening` whose window longitudinal center/length match the scaled detection and whose cross-axis geometry matches the nearest wall band.

- [ ] **Step 1: Write failing horizontal and vertical window tests**

Add cases with two nearby parallel walls and assert that the closest compatible wall is chosen. For a horizontal detection, assert `center_x` and `width` are unchanged while `center_y` and `height` match the wall. Mirror those assertions for a vertical detection.

```python
self.assertAlmostEqual(window.center_x, 52.0)
self.assertAlmostEqual(window.width, 24.0)
self.assertAlmostEqual(window.center_y, 41.5)
self.assertAlmostEqual(window.height, 8.0)
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONPATH='src'
.\.venv\Scripts\python.exe -m unittest tests.test_opening_alignment
```

Expected: the new nearest-wall or geometry-preservation assertion fails against the current all-points percentile behavior.

- [ ] **Step 3: Implement window wall-band selection**

Add a focused helper that:

```python
def _window_rectangle_on_nearest_wall(
    wall: np.ndarray,
    center_x: float,
    center_y: float,
    width: float,
    height: float,
    tolerance: int,
) -> np.ndarray | None:
    ...
```

The helper must use detection dimensions for orientation, inspect an expanded longitudinal interval, group qualifying adjacent rows/columns into wall bands, choose the band with the smallest cross-axis distance, preserve detector longitudinal bounds, and enforce `MIN_RENDERABLE_THICKNESS_PX`. Call it only for `detection.kind == "window"`; keep the existing door path unchanged.

- [ ] **Step 4: Run the focused tests and confirm pass**

Run the command from Step 2.

Expected: all opening-alignment tests pass.

---

### Task 2: Review Compose And Editor Regression Coverage

**Files:**
- Modify: `tests/test_compose_edits_api.py`
- Verify: `tests_js/review-editor.test.mjs`

**Interfaces:**
- Consumes: edited opening JSON posted to `/api/compose-edits`.
- Produces: snapped window geometry in `result["openings"]` and matching 3D polygons while retaining existing move, resize, type, delete, undo, and redo behavior.

- [ ] **Step 1: Add a compose regression test**

Post a horizontal edited window near a wall and assert:

```python
self.assertEqual(result["opening_detection"]["accepted_windows"], 1)
self.assertAlmostEqual(result["openings"][0]["center_x"], submitted_center_x)
self.assertAlmostEqual(result["openings"][0]["width"], submitted_width)
self.assertAlmostEqual(result["openings"][0]["center_y"], wall_center_y)
self.assertGreater(len(result["polygons"]["window"]), 0)
```

- [ ] **Step 2: Run Python and editor tests**

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTHONPATH='src'
.\.venv\Scripts\python.exe -m unittest tests.test_opening_alignment tests.test_compose_edits_api tests.test_review_edits
node --test tests_js/review-editor.test.mjs tests_js/review-document.test.mjs
```

Expected: both suites pass. The current editor tests already cover move, length-only resize, validity recalculation, and transaction history.

- [ ] **Step 3: Verify the live 8012 workflow**

Upload a floor plan, confirm a detected window sits on its wall in Show Original, adjust it, switch to Show 3D, and switch back. The adjusted opening must remain in the corrected position and the window cut must align with the wall.
