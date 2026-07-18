import unittest
from dataclasses import replace

import numpy as np

from buildingcv.opening_alignment import align_openings
from buildingcv.mitunet_polygons import mask_to_polygons
from buildingcv.roboflow_openings import OpeningDetection


def opening(
    kind: str,
    center: tuple[float, float],
    size: tuple[float, float],
    source_size: tuple[int, int] = (100, 100),
    confidence: float = 0.9,
) -> OpeningDetection:
    return OpeningDetection(
        kind=kind,  # type: ignore[arg-type]
        confidence=confidence,
        center_x=center[0],
        center_y=center[1],
        width=size[0],
        height=size[1],
        image_width=source_size[0],
        image_height=source_size[1],
        source_model="model/1",
    )


class OpeningAlignmentTests(unittest.TestCase):
    def test_alignment_reports_editable_geometry_and_id(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 10:90] = 1
        item = opening("door", center=(50, 40), size=(20, 10))
        item = replace(item, opening_id="door-7")

        result = align_openings(wall, [item], match_tolerance=20)

        self.assertEqual(result.openings[0].opening_id, "door-7")
        self.assertEqual(result.openings[0].axis, "horizontal")
        self.assertTrue(result.openings[0].valid)
        self.assertAlmostEqual(result.openings[0].center_y, 49.5)

    def test_door_moved_far_from_its_2d_detection_does_not_cut_a_wall(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 10:90] = 1

        # The detected door is above the wall.  Snapping it down to the wall
        # would move the 3D opening far from the 2D result and cut an unrelated
        # wall segment, so it must remain an editable 2D-only detection.
        result = align_openings(
            wall,
            [opening("door", center=(50, 32), size=(20, 10))],
            match_tolerance=20,
        )

        self.assertEqual(result.accepted_doors, 0)
        self.assertEqual(result.rejected, 1)
        self.assertFalse(result.openings[0].valid)
        self.assertEqual(result.openings[0].reason, "moved-too-far")
        self.assertFalse(np.any(result.class_mask == 2))
        np.testing.assert_array_equal(result.class_mask, wall)

    def test_rejected_opening_remains_editable(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[5:10, 5:95] = 1
        item = replace(opening("window", (50, 80), (20, 10)), opening_id="window-2")

        result = align_openings(wall, [item], match_tolerance=12)

        self.assertFalse(result.openings[0].valid)
        self.assertEqual(result.openings[0].opening_id, "window-2")

    def test_horizontal_door_marks_its_footprint_in_the_class_mask(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 10:90] = 1

        result = align_openings(
            wall,
            [opening("door", center=(50, 39), size=(20, 10))],
            match_tolerance=20,
        )

        self.assertEqual(result.accepted_doors, 1)
        self.assertEqual(result.rejected, 0)
        # The viewer cuts the passage and builds the header wall from the
        # door polygons, so the footprint must reach the class mask as 2.
        self.assertTrue(np.any(result.class_mask == 2))
        self.assertGreater(len(mask_to_polygons(result.class_mask)["door"]), 0)
        self.assertFalse(hasattr(result, "render_class_mask"))

    def test_horizontal_door_footprint_matches_adjacent_wall_thickness(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 10:90] = 1
        # The opening itself is cut out of the wall, leaving only a thin sliver
        # inside the door span — the percentile-based rectangle would come out
        # thinner than the flanking walls.
        wall[47:55, 40:60] = 0

        result = align_openings(
            wall,
            [opening("door", center=(50, 50), size=(20, 10))],
            match_tolerance=20,
        )

        self.assertEqual(result.accepted_doors, 1)
        door_rows = np.nonzero((result.class_mask == 2).any(axis=1))[0]
        # Footprint must span the full flanking-wall band (rows 45..54).
        self.assertEqual(int(door_rows.min()), 45)
        self.assertEqual(int(door_rows.max()), 54)

    def test_vertical_door_footprint_matches_adjacent_wall_thickness(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[10:90, 45:55] = 1
        wall[40:60, 47:55] = 0

        result = align_openings(
            wall,
            [opening("door", center=(50, 50), size=(10, 20))],
            match_tolerance=20,
        )

        self.assertEqual(result.accepted_doors, 1)
        door_cols = np.nonzero((result.class_mask == 2).any(axis=0))[0]
        self.assertEqual(int(door_cols.min()), 45)
        self.assertEqual(int(door_cols.max()), 54)

    def test_corner_door_header_does_not_inherit_perpendicular_wall_length(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 10:90] = 1     # horizontal wall hosting the door
        wall[10:90, 60:70] = 1     # perpendicular wall meeting the right jamb
        wall[45:55, 40:60] = 0     # the door opening itself

        result = align_openings(
            wall,
            [opening("door", center=(50, 50), size=(20, 10))],
            match_tolerance=20,
        )

        self.assertEqual(result.accepted_doors, 1)
        door_rows = np.nonzero((result.class_mask == 2).any(axis=1))[0]
        # The footprint must match the host wall band, not run down the
        # perpendicular wall.
        self.assertEqual(int(door_rows.min()), 45)
        self.assertEqual(int(door_rows.max()), 54)

    def test_square_door_box_snaps_to_the_wall_with_the_gap_not_the_jamb_wall(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 10:90] = 1     # horizontal wall hosting the doorway
        wall[45:55, 40:60] = 0     # the doorway gap
        wall[10:90, 33:41] = 1     # perpendicular wall right next to the swing box

        # YOLO door boxes include the swing arc, so they are roughly square
        # and overlap the perpendicular wall.
        result = align_openings(
            wall,
            [opening("door", center=(50, 42), size=(22, 20))],
            match_tolerance=6,
        )

        self.assertEqual(result.accepted_doors, 1)
        snapped = result.openings[0]
        self.assertEqual(snapped.axis, "horizontal")
        door_rows = np.nonzero((result.class_mask == 2).any(axis=1))[0]
        self.assertGreaterEqual(int(door_rows.min()), 45)
        self.assertLessEqual(int(door_rows.max()), 54)

    def test_low_confidence_door_is_rejected(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 10:90] = 1

        result = align_openings(
            wall,
            [opening("door", center=(50, 50), size=(40, 10), confidence=0.4)],
            match_tolerance=20,
        )

        self.assertEqual(result.accepted_doors, 0)
        self.assertEqual(result.rejected, 1)
        self.assertEqual(result.openings[0].reason, "low-confidence")
        self.assertFalse(np.any(result.class_mask == 2))

    def test_vertical_window_uses_local_wall_axis_and_thickness(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[10:90, 45:55] = 1

        result = align_openings(
            wall,
            [opening("window", center=(61, 50), size=(10, 24))],
            match_tolerance=20,
        )

        self.assertEqual(result.accepted_windows, 1)
        self.assertEqual(result.rejected, 0)
        self.assertTrue(np.all(result.class_mask[38:62, 45:55] == 3))
        self.assertFalse(np.any(result.class_mask[:, :45] == 3))

    def test_horizontal_window_snaps_to_nearest_parallel_wall_and_preserves_length(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[30:38, 10:90] = 1
        wall[48:58, 10:90] = 1

        result = align_openings(
            wall,
            [opening("window", center=(52, 40), size=(24, 8))],
            match_tolerance=20,
        )

        snapped = result.openings[0]
        self.assertTrue(snapped.valid)
        self.assertEqual(snapped.axis, "horizontal")
        self.assertAlmostEqual(snapped.center_x, 52.0)
        self.assertAlmostEqual(snapped.width, 24.0)
        self.assertAlmostEqual(snapped.center_y, 33.5)
        self.assertAlmostEqual(snapped.height, 8.0)

    def test_vertical_window_snaps_to_nearest_parallel_wall_and_preserves_length(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[10:90, 25:33] = 1
        wall[10:90, 45:55] = 1

        result = align_openings(
            wall,
            [opening("window", center=(38, 54), size=(8, 26))],
            match_tolerance=18,
        )

        snapped = result.openings[0]
        self.assertTrue(snapped.valid)
        self.assertEqual(snapped.axis, "vertical")
        self.assertAlmostEqual(snapped.center_x, 28.5)
        self.assertAlmostEqual(snapped.width, 8.0)
        self.assertAlmostEqual(snapped.center_y, 54.0)
        self.assertAlmostEqual(snapped.height, 26.0)

    def test_window_uses_full_wall_thickness_when_only_wall_edge_is_nearby(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[50:62, 10:90] = 1

        result = align_openings(
            wall,
            [opening("window", center=(50, 28), size=(20, 8))],
            match_tolerance=20,
        )

        snapped = result.openings[0]
        self.assertTrue(snapped.valid)
        self.assertAlmostEqual(snapped.center_y, 55.5)
        self.assertAlmostEqual(snapped.height, 12.0)

    def test_window_with_only_one_supported_end_stays_editable_without_cutting_wall(self) -> None:
        wall = np.zeros((120, 200), dtype=np.uint8)
        wall[45:55, 20:64] = 1

        result = align_openings(
            wall,
            [opening("window", center=(100, 50), size=(72, 10), source_size=(200, 120))],
            match_tolerance=24,
        )

        snapped = result.openings[0]
        self.assertFalse(snapped.valid)
        self.assertEqual(result.accepted_windows, 0)
        self.assertEqual(result.rejected, 1)
        self.assertFalse(np.any(result.class_mask == 3))
        np.testing.assert_array_equal(result.class_mask, wall)

    def test_window_shifts_minimally_until_both_ends_touch_the_wall(self) -> None:
        wall = np.zeros((100, 120), dtype=np.uint8)
        wall[45:55, 20:100] = 1

        result = align_openings(
            wall,
            [opening("window", center=(95, 50), size=(20, 10), source_size=(120, 100))],
            match_tolerance=12,
        )

        snapped = result.openings[0]
        self.assertTrue(snapped.valid)
        self.assertAlmostEqual(snapped.center_x, 90.0)
        self.assertAlmostEqual(snapped.width, 20.0)
        self.assertTrue(np.all(result.class_mask[45:55, 80:100] == 3))

    def test_window_adjusts_each_end_independently_to_bridge_asymmetric_gaps(self) -> None:
        wall = np.zeros((100, 120), dtype=np.uint8)
        wall[45:55, 20:40] = 1
        wall[45:55, 64:100] = 1

        result = align_openings(
            wall,
            [opening("window", center=(53.5, 50), size=(21, 10), source_size=(120, 100))],
            match_tolerance=12,
        )

        snapped = result.openings[0]
        self.assertTrue(snapped.valid)
        self.assertAlmostEqual(snapped.center_x, 52.0)
        self.assertAlmostEqual(snapped.width, 24.0)
        self.assertTrue(np.all(result.class_mask[45:55, 40:64] == 3))

    def test_horizontal_window_does_not_snap_to_perpendicular_wall(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[10:90, 45:61] = 1

        result = align_openings(
            wall,
            [opening("window", center=(53, 50), size=(24, 8))],
            match_tolerance=20,
        )

        self.assertFalse(result.openings[0].valid)
        self.assertEqual(result.accepted_windows, 0)
        self.assertEqual(result.rejected, 1)

    def test_opening_without_nearby_wall_is_rejected(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[5:10, 5:95] = 1

        result = align_openings(
            wall,
            [opening("door", center=(50, 80), size=(20, 10))],
            match_tolerance=12,
        )

        self.assertEqual(result.rejected, 1)
        self.assertEqual(result.accepted_doors, 0)
        self.assertFalse(np.any(result.class_mask == 2))
        np.testing.assert_array_equal(result.class_mask, wall)

    def test_default_alignment_does_not_pull_a_door_from_twenty_pixels_away(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 10:90] = 1

        result = align_openings(
            wall,
            [opening("door", center=(50, 20), size=(20, 10))],
        )

        self.assertEqual(result.accepted_doors, 0)
        self.assertEqual(result.rejected, 1)
        self.assertFalse(np.any(result.class_mask == 2))

    def test_default_alignment_keeps_the_original_window_search_distance(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 10:90] = 1

        result = align_openings(
            wall,
            [opening("window", center=(50, 20), size=(20, 10))],
        )

        self.assertEqual(result.accepted_windows, 1)
        self.assertEqual(result.rejected, 0)
        self.assertTrue(result.openings[0].valid)

    def test_door_with_only_one_wall_supported_end_is_rejected(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 20:45] = 1

        result = align_openings(
            wall,
            [opening("door", center=(50, 50), size=(30, 10))],
            match_tolerance=16,
        )

        self.assertEqual(result.accepted_doors, 0)
        self.assertEqual(result.rejected, 1)
        self.assertFalse(np.any(result.class_mask == 2))

    def test_higher_confidence_opening_wins_when_footprints_overlap(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[45:55, 10:90] = 1

        result = align_openings(
            wall,
            [
                opening("door", center=(50, 50), size=(20, 10), confidence=0.95),
                opening("window", center=(50, 50), size=(20, 10), confidence=0.70),
            ],
            match_tolerance=12,
        )

        self.assertEqual(result.accepted_doors, 1)
        self.assertEqual(result.accepted_windows, 0)
        self.assertEqual(result.rejected, 1)
        self.assertFalse(np.any(result.class_mask == 3))

    def test_single_pixel_wall_door_still_yields_a_polygon(self) -> None:
        wall = np.zeros((100, 100), dtype=np.uint8)
        wall[50:51, 10:90] = 1

        result = align_openings(
            wall,
            [opening("door", center=(50, 50), size=(20, 8))],
            match_tolerance=12,
        )
        self.assertEqual(result.accepted_doors, 1)
        self.assertTrue(np.any(result.class_mask == 2))
        self.assertGreater(len(mask_to_polygons(result.class_mask)["door"]), 0)


if __name__ == "__main__":
    unittest.main()
