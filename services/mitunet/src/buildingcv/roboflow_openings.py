"""Roboflow client that exposes door/window detections only."""

from __future__ import annotations

import base64
import math
import os
from dataclasses import dataclass
from typing import Literal, Mapping

import httpx

DEFAULT_MODEL = "cubicasa5k-2-qpmsa/6"
DEFAULT_DOOR_THRESHOLD = 0.40
DEFAULT_WINDOW_THRESHOLD = 0.20
DEFAULT_DETECTION_CONFIDENCE = 20
DEFAULT_DETECTION_OVERLAP = 30
DUPLICATE_IOU_THRESHOLD = 0.50
DUPLICATE_CONTAINMENT_THRESHOLD = 0.75

OpeningKind = Literal["door", "window"]
DetectionStatus = Literal["ready", "disabled", "failed"]


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
    mask_polygon: tuple[tuple[float, float], ...] = ()


@dataclass(frozen=True)
class RoboflowResult:
    status: DetectionStatus
    model: str
    detections: list[OpeningDetection]
    warning: str | None = None


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _opening_kind(class_name: object) -> OpeningKind | None:
    normalized = str(class_name or "").strip().lower().replace("-", "_").replace(" ", "_")
    if "door" in normalized:
        return "door"
    if "window" in normalized:
        return "window"
    return None


def _finite_number(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _corners(item: OpeningDetection) -> tuple[float, float, float, float]:
    return (
        item.center_x - item.width / 2,
        item.center_y - item.height / 2,
        item.center_x + item.width / 2,
        item.center_y + item.height / 2,
    )


def _is_duplicate(first: OpeningDetection, second: OpeningDetection) -> bool:
    ax1, ay1, ax2, ay2 = _corners(first)
    bx1, by1, bx2, by2 = _corners(second)
    intersection_width = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    intersection_height = max(0.0, min(ay2, by2) - max(ay1, by1))
    intersection = intersection_width * intersection_height
    area_a = max(1.0, first.width * first.height)
    area_b = max(1.0, second.width * second.height)
    union = max(1.0, area_a + area_b - intersection)
    smaller = max(1.0, min(area_a, area_b))
    return (
        intersection / union > DUPLICATE_IOU_THRESHOLD
        or intersection / smaller > DUPLICATE_CONTAINMENT_THRESHOLD
    )


def parse_opening_predictions(
    payload: Mapping[str, object],
    model: str,
    door_threshold: float = DEFAULT_DOOR_THRESHOLD,
    window_threshold: float = DEFAULT_WINDOW_THRESHOLD,
) -> list[OpeningDetection]:
    """Parse only door/window boxes; wall predictions never leave this function."""
    image = payload.get("image")
    image_mapping = image if isinstance(image, Mapping) else {}
    image_width = max(1, int(_finite_number(image_mapping.get("width")) or 1))
    image_height = max(1, int(_finite_number(image_mapping.get("height")) or 1))
    predictions = payload.get("predictions")
    prediction_list = predictions if isinstance(predictions, list) else []

    mapped: list[OpeningDetection] = []
    for prediction in prediction_list:
        if not isinstance(prediction, Mapping):
            continue
        kind = _opening_kind(prediction.get("class"))
        if kind is None:
            continue
        confidence = _finite_number(prediction.get("confidence")) or 0.0
        threshold = door_threshold if kind == "door" else window_threshold
        center_x = _finite_number(prediction.get("x"))
        center_y = _finite_number(prediction.get("y"))
        width = _finite_number(prediction.get("width"))
        height = _finite_number(prediction.get("height"))
        if confidence < threshold or center_x is None or center_y is None:
            continue
        if width is None or height is None or width <= 0 or height <= 0:
            continue
        mapped.append(
            OpeningDetection(
                kind=kind,
                confidence=confidence,
                center_x=center_x,
                center_y=center_y,
                width=width,
                height=height,
                image_width=image_width,
                image_height=image_height,
                source_model=model,
            )
        )

    kept: list[OpeningDetection] = []
    for candidate in sorted(mapped, key=lambda item: item.confidence, reverse=True):
        if any(_is_duplicate(existing, candidate) for existing in kept):
            continue
        kept.append(candidate)
    return kept


class RoboflowOpeningClient:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float = 20.0,
    ) -> None:
        self.api_key = os.environ.get("ROBOFLOW_API_KEY", "") if api_key is None else api_key
        self.model = model or os.environ.get("ROBOFLOW_FLOOR_PLAN_MODEL", DEFAULT_MODEL)
        self.timeout_seconds = timeout_seconds
        self.door_threshold = _env_float("ROBOFLOW_DOOR_MIN_CONFIDENCE", DEFAULT_DOOR_THRESHOLD)
        self.window_threshold = _env_float("ROBOFLOW_WINDOW_MIN_CONFIDENCE", DEFAULT_WINDOW_THRESHOLD)

    async def detect(self, image_bytes: bytes) -> RoboflowResult:
        if not self.api_key:
            return RoboflowResult(
                status="disabled",
                model=self.model,
                detections=[],
                warning="ROBOFLOW_API_KEY is not configured; showing MitUNet walls only.",
            )

        endpoint = f"https://detect.roboflow.com/{self.model}"
        params = {
            "api_key": self.api_key,
            "confidence": str(DEFAULT_DETECTION_CONFIDENCE),
            "overlap": str(DEFAULT_DETECTION_OVERLAP),
        }
        encoded = base64.b64encode(image_bytes)
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    endpoint,
                    params=params,
                    content=encoded,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                response.raise_for_status()
                payload = response.json()
            if not isinstance(payload, Mapping):
                raise ValueError("Roboflow response is not an object")
            detections = parse_opening_predictions(
                payload,
                model=self.model,
                door_threshold=self.door_threshold,
                window_threshold=self.window_threshold,
            )
            return RoboflowResult("ready", self.model, detections)
        except (httpx.HTTPError, TypeError, ValueError) as error:
            return RoboflowResult(
                status="failed",
                model=self.model,
                detections=[],
                warning=f"Roboflow opening detection failed ({type(error).__name__}); showing walls only.",
            )
