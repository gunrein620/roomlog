"""Synthesize wall support under detected openings before alignment.

A detected door or window is strong evidence that a wall exists at that
location even when MitUNet missed it (balcony edges and window symbols are
often drawn too thin to segment). Painting a thin wall band under each
detection lets ``align_openings`` accept openings that would otherwise be
rejected with ``no-nearby-wall`` or ``unsupported-ends``.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

from .roboflow_openings import OpeningDetection

SEARCH_TOLERANCE_PX = 24
LONGITUDINAL_EXTENSION_PX = 12
MIN_SYNTH_THICKNESS_PX = 3
MAX_SYNTH_THICKNESS_PX = 14
MIN_BAND_SUPPORT_PX = 4


def _contiguous_runs(flags: np.ndarray) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for index, enabled in enumerate(flags):
        if enabled and start is None:
            start = index
        elif not enabled and start is not None:
            runs.append((start, index))
            start = None
    if start is not None:
        runs.append((start, len(flags)))
    return runs


def _nearest_band(
    counts: np.ndarray,
    offset: int,
    target_center: float,
) -> tuple[int, int] | None:
    """Pick the supported transverse run closest to the detection center."""
    runs = _contiguous_runs(counts >= MIN_BAND_SUPPORT_PX)
    if not runs:
        return None
    start, end = min(
        runs,
        key=lambda run: abs(offset + (run[0] + run[1] - 1) / 2 - target_center),
    )
    return offset + start, offset + end


def _clamped_band(start: int, end: int, limit: int) -> tuple[int, int]:
    thickness = int(np.clip(end - start, MIN_SYNTH_THICKNESS_PX, MAX_SYNTH_THICKNESS_PX))
    center = (start + end) / 2
    clamped_start = int(round(center - thickness / 2))
    clamped_start = max(0, min(clamped_start, limit - thickness))
    return clamped_start, clamped_start + thickness


def reinforce_wall_mask(
    wall_mask: np.ndarray,
    detections: Sequence[OpeningDetection],
) -> np.ndarray:
    """Return a copy of ``wall_mask`` with a wall band painted under each opening."""
    if wall_mask.ndim != 2:
        raise ValueError("wall_mask must be a 2D array")
    wall = (wall_mask != 0).astype(np.uint8)
    reinforced = wall.copy()
    height_limit, width_limit = wall.shape

    for detection in detections:
        if detection.kind != "window":
            continue
        scale_x = width_limit / max(1, detection.image_width)
        scale_y = height_limit / max(1, detection.image_height)
        center_x = detection.center_x * scale_x
        center_y = detection.center_y * scale_y
        width = max(2.0, detection.width * scale_x)
        height = max(2.0, detection.height * scale_y)
        horizontal = width >= height

        if horizontal:
            span_start = max(0, int(np.floor(center_x - width / 2)))
            span_end = min(width_limit, int(np.ceil(center_x + width / 2)))
            search_start = max(0, int(np.floor(center_y - height / 2 - SEARCH_TOLERANCE_PX)))
            search_end = min(height_limit, int(np.ceil(center_y + height / 2 + SEARCH_TOLERANCE_PX)))
            if span_end <= span_start or search_end <= search_start:
                continue
            probe_start = max(0, span_start - SEARCH_TOLERANCE_PX)
            probe_end = min(width_limit, span_end + SEARCH_TOLERANCE_PX)
            counts = np.count_nonzero(wall[search_start:search_end, probe_start:probe_end], axis=1)
            band = _nearest_band(counts, search_start, center_y)
            if band is None:
                thickness = int(np.clip(round(height), MIN_SYNTH_THICKNESS_PX, MAX_SYNTH_THICKNESS_PX))
                band = (int(round(center_y - thickness / 2)), int(round(center_y - thickness / 2)) + thickness)
            top, bottom = _clamped_band(*band, height_limit)
            left = max(0, span_start - LONGITUDINAL_EXTENSION_PX)
            right = min(width_limit, span_end + LONGITUDINAL_EXTENSION_PX)
            reinforced[top:bottom, left:right] = 1
        else:
            span_start = max(0, int(np.floor(center_y - height / 2)))
            span_end = min(height_limit, int(np.ceil(center_y + height / 2)))
            search_start = max(0, int(np.floor(center_x - width / 2 - SEARCH_TOLERANCE_PX)))
            search_end = min(width_limit, int(np.ceil(center_x + width / 2 + SEARCH_TOLERANCE_PX)))
            if span_end <= span_start or search_end <= search_start:
                continue
            probe_start = max(0, span_start - SEARCH_TOLERANCE_PX)
            probe_end = min(height_limit, span_end + SEARCH_TOLERANCE_PX)
            counts = np.count_nonzero(wall[probe_start:probe_end, search_start:search_end], axis=0)
            band = _nearest_band(counts, search_start, center_x)
            if band is None:
                thickness = int(np.clip(round(width), MIN_SYNTH_THICKNESS_PX, MAX_SYNTH_THICKNESS_PX))
                band = (int(round(center_x - thickness / 2)), int(round(center_x - thickness / 2)) + thickness)
            left, right = _clamped_band(*band, width_limit)
            top = max(0, span_start - LONGITUDINAL_EXTENSION_PX)
            bottom = min(height_limit, span_end + LONGITUDINAL_EXTENSION_PX)
            reinforced[top:bottom, left:right] = 1

    return reinforced
