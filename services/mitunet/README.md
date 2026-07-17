# MitUNet + Roboflow Floorplan to 3D

This is a standalone floor-plan-to-3D demo. It adapts the polygon extraction and
Three.js viewer from `Yytsi/floorplan-to-3d`, but loads the local MitUNet
checkpoint at `weights/best.pth` instead of the original ResNet-UNet model.

## What it does

```text
PNG/JPEG floor plan
  -> MitUNet binary wall prediction (the only wall source)
  -> Roboflow door/window detection
  -> align openings to the MitUNet wall axis and thickness
  -> corrected wall/door/window polygons
  -> Three.js wall, door, and window preview
```

Roboflow wall predictions are always discarded. If Roboflow is unavailable or
not configured, the endpoint still returns the MitUNet wall-only result.

## Run on Windows

```powershell
cd C:\Users\smoun\Jungle\floorplan-to-3d-mitunet
$env:ROBOFLOW_API_KEY = "your Roboflow API key for this shell"
$env:ROBOFLOW_FLOOR_PLAN_MODEL = "cubicasa5k-2-qpmsa/6"
.\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8012
```

Open `http://127.0.0.1:8012`, then choose a PNG or JPEG floor-plan image.

## RoomLog integration

RoomLog opens this viewer with a one-time request id and its exact browser
origin. After review, choose **Show 3D** and then **RoomLog에 연결**. The viewer
sends the current wall, door, and window polygons back to the RoomLog window;
RoomLog saves them with the listing and renders them in its Three.js preview.

Allow the RoomLog development origin when starting this server:

```powershell
$env:ROOMLOG_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
.\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8012
```

Set `NEXT_PUBLIC_MITUNET_EDITOR_URL=http://127.0.0.1:8012` in RoomLog. For a
deployed RoomLog instance, add its exact HTTPS origin to
`ROOMLOG_ALLOWED_ORIGINS` and point the RoomLog variable at the deployed
MitUNet viewer URL. The origin list is exact and comma-separated.

The server resizes the uploaded image to 1024 x 1024 because that is the
resolution used by the MitUNet training script.

## Review workflow

The live viewer follows `Upload -> Show Original review -> Show 3D`. The
original view overlays walls in red, doors in amber, and windows in blue. Use
Select to move or resize openings, Wall and Erase with the brush-size control
to correct the mask, and Door or Window to add missing openings. Undo, redo,
delete, type change, reset, and per-class visibility controls remain available
throughout the review.

`Show 3D` composes the current wall mask and openings only after the review has
changed. Switching between the two views preserves the review and reuses the
cached 3D result for unchanged revisions. If Roboflow is disabled or fails,
the wall result still opens for review and the manual Door and Window tools
remain available. If 3D composition fails, the viewer returns to Show Original
with the review intact so Show 3D can be retried. Review edits stay in the
current browser session and are not saved by the server.

On a static host without `/healthz`, the viewer loads
`viewer/demos/manifest.json`, shows a compact sample selector, and opens the
first pre-rendered JSON sample automatically. These legacy samples render
directly in 3D; upload and review tools stay disabled because the sample
payloads do not include the editable wall mask and opening records.

## Layout

```text
weights/best.pth                 MitUNet checkpoint
src/buildingcv/mitunet.py        MitUNet loader and binary wall inference
src/buildingcv/mitunet_polygons.py
                                 Cairo-free class-mask to polygon conversion
src/buildingcv/roboflow_openings.py
                                 Door/window-only Roboflow client
src/buildingcv/opening_alignment.py
                                 Opening-to-wall axis and thickness correction
src/buildingcv/extraction_pipeline.py
                                 MitUNet and Roboflow result composition
server/main.py                   Combined PNG/JPEG API and local viewer server
viewer/index.html                Review editor and Three.js wall/opening preview
```
