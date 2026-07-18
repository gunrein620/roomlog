import unittest

from buildingcv.roboflow_openings import (
    RoboflowOpeningClient,
    parse_opening_predictions,
)


class RoboflowOpeningParsingTests(unittest.TestCase):
    def test_default_thresholds_reject_low_confidence_openings(self) -> None:
        payload = {
            "image": {"width": 100, "height": 100},
            "predictions": [
                {"class": "door", "confidence": 0.39, "x": 20, "y": 20, "width": 10, "height": 10},
                {"class": "window", "confidence": 0.19, "x": 40, "y": 20, "width": 10, "height": 10},
                {"class": "door", "confidence": 0.40, "x": 60, "y": 20, "width": 10, "height": 10},
                {"class": "window", "confidence": 0.20, "x": 80, "y": 20, "width": 10, "height": 10},
            ],
        }

        detections = parse_opening_predictions(payload, model="model/1")

        self.assertEqual({item.kind for item in detections}, {"door", "window"})
        self.assertEqual(
            {item.kind: item.confidence for item in detections},
            {"door": 0.40, "window": 0.20},
        )

    def test_parser_keeps_doors_and_windows_but_discards_walls(self) -> None:
        payload = {
            "image": {"width": 200, "height": 100},
            "predictions": [
                {
                    "class": "wall",
                    "confidence": 0.99,
                    "x": 100,
                    "y": 50,
                    "width": 180,
                    "height": 10,
                },
                {
                    "class": "door",
                    "confidence": 0.70,
                    "x": 40,
                    "y": 50,
                    "width": 20,
                    "height": 12,
                },
                {
                    "class": "sliding-window",
                    "confidence": 0.80,
                    "x": 140,
                    "y": 50,
                    "width": 30,
                    "height": 12,
                },
            ],
        }

        detections = parse_opening_predictions(
            payload,
            model="cubicasa5k-2-qpmsa/6",
            door_threshold=0.15,
            window_threshold=0.20,
        )

        self.assertEqual([item.kind for item in detections], ["window", "door"])
        self.assertTrue(all(item.source_model == "cubicasa5k-2-qpmsa/6" for item in detections))

    def test_parser_filters_confidence_and_same_kind_duplicates(self) -> None:
        payload = {
            "image": {"width": 100, "height": 100},
            "predictions": [
                {
                    "class": "door",
                    "confidence": 0.10,
                    "x": 20,
                    "y": 20,
                    "width": 10,
                    "height": 10,
                },
                {
                    "class": "window",
                    "confidence": 0.91,
                    "x": 50,
                    "y": 50,
                    "width": 20,
                    "height": 10,
                },
                {
                    "class": "window",
                    "confidence": 0.60,
                    "x": 51,
                    "y": 50,
                    "width": 20,
                    "height": 10,
                },
            ],
        }

        detections = parse_opening_predictions(
            payload,
            model="model/1",
            door_threshold=0.15,
            window_threshold=0.20,
        )

        self.assertEqual(len(detections), 1)
        self.assertEqual(detections[0].kind, "window")
        self.assertAlmostEqual(detections[0].confidence, 0.91)

    def test_parser_keeps_only_higher_confidence_cross_kind_duplicate(self) -> None:
        payload = {
            "image": {"width": 100, "height": 100},
            "predictions": [
                {
                    "class": "door",
                    "confidence": 0.88,
                    "x": 50,
                    "y": 50,
                    "width": 20,
                    "height": 10,
                },
                {
                    "class": "window",
                    "confidence": 0.72,
                    "x": 51,
                    "y": 50,
                    "width": 20,
                    "height": 10,
                },
            ],
        }

        detections = parse_opening_predictions(payload, model="model/1")

        self.assertEqual(len(detections), 1)
        self.assertEqual(detections[0].kind, "door")
        self.assertAlmostEqual(detections[0].confidence, 0.88)


class RoboflowOpeningClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_default_client_keeps_window_recall_while_filtering_doors(self) -> None:
        client = RoboflowOpeningClient(api_key="key", model="model/1")

        self.assertEqual(client.door_threshold, 0.40)
        self.assertEqual(client.window_threshold, 0.20)

    async def test_missing_api_key_disables_detection_without_request(self) -> None:
        client = RoboflowOpeningClient(api_key="", model="model/1")

        result = await client.detect(b"image")

        self.assertEqual(result.status, "disabled")
        self.assertEqual(result.detections, [])
        self.assertIn("ROBOFLOW_API_KEY", result.warning or "")


if __name__ == "__main__":
    unittest.main()
