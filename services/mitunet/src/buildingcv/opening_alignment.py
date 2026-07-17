"""Snap Roboflow door/window boxes to the local MitUNet wall footprint."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

import numpy as np

from .roboflow_openings import OpeningDetection, OpeningKind

MIN_MATCHED_WALL_PIXELS = 8
DEFAULT_MATCH_TOLERANCE_PX = 24
MAX_DOOR_MATCH_TOLERANCE_PX = 16
MAX_DOOR_CENTER_SHIFT_PX = 12
MIN_RENDERABLE_THICKNESS_PX = 3
MIN_WALL_BAND_SUPPORT_RATIO = 0.15
MIN_WALL_BAND_ASPECT_RATIO = 1.5
DOOR_JAMB_PROBE_PX = 4
DOOR_JAMB_BAND_TOLERANCE_PX = 3
MIN_DOOR_CONFIDENCE = 0.6


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
    reason: str = ""
    mask_polygon: tuple[tuple[float, float], ...] = ()


@dataclass(frozen=True)
class OpeningAlignmentResult:
    class_mask: np.ndarray
    accepted_doors: int
    accepted_windows: int
    rejected: int
    openings: tuple[AlignedOpening, ...] = ()


def _search_points(
    wall: np.ndarray,
    center_x: float,
    center_y: float,
    width: float,
    height: float,
    tolerance: int,
) -> np.ndarray:
    x0 = max(0, int(np.floor(center_x - width / 2 - tolerance)))
    x1 = min(wall.shape[1], int(np.ceil(center_x + width / 2 + tolerance)))
    y0 = max(0, int(np.floor(center_y - height / 2 - tolerance)))
    y1 = min(wall.shape[0], int(np.ceil(center_y + height / 2 + tolerance)))
    if x1 <= x0 or y1 <= y0:
        return np.empty((0, 2), dtype=np.float32)
    local_y, local_x = np.nonzero(wall[y0:y1, x0:x1])
    if local_x.size == 0:
        return np.empty((0, 2), dtype=np.float32)
    return np.column_stack((local_x + x0, local_y + y0)).astype(np.float32)


def _is_horizontal(points: np.ndarray) -> bool:
    centered = points - points.mean(axis=0, keepdims=True)
    covariance = centered.T @ centered
    eigenvalues, eigenvectors = np.linalg.eigh(covariance)
    major = eigenvectors[:, int(np.argmax(eigenvalues))]
    return abs(float(major[0])) >= abs(float(major[1]))


def _ensure_minimum_span(start: int, end: int, limit: int) -> tuple[int, int]:
    if end - start >= MIN_RENDERABLE_THICKNESS_PX:
        return start, end
    center = (start + end) / 2
    start = int(np.floor(center - MIN_RENDERABLE_THICKNESS_PX / 2))
    end = start + MIN_RENDERABLE_THICKNESS_PX
    if start < 0:
        return 0, min(limit, MIN_RENDERABLE_THICKNESS_PX)
    if end > limit:
        return max(0, limit - MIN_RENDERABLE_THICKNESS_PX), limit
    return start, end


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


def _supported_band_candidates(
    counts: np.ndarray,
    offset: int,
    target_center: float,
    longitudinal_span: int,
    target_half_span: float,
    tolerance: int,
) -> list[tuple[int, int]]:
    minimum_support = max(
        MIN_MATCHED_WALL_PIXELS,
        int(np.ceil(longitudinal_span * MIN_WALL_BAND_SUPPORT_RATIO)),
    )
    runs = _contiguous_runs(counts >= minimum_support)
    candidates = []
    for run in runs:
        start, end = run
        run_thickness = end - start
        peak_support = int(counts[start:end].max())
        minimum_oriented_support = max(
            MIN_MATCHED_WALL_PIXELS,
            int(np.ceil(run_thickness * MIN_WALL_BAND_ASPECT_RATIO)),
        )
        if peak_support < minimum_oriented_support:
            continue
        center = offset + (start + end - 1) / 2
        half_span = run_thickness / 2
        if abs(center - target_center) <= tolerance + target_half_span + half_span:
            candidates.append(run)
    def score(run: tuple[int, int]) -> tuple[float, int]:
        start, end = run
        center = offset + (start + end - 1) / 2
        support = int(counts[start:end].sum())
        return abs(center - target_center), -support

    return [
        (offset + start, offset + end)
        for start, end in sorted(candidates, key=score)
    ]


def _rasterized_longitudinal_span(
    center: float,
    length: float,
    limit: int,
) -> tuple[int, int]:
    span = max(2, int(round(length)))
    start = int(round(center - span / 2))
    end = start + span
    if start < 0:
        return 0, min(limit, span)
    if end > limit:
        return max(0, limit - span), limit
    return start, end


def _span_has_wall_support_at_both_ends(
    wall: np.ndarray,
    axis: Literal["horizontal", "vertical"],
    band_start: int,
    band_end: int,
    span_start: int,
    span_end: int,
) -> bool:
    return (
        _boundary_has_wall_support(wall, axis, band_start, band_end, span_start)
        and _boundary_has_wall_support(wall, axis, band_start, band_end, span_end)
    )


def _boundary_has_wall_support(
    wall: np.ndarray,
    axis: Literal["horizontal", "vertical"],
    band_start: int,
    band_end: int,
    position: int,
) -> bool:
    required = max(1, int(np.ceil((band_end - band_start) * 0.2)))
    if axis == "horizontal":
        support = wall[
            band_start:band_end,
            max(0, position - 1):min(wall.shape[1], position + 1),
        ]
    else:
        support = wall[
            max(0, position - 1):min(wall.shape[0], position + 1),
            band_start:band_end,
        ]
    return np.count_nonzero(support) >= required


def _snap_span_to_supported_wall_ends(
    wall: np.ndarray,
    axis: Literal["horizontal", "vertical"],
    band_start: int,
    band_end: int,
    span_start: int,
    span_end: int,
    tolerance: int,
) -> tuple[int, int] | None:
    limit = wall.shape[1] if axis == "horizontal" else wall.shape[0]
    shifts = [0]
    for distance in range(1, tolerance + 1):
        shifts.extend((-distance, distance))

    for shift in shifts:
        shifted_start = span_start + shift
        shifted_end = span_end + shift
        if shifted_start < 0 or shifted_end > limit:
            continue
        if _span_has_wall_support_at_both_ends(
            wall,
            axis,
            band_start,
            band_end,
            shifted_start,
            shifted_end,
        ):
            return shifted_start, shifted_end
    return None


def _fit_span_to_nearest_supported_ends(
    wall: np.ndarray,
    axis: Literal["horizontal", "vertical"],
    band_start: int,
    band_end: int,
    span_start: int,
    span_end: int,
    tolerance: int,
) -> tuple[int, int] | None:
    limit = wall.shape[1] if axis == "horizontal" else wall.shape[0]

    def nearest_supported(target: int) -> int | None:
        candidates = range(max(0, target - tolerance), min(limit, target + tolerance) + 1)
        supported = [
            position
            for position in candidates
            if _boundary_has_wall_support(wall, axis, band_start, band_end, position)
        ]
        if not supported:
            return None
        return min(supported, key=lambda position: (abs(position - target), position))

    fitted_start = nearest_supported(span_start)
    fitted_end = nearest_supported(span_end)
    if fitted_start is None or fitted_end is None or fitted_end - fitted_start < 2:
        return None
    return fitted_start, fitted_end


def _resolve_band_and_span(
    wall: np.ndarray,
    axis: Literal["horizontal", "vertical"],
    candidates: Sequence[tuple[int, int]],
    longitudinal_center: float,
    longitudinal_length: float,
    tolerance: int,
) -> tuple[int, int, int, int, bool]:
    """Pick the first candidate band whose span has wall support at both ends."""
    transverse_limit = wall.shape[0] if axis == "horizontal" else wall.shape[1]
    longitudinal_limit = wall.shape[1] if axis == "horizontal" else wall.shape[0]
    fallback: tuple[int, int, int, int] | None = None
    for band in candidates:
        band_start, band_end = _ensure_minimum_span(*band, transverse_limit)
        span_start, span_end = _rasterized_longitudinal_span(
            longitudinal_center, longitudinal_length, longitudinal_limit
        )
        snapped_span = _snap_span_to_supported_wall_ends(
            wall, axis, band_start, band_end, span_start, span_end, tolerance
        )
        if snapped_span is None:
            snapped_span = _fit_span_to_nearest_supported_ends(
                wall, axis, band_start, band_end, span_start, span_end, tolerance
            )
        if snapped_span is not None:
            return band_start, band_end, snapped_span[0], snapped_span[1], True
        if fallback is None:
            fallback = (band_start, band_end, span_start, span_end)
    assert fallback is not None
    return (*fallback, False)


def _window_rectangle_on_nearest_wall(
    wall: np.ndarray,
    center_x: float,
    center_y: float,
    width: float,
    height: float,
    tolerance: int,
) -> tuple[np.ndarray, Literal["horizontal", "vertical"], bool] | None:
    horizontal = width >= height
    x0 = max(0, int(np.floor(center_x - width / 2 - tolerance)))
    x1 = min(wall.shape[1], int(np.ceil(center_x + width / 2 + tolerance)))
    y0 = max(0, int(np.floor(center_y - height / 2 - tolerance)))
    y1 = min(wall.shape[0], int(np.ceil(center_y + height / 2 + tolerance)))
    if x1 <= x0 or y1 <= y0:
        return None

    rectangle = np.zeros_like(wall, dtype=bool)
    if horizontal:
        candidates = _supported_band_candidates(
            np.count_nonzero(wall[:, x0:x1], axis=1),
            0,
            center_y,
            x1 - x0,
            height / 2,
            tolerance,
        )
        if not candidates:
            return None
        top, bottom, left, right, both_ends_supported = _resolve_band_and_span(
            wall, "horizontal", candidates, center_x, width, tolerance
        )
        rectangle[top:bottom, left:right] = True
        return rectangle, "horizontal", both_ends_supported

    candidates = _supported_band_candidates(
        np.count_nonzero(wall[y0:y1, :], axis=0),
        0,
        center_x,
        y1 - y0,
        width / 2,
        tolerance,
    )
    if not candidates:
        return None
    left, right, top, bottom, both_ends_supported = _resolve_band_and_span(
        wall, "vertical", candidates, center_y, height, tolerance
    )
    rectangle[top:bottom, left:right] = True
    return rectangle, "vertical", both_ends_supported


def _corrected_rectangle(
    wall: np.ndarray,
    points: np.ndarray,
    center_x: float,
    center_y: float,
    width: float,
    height: float,
    axis: Literal["horizontal", "vertical"],
) -> np.ndarray | None:
    rectangle = np.zeros_like(wall, dtype=bool)
    if axis == "horizontal":
        along = points[np.abs(points[:, 0] - center_x) <= width / 2 + 1]
        if along.shape[0] < MIN_MATCHED_WALL_PIXELS:
            return None
        left = max(0, int(round(center_x - width / 2)))
        right = min(wall.shape[1], int(round(center_x + width / 2)) + 1)
        top = max(0, int(np.floor(np.percentile(along[:, 1], 5))))
        bottom = min(wall.shape[0], int(np.ceil(np.percentile(along[:, 1], 95))) + 1)
        top, bottom = _ensure_minimum_span(top, bottom, wall.shape[0])
    else:
        along = points[np.abs(points[:, 1] - center_y) <= height / 2 + 1]
        if along.shape[0] < MIN_MATCHED_WALL_PIXELS:
            return None
        top = max(0, int(round(center_y - height / 2)))
        bottom = min(wall.shape[0], int(round(center_y + height / 2)) + 1)
        left = max(0, int(np.floor(np.percentile(along[:, 0], 5))))
        right = min(wall.shape[1], int(np.ceil(np.percentile(along[:, 0], 95))) + 1)
        left, right = _ensure_minimum_span(left, right, wall.shape[1])
    if right <= left or bottom <= top:
        return None
    rectangle[top:bottom, left:right] = True
    return rectangle


def _jamb_wall_band(
    wall: np.ndarray,
    axis: Literal["horizontal", "vertical"],
    probe_start: int,
    probe_end: int,
    band_start: int,
    band_end: int,
) -> tuple[int, int] | None:
    """Cross-wall extent of the wall strip just beyond one end of a door."""
    if probe_end <= probe_start:
        return None
    if axis == "horizontal":
        occupancy = wall[:, probe_start:probe_end].any(axis=1)
    else:
        occupancy = wall[probe_start:probe_end, :].any(axis=0)
    runs = _contiguous_runs(occupancy)
    # A perpendicular wall meeting the jamb produces one long run along the
    # cross direction; only the part near the door's own band is the wall the
    # header should match, so clamp every run to a window around that band.
    band_thickness = band_end - band_start
    window_start = band_start - band_thickness - DOOR_JAMB_BAND_TOLERANCE_PX
    window_end = band_end + band_thickness + DOOR_JAMB_BAND_TOLERANCE_PX
    best: tuple[int, int] | None = None
    best_overlap = -1
    for start, end in runs:
        start = max(start, window_start)
        end = min(end, window_end)
        if end <= start:
            continue
        overlap = min(end, band_end + DOOR_JAMB_BAND_TOLERANCE_PX) - max(
            start, band_start - DOOR_JAMB_BAND_TOLERANCE_PX
        )
        if overlap > 0 and overlap > best_overlap:
            best = (start, end)
            best_overlap = overlap
    return best


def _match_door_thickness_to_adjacent_walls(
    wall: np.ndarray,
    rectangle: np.ndarray,
    axis: Literal["horizontal", "vertical"],
) -> np.ndarray:
    """Widen/narrow a door footprint so it spans the neighbouring wall band.

    The viewer extrudes the header wall above the door straight from this
    footprint, so a footprint thinner than the flanking walls renders as a
    recessed slab that reads as a hole above the door.
    """
    ys, xs = np.nonzero(rectangle)
    if xs.size == 0:
        return rectangle
    if axis == "horizontal":
        band_start, band_end = int(ys.min()), int(ys.max()) + 1
        span_start, span_end = int(xs.min()), int(xs.max()) + 1
        limit = wall.shape[0]
        before = _jamb_wall_band(
            wall, axis, max(0, span_start - DOOR_JAMB_PROBE_PX), span_start,
            band_start, band_end,
        )
        after = _jamb_wall_band(
            wall, axis, span_end, min(wall.shape[1], span_end + DOOR_JAMB_PROBE_PX),
            band_start, band_end,
        )
    else:
        band_start, band_end = int(xs.min()), int(xs.max()) + 1
        span_start, span_end = int(ys.min()), int(ys.max()) + 1
        limit = wall.shape[1]
        before = _jamb_wall_band(
            wall, axis, max(0, span_start - DOOR_JAMB_PROBE_PX), span_start,
            band_start, band_end,
        )
        after = _jamb_wall_band(
            wall, axis, span_end, min(wall.shape[0], span_end + DOOR_JAMB_PROBE_PX),
            band_start, band_end,
        )
    bands = [band for band in (before, after) if band is not None]
    if not bands:
        return rectangle
    # With walls on both sides, the header should span the band common to
    # both — the union would inherit a perpendicular wall's extra thickness
    # when the door sits in a corner.
    if len(bands) == 2:
        new_start = max(band[0] for band in bands)
        new_end = min(band[1] for band in bands)
        if new_end <= new_start:
            new_start = min(band[0] for band in bands)
            new_end = max(band[1] for band in bands)
    else:
        new_start, new_end = bands[0]
    new_start, new_end = _ensure_minimum_span(new_start, new_end, limit)
    out = np.zeros_like(rectangle)
    if axis == "horizontal":
        out[new_start:new_end, span_start:span_end] = True
    else:
        out[span_start:span_end, new_start:new_end] = True
    return out


def _best_door_rectangle(
    wall: np.ndarray,
    points: np.ndarray,
    center_x: float,
    center_y: float,
    width: float,
    height: float,
) -> tuple[np.ndarray, Literal["horizontal", "vertical"]] | None:
    """Pick the wall the door actually passes through.

    A YOLO door box includes the swing arc, so it is roughly square and its
    dimensions do not reveal the hosting wall's direction; PCA over nearby
    wall pixels often latches onto a perpendicular jamb wall instead. A real
    doorway is a *gap* between two supported jambs, so build a candidate per
    axis and keep the one whose interior is emptiest.
    """
    candidates: list[tuple[float, Literal["horizontal", "vertical"], np.ndarray]] = []
    for axis in ("horizontal", "vertical"):
        rect = _corrected_rectangle(wall, points, center_x, center_y, width, height, axis)
        if rect is None:
            continue
        rect = _match_door_thickness_to_adjacent_walls(wall, rect, axis)
        if not _rectangle_has_wall_support_at_both_ends(wall, rect, axis):
            continue
        occupancy = float(wall[rect].mean()) if np.any(rect) else 1.0
        candidates.append((occupancy, axis, rect))
    if candidates:
        occupancy, axis, rect = min(candidates, key=lambda item: item[0])
        return rect, axis
    # No candidate with two supported jambs — fall back to the PCA axis and
    # let the caller's support check decide whether to reject.
    axis = "horizontal" if _is_horizontal(points) else "vertical"
    rect = _corrected_rectangle(wall, points, center_x, center_y, width, height, axis)
    if rect is None:
        return None
    return _match_door_thickness_to_adjacent_walls(wall, rect, axis), axis


def _rectangle_has_wall_support_at_both_ends(
    wall: np.ndarray,
    rectangle: np.ndarray,
    axis: Literal["horizontal", "vertical"],
) -> bool:
    ys, xs = np.nonzero(rectangle)
    if xs.size == 0:
        return False
    if axis == "horizontal":
        return _span_has_wall_support_at_both_ends(
            wall,
            axis,
            int(ys.min()),
            int(ys.max()) + 1,
            int(xs.min()),
            int(xs.max()) + 1,
        )
    return _span_has_wall_support_at_both_ends(
        wall,
        axis,
        int(xs.min()),
        int(xs.max()) + 1,
        int(ys.min()),
        int(ys.max()) + 1,
    )


def _axis_from_dimensions(width: float, height: float) -> Literal["horizontal", "vertical"]:
    return "horizontal" if width >= height else "vertical"


def _rectangle_center(rectangle: np.ndarray) -> tuple[float, float] | None:
    ys, xs = np.nonzero(rectangle)
    if xs.size == 0:
        return None
    return (
        (float(xs.min()) + float(xs.max())) / 2.0,
        (float(ys.min()) + float(ys.max())) / 2.0,
    )


def _opening_id(detection: OpeningDetection, rank: int) -> str:
    return detection.opening_id or f"opening-{rank + 1}"


def _rejected_opening(
    detection: OpeningDetection,
    rank: int,
    center_x: float,
    center_y: float,
    width: float,
    height: float,
    reason: str,
) -> AlignedOpening:
    return AlignedOpening(
        opening_id=_opening_id(detection, rank),
        kind=detection.kind,
        confidence=detection.confidence,
        center_x=center_x,
        center_y=center_y,
        width=width,
        height=height,
        axis=_axis_from_dimensions(width, height),
        valid=False,
        source_model=detection.source_model,
        reason=reason,
        mask_polygon=detection.mask_polygon,
    )


def _accepted_opening(
    detection: OpeningDetection,
    rank: int,
    rectangle: np.ndarray,
    axis: Literal["horizontal", "vertical"],
    longitudinal_center: float | None = None,
    longitudinal_length: float | None = None,
    valid: bool = True,
    reason: str = "",
) -> AlignedOpening:
    ys, xs = np.nonzero(rectangle)
    left = float(xs.min())
    right = float(xs.max())
    top = float(ys.min())
    bottom = float(ys.max())
    center_x = (left + right) / 2.0
    center_y = (top + bottom) / 2.0
    width = right - left + 1.0
    height = bottom - top + 1.0
    if longitudinal_center is not None and longitudinal_length is not None:
        if axis == "horizontal":
            center_x = longitudinal_center
            width = longitudinal_length
        else:
            center_y = longitudinal_center
            height = longitudinal_length
    return AlignedOpening(
        opening_id=_opening_id(detection, rank),
        kind=detection.kind,
        confidence=detection.confidence,
        center_x=center_x,
        center_y=center_y,
        width=width,
        height=height,
        axis=axis,
        valid=valid,
        source_model=detection.source_model,
        reason=reason,
        mask_polygon=detection.mask_polygon,
    )


def align_openings(
    wall_mask: np.ndarray,
    detections: Sequence[OpeningDetection],
    match_tolerance: int = DEFAULT_MATCH_TOLERANCE_PX,
) -> OpeningAlignmentResult:
    """Return a 0/1/2/3 mask where doors/windows replace matched wall pixels."""
    if wall_mask.ndim != 2:
        raise ValueError("wall_mask must be a 2D array")
    wall = wall_mask.astype(bool)
    class_mask = wall.astype(np.uint8)
    occupied = np.zeros_like(wall, dtype=bool)
    accepted_doors = 0
    accepted_windows = 0
    rejected = 0
    openings: list[AlignedOpening] = []

    for rank, detection in enumerate(
        sorted(detections, key=lambda item: item.confidence, reverse=True)
    ):
        scale_x = wall.shape[1] / max(1, detection.image_width)
        scale_y = wall.shape[0] / max(1, detection.image_height)
        center_x = detection.center_x * scale_x
        center_y = detection.center_y * scale_y
        width = max(2.0, detection.width * scale_x)
        height = max(2.0, detection.height * scale_y)
        if detection.kind == "door" and detection.confidence < MIN_DOOR_CONFIDENCE:
            # Low-confidence door boxes are usually windows or open passages;
            # accepting one cuts a long hole in a real wall.
            rejected += 1
            openings.append(
                _rejected_opening(
                    detection, rank, center_x, center_y, width, height, "low-confidence"
                )
            )
            continue
        detection_tolerance = max(0, match_tolerance)
        if detection.kind == "door":
            detection_tolerance = min(detection_tolerance, MAX_DOOR_MATCH_TOLERANCE_PX)
        axis: Literal["horizontal", "vertical"]
        both_window_ends_supported = True
        if detection.kind == "window":
            snapped_window = _window_rectangle_on_nearest_wall(
                wall,
                center_x,
                center_y,
                width,
                height,
                detection_tolerance,
            )
            if snapped_window is None:
                rectangle = None
                axis = _axis_from_dimensions(width, height)
            else:
                rectangle, axis, both_window_ends_supported = snapped_window
        else:
            points = _search_points(
                wall,
                center_x,
                center_y,
                width,
                height,
                detection_tolerance,
            )
            if points.shape[0] < MIN_MATCHED_WALL_PIXELS:
                rejected += 1
                openings.append(
                    _rejected_opening(
                        detection, rank, center_x, center_y, width, height, "no-nearby-wall"
                    )
                )
                continue
            best = _best_door_rectangle(
                wall,
                points,
                center_x,
                center_y,
                width,
                height,
            )
            if best is None:
                rectangle = None
                axis = _axis_from_dimensions(width, height)
            else:
                rectangle, axis = best
        if rectangle is None:
            rejected += 1
            openings.append(
                _rejected_opening(
                    detection, rank, center_x, center_y, width, height, "no-nearby-wall"
                )
            )
            continue
        if detection.kind == "door":
            # A YOLO door box contains the swing arc, so the box center sits
            # well off the hosting wall even for a perfect detection.  Measure
            # how far the snapped footprint escapes the detection box instead
            # of the raw center shift — a wall inside the box is always fine.
            snapped_center = _rectangle_center(rectangle)
            if snapped_center is None or max(
                abs(snapped_center[0] - center_x) - width / 2,
                abs(snapped_center[1] - center_y) - height / 2,
            ) > MAX_DOOR_CENTER_SHIFT_PX:
                # Keep the detector result available in 2D, but do not let a
                # distant wall snap become a false opening in 3D.
                rejected += 1
                openings.append(
                    _rejected_opening(
                        detection,
                        rank,
                        center_x,
                        center_y,
                        width,
                        height,
                        "moved-too-far",
                    )
                )
                continue
        if detection.kind == "window" and not both_window_ends_supported:
            rejected += 1
            openings.append(
                _accepted_opening(
                    detection,
                    rank,
                    rectangle,
                    axis,
                    valid=False,
                    reason="unsupported-ends",
                )
            )
            continue
        if detection.kind == "door" and not _rectangle_has_wall_support_at_both_ends(
            wall, rectangle, axis
        ):
            rejected += 1
            openings.append(
                _rejected_opening(
                    detection, rank, center_x, center_y, width, height, "unsupported-ends"
                )
            )
            continue
        # The matched wall can be only one pixel thick after segmentation.
        # Keep the snapped rectangle so Three.js receives a valid polygon,
        # while matching still depends on real nearby MitUNet wall pixels.
        footprint = rectangle & ~occupied
        if np.count_nonzero(footprint) < MIN_MATCHED_WALL_PIXELS:
            rejected += 1
            openings.append(
                _rejected_opening(
                    detection, rank, center_x, center_y, width, height, "overlaps-other-opening"
                )
            )
            continue

        # Doors and windows must reach the class mask for the viewer to create
        # their 3D openings.  Rejected detections stay visible and editable in 2D.
        class_mask[footprint] = 3 if detection.kind == "window" else 2
        occupied |= footprint
        longitudinal_center: float | None = None
        longitudinal_length: float | None = None
        if detection.kind == "window":
            ys, xs = np.nonzero(rectangle)
            if axis == "horizontal":
                longitudinal_center = (float(xs.min()) + float(xs.max()) + 1.0) / 2.0
                longitudinal_length = float(xs.max() - xs.min() + 1)
            else:
                longitudinal_center = (float(ys.min()) + float(ys.max()) + 1.0) / 2.0
                longitudinal_length = float(ys.max() - ys.min() + 1)
        openings.append(
            _accepted_opening(
                detection,
                rank,
                rectangle,
                axis,
                longitudinal_center,
                longitudinal_length,
                valid=both_window_ends_supported,
            )
        )
        if detection.kind == "door":
            accepted_doors += 1
        else:
            accepted_windows += 1

    return OpeningAlignmentResult(
        class_mask=class_mask,
        accepted_doors=accepted_doors,
        accepted_windows=accepted_windows,
        rejected=rejected,
        openings=tuple(openings),
    )
