# Recognition Review Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start every upload in an editable color-coded 2D recognition view, let the user correct walls, doors, and windows, and build or revisit the matching Three.js result through `Show 3D` without losing edits.

**Architecture:** FastAPI returns the binary MitUNet mask and editable aligned Roboflow openings in the existing 1024-coordinate system. A focused browser review editor keeps a bounded undo history, paints wall-mask corrections, and edits opening boxes; `/compose-edits` remains the authoritative mask-to-polygon boundary before Three.js rendering. The original and 3D views share one review document and switch without rerunning either AI model.

**Tech Stack:** Python 3.11, FastAPI multipart uploads, Pillow, NumPy, OpenCV, browser Canvas 2D, ES modules, Node built-in test runner, Three.js, unittest, Playwright

## Global Constraints

- MitUNet remains the only wall-recognition source; Roboflow wall predictions remain discarded.
- Coordinates and masks remain exactly 1024 x 1024 from extraction through editing and composition.
- Wall overlay is semi-transparent red `#ef4444`, door overlay is amber `#f59e0b`, and window overlay is blue `#2563eb`.
- Upload opens `Show Original`; 3D is built only after the user presses `Show 3D`.
- Switching views preserves all edits and does not rerun AI.
- Wall editing uses brush and eraser; openings use selection, move, length resize, add, delete, and door/window type change.
- One complete wall stroke or opening gesture is one undo action; history keeps at most 30 actions.
- Roboflow failure still opens the editor with MitUNet walls and manual door/window tools.
- Invalid openings stay visible in 2D and are excluded from 3D until corrected.
- Existing demo JSON and static Three.js rendering remain compatible.

---

### Task 1: Return Editable Mask And Opening Geometry

**Files:**
- Modify: `src/buildingcv/roboflow_openings.py`
- Modify: `src/buildingcv/opening_alignment.py`
- Create: `src/buildingcv/review_edits.py`
- Modify: `src/buildingcv/extraction_pipeline.py`
- Modify: `tests/test_opening_alignment.py`
- Modify: `tests/test_server_openings.py`
- Create: `tests/test_review_edits.py`

**Interfaces:**
- Consumes: the 2D MitUNet wall mask and filtered Roboflow `OpeningDetection` values.
- Produces: `encode_wall_mask_png(mask) -> str`, `decode_wall_mask_png(raw) -> np.ndarray`, aligned editable openings, and extraction responses containing `wall_mask_b64` plus `openings`.

- [ ] **Step 1: Add failing alignment tests for editable accepted and rejected openings**

```python
def test_alignment_reports_editable_geometry_and_id(self) -> None:
    wall = np.zeros((100, 100), dtype=np.uint8)
    wall[45:55, 10:90] = 1
    item = opening("door", center=(50, 40), size=(20, 10))
    item = replace(item, opening_id="door-7")

    result = align_openings(wall, [item], match_tolerance=20)

    self.assertEqual(result.openings[0].opening_id, "door-7")
    self.assertEqual(result.openings[0].axis, "horizontal")
    self.assertTrue(result.openings[0].valid)
    self.assertAlmostEqual(result.openings[0].center_y, 49.5)

def test_rejected_opening_remains_editable(self) -> None:
    wall = np.zeros((100, 100), dtype=np.uint8)
    wall[5:10, 5:95] = 1
    item = replace(opening("window", (50, 80), (20, 10)), opening_id="window-2")

    result = align_openings(wall, [item], match_tolerance=12)

    self.assertFalse(result.openings[0].valid)
    self.assertEqual(result.openings[0].opening_id, "window-2")
```

- [ ] **Step 2: Run the focused alignment tests and verify failure**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_opening_alignment -v`

Expected: FAIL because `OpeningAlignmentResult` does not expose `openings` and `OpeningDetection` has no `opening_id`.

- [ ] **Step 3: Extend the alignment types without changing existing polygon behavior**

```python
@dataclass(frozen=True)
class OpeningDetection:
    kind: OpeningKind
    confidence: float
    center_x: float
    center_y: float
    width: float
    height: float
    image_width: int
    image_height: int
    source_model: str
    opening_id: str = ""

@dataclass(frozen=True)
class AlignedOpening:
    opening_id: str
    kind: OpeningKind
    confidence: float
    center_x: float
    center_y: float
    width: float
    height: float
    axis: Literal["horizontal", "vertical"]
    valid: bool
    source_model: str

@dataclass(frozen=True)
class OpeningAlignmentResult:
    class_mask: np.ndarray
    accepted_doors: int
    accepted_windows: int
    rejected: int
    openings: tuple[AlignedOpening, ...] = ()
```

For accepted detections, calculate editable center, width, and height from the corrected rectangle bounds. For rejected detections, retain the scaled source box, infer the axis from its longer dimension, and set `valid=False`. Assign `opening_id` from the detection or `opening-{rank + 1}` when absent.

- [ ] **Step 4: Add failing lossless mask serialization tests**

```python
class ReviewEditTests(unittest.TestCase):
    def test_binary_mask_png_round_trip_is_lossless(self) -> None:
        mask = np.zeros((1024, 1024), dtype=np.uint8)
        mask[100:130, 50:900] = 1

        encoded = encode_wall_mask_png(mask)
        decoded = decode_wall_mask_png(base64.b64decode(encoded))

        np.testing.assert_array_equal(decoded, mask)

    def test_decode_rejects_non_1024_mask(self) -> None:
        image = Image.new("L", (64, 64), 255)
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        with self.assertRaisesRegex(ValueError, "1024 x 1024"):
            decode_wall_mask_png(buffer.getvalue())
```

- [ ] **Step 5: Implement binary PNG mask helpers and opening payload conversion**

```python
CANVAS_SIZE = 1024

def encode_wall_mask_png(mask: np.ndarray) -> str:
    if mask.shape != (CANVAS_SIZE, CANVAS_SIZE):
        raise ValueError("wall mask must be 1024 x 1024")
    image = Image.fromarray(mask.astype(bool).astype(np.uint8) * 255, mode="L")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")

def decode_wall_mask_png(raw: bytes) -> np.ndarray:
    image = Image.open(BytesIO(raw)).convert("L")
    if image.size != (CANVAS_SIZE, CANVAS_SIZE):
        raise ValueError("wall mask must be 1024 x 1024")
    return (np.asarray(image, dtype=np.uint8) >= 128).astype(np.uint8)

def editable_openings_payload(items: Sequence[AlignedOpening]) -> list[dict[str, object]]:
    return [
        {
            "id": item.opening_id,
            "kind": item.kind,
            "confidence": item.confidence,
            "center_x": item.center_x,
            "center_y": item.center_y,
            "width": item.width,
            "height": item.height,
            "axis": item.axis,
            "valid": item.valid,
        }
        for item in items
    ]
```

- [ ] **Step 6: Include editable data in extraction responses**

```python
return {
    "canvas_size": [width, height],
    "content_rect": [0, 0, width, height],
    "wall_mask_b64": encode_wall_mask_png(wall_mask),
    "openings": editable_openings_payload(aligned.openings),
    "polygons": mask_to_polygons(aligned.class_mask),
    "opening_detection": metadata,
}
```

When Roboflow is disabled or failed, return `openings=[]` and still return `wall_mask_b64`.

- [ ] **Step 7: Run backend tests**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_review_edits tests.test_opening_alignment tests.test_server_openings -v`

Expected: all editable geometry, fallback, and mask round-trip tests PASS.

- [ ] **Step 8: Commit editable extraction data**

```powershell
git add src/buildingcv/roboflow_openings.py src/buildingcv/opening_alignment.py src/buildingcv/review_edits.py src/buildingcv/extraction_pipeline.py tests/test_review_edits.py tests/test_opening_alignment.py tests/test_server_openings.py
git commit -m "feat: expose editable recognition data"
```

### Task 2: Compose Reviewed Edits Through FastAPI

**Files:**
- Modify: `src/buildingcv/review_edits.py`
- Modify: `server/main.py`
- Create: `tests/test_compose_edits_api.py`

**Interfaces:**
- Consumes: multipart `wall_mask` PNG and `openings` JSON in 1024-canvas coordinates.
- Produces: `parse_review_openings(value) -> list[OpeningDetection]`, `compose_review_edits(mask, detections) -> CombinedExtractionResult`, and `POST /compose-edits`.

- [ ] **Step 1: Write failing opening validation tests**

```python
def test_parse_review_openings_accepts_manual_door(self) -> None:
    items = parse_review_openings([
        {
            "id": "manual-1",
            "kind": "door",
            "confidence": 1.0,
            "center_x": 400,
            "center_y": 500,
            "width": 80,
            "height": 12,
        }
    ])
    self.assertEqual(items[0].opening_id, "manual-1")
    self.assertEqual(items[0].image_width, 1024)

def test_parse_review_openings_rejects_bad_kind_and_coordinates(self) -> None:
    with self.assertRaisesRegex(ValueError, "kind"):
        parse_review_openings([{"id": "bad", "kind": "wall"}])
    with self.assertRaisesRegex(ValueError, "finite"):
        parse_review_openings([{
            "id": "bad-2", "kind": "door", "center_x": "nan",
            "center_y": 10, "width": 20, "height": 5,
        }])
```

- [ ] **Step 2: Implement strict review-opening parsing**

```python
def parse_review_openings(value: object) -> list[OpeningDetection]:
    if not isinstance(value, list):
        raise ValueError("openings must be a JSON array")
    parsed: list[OpeningDetection] = []
    seen_ids: set[str] = set()
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValueError(f"opening {index} must be an object")
        opening_id = str(item.get("id") or f"manual-{index + 1}")
        kind = item.get("kind")
        if kind not in {"door", "window"}:
            raise ValueError(f"opening {opening_id} has invalid kind")
        numbers = [float(item.get(name)) for name in ("center_x", "center_y", "width", "height")]
        if not all(math.isfinite(number) for number in numbers):
            raise ValueError(f"opening {opening_id} coordinates must be finite")
        center_x, center_y, width, height = numbers
        if width < 2 or height < 2 or not (0 <= center_x <= 1024 and 0 <= center_y <= 1024):
            raise ValueError(f"opening {opening_id} is outside the editable canvas")
        if opening_id in seen_ids:
            raise ValueError(f"duplicate opening id: {opening_id}")
        seen_ids.add(opening_id)
        parsed.append(OpeningDetection(
            kind=kind,
            confidence=float(item.get("confidence", 1.0)),
            center_x=center_x,
            center_y=center_y,
            width=width,
            height=height,
            image_width=1024,
            image_height=1024,
            source_model="review-editor",
            opening_id=opening_id,
        ))
    return parsed
```

- [ ] **Step 3: Write failing endpoint tests for success and invalid masks**

```python
class ComposeEditsApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_compose_edits_returns_reviewed_polygons(self) -> None:
        wall = np.zeros((1024, 1024), dtype=np.uint8)
        wall[500:516, 100:900] = 1
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        openings = json.dumps([{
            "id": "door-1", "kind": "door", "confidence": 1.0,
            "center_x": 400, "center_y": 508, "width": 80, "height": 16,
        }])

        result = await compose_edits(wall_mask=upload, openings=openings)

        self.assertGreater(len(result["polygons"]["wall"]), 0)
        self.assertEqual(result["opening_detection"]["accepted_doors"], 1)

    async def test_compose_edits_rejects_empty_wall_mask(self) -> None:
        wall = np.zeros((1024, 1024), dtype=np.uint8)
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        with self.assertRaises(HTTPException) as caught:
            await compose_edits(wall_mask=upload, openings="[]")
        self.assertEqual(caught.exception.status_code, 422)
```

- [ ] **Step 4: Implement the composition endpoint**

```python
@app.post("/compose-edits")
async def compose_edits(
    wall_mask: UploadFile = File(...),
    openings: str = Form("[]"),
) -> dict:
    try:
        mask = decode_wall_mask_png(await wall_mask.read())
        if not np.any(mask):
            raise ValueError("at least one wall is required")
        payload = json.loads(openings)
        detections = parse_review_openings(payload)
    except (UnidentifiedImageError, json.JSONDecodeError, TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return compose_review_edits(mask, detections)
```

`compose_review_edits` calls `align_openings` with the edited mask, marks unmatched openings invalid, converts the resulting class mask through `mask_to_polygons`, and returns the same response shape as `/extract-image` without rerunning MitUNet or Roboflow.

- [ ] **Step 5: Expose viewer ES modules from FastAPI**

```python
VIEWER_DIR = REPO_ROOT / "viewer"
app.mount("/viewer-assets", StaticFiles(directory=VIEWER_DIR), name="viewer-assets")
```

- [ ] **Step 6: Run API tests**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_compose_edits_api tests.test_review_edits -v`

Expected: successful composition, malformed JSON, wrong-size mask, and empty-wall tests PASS.

- [ ] **Step 7: Commit reviewed composition**

```powershell
git add src/buildingcv/review_edits.py server/main.py tests/test_compose_edits_api.py
git commit -m "feat: compose reviewed floor plan edits"
```

### Task 3: Build Bounded Review State And Undo History

**Files:**
- Create: `viewer/review-document.mjs`
- Create: `tests_js/review-document.test.mjs`

**Interfaces:**
- Consumes: a binary `Uint8Array` wall mask and editable opening objects.
- Produces: `ReviewDocument` with transactional edit history, reset, revision tracking, and immutable export values.

- [ ] **Step 1: Write failing Node tests for edit history and render revisions**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { ReviewDocument } from "../viewer/review-document.mjs";

test("one committed gesture is one undo step", () => {
  const doc = new ReviewDocument(new Uint8Array([0, 1, 0, 0]), []);
  doc.beginEdit();
  doc.wallMask[0] = 1;
  doc.wallMask[2] = 1;
  doc.commitEdit();
  assert.deepEqual([...doc.wallMask], [1, 1, 1, 0]);
  doc.undo();
  assert.deepEqual([...doc.wallMask], [0, 1, 0, 0]);
});

test("view switching can detect a stale 3d render", () => {
  const doc = new ReviewDocument(new Uint8Array([1]), []);
  assert.equal(doc.needsCompose(), true);
  doc.markRendered();
  assert.equal(doc.needsCompose(), false);
  doc.beginEdit();
  doc.openings.push({ id: "door-1", kind: "door" });
  doc.commitEdit();
  assert.equal(doc.needsCompose(), true);
});

test("history is bounded to 30 committed gestures", () => {
  const doc = new ReviewDocument(new Uint8Array([0]), []);
  for (let index = 0; index < 40; index += 1) {
    doc.beginEdit();
    doc.wallMask[0] = index % 2;
    doc.commitEdit();
  }
  assert.equal(doc.undoDepth, 30);
});
```

- [ ] **Step 2: Run Node tests and verify module-not-found failure**

Run: `node --test tests_js/review-document.test.mjs`

Expected: FAIL because `viewer/review-document.mjs` does not exist.

- [ ] **Step 3: Implement transactional history**

```javascript
const cloneOpenings = openings => openings.map(opening => ({ ...opening }));

export class ReviewDocument {
  constructor(wallMask, openings, historyLimit = 30) {
    this.original = { wallMask: wallMask.slice(), openings: cloneOpenings(openings) };
    this.wallMask = wallMask.slice();
    this.openings = cloneOpenings(openings);
    this.historyLimit = historyLimit;
    this.past = [];
    this.future = [];
    this.pending = null;
    this.revision = 1;
    this.renderedRevision = 0;
  }
  snapshot() {
    return { wallMask: this.wallMask.slice(), openings: cloneOpenings(this.openings) };
  }
  restore(snapshot) {
    this.wallMask = snapshot.wallMask.slice();
    this.openings = cloneOpenings(snapshot.openings);
  }
  beginEdit() {
    if (!this.pending) this.pending = this.snapshot();
  }
  commitEdit() {
    if (!this.pending) return;
    this.past.push(this.pending);
    this.past = this.past.slice(-this.historyLimit);
    this.pending = null;
    this.future = [];
    this.revision += 1;
  }
  cancelEdit() {
    if (this.pending) this.restore(this.pending);
    this.pending = null;
  }
  undo() {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.snapshot());
    this.restore(previous);
    this.revision += 1;
    return true;
  }
  redo() {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.snapshot());
    this.restore(next);
    this.revision += 1;
    return true;
  }
  reset() {
    this.beginEdit();
    this.restore(this.original);
    this.commitEdit();
  }
  markRendered() { this.renderedRevision = this.revision; }
  needsCompose() { return this.renderedRevision !== this.revision; }
  get undoDepth() { return this.past.length; }
}
```

- [ ] **Step 4: Add tests for redo, reset, and opening type changes**

Verify that redo restores the undone state, reset restores original AI results, and a door changed to a window returns to a door after undo.

- [ ] **Step 5: Run review-document tests**

Run: `node --test tests_js/review-document.test.mjs`

Expected: all history, reset, and revision tests PASS.

- [ ] **Step 6: Commit review state**

```powershell
git add viewer/review-document.mjs tests_js/review-document.test.mjs
git commit -m "feat: add review editor history state"
```

### Task 4: Implement The 2D Recognition Canvas Editor

**Files:**
- Create: `viewer/review-editor.mjs`
- Create: `tests_js/review-editor.test.mjs`

**Interfaces:**
- Consumes: `ReviewDocument`, `input_image_b64`, and pointer/keyboard events.
- Produces: a full-canvas editor with `load`, `setTool`, `setBrushSize`, `undo`, `redo`, `reset`, `deleteSelected`, `toggleSelectedType`, `toWallMaskBlob`, and `getOpenings`.

- [ ] **Step 1: Write failing pure geometry tests**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { hitTestOpening, moveOpening, resizeOpeningLength } from "../viewer/review-editor.mjs";

const horizontal = {
  id: "door-1", kind: "door", center_x: 100, center_y: 50,
  width: 40, height: 10, axis: "horizontal", valid: true,
};

test("hit testing selects a visible opening box", () => {
  assert.equal(hitTestOpening([horizontal], 110, 50)?.id, "door-1");
  assert.equal(hitTestOpening([horizontal], 160, 50), null);
});

test("moving clamps an opening to the 1024 canvas", () => {
  const moved = moveOpening(horizontal, 1000, 1000, 1024, 1024);
  assert.equal(moved.center_x, 1004);
  assert.equal(moved.center_y, 1019);
});

test("horizontal resize changes width but preserves thickness", () => {
  const resized = resizeOpeningLength(horizontal, "end", 130, 50);
  assert.equal(resized.width, 50);
  assert.equal(resized.height, 10);
});
```

- [ ] **Step 2: Implement pure opening geometry helpers**

```javascript
export function openingBounds(opening) {
  return {
    left: opening.center_x - opening.width / 2,
    right: opening.center_x + opening.width / 2,
    top: opening.center_y - opening.height / 2,
    bottom: opening.center_y + opening.height / 2,
  };
}

export function hitTestOpening(openings, x, y, padding = 8) {
  for (let index = openings.length - 1; index >= 0; index -= 1) {
    const bounds = openingBounds(openings[index]);
    if (x >= bounds.left - padding && x <= bounds.right + padding &&
        y >= bounds.top - padding && y <= bounds.bottom + padding) {
      return openings[index];
    }
  }
  return null;
}
```

`moveOpening` clamps the full box inside 0..1024. `resizeOpeningLength` moves only the selected along-wall endpoint, enforces an 8-pixel minimum length, and preserves cross-wall thickness.

- [ ] **Step 3: Implement image decoding and mask initialization**

Create an offscreen 1024 x 1024 wall-mask canvas. Decode `wall_mask_b64` into `Uint8Array` values 0/1, initialize `ReviewDocument`, decode `input_image_b64`, and render the original image with `object-fit: contain` behavior computed from the visible canvas bounds.

- [ ] **Step 4: Render fixed color overlays and legend-compatible visibility**

```javascript
const CLASS_COLORS = {
  wall: "rgba(239, 68, 68, 0.42)",
  door: "rgba(245, 158, 11, 0.72)",
  window: "rgba(37, 99, 235, 0.72)",
};
```

Draw the wall mask through a red offscreen color layer, then draw each opening rectangle. Invalid openings keep their class fill but use a dashed black outline. The selected opening uses a 2-pixel white outline and two square along-wall handles.

- [ ] **Step 5: Implement one-gesture wall painting and erasing**

On pointer down for `wall` or `erase`, call `document.beginEdit()`. Draw round line segments into the binary mask with the selected brush size as the pointer moves. On pointer up, call `document.commitEdit()` once, rebuild the overlay, and call `onChange(document)`.

- [ ] **Step 6: Implement opening selection, move, resize, add, delete, and type change**

- `select`: click a box or handle; drag a box to move it; drag a handle to resize its along-wall length.
- `door` and `window`: drag to create a horizontal or vertical box based on the dominant drag axis; use 12 pixels as initial cross-wall thickness and `manual-${counter}` as the ID.
- `deleteSelected`: remove the selected opening in one transaction.
- `toggleSelectedType`: switch `door` and `window` in one transaction.
- Set edited openings to `valid=true` for immediate display; the server repeats authoritative wall matching during `/compose-edits`.

- [ ] **Step 7: Add pan, zoom, resize, and keyboard behavior**

Use mouse wheel or trackpad to zoom around the pointer, clamp zoom to `0.5..8`, and pan while the middle button or Space key is held. Recompute device-pixel-ratio canvas dimensions on resize. Wire `Ctrl+Z`, `Ctrl+Shift+Z`, `Delete`, and `Escape` only while `Show Original` is active.

- [ ] **Step 8: Export the current wall mask as a lossless PNG**

```javascript
async toWallMaskBlob() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  const image = context.createImageData(1024, 1024);
  for (let index = 0; index < this.document.wallMask.length; index += 1) {
    const value = this.document.wallMask[index] ? 255 : 0;
    const offset = index * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
}
```

- [ ] **Step 9: Run pure editor tests**

Run: `node --test tests_js/review-editor.test.mjs tests_js/review-document.test.mjs`

Expected: all geometry and state tests PASS without a browser DOM.

- [ ] **Step 10: Commit the canvas editor**

```powershell
git add viewer/review-editor.mjs tests_js/review-editor.test.mjs
git commit -m "feat: add recognition review canvas"
```

### Task 5: Integrate Show Original And Show 3D

**Files:**
- Modify: `viewer/index.html`
- Modify: `README.md`

**Interfaces:**
- Consumes: `/extract-image`, `ReviewEditor`, and `/compose-edits`.
- Produces: upload-first 2D review, color legend and tools, explicit 3D composition, and state-preserving view switching.

- [ ] **Step 1: Add the 2D canvas, segmented view control, and edit toolbar**

```html
<canvas id="review-canvas" hidden></canvas>
<div class="segmented" id="view-switch" role="tablist" aria-label="Plan view">
  <button class="segment active" data-view="original" role="tab">Show Original</button>
  <button class="segment" data-view="3d" role="tab" disabled>Show 3D</button>
</div>
<div id="editor-tools" hidden>
  <div class="tool-row" role="toolbar" aria-label="Recognition editing tools">
    <button data-tool="select" title="Select and move">Select</button>
    <button data-tool="wall" title="Add wall">Wall</button>
    <button data-tool="erase" title="Erase wall">Erase</button>
    <button data-tool="door" title="Add door">Door</button>
    <button data-tool="window" title="Add window">Window</button>
  </div>
  <input id="brush-size" type="range" min="4" max="64" value="18" aria-label="Brush size">
</div>
```

Use icon-plus-text controls with Lucide icons when the module is available; preserve text labels when the icon CDN cannot load. Keep buttons at stable dimensions, panel radius at 8 pixels, and responsive controls within the viewport.

- [ ] **Step 2: Add class legend and edit actions**

The legend uses colored swatches and checkboxes for temporary visibility only. Add undo, redo, delete, change type, and reset commands. Disable commands when no document or selection exists and update counts from the live opening list.

- [ ] **Step 3: Replace immediate 3D loading after upload**

```javascript
async function extractForReview(file) {
  const form = new FormData();
  form.append("image", file);
  const response = await fetch("/extract-image", { method: "POST", body: form });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  await reviewEditor.load(data);
  currentExtraction = data;
  setView("original");
  setEditorEnabled(true);
}
```

Do not call `loadPlan(data)` in the upload callback.

- [ ] **Step 4: Compose only when Show 3D needs a newer revision**

```javascript
async function showThreeDimensionalView() {
  if (!reviewEditor.document) return;
  if (reviewEditor.document.needsCompose()) {
    const form = new FormData();
    form.append("wall_mask", await reviewEditor.toWallMaskBlob(), "wall-mask.png");
    form.append("openings", JSON.stringify(reviewEditor.getOpenings()));
    const response = await fetch("/compose-edits", { method: "POST", body: form });
    if (!response.ok) throw new Error(await response.text());
    currentComposedPlan = await response.json();
    await loadPlan({ ...currentComposedPlan, input_image_b64: currentExtraction.input_image_b64 });
    reviewEditor.document.markRendered();
  }
  setView("3d");
}
```

If composition fails, stay in `Show Original`, preserve edits, and show a retry message.

- [ ] **Step 5: Implement state-preserving view switching**

`setView("original")` shows the review canvas and tools, hides the Three.js canvas, disables orbit controls, and redraws the editor. `setView("3d")` hides the editor, shows Three.js, restores orbit controls and the previous 3D camera, and does not destroy the review document.

- [ ] **Step 6: Preserve Roboflow fallback and invalid-opening feedback**

When `/extract-image` reports Roboflow disabled or failed, show its warning as non-fatal status and keep manual Door/Window tools enabled. After composition, synchronize `valid` and corrected geometry by opening ID from the server response and return to the editor only when the user presses `Show Original`.

- [ ] **Step 7: Document the review-first behavior**

Add a README section describing `Upload -> Show Original review -> Show 3D`, the class colors, supported edits, and the fact that edits remain local to the browser session.

- [ ] **Step 8: Run static and automated tests**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v`

Expected: all Python tests PASS.

Run: `node --test tests_js/*.test.mjs`

Expected: all JavaScript tests PASS.

- [ ] **Step 9: Commit the integrated review flow**

```powershell
git add viewer/index.html README.md
git commit -m "feat: add review before 3d conversion"
```

### Task 6: End-To-End Browser Verification

**Files:**
- Modify only if verification exposes a defect: `viewer/index.html`, `viewer/review-editor.mjs`, `server/main.py`, or their focused tests.
- Create screenshots under ignored local directory: `output/playwright/`.

**Interfaces:**
- Consumes: the running FastAPI server, real MitUNet checkpoint, optional Roboflow key, and an AIHub validation image.
- Produces: verified desktop/mobile 2D and 3D behavior with no console errors or overlapping controls.

- [ ] **Step 1: Restart the local server with the existing model configuration**

Run: `.\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8012`

Expected: `/healthz` returns HTTP 200 and the process stays running.

- [ ] **Step 2: Verify upload starts in 2D review**

Upload `D:\woo-zu-aihub\output_separated\val\images\APT_FP_STR_000477071_p0.png`. Confirm the original drawing is visible, red walls, amber doors, and blue windows are nonblank, and `Show Original` is selected before any 3D meshes appear.

- [ ] **Step 3: Verify every required edit class**

Perform one wall brush stroke, one erase stroke, move and resize an opening, change its type, add and delete an opening, undo and redo, then reset. Confirm each complete gesture changes history by one step and the class counts remain consistent.

- [ ] **Step 4: Verify 2D/3D round trips**

Make a visible edit, press `Show 3D`, verify the corresponding geometry, press `Show Original`, verify the edit remains, change it again, and press `Show 3D` to verify the mesh changes without rerunning AI.

- [ ] **Step 5: Verify fallback and errors**

Run without a Roboflow key and confirm wall-only review plus manual opening creation. Submit an empty edited wall mask through the endpoint and confirm HTTP 422 while the browser preserves the review document.

- [ ] **Step 6: Check desktop, mobile, and Three.js pixels**

At 1440 x 900 and 390 x 844, capture `Show Original` and `Show 3D`. Confirm both canvases contain non-background pixels, the plan is framed, controls stay inside the viewport, no text overlaps, and browser console error/warning counts are zero.

- [ ] **Step 7: Run final verification**

Run: `git diff --check`

Run: `.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v`

Run: `node --test tests_js/*.test.mjs`

Expected: clean diff check and all Python/JavaScript tests PASS.

- [ ] **Step 8: Commit only defect fixes discovered during verification**

```powershell
git add viewer/index.html viewer/review-editor.mjs server/main.py tests/test_compose_edits_api.py tests_js/review-editor.test.mjs
git commit -m "fix: polish recognition review workflow"
```

If verification finds no defect, skip this commit and leave the branch at the Task 5 commit.
