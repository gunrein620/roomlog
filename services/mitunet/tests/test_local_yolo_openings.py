import base64
import unittest

import numpy as np

from buildingcv.extraction_pipeline import compose_opening_review
from buildingcv.local_yolo_openings import parse_yolo_opening_boxes
from buildingcv.review_edits import decode_wall_mask_png
from buildingcv.roboflow_openings import RoboflowResult


class LocalYoloOpeningTests(unittest.TestCase):
    def test_segment_classes_become_door_and_window_review_candidates(self) -> None:
        detections = parse_yolo_opening_boxes(
            class_ids=[0, 1, 2],
            confidences=[0.9, 0.8, 0.7],
            xywh=[[100, 200, 60, 10], [300, 400, 12, 80], [500, 600, 90, 14]],
            mask_polygons=[
                [[70, 195], [130, 195], [130, 205], [70, 205]],
                [[294, 360], [306, 360], [306, 440], [294, 440]],
                [[455, 593], [545, 593], [545, 607], [455, 607]],
            ],
            image_width=1024,
            image_height=1024,
            model="yolo-segv1.pt",
        )

        self.assertEqual([item.kind for item in detections], ["door", "door", "window"])
        self.assertEqual([item.opening_id for item in detections], ["yolo-1", "yolo-2", "yolo-3"])
        self.assertEqual(detections[2].mask_polygon, ((455.0, 593.0), (545.0, 593.0), (545.0, 607.0), (455.0, 607.0)))

    def test_yolo_candidates_do_not_change_the_raw_mitunet_wall_mask(self) -> None:
        wall = np.zeros((1024, 1024), dtype=np.uint8)
        wall[500:520, 100:900] = 1
        detections = parse_yolo_opening_boxes(
            class_ids=[0, 2],
            confidences=[0.9, 0.8],
            xywh=[[300, 510, 80, 20], [700, 510, 80, 20]],
            image_width=1024,
            image_height=1024,
            model="yolo-segv1.pt",
        )

        result = compose_opening_review(
            wall,
            RoboflowResult(status="ready", model="yolo-segv1.pt", detections=detections),
        )

        np.testing.assert_array_equal(
            decode_wall_mask_png(base64.b64decode(result["wall_mask_b64"])), wall
        )
        self.assertGreater(len(result["polygons"]["wall"]), 0)
        self.assertEqual(result["polygons"]["door"], [])
        self.assertEqual(result["polygons"]["window"], [])
        self.assertEqual(result["opening_detection"]["accepted_doors"], 1)
        self.assertEqual(result["opening_detection"]["accepted_windows"], 1)
        self.assertEqual([item["kind"] for item in result["openings"]], ["door", "window"])
        self.assertTrue(all(item["valid"] for item in result["openings"]))
        self.assertEqual(result["openings"][0]["mask_polygon"], [])


if __name__ == "__main__":
    unittest.main()
