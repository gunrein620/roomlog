import unittest

import numpy as np

from buildingcv.opening_alignment import align_openings
from buildingcv.roboflow_openings import OpeningDetection
from buildingcv.wall_reinforcement import reinforce_wall_mask


def _window(center_x, center_y, width, height, opening_id="w1"):
    return OpeningDetection(
        kind="window",
        confidence=0.9,
        center_x=center_x,
        center_y=center_y,
        width=width,
        height=height,
        image_width=200,
        image_height=200,
        source_model="test",
        opening_id=opening_id,
    )


def _door(center_x, center_y, width, height, opening_id="d1"):
    return OpeningDetection(
        kind="door",
        confidence=0.9,
        center_x=center_x,
        center_y=center_y,
        width=width,
        height=height,
        image_width=200,
        image_height=200,
        source_model="test",
        opening_id=opening_id,
    )


class WallReinforcementTests(unittest.TestCase):
    def test_door_detection_does_not_synthesize_a_wall_band(self):
        wall = np.zeros((200, 200), dtype=np.uint8)

        reinforced = reinforce_wall_mask(wall, [_door(100, 100, 40, 6)])

        self.assertEqual(np.count_nonzero(reinforced), 0)

    def test_floating_window_gets_a_synthesized_wall_band(self):
        wall = np.zeros((200, 200), dtype=np.uint8)
        reinforced = reinforce_wall_mask(wall, [_window(100, 100, 40, 6)])

        self.assertGreater(np.count_nonzero(reinforced), 0)
        result = align_openings(reinforced, [_window(100, 100, 40, 6)])
        self.assertEqual(result.accepted_windows, 1)
        self.assertTrue(result.openings[0].valid)

    def test_band_snaps_to_nearby_wall_rows(self):
        wall = np.zeros((200, 200), dtype=np.uint8)
        wall[90:94, 40:75] = 1  # wall fragment left of the window
        reinforced = reinforce_wall_mask(wall, [_window(100, 100, 40, 6)])

        band_rows = np.nonzero(reinforced[:, 100].astype(bool))[0]
        self.assertTrue(band_rows.size)
        self.assertTrue(np.all((band_rows >= 88) & (band_rows <= 96)))

    def test_extension_bridges_gap_to_neighboring_walls(self):
        wall = np.zeros((200, 200), dtype=np.uint8)
        wall[98:102, 40:75] = 1
        wall[98:102, 125:160] = 1
        detection = _window(100, 100, 44, 6)
        reinforced = reinforce_wall_mask(wall, [detection])

        result = align_openings(reinforced, [detection])
        self.assertEqual(result.accepted_windows, 1)
        self.assertTrue(result.openings[0].valid)
        self.assertEqual(result.openings[0].reason, "")

    def test_vertical_window_is_supported(self):
        wall = np.zeros((200, 200), dtype=np.uint8)
        wall[40:75, 98:102] = 1
        wall[125:160, 98:102] = 1
        detection = _window(100, 100, 6, 44, "v1")
        reinforced = reinforce_wall_mask(wall, [detection])

        result = align_openings(reinforced, [detection])
        self.assertEqual(result.accepted_windows, 1)
        self.assertTrue(result.openings[0].valid)

    def test_window_reinforcement_does_not_bridge_a_distant_collinear_gap(self):
        wall = np.zeros((200, 200), dtype=np.uint8)
        wall[98:102, 10:60] = 1  # long wall left of the window, same row band
        reinforced = reinforce_wall_mask(wall, [_window(120, 100, 40, 6)])

        import cv2

        count, _ = cv2.connectedComponents(reinforced, connectivity=8)
        self.assertEqual(count - 1, 2)  # only a window-local band is synthesized

    def test_existing_walls_are_preserved(self):
        wall = np.zeros((200, 200), dtype=np.uint8)
        wall[10:14, 10:60] = 1
        reinforced = reinforce_wall_mask(wall, [_window(100, 100, 40, 6)])
        self.assertTrue(np.all(reinforced[wall.astype(bool)] == 1))


if __name__ == "__main__":
    unittest.main()
