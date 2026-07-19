"""Cairo-free mask-to-polygon conversion used by the MitUNet image path."""

from __future__ import annotations

from typing import Literal, TypedDict

import cv2
import numpy as np

EXTRACT_CLASSES = ("wall", "door", "window")
CLASS_TO_ID = {"wall": 1, "door": 2, "window": 3}
WALL_MASK_CLOSING_KERNEL_PX = 5
MIN_WALL_COMPONENT_AREA_PX = 120
WALL_NETWORK_LINK_DISTANCE_PX = 24
WALL_NETWORK_ANCHOR_AREA_RATIO = 0.20
WALL_AXIS_BRIDGE_MAX_GAP_PX = 96
WALL_AXIS_BRIDGE_MIN_RUN_PX = 32
POLYGON_CLOSING_KERNEL_PX = 3
WALL_APPROX_EPSILON_PX = 0.5
LEGACY_WALL_APPROX_EPSILON_PX = 3.0
OPENING_APPROX_EPSILON_PX = 1.5
MIN_WALL_POLYGON_AREA_PX = 120.0
MIN_OPENING_AREA_PX = 4.0
OPENING_WALL_OVERLAP_PX = 2


class Polygon(TypedDict):
    outer: list[list[float]]
    holes: list[list[list[float]]]


WallPolygonMode = Literal["exact", "legacy", "copy-wall"]


class ExtractionResult(TypedDict):
    canvas_size: list[int]
    content_rect: list[int]
    polygons: dict[str, list[Polygon]]


def _retain_main_wall_network(binary: np.ndarray) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    if count <= 2:
        return binary

    areas = stats[1:, cv2.CC_STAT_AREA]
    largest_area = int(areas.max())
    anchor_threshold = max(
        MIN_WALL_COMPONENT_AREA_PX,
        int(np.ceil(largest_area * WALL_NETWORK_ANCHOR_AREA_RATIO)),
    )
    kept_labels = {
        label
        for label in range(1, count)
        if int(stats[label, cv2.CC_STAT_AREA]) >= anchor_threshold
    }
    keep_mask = np.isin(labels, list(kept_labels)).astype(np.uint8)
    kernel_size = WALL_NETWORK_LINK_DISTANCE_PX * 2 + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))

    while True:
        nearby = cv2.dilate(keep_mask, kernel, iterations=1)
        linked_labels = set(np.unique(labels[nearby != 0]).tolist()) - {0}
        new_labels = linked_labels - kept_labels
        if not new_labels:
            break
        kept_labels.update(new_labels)
        keep_mask = np.isin(labels, list(kept_labels)).astype(np.uint8)

    return keep_mask


def _bridge_line_gap(line: np.ndarray) -> np.ndarray:
    positions = np.flatnonzero(line)
    if positions.size < 2:
        return line.copy()

    splits = np.flatnonzero(np.diff(positions) > 1) + 1
    runs = np.split(positions, splits)
    bridged = line.copy()
    for left, right in zip(runs, runs[1:]):
        gap_start = int(left[-1]) + 1
        gap_end = int(right[0])
        gap = gap_end - gap_start
        if (
            0 < gap <= WALL_AXIS_BRIDGE_MAX_GAP_PX
            and left.size >= WALL_AXIS_BRIDGE_MIN_RUN_PX
            and right.size >= WALL_AXIS_BRIDGE_MIN_RUN_PX
        ):
            bridged[gap_start:gap_end] = 1
    return bridged


def _bridge_axis_aligned_wall_gaps(binary: np.ndarray) -> np.ndarray:
    horizontal = binary.copy()
    for row in range(binary.shape[0]):
        horizontal[row, :] = _bridge_line_gap(binary[row, :])

    vertical = binary.copy()
    for column in range(binary.shape[1]):
        vertical[:, column] = _bridge_line_gap(binary[:, column])
    return np.maximum(horizontal, vertical)


def clean_wall_mask(mask: np.ndarray) -> np.ndarray:
    """Remove wall noise and repair bounded gaps between long collinear walls."""
    if mask.ndim != 2:
        raise ValueError("wall mask must be a 2D array")

    binary = (mask != 0).astype(np.uint8)
    if not binary.any():
        return binary

    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    filtered = np.zeros_like(binary)
    for label in range(1, count):
        if stats[label, cv2.CC_STAT_AREA] >= MIN_WALL_COMPONENT_AREA_PX:
            filtered[labels == label] = 1

    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (WALL_MASK_CLOSING_KERNEL_PX, WALL_MASK_CLOSING_KERNEL_PX),
    )
    closed = cv2.morphologyEx(filtered, cv2.MORPH_CLOSE, kernel)
    return _retain_main_wall_network(closed)


def _simplify(contour: np.ndarray, epsilon: float) -> list[list[float]]:
    points = cv2.approxPolyDP(contour, epsilon, closed=True)
    return points.reshape(-1, 2).astype(float).tolist()


def _overlap_openings_with_wall_edges(binary: np.ndarray) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    expanded = np.zeros_like(binary)
    for label in range(1, count):
        width = int(stats[label, cv2.CC_STAT_WIDTH])
        height = int(stats[label, cv2.CC_STAT_HEIGHT])
        if width >= height:
            kernel_size = (OPENING_WALL_OVERLAP_PX * 2 + 1, 1)
        else:
            kernel_size = (1, OPENING_WALL_OVERLAP_PX * 2 + 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, kernel_size)
        component = (labels == label).astype(np.uint8)
        expanded = np.maximum(expanded, cv2.dilate(component, kernel, iterations=1))
    return expanded


def polygons_for_class(
    mask: np.ndarray,
    class_id: int,
    *,
    wall_mode: WallPolygonMode = "exact",
) -> list[Polygon]:
    if wall_mode not in {"exact", "legacy", "copy-wall"}:
        raise ValueError(f"unsupported wall polygon mode: {wall_mode}")

    binary = (mask == class_id).astype(np.uint8)
    if not binary.any():
        return []

    is_wall = class_id == CLASS_TO_ID["wall"]
    if class_id == CLASS_TO_ID["window"]:
        binary = _overlap_openings_with_wall_edges(binary)

    legacy_wall = is_wall and wall_mode in {"legacy", "copy-wall"}
    if is_wall and not legacy_wall:
        # The review canvas already contains the exact accepted wall mask.
        # Closing here would fill detected gaps before the 3D conversion.
        closed = binary
    else:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (POLYGON_CLOSING_KERNEL_PX, POLYGON_CLOSING_KERNEL_PX),
        )
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    contours, hierarchy = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hierarchy is None:
        return []

    children_by_parent: dict[int, list[int]] = {}
    for index, (_, _, _, parent) in enumerate(hierarchy[0]):
        if parent != -1:
            children_by_parent.setdefault(parent, []).append(index)

    min_area = MIN_WALL_POLYGON_AREA_PX if is_wall else MIN_OPENING_AREA_PX
    epsilon = (
        LEGACY_WALL_APPROX_EPSILON_PX
        if legacy_wall
        else WALL_APPROX_EPSILON_PX
        if is_wall
        else OPENING_APPROX_EPSILON_PX
    )
    polygons: list[Polygon] = []
    for index, (_, _, _, parent) in enumerate(hierarchy[0]):
        if parent != -1 or cv2.contourArea(contours[index]) < min_area:
            continue
        outer = _simplify(contours[index], epsilon)
        if len(outer) < 3:
            continue
        holes = [
            ring
            for child in children_by_parent.get(index, [])
            if cv2.contourArea(contours[child]) >= min_area
            for ring in [_simplify(contours[child], epsilon)]
            if len(ring) >= 3
        ]
        polygons.append({"outer": outer, "holes": holes})
    return polygons


def mask_to_polygons(
    mask: np.ndarray,
    *,
    wall_mode: WallPolygonMode = "exact",
) -> dict[str, list[Polygon]]:
    """Return the viewer's wall/door/window polygon schema for a class mask."""
    return {
        name: polygons_for_class(mask, CLASS_TO_ID[name], wall_mode=wall_mode)
        for name in EXTRACT_CLASSES
    }
