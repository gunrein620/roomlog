import unittest

import cv2
import numpy as np

import buildingcv.mitunet_polygons as mitunet_polygons


def clean_wall_mask(mask: np.ndarray) -> np.ndarray:
    cleaner = getattr(mitunet_polygons, "clean_wall_mask", None)
    if cleaner is None:
        raise AssertionError("clean_wall_mask is missing")
    return cleaner(mask)


def rasterize_wall_polygons(
    polygons: list[mitunet_polygons.Polygon],
    shape: tuple[int, int],
) -> np.ndarray:
    rendered = np.zeros(shape, dtype=np.uint8)
    for polygon in polygons:
        outer = np.asarray(polygon["outer"], dtype=np.int32)
        cv2.fillPoly(rendered, [outer], 1)
        for hole in polygon["holes"]:
            ring = np.asarray(hole, dtype=np.int32)
            cv2.fillPoly(rendered, [ring], 0)
    return rendered


class MitUNetPolygonTests(unittest.TestCase):
    def test_legacy_wall_mode_matches_the_previous_wall_simplification(self) -> None:
        mask = np.zeros((100, 120), dtype=np.uint8)
        mask[40:46, 10:55] = 1
        mask[43:49, 55:110] = 1

        exact = mitunet_polygons.mask_to_polygons(mask)["wall"]
        legacy = mitunet_polygons.mask_to_polygons(mask, wall_mode="legacy")["wall"]

        self.assertGreater(sum(len(item["outer"]) for item in exact), 4)
        self.assertEqual(sum(len(item["outer"]) for item in legacy), 4)

    def test_legacy_wall_mode_closes_the_previous_two_pixel_gap(self) -> None:
        mask = np.zeros((64, 96), dtype=np.uint8)
        mask[24:34, 8:44] = 1
        mask[24:34, 46:88] = 1

        exact = mitunet_polygons.mask_to_polygons(mask)["wall"]
        legacy = mitunet_polygons.mask_to_polygons(mask, wall_mode="legacy")["wall"]

        self.assertEqual(len(exact), 2)
        self.assertEqual(len(legacy), 1)

    def test_wall_polygon_preserves_a_detected_step_without_diagonalizing_it(self) -> None:
        mask = np.zeros((100, 120), dtype=np.uint8)
        mask[40:46, 10:55] = 1
        mask[43:49, 55:110] = 1

        polygons = mitunet_polygons.mask_to_polygons(mask)["wall"]
        rendered = rasterize_wall_polygons(polygons, mask.shape)

        np.testing.assert_array_equal(rendered, mask)

    def test_wall_polygon_preserves_a_detected_two_pixel_gap(self) -> None:
        mask = np.zeros((64, 96), dtype=np.uint8)
        mask[24:34, 8:44] = 1
        mask[24:34, 46:88] = 1

        polygons = mitunet_polygons.mask_to_polygons(mask)["wall"]
        rendered = rasterize_wall_polygons(polygons, mask.shape)

        self.assertFalse(np.any(rendered[24:34, 44:46]))

    def test_wall_cleanup_removes_small_components_and_normalizes_binary_values(self) -> None:
        mask = np.zeros((64, 64), dtype=np.uint8)
        mask[8:28, 8:18] = 255
        mask[40:50, 40:50] = 255

        cleaned = clean_wall_mask(mask)

        self.assertEqual(set(np.unique(cleaned)), {0, 1})
        self.assertTrue(cleaned[12, 12])
        self.assertFalse(cleaned[45, 45])

    def test_wall_cleanup_closes_a_three_pixel_break(self) -> None:
        mask = np.zeros((64, 64), dtype=np.uint8)
        mask[28:36, 5:30] = 1
        mask[28:36, 33:58] = 1

        cleaned = clean_wall_mask(mask)

        self.assertTrue(np.all(cleaned[28:36, 30:33]))

    def test_wall_cleanup_preserves_a_wide_opening(self) -> None:
        mask = np.zeros((64, 64), dtype=np.uint8)
        mask[20:44, 8:56] = 1
        mask[20:44, 28:36] = 0

        cleaned = clean_wall_mask(mask)

        self.assertFalse(np.any(cleaned[20:44, 28:36]))

    def test_wall_cleanup_does_not_bridge_a_long_horizontal_gap_without_window_evidence(self) -> None:
        mask = np.zeros((180, 280), dtype=np.uint8)
        mask[70:82, 20:110] = 1
        mask[70:82, 170:260] = 1

        cleaned = clean_wall_mask(mask)

        self.assertFalse(np.any(cleaned[70:82, 110:170]))

    def test_wall_cleanup_does_not_bridge_a_long_vertical_gap_without_window_evidence(self) -> None:
        mask = np.zeros((240, 240), dtype=np.uint8)
        mask[20:90, 110:122] = 1
        mask[150:220, 110:122] = 1

        cleaned = clean_wall_mask(mask)

        self.assertFalse(np.any(cleaned[90:150, 110:122]))

    def test_wall_cleanup_removes_large_isolated_furniture_edge(self) -> None:
        mask = np.zeros((160, 160), dtype=np.uint8)
        mask[10:20, 10:150] = 1
        mask[140:150, 10:150] = 1
        mask[10:150, 10:20] = 1
        mask[10:150, 140:150] = 1
        mask[70:78, 55:105] = 1

        cleaned = clean_wall_mask(mask)

        self.assertTrue(cleaned[15, 80])
        self.assertFalse(np.any(cleaned[70:78, 55:105]))

    def test_wall_cleanup_keeps_detached_wall_near_main_network(self) -> None:
        mask = np.zeros((100, 160), dtype=np.uint8)
        mask[35:55, 10:120] = 1
        mask[35:45, 134:150] = 1

        cleaned = clean_wall_mask(mask)

        self.assertTrue(np.all(cleaned[35:45, 134:150]))

    def test_wall_polygon_keeps_a_large_opening_as_a_hole(self) -> None:
        mask = np.zeros((64, 64), dtype=np.uint8)
        cv2.rectangle(mask, (4, 4), (59, 59), 1, thickness=-1)
        cv2.rectangle(mask, (22, 22), (42, 42), 0, thickness=-1)

        polygons = mitunet_polygons.mask_to_polygons(mask)

        self.assertEqual(len(polygons["wall"]), 1)
        self.assertEqual(len(polygons["wall"][0]["holes"]), 1)
        self.assertEqual(polygons["door"], [])
        self.assertEqual(polygons["window"], [])

    def test_thin_aligned_openings_are_not_removed_as_wall_noise(self) -> None:
        mask = np.zeros((64, 64), dtype=np.uint8)
        cv2.rectangle(mask, (8, 8), (55, 15), 1, thickness=-1)
        cv2.rectangle(mask, (20, 8), (22, 15), 2, thickness=-1)
        cv2.rectangle(mask, (40, 8), (42, 15), 3, thickness=-1)

        polygons = mitunet_polygons.mask_to_polygons(mask)

        self.assertEqual(len(polygons["door"]), 1)
        self.assertEqual(len(polygons["window"]), 1)

    def test_window_polygon_overlaps_adjacent_wall_edges_without_growing_thickness(self) -> None:
        mask = np.zeros((64, 64), dtype=np.uint8)
        mask[20:30, 5:45] = 1
        mask[20:30, 20:30] = 3

        polygons = mitunet_polygons.mask_to_polygons(mask)

        wall_bounds = sorted(
            (
                min(point[0] for point in polygon["outer"]),
                max(point[0] for point in polygon["outer"]),
            )
            for polygon in polygons["wall"]
        )
        window = polygons["window"][0]
        window_x = [point[0] for point in window["outer"]]
        window_y = [point[1] for point in window["outer"]]

        self.assertLess(min(window_x), wall_bounds[0][1])
        self.assertGreater(max(window_x), wall_bounds[1][0])
        self.assertEqual((min(window_y), max(window_y)), (20.0, 29.0))

    def test_door_polygon_does_not_overlap_adjacent_wall_edges(self) -> None:
        mask = np.zeros((64, 64), dtype=np.uint8)
        mask[20:30, 5:45] = 1
        mask[20:30, 20:30] = 2

        polygons = mitunet_polygons.mask_to_polygons(mask)

        door = polygons["door"][0]
        door_x = [point[0] for point in door["outer"]]
        door_y = [point[1] for point in door["outer"]]
        self.assertEqual((min(door_x), max(door_x)), (20.0, 29.0))
        self.assertEqual((min(door_y), max(door_y)), (20.0, 29.0))
