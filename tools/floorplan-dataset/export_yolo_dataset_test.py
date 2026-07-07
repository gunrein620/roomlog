#!/usr/bin/env python3
from __future__ import annotations

import unittest

from export_yolo_dataset import YOLO_CLASS_NAMES, YOLO_CLASS_TO_ID, yolo_bbox


class YoloDatasetExportTest(unittest.TestCase):
    def test_class_order_splits_doors_and_keeps_windows_unified(self) -> None:
        self.assertEqual(YOLO_CLASS_NAMES, ["wall", "hinged_door", "sliding_door", "window"])
        self.assertEqual(
            YOLO_CLASS_TO_ID,
            {"wall": 0, "hinged_door": 1, "sliding_door": 2, "window": 3},
        )

    def test_yolo_bbox_normalizes_xywh_to_center_format(self) -> None:
        self.assertEqual(
            yolo_bbox([100, 50, 200, 100], image_width=1000, image_height=500),
            [0.2, 0.2, 0.2, 0.2],
        )


if __name__ == "__main__":
    unittest.main()
