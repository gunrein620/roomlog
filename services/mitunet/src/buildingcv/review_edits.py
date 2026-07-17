"""Helpers for editable recognition-review payloads."""

from __future__ import annotations

import base64
import math
from dataclasses import replace
from io import BytesIO
from typing import TYPE_CHECKING, Sequence, TypedDict

import numpy as np
import cv2
from PIL import Image

from .opening_alignment import AlignedOpening
from .roboflow_openings import OpeningDetection

if TYPE_CHECKING:
    from .extraction_pipeline import CombinedExtractionResult
    from .mitunet_polygons import WallPolygonMode
    from .opening_alignment import OpeningAlignmentResult

CANVAS_SIZE = 1024


class EditableOpeningPayload(TypedDict):
    id: str
    kind: str
    confidence: float
    center_x: float
    center_y: float
    width: float
    height: float
    axis: str
    valid: bool
    reason: str
    mask_polygon: list[list[float]]


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


def editable_openings_payload(items: Sequence[AlignedOpening]) -> list[EditableOpeningPayload]:
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
            "reason": item.reason,
            "mask_polygon": [[x, y] for x, y in item.mask_polygon],
        }
        for item in items
    ]


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

        try:
            center_x = float(item.get("center_x"))
            center_y = float(item.get("center_y"))
            width = float(item.get("width"))
            height = float(item.get("height"))
        except (TypeError, ValueError) as error:
            raise ValueError(f"opening {opening_id} coordinates must be finite") from error

        if not all(math.isfinite(number) for number in (center_x, center_y, width, height)):
            raise ValueError(f"opening {opening_id} coordinates must be finite")
        if width < 2 or height < 2 or not (0 <= center_x <= CANVAS_SIZE and 0 <= center_y <= CANVAS_SIZE):
            raise ValueError(f"opening {opening_id} is outside the editable canvas")
        if opening_id in seen_ids:
            raise ValueError(f"duplicate opening id: {opening_id}")

        try:
            confidence = float(item.get("confidence", 1.0))
        except (TypeError, ValueError) as error:
            raise ValueError(f"opening {opening_id} confidence must be finite") from error
        if not math.isfinite(confidence):
            raise ValueError(f"opening {opening_id} confidence must be finite")

        raw_mask_polygon = item.get("mask_polygon", [])
        if not isinstance(raw_mask_polygon, list):
            raise ValueError(f"opening {opening_id} mask_polygon must be an array")
        mask_polygon: list[tuple[float, float]] = []
        for point in raw_mask_polygon:
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                raise ValueError(f"opening {opening_id} mask_polygon point is invalid")
            try:
                x, y = float(point[0]), float(point[1])
            except (TypeError, ValueError) as error:
                raise ValueError(f"opening {opening_id} mask_polygon point is invalid") from error
            if not (math.isfinite(x) and math.isfinite(y) and 0 <= x <= CANVAS_SIZE and 0 <= y <= CANVAS_SIZE):
                raise ValueError(f"opening {opening_id} mask_polygon point is invalid")
            mask_polygon.append((x, y))
        if mask_polygon and len(mask_polygon) < 3:
            raise ValueError(f"opening {opening_id} mask_polygon needs at least three points")

        seen_ids.add(opening_id)
        parsed.append(
            OpeningDetection(
                kind=kind,
                confidence=confidence,
                center_x=center_x,
                center_y=center_y,
                width=width,
                height=height,
                image_width=CANVAS_SIZE,
                image_height=CANVAS_SIZE,
                source_model="review-editor",
                opening_id=opening_id,
                mask_polygon=tuple(mask_polygon),
            )
        )

    return parsed


def compose_review_edits(
    wall_mask: np.ndarray,
    detections: Sequence[OpeningDetection],
    *,
    wall_polygon_mode: "WallPolygonMode" = "exact",
) -> "CombinedExtractionResult":
    from .mitunet_polygons import mask_to_polygons
    from .opening_alignment import align_openings

    if wall_mask.ndim != 2:
        raise ValueError("wall_mask must be a 2D array")

    base_aligned = align_openings(wall_mask, detections)
    aligned = _apply_segmented_window_masks(base_aligned, detections)
    polygon_mask = aligned.class_mask
    if wall_polygon_mode == "legacy":
        # The copy viewer kept detected doors editable in 2D but never stamped
        # them into the class mask, so door footprints did not cut 3D walls.
        polygon_mask = polygon_mask.copy()
        door_pixels = polygon_mask == 2
        polygon_mask[door_pixels] = wall_mask[door_pixels]
    polygon_mode = "legacy" if wall_polygon_mode == "copy-wall" else wall_polygon_mode
    polygons = mask_to_polygons(polygon_mask, wall_mode=polygon_mode)
    if wall_polygon_mode == "exact":
        # Exact mode preserves the reviewed wall mask without cutting openings
        # into it. Legacy mode intentionally follows the previous viewer output.
        polygons["wall"] = mask_to_polygons(wall_mask)["wall"]
    elif wall_polygon_mode == "copy-wall":
        copy_wall_mask = _copy_wall_class_mask(wall_mask, base_aligned, detections)
        polygons["wall"] = mask_to_polygons(copy_wall_mask, wall_mode="legacy")["wall"]
    height, width = wall_mask.shape
    return {
        "canvas_size": [width, height],
        "content_rect": [0, 0, width, height],
        "wall_mask_b64": encode_wall_mask_png(wall_mask),
        "openings": editable_openings_payload(aligned.openings),
        "polygons": polygons,
        "opening_detection": {
            "status": "ready",
            "model": "review-editor",
            "accepted_doors": aligned.accepted_doors,
            "accepted_windows": aligned.accepted_windows,
            "rejected": aligned.rejected,
            "warning": None,
        },
    }


def _copy_wall_class_mask(
    wall_mask: np.ndarray,
    aligned: "OpeningAlignmentResult",
    detections: Sequence[OpeningDetection],
) -> np.ndarray:
    """Reproduce the copy viewer's wall mask while leaving current openings intact."""
    class_mask = aligned.class_mask.copy()
    door_pixels = class_mask == 2
    class_mask[door_pixels] = wall_mask[door_pixels]
    height, width = class_mask.shape
    window_ids = {
        detection.opening_id
        for detection in detections
        if detection.kind == "window" and len(detection.mask_polygon) >= 3
    }
    for opening in aligned.openings:
        if opening.kind != "window" or opening.opening_id not in window_ids:
            continue
        left = max(0, int(np.floor(opening.center_x - opening.width / 2)))
        right = min(width, int(np.ceil(opening.center_x + opening.width / 2)))
        top = max(0, int(np.floor(opening.center_y - opening.height / 2)))
        bottom = min(height, int(np.ceil(opening.center_y + opening.height / 2)))
        region = class_mask[top:bottom, left:right]
        region[region == 3] = 1
    for detection in detections:
        if detection.opening_id not in window_ids:
            continue
        points = np.asarray(detection.mask_polygon, dtype=np.float32)
        points[:, 0] = np.clip(points[:, 0], 0, width - 1)
        points[:, 1] = np.clip(points[:, 1], 0, height - 1)
        mask = np.zeros_like(class_mask, dtype=np.uint8)
        cv2.fillPoly(mask, [np.rint(points).astype(np.int32)], 1)
        class_mask[mask != 0] = 3
    return class_mask


def _apply_segmented_window_masks(
    aligned: "OpeningAlignmentResult",
    detections: Sequence[OpeningDetection],
) -> "OpeningAlignmentResult":
    """Use YOLO window masks directly in 3D, even when wall snapping rejects them."""
    from .opening_alignment import OpeningAlignmentResult

    class_mask = aligned.class_mask.copy()
    window_ids: set[str] = set()
    height, width = class_mask.shape
    for detection in detections:
        if detection.kind != "window" or len(detection.mask_polygon) < 3:
            continue
        window_ids.add(detection.opening_id)

    for opening in aligned.openings:
        if opening.kind != "window" or opening.opening_id not in window_ids:
            continue
        left = max(0, int(np.floor(opening.center_x - opening.width / 2)))
        right = min(width, int(np.ceil(opening.center_x + opening.width / 2)))
        top = max(0, int(np.floor(opening.center_y - opening.height / 2)))
        bottom = min(height, int(np.ceil(opening.center_y + opening.height / 2)))
        class_mask[top:bottom, left:right][class_mask[top:bottom, left:right] == 3] = 1

    for detection in detections:
        if detection.opening_id not in window_ids:
            continue
        points = np.asarray(detection.mask_polygon, dtype=np.float32)
        points[:, 0] = np.clip(points[:, 0], 0, width - 1)
        points[:, 1] = np.clip(points[:, 1], 0, height - 1)
        # Raw YOLO segment outlines have small zig-zags that render as bumpy
        # window glass. Simplify the outline to drop those jitters while
        # keeping the overall shape — including curved balcony runs, which a
        # bounding rectangle would flatten into a thick straight slab.
        contour = np.rint(points).astype(np.int32).reshape(-1, 1, 2)
        epsilon = 0.005 * cv2.arcLength(contour, True)
        simplified = cv2.approxPolyDP(contour, epsilon, True)
        outline = simplified if len(simplified) >= 3 else contour
        mask = np.zeros_like(class_mask, dtype=np.uint8)
        cv2.fillPoly(mask, [outline], 1)
        class_mask[mask != 0] = 3

    openings = tuple(
        replace(opening, valid=True, reason="")
        if opening.kind == "window" and opening.opening_id in window_ids
        else opening
        for opening in aligned.openings
    )
    return OpeningAlignmentResult(
        class_mask=class_mask,
        accepted_doors=sum(opening.kind == "door" and opening.valid for opening in openings),
        accepted_windows=sum(opening.kind == "window" and opening.valid for opening in openings),
        rejected=sum(not opening.valid for opening in openings),
        openings=openings,
    )
