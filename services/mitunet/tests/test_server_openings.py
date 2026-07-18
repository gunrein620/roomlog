import base64
import unittest

import numpy as np

from buildingcv.extraction_pipeline import compose_extraction
from buildingcv.review_edits import decode_wall_mask_png
from buildingcv.roboflow_openings import OpeningDetection, RoboflowResult


def detection(kind: str, x: float) -> OpeningDetection:
    return OpeningDetection(
        kind=kind,  # type: ignore[arg-type]
        confidence=0.9,
        center_x=x,
        center_y=512,
        width=160,
        height=40,
        image_width=1024,
        image_height=1024,
        source_model="model/1",
    )


class ExtractionPipelineTests(unittest.TestCase):
    def test_disabled_roboflow_keeps_wall_only_polygons(self) -> None:
        wall = np.zeros((1024, 1024), dtype=np.uint8)
        wall[100:900, 100:120] = 1

        result = compose_extraction(
            wall,
            RoboflowResult(status="disabled", model="model/1", detections=[]),
        )

        self.assertGreater(len(result["polygons"]["wall"]), 0)
        self.assertEqual(result["polygons"]["door"], [])
        self.assertEqual(result["polygons"]["window"], [])
        self.assertEqual(result["opening_detection"]["status"], "disabled")
        self.assertEqual(result["openings"], [])
        np.testing.assert_array_equal(
            decode_wall_mask_png(base64.b64decode(result["wall_mask_b64"])),
            wall,
        )

    def test_ready_result_returns_aligned_door_and_window_polygons(self) -> None:
        wall = np.zeros((1024, 1024), dtype=np.uint8)
        wall[500:520, 100:924] = 1
        roboflow = RoboflowResult(
            status="ready",
            model="model/1",
            detections=[detection("door", 300), detection("window", 700)],
        )

        result = compose_extraction(wall, roboflow)

        self.assertEqual(result["opening_detection"]["accepted_doors"], 1)
        self.assertEqual(result["opening_detection"]["accepted_windows"], 1)
        self.assertEqual(result["opening_detection"]["rejected"], 0)
        # Door footprints reach the class mask so the viewer can cut the
        # passage and build the header wall above it.
        self.assertGreater(len(result["polygons"]["door"]), 0)
        self.assertGreater(len(result["polygons"]["window"]), 0)
        self.assertEqual([item["id"] for item in result["openings"]], ["opening-1", "opening-2"])
        self.assertTrue(all(item["valid"] for item in result["openings"]))
        np.testing.assert_array_equal(
            decode_wall_mask_png(base64.b64decode(result["wall_mask_b64"])),
            wall,
        )

    def test_failed_roboflow_preserves_warning_and_wall_geometry(self) -> None:
        wall = np.zeros((1024, 1024), dtype=np.uint8)
        wall[400:420, 120:900] = 1

        result = compose_extraction(
            wall,
            RoboflowResult(
                status="failed",
                model="model/1",
                detections=[],
                warning="temporary failure",
            ),
        )

        self.assertGreater(len(result["polygons"]["wall"]), 0)
        self.assertEqual(result["opening_detection"]["warning"], "temporary failure")
        self.assertEqual(result["openings"], [])
        np.testing.assert_array_equal(
            decode_wall_mask_png(base64.b64decode(result["wall_mask_b64"])),
            wall,
        )


if __name__ == "__main__":
    unittest.main()
