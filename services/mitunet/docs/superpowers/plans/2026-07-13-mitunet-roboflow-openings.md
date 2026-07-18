# MitUNet + Roboflow Openings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Roboflow door/window detection to the MitUNet wall viewer, snap each opening to the predicted wall footprint, and render corrected door and window geometry without consuming Roboflow wall detections.

**Architecture:** MitUNet remains the only wall source. A focused Roboflow client returns filtered door/window boxes, an alignment module converts those boxes into wall-intersection masks on the 1024 canvas, and the existing polygon extractor emits corrected wall, door, and window polygons. The viewer treats door/window footprints as full-height cuts, then restores the lintel or sill geometry needed for each opening type.

**Tech Stack:** Python 3.11, FastAPI, httpx, NumPy, OpenCV, PyTorch, Three.js, unittest, Playwright CLI

## Global Constraints

- Ignore every Roboflow wall prediction; only door and window classes may reach the alignment layer.
- Keep `cubicasa5k-2-qpmsa/6` as the default Roboflow model.
- Keep door confidence at `0.15` and window confidence at `0.20` unless environment variables override them.
- Never store or return `ROBOFLOW_API_KEY`.
- Preserve wall-only output when Roboflow is disabled, times out, fails, or finds no valid opening.
- Reject an opening that cannot be matched to nearby MitUNet wall pixels.

---

### Task 1: Roboflow Door/Window Client

**Files:**
- Create: `src/buildingcv/roboflow_openings.py`
- Create: `tests/test_roboflow_openings.py`
- Modify: `pyproject.toml`

**Interfaces:**
- Consumes: original PNG/JPEG bytes and environment configuration.
- Produces: `parse_opening_predictions(payload, model, door_threshold, window_threshold) -> list[OpeningDetection]` and `RoboflowOpeningClient.detect(image_bytes) -> RoboflowResult`.

- [ ] **Step 1: Write parsing tests that prove walls are ignored**

```python
class RoboflowOpeningTests(unittest.TestCase):
    def test_parser_keeps_doors_and_windows_but_discards_walls(self):
        payload = {
            "image": {"width": 200, "height": 100},
            "predictions": [
                {"class": "wall", "confidence": 0.99, "x": 100, "y": 50, "width": 180, "height": 10},
                {"class": "door", "confidence": 0.70, "x": 40, "y": 50, "width": 20, "height": 12},
                {"class": "window", "confidence": 0.80, "x": 140, "y": 50, "width": 30, "height": 12},
            ],
        }
        detections = parse_opening_predictions(payload, "cubicasa5k-2-qpmsa/6", 0.15, 0.20)
        self.assertEqual([item.kind for item in detections], ["door", "window"])
```

- [ ] **Step 2: Add tests for confidence filtering and duplicate suppression**

```python
def test_parser_drops_low_confidence_and_overlapping_duplicates(self):
    payload = {
        "image": {"width": 100, "height": 100},
        "predictions": [
            {"class": "door", "confidence": 0.10, "x": 20, "y": 20, "width": 10, "height": 10},
            {"class": "window", "confidence": 0.91, "x": 50, "y": 50, "width": 20, "height": 10},
            {"class": "window", "confidence": 0.60, "x": 51, "y": 50, "width": 20, "height": 10},
        ],
    }
    detections = parse_opening_predictions(payload, "model/1", 0.15, 0.20)
    self.assertEqual(len(detections), 1)
    self.assertEqual(detections[0].kind, "window")
    self.assertAlmostEqual(detections[0].confidence, 0.91)
```

- [ ] **Step 3: Run the tests and confirm they fail before implementation**

Run: `\.venv\Scripts\python.exe -m unittest tests.test_roboflow_openings -v`

Expected: FAIL because `buildingcv.roboflow_openings` does not exist.

- [ ] **Step 4: Implement typed parsing and the asynchronous client**

```python
@dataclass(frozen=True)
class OpeningDetection:
    kind: Literal["door", "window"]
    confidence: float
    center_x: float
    center_y: float
    width: float
    height: float
    image_width: int
    image_height: int

@dataclass(frozen=True)
class RoboflowResult:
    status: Literal["ready", "disabled", "failed"]
    model: str
    detections: list[OpeningDetection]
    warning: str | None = None

def normalize_opening_class(name: object) -> Literal["door", "window"] | None:
    normalized = str(name or "").strip().lower().replace("-", "_").replace(" ", "_")
    if "door" in normalized:
        return "door"
    if "window" in normalized:
        return "window"
    return None
```

Use `httpx.AsyncClient(timeout=20)` to POST base64 image bytes as `application/x-www-form-urlencoded`. Sort by confidence and suppress same-kind duplicates at box IoU greater than `0.5` or containment greater than `0.75`. Return `disabled` without an HTTP request when the key is absent; catch timeout/HTTP/JSON errors and return `failed` without exposing the key.

- [ ] **Step 5: Add httpx to the serving dependency set**

```toml
serve = [
    # existing dependencies
    "httpx>=0.27",
]
```

- [ ] **Step 6: Run the focused tests**

Run: `\.venv\Scripts\python.exe -m unittest tests.test_roboflow_openings -v`

Expected: all Roboflow parsing/client fallback tests PASS.

- [ ] **Step 7: Commit the client task**

```powershell
git add pyproject.toml src/buildingcv/roboflow_openings.py tests/test_roboflow_openings.py
git commit -m "feat: add Roboflow opening client"
```

### Task 2: Snap Openings to the MitUNet Wall Mask

**Files:**
- Create: `src/buildingcv/opening_alignment.py`
- Create: `tests/test_opening_alignment.py`

**Interfaces:**
- Consumes: `wall_mask: np.ndarray` and `list[OpeningDetection]`.
- Produces: `align_openings(wall_mask, detections) -> OpeningAlignmentResult`, containing a corrected class mask, accepted counts, and rejected count.

- [ ] **Step 1: Write horizontal and vertical snapping tests**

```python
def opening(kind, center, size, source_size):
    return OpeningDetection(
        kind=kind,
        confidence=0.9,
        center_x=center[0],
        center_y=center[1],
        width=size[0],
        height=size[1],
        image_width=source_size[0],
        image_height=source_size[1],
    )

def test_horizontal_door_is_centered_on_wall_and_cuts_full_thickness(self):
    wall = np.zeros((100, 100), dtype=np.uint8)
    wall[45:55, 10:90] = 1
    detection = opening("door", center=(50, 40), size=(20, 12), source_size=(100, 100))
    result = align_openings(wall, [detection], match_tolerance=20)
    self.assertEqual(result.accepted_doors, 1)
    self.assertTrue(np.all(result.class_mask[45:55, 40:60] == 2))
    self.assertFalse(np.any(result.class_mask[45:55, 40:60] == 1))

def test_vertical_window_uses_local_wall_axis(self):
    wall = np.zeros((100, 100), dtype=np.uint8)
    wall[10:90, 45:55] = 1
    result = align_openings(wall, [opening("window", (60, 50), (12, 24), (100, 100))], 20)
    self.assertEqual(result.accepted_windows, 1)
    self.assertTrue(np.any(result.class_mask[:, :,] == 3))
```

- [ ] **Step 2: Write a rejection test for a detection with no nearby wall**

```python
def test_opening_without_nearby_wall_is_rejected(self):
    wall = np.zeros((100, 100), dtype=np.uint8)
    wall[5:10, 5:95] = 1
    result = align_openings(wall, [opening("door", (50, 80), (20, 10), (100, 100))], 12)
    self.assertEqual(result.rejected, 1)
    self.assertFalse(np.any(result.class_mask == 2))
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `\.venv\Scripts\python.exe -m unittest tests.test_opening_alignment -v`

Expected: FAIL because the alignment module does not exist.

- [ ] **Step 4: Implement wall-axis and thickness correction**

```python
@dataclass(frozen=True)
class OpeningAlignmentResult:
    class_mask: np.ndarray
    accepted_doors: int
    accepted_windows: int
    rejected: int

def align_openings(
    wall_mask: np.ndarray,
    detections: Sequence[OpeningDetection],
    match_tolerance: int = 24,
) -> OpeningAlignmentResult:
    wall = wall_mask.astype(bool)
    class_mask = wall.astype(np.uint8)
    occupied = np.zeros_like(wall)
    accepted_doors = accepted_windows = rejected = 0

    for detection in sorted(detections, key=lambda item: item.confidence, reverse=True):
        scale_x = wall.shape[1] / detection.image_width
        scale_y = wall.shape[0] / detection.image_height
        cx = detection.center_x * scale_x
        cy = detection.center_y * scale_y
        box_w = max(2.0, detection.width * scale_x)
        box_h = max(2.0, detection.height * scale_y)
        x0 = max(0, int(np.floor(cx - box_w / 2 - match_tolerance)))
        x1 = min(wall.shape[1], int(np.ceil(cx + box_w / 2 + match_tolerance)))
        y0 = max(0, int(np.floor(cy - box_h / 2 - match_tolerance)))
        y1 = min(wall.shape[0], int(np.ceil(cy + box_h / 2 + match_tolerance)))
        local_y, local_x = np.nonzero(wall[y0:y1, x0:x1])
        if local_x.size < 8:
            rejected += 1
            continue

        points = np.column_stack((local_x + x0, local_y + y0)).astype(np.float32)
        centered = points - points.mean(axis=0, keepdims=True)
        eigenvalues, eigenvectors = np.linalg.eigh(centered.T @ centered)
        major = eigenvectors[:, int(np.argmax(eigenvalues))]
        horizontal = abs(float(major[0])) >= abs(float(major[1]))
        rectangle = np.zeros_like(wall)

        if horizontal:
            along = points[np.abs(points[:, 0] - cx) <= box_w / 2 + 1]
            if along.size == 0:
                rejected += 1
                continue
            left = max(0, int(round(cx - box_w / 2)))
            right = min(wall.shape[1], int(round(cx + box_w / 2)) + 1)
            top = max(0, int(np.floor(np.percentile(along[:, 1], 5))) - 1)
            bottom = min(wall.shape[0], int(np.ceil(np.percentile(along[:, 1], 95))) + 2)
            rectangle[top:bottom, left:right] = True
        else:
            along = points[np.abs(points[:, 1] - cy) <= box_h / 2 + 1]
            if along.size == 0:
                rejected += 1
                continue
            top = max(0, int(round(cy - box_h / 2)))
            bottom = min(wall.shape[0], int(round(cy + box_h / 2)) + 1)
            left = max(0, int(np.floor(np.percentile(along[:, 0], 5))) - 1)
            right = min(wall.shape[1], int(np.ceil(np.percentile(along[:, 0], 95))) + 2)
            rectangle[top:bottom, left:right] = True

        footprint = rectangle & wall & ~occupied
        if np.count_nonzero(footprint) < 8:
            rejected += 1
            continue
        class_id = 2 if detection.kind == "door" else 3
        class_mask[footprint] = class_id
        occupied |= footprint
        if detection.kind == "door":
            accepted_doors += 1
        else:
            accepted_windows += 1

    return OpeningAlignmentResult(
        class_mask=class_mask,
        accepted_doors=accepted_doors,
        accepted_windows=accepted_windows,
        rejected=rejected,
    )
```

Require at least 8 matched wall pixels. Use the detection's along-wall length, but derive the cross-wall bounds from nearby MitUNet wall pixels so the opening spans the complete predicted wall thickness. Prevent door/window overlap by keeping the higher-confidence opening first.

- [ ] **Step 5: Run all alignment and polygon tests**

Run: `\.venv\Scripts\python.exe -m unittest tests.test_opening_alignment tests.test_mitunet_polygons -v`

Expected: horizontal, vertical, rejection, and polygon-hole tests PASS.

- [ ] **Step 6: Commit the alignment task**

```powershell
git add src/buildingcv/opening_alignment.py tests/test_opening_alignment.py
git commit -m "feat: align openings to MitUNet walls"
```

### Task 3: Join Both Models in the FastAPI Endpoint

**Files:**
- Modify: `src/buildingcv/mitunet.py`
- Create: `src/buildingcv/extraction_pipeline.py`
- Modify: `server/main.py`
- Create: `tests/test_server_openings.py`

**Interfaces:**
- Consumes: one uploaded image, `MitUNetPolygonExtractor.predict_mask(image)`, and `RoboflowOpeningClient.detect(raw)`.
- Produces: `compose_extraction(wall_mask, roboflow_result) -> dict` and the existing polygon response plus `opening_detection: {status, model, accepted_doors, accepted_windows, rejected, warning}`.

- [ ] **Step 1: Add a test for wall-only fallback**

```python
def test_missing_roboflow_key_returns_wall_polygons(self):
    wall = np.zeros((64, 64), dtype=np.uint8)
    wall[8:56, 8:16] = 1
    result = compose_extraction(wall, RoboflowResult("disabled", "model/1", []))
    self.assertGreater(len(result["polygons"]["wall"]), 0)
    self.assertEqual(result["polygons"]["door"], [])
    self.assertEqual(result["opening_detection"]["status"], "disabled")
```

- [ ] **Step 2: Add a test that accepted openings become class polygons**

```python
def test_ready_roboflow_result_returns_corrected_door_and_window_polygons(self):
    wall = np.zeros((100, 100), dtype=np.uint8)
    wall[45:55, 5:95] = 1
    detections = [
        OpeningDetection("door", 0.9, 30, 50, 12, 12, 100, 100),
        OpeningDetection("window", 0.9, 70, 50, 12, 12, 100, 100),
    ]
    result = compose_extraction(wall, RoboflowResult("ready", "model/1", detections))
    self.assertEqual(result["opening_detection"]["accepted_doors"], 1)
    self.assertEqual(result["opening_detection"]["accepted_windows"], 1)
    self.assertGreater(len(result["polygons"]["door"]), 0)
    self.assertGreater(len(result["polygons"]["window"]), 0)
```

- [ ] **Step 3: Split MitUNet inference from polygon conversion**

```python
class MitUNetPolygonExtractor:
    @torch.inference_mode()
    def predict_mask(self, image: Image.Image) -> tuple[np.ndarray, Image.Image]:
        rgb = np.asarray(image.convert("RGB"))
        resized = cv2.resize(rgb, (IMAGE_SIZE, IMAGE_SIZE), interpolation=cv2.INTER_LINEAR)
        normalized = resized.astype(np.float32) / 255.0
        normalized = (normalized - IMAGENET_MEAN) / IMAGENET_STD
        channels_first = np.ascontiguousarray(normalized.transpose(2, 0, 1))
        tensor = torch.from_numpy(channels_first).unsqueeze(0).to(self.device)
        logits = self.model(tensor)
        wall_mask = (
            (torch.sigmoid(logits.squeeze(1)) >= self.threshold)
            .to(torch.uint8)
            .squeeze(0)
            .cpu()
            .numpy()
        )
        return wall_mask, Image.fromarray(resized)

    def extract(self, image: Image.Image) -> MitUNetResult:
        wall_mask, rendered = self.predict_mask(image)
        result = {
            "canvas_size": [IMAGE_SIZE, IMAGE_SIZE],
            "content_rect": [0, 0, IMAGE_SIZE, IMAGE_SIZE],
            "polygons": mask_to_polygons(wall_mask),
        }
        return {"result": result, "rendered_image": rendered}
```

- [ ] **Step 4: Implement pure response composition**

```python
def compose_extraction(wall_mask: np.ndarray, roboflow: RoboflowResult) -> dict:
    if roboflow.status == "ready":
        aligned = align_openings(wall_mask, roboflow.detections)
    else:
        aligned = OpeningAlignmentResult(wall_mask.astype(np.uint8), 0, 0, 0)
    return {
        "canvas_size": [wall_mask.shape[1], wall_mask.shape[0]],
        "content_rect": [0, 0, wall_mask.shape[1], wall_mask.shape[0]],
        "polygons": mask_to_polygons(aligned.class_mask),
        "opening_detection": {
            "status": roboflow.status,
            "model": roboflow.model,
            "accepted_doors": aligned.accepted_doors,
            "accepted_windows": aligned.accepted_windows,
            "rejected": aligned.rejected,
            "warning": roboflow.warning,
        },
    }
```

- [ ] **Step 5: Integrate the client without making it a hard dependency**

Initialize `RoboflowOpeningClient` during lifespan. In `/extract-image`, run MitUNet first, call Roboflow with the same raw bytes, align only returned door/window detections, then return polygons and metadata. If the client is disabled or failed, preserve the original wall mask and response.

- [ ] **Step 6: Run the API composition tests and complete suite**

Run: `\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v`

Expected: all tests PASS without requiring a real Roboflow key or network request.

- [ ] **Step 7: Commit the endpoint integration**

```powershell
git add src/buildingcv/mitunet.py src/buildingcv/extraction_pipeline.py server/main.py tests/test_server_openings.py
git commit -m "feat: combine MitUNet walls with Roboflow openings"
```

### Task 4: Render Corrected Door and Window Geometry

**Files:**
- Modify: `viewer/index.html`

**Interfaces:**
- Consumes: wall polygons with full-height opening cuts plus matching door/window footprint polygons.
- Produces: full-height walls, door panels with lintels, and glass windows with sill and upper-wall sections.

- [ ] **Step 1: Add a reusable vertical-section mesh helper**

```javascript
function addOpeningSection(poly, scale, cx, cy, bottom, top, material, withEdges = true) {
  if (top <= bottom) return null;
  const mesh = buildExtrudedMesh(poly, scale, cx, cy, top - bottom, material, withEdges);
  mesh.position.y = bottom;
  planGroup.add(mesh);
  return mesh;
}
```

- [ ] **Step 2: Render door geometry without restoring the full wall column**

```javascript
if (item.kind === "door") {
  meshes.push(addOpeningSection(item.poly, scale, cx, cy, 0, DOOR_HEIGHT, doorMat, true));
  meshes.push(addOpeningSection(item.poly, scale, cx, cy, DOOR_HEIGHT, WALL_HEIGHT, wallMat, true));
}
```

The first mesh is the visible door panel and the second restores only the wall lintel. The original wall polygon already excludes the door footprint.

- [ ] **Step 3: Render window geometry and restore only wall above and below**

```javascript
if (item.kind === "window") {
  meshes.push(addOpeningSection(item.poly, scale, cx, cy, 0, WINDOW_SILL, wallMat, true));
  meshes.push(addOpeningSection(item.poly, scale, cx, cy, WINDOW_SILL, WINDOW_TOP, windowMat, false));
  meshes.push(addOpeningSection(item.poly, scale, cx, cy, WINDOW_TOP, WALL_HEIGHT, wallMat, true));
}

for (const mesh of meshes.filter(Boolean)) {
  mesh.scale.z = 0.001;
  animations.push({ mesh, start, delay: i * STAGGER_MS, duration: RISE_DURATION_MS });
}
```

- [ ] **Step 4: Show Roboflow status without treating fallback as an error**

```javascript
function summarize(data) {
  const base = `${data.polygons.wall.length} walls · ${data.polygons.door.length} doors · ${data.polygons.window.length} windows`;
  const detection = data.opening_detection;
  return detection?.warning ? `${base} · ${detection.warning}` : base;
}
```

- [ ] **Step 5: Restart the server and perform browser verification**

Run: `\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8012`

Verify with Playwright at desktop and mobile widths: the uploaded plan remains visible, all meshes align with it, doors sit on walls from floor level, windows sit inside walls above floor level, and controls/status text do not overlap.

- [ ] **Step 6: Commit the viewer task**

```powershell
git add viewer/index.html
git commit -m "feat: render aligned door and window openings"
```

### Task 5: Document Configuration and Run End-to-End Checks

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: final server and viewer behavior.
- Produces: copy-paste Windows startup commands and verified fallback/online behavior.

- [ ] **Step 1: Document environment setup without embedding the secret**

```powershell
$env:ROBOFLOW_API_KEY = Read-Host "Roboflow API key"
$env:ROBOFLOW_FLOOR_PLAN_MODEL="cubicasa5k-2-qpmsa/6"
.\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8012
```

- [ ] **Step 2: Run static and unit verification**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v`

Expected: all tests PASS.

- [ ] **Step 3: Verify wall-only fallback**

Start without `ROBOFLOW_API_KEY`, upload an AIHub image, and confirm HTTP 200 with non-empty wall polygons, empty door/window arrays, and `opening_detection.status == "disabled"`.

- [ ] **Step 4: Verify real Roboflow integration when a key is available**

Start with `ROBOFLOW_API_KEY`, upload the same AIHub image, and confirm HTTP 200, zero consumed Roboflow wall predictions, and accepted door/window counts matching the rendered 3D openings.

- [ ] **Step 5: Commit documentation**

```powershell
git add README.md
git commit -m "docs: explain Roboflow opening configuration"
```
