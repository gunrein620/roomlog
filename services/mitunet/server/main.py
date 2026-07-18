"""Local PNG/JPEG inference server for the MitUNet wall-to-3D demo."""

from __future__ import annotations

import base64
import json
import os
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from typing import Annotated, Literal

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError

from buildingcv.extraction_pipeline import compose_opening_review
from buildingcv.local_yolo_openings import LocalYoloSegmentOpeningClient
from buildingcv.mitunet import MitUNetPolygonExtractor
from buildingcv.review_edits import compose_review_edits, decode_wall_mask_png, parse_review_openings
from server.integration import integration_config_payload

REPO_ROOT = Path(__file__).resolve().parent.parent
VIEWER_HTML = REPO_ROOT / "viewer" / "index.html"
VIEWER_DIR = REPO_ROOT / "viewer"
DEFAULT_WEIGHTS = REPO_ROOT / "weights" / "best.pth"
DEFAULT_YOLO_SEG_WEIGHTS = REPO_ROOT / "weights" / "yolo-segv1.pt"
DEFAULT_DEVICE = "auto"
MAX_UPLOAD_BYTES = 16 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    weights_path = Path(os.environ.get("MITUNET_WEIGHTS", str(DEFAULT_WEIGHTS)))
    if not weights_path.is_file():
        raise RuntimeError(f"MitUNet checkpoint not found: {weights_path}")
    yolo_weights_path = Path(os.environ.get("YOLO_SEG_WEIGHTS", str(DEFAULT_YOLO_SEG_WEIGHTS)))
    if not yolo_weights_path.is_file():
        raise RuntimeError(f"YOLO segmentation checkpoint not found: {yolo_weights_path}")
    device = os.environ.get("BUILDINGCV_DEVICE", DEFAULT_DEVICE)
    extractor = MitUNetPolygonExtractor(str(weights_path), device=device)
    yolo_client = LocalYoloSegmentOpeningClient(yolo_weights_path)
    print(f"[server] loaded MitUNet checkpoint {weights_path} on {extractor.device}")
    print(f"[server] loaded local YOLO segmentation checkpoint {yolo_weights_path}")
    app.state.extractor = extractor
    app.state.yolo_client = yolo_client
    yield


app = FastAPI(title="MitUNet floorplan to 3D", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/integration-config")
def integration_config() -> dict[str, list[str]]:
    return integration_config_payload()


@app.get("/healthz")
def healthz() -> dict:
    extractor: MitUNetPolygonExtractor = app.state.extractor
    yolo_client: LocalYoloSegmentOpeningClient = app.state.yolo_client
    return {
        "ok": True,
        "device": str(extractor.device),
        "image_size": [1024, 1024],
        "classes": ["floor", "wall"],
        "model": "MitUNet MiT-B4 + U-Net scSE",
        "opening_model": yolo_client.model_name,
        "opening_detection_enabled": True,
    }


@app.get("/")
def index() -> FileResponse:
    return FileResponse(VIEWER_HTML)


DEMOS_DIR = REPO_ROOT / "viewer" / "demos"
app.mount("/viewer-assets", StaticFiles(directory=VIEWER_DIR), name="viewer-assets")
if DEMOS_DIR.is_dir():
    app.mount("/demos", StaticFiles(directory=DEMOS_DIR), name="demos")


def attach_input_image(image: Image.Image, result: dict, field_name: str = "input_image_b64") -> dict:
    """Inline a PNG image payload under the requested response field."""
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    result[field_name] = base64.b64encode(buffer.getvalue()).decode("ascii")
    return result


@app.post("/extract-image")
async def extract_image(image: UploadFile = File(...)) -> dict:
    """Run the binary MitUNet wall model on a floor-plan PNG or JPEG."""
    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty upload")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"upload exceeds {MAX_UPLOAD_BYTES} bytes")

    extractor: MitUNetPolygonExtractor = app.state.extractor
    yolo_client: LocalYoloSegmentOpeningClient = app.state.yolo_client
    try:
        source = Image.open(BytesIO(raw))
        wall_mask, rendered_image = extractor.predict_mask(source)
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=422, detail="upload a readable PNG or JPEG floor plan") from error
    opening_result = yolo_client.detect(rendered_image)
    result = compose_opening_review(wall_mask, opening_result)
    # Geometry stays aligned to MitUNet's 1024px render; AI room/OCR analysis
    # receives the untouched upload so labels are not stretched to a square.
    attach_input_image(rendered_image, result)
    return attach_input_image(source, result, "analysis_image_b64")


@app.post("/compose-edits")
async def compose_edits(
    wall_mask: UploadFile = File(...),
    openings: str = Form("[]"),
    wall_polygon_mode: Annotated[Literal["exact", "legacy", "copy-wall"], Form()] = "exact",
) -> dict:
    try:
        mask = decode_wall_mask_png(await wall_mask.read())
        if not np.any(mask):
            raise ValueError("at least one wall is required")
        detections = parse_review_openings(json.loads(openings))
    except (UnidentifiedImageError, json.JSONDecodeError, TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return compose_review_edits(
        mask,
        detections,
        wall_polygon_mode=wall_polygon_mode,
    )
