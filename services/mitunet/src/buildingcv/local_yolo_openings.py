"""Local YOLO segmentation inference for door and window review candidates."""

from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Sequence

import numpy as np
from PIL import Image

from .roboflow_openings import OpeningDetection, RoboflowResult

YOLO_CLASS_TO_OPENING_KIND = {0: "door", 1: "door", 2: "window"}
DEFAULT_CONFIDENCE = 0.25
DEFAULT_IMAGE_SIZE = 1024


def parse_yolo_opening_boxes(
    class_ids: Sequence[float],
    confidences: Sequence[float],
    xywh: Sequence[Sequence[float]],
    image_width: int,
    image_height: int,
    model: str,
    mask_polygons: Sequence[Sequence[Sequence[float]]] | None = None,
) -> list[OpeningDetection]:
    """Convert YOLO's hinge/slide/window boxes into reviewable openings."""
    detections: list[OpeningDetection] = []
    for index, (class_id, confidence, box) in enumerate(zip(class_ids, confidences, xywh)):
        kind = YOLO_CLASS_TO_OPENING_KIND.get(int(class_id))
        if kind is None or len(box) != 4:
            continue
        center_x, center_y, width, height = (float(value) for value in box)
        confidence = float(confidence)
        if not all(math.isfinite(value) for value in (center_x, center_y, width, height, confidence)):
            continue
        if width <= 0 or height <= 0 or confidence <= 0:
            continue
        raw_polygon = mask_polygons[index] if mask_polygons and index < len(mask_polygons) else ()
        mask_polygon = tuple(
            (float(point[0]), float(point[1]))
            for point in raw_polygon
            if len(point) >= 2
            and math.isfinite(float(point[0]))
            and math.isfinite(float(point[1]))
        )
        if len(mask_polygon) < 3:
            mask_polygon = ()
        detections.append(
            OpeningDetection(
                kind=kind,
                confidence=confidence,
                center_x=center_x,
                center_y=center_y,
                width=width,
                height=height,
                image_width=max(1, image_width),
                image_height=max(1, image_height),
                source_model=model,
                opening_id=f"yolo-{len(detections) + 1}",
                mask_polygon=mask_polygon,
            )
        )
    return detections


class LocalYoloSegmentOpeningClient:
    """Run the supplied YOLO segmentation checkpoint locally, without wall correction."""

    def __init__(
        self,
        weights_path: str | Path,
        confidence: float = DEFAULT_CONFIDENCE,
        image_size: int = DEFAULT_IMAGE_SIZE,
    ) -> None:
        self.weights_path = Path(weights_path)
        if not self.weights_path.is_file():
            raise FileNotFoundError(f"YOLO checkpoint not found: {self.weights_path}")
        self.confidence = confidence
        self.image_size = image_size
        runtime_dir = self.weights_path.parent.parent / ".runtime"
        os.environ.setdefault("YOLO_CONFIG_DIR", str(runtime_dir / "ultralytics"))
        os.environ.setdefault("MPLCONFIGDIR", str(runtime_dir / "matplotlib"))
        Path(os.environ["YOLO_CONFIG_DIR"]).mkdir(parents=True, exist_ok=True)
        Path(os.environ["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)
        from ultralytics import YOLO

        self.model = YOLO(str(self.weights_path))
        self.model_name = self.weights_path.name

    def detect(self, image: Image.Image) -> RoboflowResult:
        try:
            result = self.model.predict(
                np.asarray(image.convert("RGB")),
                imgsz=self.image_size,
                conf=self.confidence,
                verbose=False,
            )[0]
            if result.boxes is None:
                return RoboflowResult("ready", self.model_name, [])
            height, width = result.orig_shape
            detections = parse_yolo_opening_boxes(
                class_ids=result.boxes.cls.detach().cpu().tolist(),
                confidences=result.boxes.conf.detach().cpu().tolist(),
                xywh=result.boxes.xywh.detach().cpu().tolist(),
                image_width=int(width),
                image_height=int(height),
                model=self.model_name,
                mask_polygons=result.masks.xy if result.masks is not None else None,
            )
            return RoboflowResult("ready", self.model_name, detections)
        except (RuntimeError, TypeError, ValueError, OSError) as error:
            return RoboflowResult(
                "failed",
                self.model_name,
                [],
                warning=f"Local YOLO opening detection failed ({type(error).__name__}).",
            )
