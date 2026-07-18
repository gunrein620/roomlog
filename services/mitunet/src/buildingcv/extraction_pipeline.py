"""Compose MitUNet wall masks with aligned Roboflow door/window detections."""

from __future__ import annotations

from typing import TypedDict

import numpy as np

from .mitunet_polygons import ExtractionResult, mask_to_polygons
from .opening_alignment import AlignedOpening, OpeningAlignmentResult, align_openings
from .review_edits import EditableOpeningPayload, editable_openings_payload, encode_wall_mask_png
from .roboflow_openings import RoboflowResult
from .wall_reinforcement import reinforce_wall_mask


class OpeningDetectionMetadata(TypedDict):
    status: str
    model: str
    accepted_doors: int
    accepted_windows: int
    rejected: int
    warning: str | None


class CombinedExtractionResult(ExtractionResult):
    wall_mask_b64: str
    openings: list[EditableOpeningPayload]
    opening_detection: OpeningDetectionMetadata


def compose_opening_review(
    wall_mask: np.ndarray,
    opening_result: RoboflowResult,
) -> CombinedExtractionResult:
    """Return raw MitUNet walls plus separate, editable local-YOLO candidates."""
    if wall_mask.ndim != 2:
        raise ValueError("wall_mask must be a 2D array")

    height, width = wall_mask.shape
    detections = opening_result.detections if opening_result.status == "ready" else []
    openings = []
    for index, detection in enumerate(detections, start=1):
        scale_x = width / max(1, detection.image_width)
        scale_y = height / max(1, detection.image_height)
        opening_width = detection.width * scale_x
        opening_height = detection.height * scale_y
        openings.append(
            AlignedOpening(
                opening_id=detection.opening_id or f"yolo-{index}",
                kind=detection.kind,
                confidence=detection.confidence,
                center_x=detection.center_x * scale_x,
                center_y=detection.center_y * scale_y,
                width=opening_width,
                height=opening_height,
                axis="horizontal" if opening_width >= opening_height else "vertical",
                valid=True,
                source_model=detection.source_model,
                mask_polygon=tuple(
                    (x * scale_x, y * scale_y) for x, y in detection.mask_polygon
                ),
            )
        )

    return {
        "canvas_size": [width, height],
        "content_rect": [0, 0, width, height],
        "wall_mask_b64": encode_wall_mask_png(wall_mask),
        "openings": editable_openings_payload(openings),
        "polygons": mask_to_polygons(wall_mask),
        "opening_detection": {
            "status": opening_result.status,
            "model": opening_result.model,
            "accepted_doors": sum(item.kind == "door" for item in openings),
            "accepted_windows": sum(item.kind == "window" for item in openings),
            "rejected": 0,
            "warning": opening_result.warning,
        },
    }


def compose_extraction(
    wall_mask: np.ndarray,
    roboflow: RoboflowResult,
) -> CombinedExtractionResult:
    """Build the viewer payload while preserving walls on Roboflow failure."""
    if wall_mask.ndim != 2:
        raise ValueError("wall_mask must be a 2D array")
    if roboflow.status == "ready":
        wall_mask = reinforce_wall_mask(wall_mask, roboflow.detections)
        aligned = align_openings(wall_mask, roboflow.detections)
    else:
        aligned = OpeningAlignmentResult(
            class_mask=wall_mask.astype(bool).astype(np.uint8),
            accepted_doors=0,
            accepted_windows=0,
            rejected=0,
            openings=(),
        )
    height, width = wall_mask.shape
    return {
        "canvas_size": [width, height],
        "content_rect": [0, 0, width, height],
        "wall_mask_b64": encode_wall_mask_png(wall_mask),
        "openings": editable_openings_payload(aligned.openings),
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
