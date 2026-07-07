# Roomlog Floor-Plan Dataset Tools

Standalone tooling for AI Hub #239 `TL_STR` / `VL_STR` structure labels. These scripts stream individual files from the dataset zips and do not extract the full dataset.

## Dataset

Default root:

```bash
/Volumes/PROJECTS/239.건축 도면 데이터/01-1.정식개방데이터
```

Override with either `AIHUB_FLOORPLAN_ROOT` or `--dataset-root`.

Drawing type filter:

- Filenames are parsed as `{BUILDING}_{TYPE}_STR_*`.
- Default is FP-only (`--drawing-types FP`) to avoid cross-section/elevation contamination.
- Override with comma-separated types, for example `--drawing-types FP,CS`, or disable with `--drawing-types ALL`.

Default 3-class taxonomy:

- `구조_벽체` -> `wall`
- `구조_출입문` -> `door`
- `구조_창호` -> `window`

`background`, fixtures, rooms, and OCR are dropped.

Optional 4-class taxonomy:

- `구조_벽체` -> `wall`
- `구조_출입문` + `여닫이문` -> `hinged_door`
- `구조_출입문` + `미닫이문` -> `sliding_door`
- `구조_창호` -> `window`

Unrecognized door subtype handling is controlled by `--unknown-door drop|hinged` and defaults to `drop`.

## 1. Overlay Verifier

Renders about eight diverse floor plans with bbox overlays:

- door: green
- window: blue
- wall: faint gray

Labels include subtype attributes such as `door/미닫이문` or `window/미닫이창`.

```bash
python3 tools/floorplan-dataset/overlay_verifier.py
```

Outputs:

```bash
tools/floorplan-dataset/overlays/*.png
```

Include non-FP drawings only when intentionally auditing contamination:

```bash
python3 tools/floorplan-dataset/overlay_verifier.py --drawing-types FP,CS,EP
```

## 2. COCO -> Roboflow Export

Default subset is FP-only, 1500 train / 300 validation, seeded and resized to max dimension 1600 px.

```bash
python3 tools/floorplan-dataset/export_roboflow_coco.py
```

Report FP pool counts and subtype coverage before exporting:

```bash
python3 tools/floorplan-dataset/export_roboflow_coco.py --report-stats --stats-sample-count 300
```

Output layout:

```bash
tools/floorplan-dataset/export/roomlog-openings-coco/
  train/
    _annotations.coco.json
    *.png
  valid/
    _annotations.coco.json
    *.png
tools/floorplan-dataset/export/roomlog-openings-coco.manifest.json
```

The uploadable folder itself intentionally contains only `train/` and `valid/`; the manifest is a sibling file so Roboflow's folder parser does not treat it as an annotation JSON.

Smoke example:

```bash
python3 tools/floorplan-dataset/export_roboflow_coco.py \
  --train-count 3 \
  --val-count 2 \
  --output-dir tools/floorplan-dataset/export/smoke-fp-class3 \
  --class-mode 3 \
  --overwrite
```

4-class export:

```bash
python3 tools/floorplan-dataset/export_roboflow_coco.py \
  --train-count 1500 \
  --val-count 300 \
  --class-mode 4 \
  --unknown-door drop \
  --output-dir tools/floorplan-dataset/export/roomlog-openings-coco-4class \
  --overwrite
```

Optional upload is gated:

```bash
export ROBOFLOW_API_KEY=...
export ROBOFLOW_WORKSPACE=...
export ROBOFLOW_PROJECT=...
python3 tools/floorplan-dataset/export_roboflow_coco.py --upload --batch-name aihub-239
```

The upload path uses the Roboflow Python SDK and requires `pip install roboflow`. It calls `workspace(ROBOFLOW_WORKSPACE).upload_dataset(...)` with `project_name=ROBOFLOW_PROJECT`.

## 3. Local Ultralytics YOLO Training

Use this path when training locally, for example Ultralytics YOLO11m-seg on an RTX 4080 16GB, bypassing Roboflow training limits. The exporter uses AI Hub Training only for `train`/`val`; AI Hub Validation is reserved for final evaluation unless `--include-aihub-validation` is explicitly passed.

Create a local training environment:

```bash
python3 -m venv .venv-yolo
source .venv-yolo/bin/activate
pip install --upgrade pip
pip install ultralytics pyyaml
```

Export YOLO segmentation data, FP-only, 4-class door split:

```bash
python3 tools/floorplan-dataset/export_yolo.py \
  --task seg \
  --class-mode 4 \
  --unknown-door drop \
  --train-count 0 \
  --val-fraction 0.05 \
  --max-dim 1600 \
  --workers 8 \
  --out tools/floorplan-dataset/export/roomlog-openings-yolo-seg-4class \
  --overwrite
```

Recommended RTX 4080 16GB training command:

```bash
yolo segment train \
  data=tools/floorplan-dataset/export/roomlog-openings-yolo-seg-4class/data.yaml \
  model=yolo11m-seg.pt \
  imgsz=1024 \
  batch=8 \
  epochs=50 \
  max_det=600 \
  workers=8
```

`batch=8` is a conservative 16GB starting point; `batch=-1` can be used to let Ultralytics auto-size. Keep `max_det=600` because floor plans commonly contain 100-250 structure objects.

Final metrics should come from the untouched AI Hub Validation split via:

```bash
python3 tools/floorplan-dataset/eval_roboflow_validation.py --class-mode 4 --unknown-door drop
```

If you explicitly exported AI Hub Validation as a YOLO `test` split with `--include-aihub-validation`, you can also run Ultralytics validation against that test split, but keep it out of model selection.

Detection export is available with `--task detect`; its labels use standard YOLO `class cx cy w h` rows instead of segmentation polygons.

## 4. Roboflow Validation Eval

Runs a Roboflow hosted model against the FP-only AI Hub validation split and computes IoU-matched precision, recall, and F1.

```bash
export ROBOFLOW_API_KEY=...
export ROBOFLOW_FLOOR_PLAN_MODEL="your-project/1"
python3 tools/floorplan-dataset/eval_roboflow_validation.py --class-mode 3
```

4-class eval:

```bash
export ROBOFLOW_API_KEY=...
export ROBOFLOW_FLOOR_PLAN_MODEL="your-4class-project/1"
python3 tools/floorplan-dataset/eval_roboflow_validation.py --class-mode 4 --unknown-door drop
```

Small smoke without API calls:

```bash
python3 tools/floorplan-dataset/eval_roboflow_validation.py --limit 2 --dry-run
```

Reports are written under:

```bash
tools/floorplan-dataset/eval/
```
