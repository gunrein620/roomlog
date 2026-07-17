# Door Header Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each detected door as a wall opening with a wall header from the door height to the ceiling.

**Architecture:** Door detection continues to provide only the two-dimensional opening footprint.  The viewer's wall-geometry helpers use that footprint to emit a wall-material header above the passage; no door leaf, frame, or door-specific material is created.  Windows retain their existing sill, glass, and upper-wall sections.

**Tech Stack:** HTML, JavaScript modules, Three.js, Python unittest, Node.js test runner.

## Global Constraints

- Keep the lower door passage free of geometry.
- Use `2.1 m` as the physical door height and its proportional equivalent in uncalibrated scenes.
- Create the header with `wallMat`; do not introduce a door material.
- Do not change window geometry or opening data.

---

### Task 1: Add a wall-header geometry helper and use it for door openings

**Files:**
- Modify: `viewer/index.html:397-404,631-636,776-838`
- Test: `tests/test_viewer_shell.py:105-116`
- Test: `tests_js/door-opening-geometry.test.mjs`

**Interfaces:**
- Consumes: `buildVerticalSection(polygon, scale, cx, cy, bottom, top, material, withEdges)` and an item whose `kind` is `door`.
- Produces: `buildDoorwayHeaderWall(polygon, scale, cx, cy, doorHeight, wallHeight, wallMaterial)`, returning the upper wall mesh or `null`.

- [ ] **Step 1: Write the failing tests**

```python
def test_door_renders_as_a_wall_opening_with_a_header(self):
    self.assertNotIn("COLOR_DOOR", self.html)
    self.assertNotIn("doorMat", self.html)
    self.assertIn("function buildDoorwayHeaderWall(", self.html)
    self.assertIn("doorHeight, wallHeight, wallMat", self.html)
```

```js
assert.match(viewer, /function buildDoorwayHeaderWall\(/);
assert.match(viewer, /buildDoorwayHeaderWall\(item\.poly,[\s\S]{0,160}doorHeight, wallHeight, wallMat\)/);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```powershell
& '.\.venv\Scripts\python.exe' -m pytest tests\test_viewer_shell.py -q -p no:cacheprovider
node --test tests_js\door-opening-geometry.test.mjs
```

Expected: the new helper-name assertions fail because the viewer does not yet emit a door header.

- [ ] **Step 3: Implement the minimal wall-header geometry**

```js
const DOOR_HEIGHT = 0.42;
const PHYSICAL_DOOR_HEIGHT = 2.1;

function buildDoorwayHeaderWall(polygon, scale, cx, cy, doorHeight, wallHeight, wallMaterial) {
  return buildVerticalSection(polygon, scale, cx, cy, doorHeight, wallHeight, wallMaterial, true);
}

const doorHeight = hasPhysicalScale ? PHYSICAL_DOOR_HEIGHT : DOOR_HEIGHT;

} else if (item.kind === "door") {
  meshes.push(buildDoorwayHeaderWall(item.poly, scale, cx, cy, doorHeight, wallHeight, wallMat));
}
```

- [ ] **Step 4: Run the focused tests to verify they pass**

Run:

```powershell
& '.\.venv\Scripts\python.exe' -m pytest tests\test_viewer_shell.py -q -p no:cacheprovider
node --test tests_js\door-opening-geometry.test.mjs
```

Expected: both commands finish with exit code `0`.

### Task 2: Run complete regression checks

**Files:**
- Verify: `tests/`
- Verify: `tests_js/*.test.mjs`

**Interfaces:**
- Consumes: the completed viewer wall-header implementation.
- Produces: fresh Python and JavaScript regression evidence.

- [ ] **Step 1: Run the complete Python suite**

```powershell
& '.\.venv\Scripts\python.exe' -m pytest tests -q -p no:cacheprovider
```

Expected: exit code `0` and no failed tests.

- [ ] **Step 2: Run the complete browser-logic suite**

```powershell
node --test tests_js\*.test.mjs
```

Expected: exit code `0` and no failed tests.
