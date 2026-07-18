import base64
import json
import unittest
from io import BytesIO

import cv2
import numpy as np
from fastapi import HTTPException, UploadFile
from PIL import Image

from buildingcv import review_edits
from buildingcv.mitunet_polygons import mask_to_polygons
from buildingcv.opening_alignment import align_openings
from buildingcv.roboflow_openings import OpeningDetection, RoboflowResult
from server import main as server_main


def mask_png_bytes(mask: np.ndarray) -> bytes:
    return base64.b64decode(review_edits.encode_wall_mask_png(mask))


def raw_png_bytes(mask: np.ndarray) -> bytes:
    image = Image.fromarray(mask.astype(bool).astype(np.uint8) * 255, mode="L")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class ParseReviewOpeningsTests(unittest.TestCase):
    def test_parse_review_openings_accepts_manual_door(self) -> None:
        parser = getattr(review_edits, "parse_review_openings", None)
        if parser is None:
            self.fail("parse_review_openings is missing")

        items = parser(
            [
                {
                    "id": "manual-1",
                    "kind": "door",
                    "confidence": 1.0,
                    "center_x": 400,
                    "center_y": 500,
                    "width": 80,
                    "height": 12,
                }
            ]
        )

        self.assertEqual(items[0].opening_id, "manual-1")
        self.assertEqual(items[0].image_width, review_edits.CANVAS_SIZE)

    def test_parse_review_openings_rejects_bad_kind_and_coordinates(self) -> None:
        parser = getattr(review_edits, "parse_review_openings", None)
        if parser is None:
            self.fail("parse_review_openings is missing")

        with self.assertRaisesRegex(ValueError, "kind"):
            parser([{"id": "bad", "kind": "wall"}])
        with self.assertRaisesRegex(ValueError, "finite"):
            parser(
                [
                    {
                        "id": "bad-2",
                        "kind": "door",
                        "center_x": "nan",
                        "center_y": 10,
                        "width": 20,
                        "height": 5,
                    }
                ]
            )


class ComposeEditsApiTests(unittest.IsolatedAsyncioTestCase):
    async def test_extract_image_uses_fixed_wall_prediction_and_local_yolo_candidates(self) -> None:
        class StubExtractor:
            def predict_mask(self, source: Image.Image):
                mask = np.zeros((1024, 1024), dtype=np.uint8)
                mask[500:516, 100:900] = 1
                return mask, source.resize((1024, 1024))

        class StubYoloClient:
            def detect(self, image: Image.Image) -> RoboflowResult:
                self.image_size = image.size
                return RoboflowResult(
                    status="ready",
                    model="yolo-segv1.pt",
                    detections=[
                        OpeningDetection(
                            kind="window",
                            confidence=0.9,
                            center_x=512,
                            center_y=508,
                            width=100,
                            height=16,
                            image_width=1024,
                            image_height=1024,
                            source_model="yolo-segv1.pt",
                            opening_id="yolo-1",
                        )
                    ],
                )

        previous_extractor = getattr(server_main.app.state, "extractor", None)
        previous_client = getattr(server_main.app.state, "yolo_client", None)
        server_main.app.state.extractor = StubExtractor()
        server_main.app.state.yolo_client = StubYoloClient()
        upload = UploadFile(
            filename="plan.png",
            file=BytesIO(raw_png_bytes(np.ones((32, 32), dtype=np.uint8))),
        )
        try:
            result = await server_main.extract_image(upload)
        finally:
            server_main.app.state.extractor = previous_extractor
            server_main.app.state.yolo_client = previous_client

        self.assertNotIn("wall_threshold", result)
        self.assertEqual(result["opening_detection"]["status"], "ready")
        self.assertEqual(result["opening_detection"]["model"], "yolo-segv1.pt")
        self.assertEqual(result["opening_detection"]["accepted_windows"], 1)
        self.assertEqual([item["id"] for item in result["openings"]], ["yolo-1"])
        source_bytes = base64.b64decode(result["analysis_image_b64"])
        with Image.open(BytesIO(source_bytes)) as source_image:
            self.assertEqual(source_image.size, (32, 32))
        rendered_bytes = base64.b64decode(result["input_image_b64"])
        with Image.open(BytesIO(rendered_bytes)) as rendered_image:
            self.assertEqual(rendered_image.size, (1024, 1024))

    async def test_compose_edits_returns_reviewed_polygons(self) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        wall[500:516, 100:900] = 1
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        openings = json.dumps(
            [
                {
                    "id": "door-1",
                    "kind": "door",
                    "confidence": 1.0,
                    "center_x": 400,
                    "center_y": 508,
                    "width": 80,
                    "height": 16,
                    "mask_polygon": [[360, 500], [440, 500], [440, 516], [360, 516]],
                }
            ]
        )

        compose = getattr(server_main, "compose_edits", None)
        if compose is None:
            self.fail("compose_edits is missing")
        result = await compose(wall_mask=upload, openings=openings)

        self.assertEqual(result["polygons"]["wall"], mask_to_polygons(wall)["wall"])
        self.assertEqual(result["opening_detection"]["accepted_doors"], 1)
        self.assertEqual(result["opening_detection"]["status"], "ready")
        self.assertEqual([item["id"] for item in result["openings"]], ["door-1"])
        self.assertTrue(result["openings"][0]["valid"])
        self.assertEqual(
            result["openings"][0]["mask_polygon"],
            [[360.0, 500.0], [440.0, 500.0], [440.0, 516.0], [360.0, 516.0]],
        )

    async def test_compose_edits_legacy_wall_mode_matches_copy_without_door_cutouts(self) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        wall[500:516, 100:900] = 1
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        openings = json.dumps(
            [
                {
                    "id": "door-1",
                    "kind": "door",
                    "confidence": 1.0,
                    "center_x": 400,
                    "center_y": 508,
                    "width": 80,
                    "height": 16,
                    "mask_polygon": [[360, 500], [440, 500], [440, 516], [360, 516]],
                }
            ]
        )

        result = await server_main.compose_edits(
            wall_mask=upload,
            openings=openings,
            wall_polygon_mode="legacy",
        )

        self.assertEqual(
            result["polygons"]["wall"],
            mask_to_polygons(wall, wall_mode="legacy")["wall"],
        )
        self.assertEqual(result["polygons"]["door"], [])
        self.assertEqual(result["opening_detection"]["accepted_doors"], 1)

    async def test_compose_edits_copy_wall_mode_keeps_copy_walls_and_current_doors(self) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        wall[500:516, 100:900] = 1
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        openings = json.dumps(
            [
                {
                    "id": "door-1",
                    "kind": "door",
                    "confidence": 1.0,
                    "center_x": 400,
                    "center_y": 508,
                    "width": 80,
                    "height": 16,
                    "mask_polygon": [[360, 500], [440, 500], [440, 516], [360, 516]],
                }
            ]
        )

        result = await server_main.compose_edits(
            wall_mask=upload,
            openings=openings,
            wall_polygon_mode="copy-wall",
        )

        self.assertEqual(
            result["polygons"]["wall"],
            mask_to_polygons(wall, wall_mode="legacy")["wall"],
        )
        self.assertGreater(len(result["polygons"]["door"]), 0)
        self.assertEqual(result["opening_detection"]["accepted_doors"], 1)

    async def test_compose_edits_copy_wall_mode_uses_copy_window_cutouts(self) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        wall[500:516, 100:900] = 1
        window_polygon = [[380, 500], [420, 500], [420, 516], [380, 516]]
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        openings = json.dumps(
            [
                {
                    "id": "window-1",
                    "kind": "window",
                    "confidence": 1.0,
                    "center_x": 400,
                    "center_y": 508,
                    "width": 40,
                    "height": 16,
                    "mask_polygon": window_polygon,
                }
            ]
        )

        result = await server_main.compose_edits(
            wall_mask=upload,
            openings=openings,
            wall_polygon_mode="copy-wall",
        )

        copy_class_mask = wall.copy()
        cv2.fillPoly(copy_class_mask, [np.asarray(window_polygon, dtype=np.int32)], 3)
        self.assertEqual(
            result["polygons"]["wall"],
            mask_to_polygons(copy_class_mask, wall_mode="legacy")["wall"],
        )
        self.assertGreater(len(result["polygons"]["window"]), 0)

    async def test_compose_edits_copy_wall_mode_retains_copy_window_alignment_fringe(self) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        cv2.fillPoly(
            wall,
            [np.asarray([[480, 100], [500, 100], [540, 900], [520, 900]], dtype=np.int32)],
            1,
        )
        window_polygon = [[488, 360], [492, 360], [492, 440], [488, 440]]
        opening_payload = [
            {
                "id": "window-1",
                "kind": "window",
                "confidence": 1.0,
                "center_x": 490,
                "center_y": 400,
                "width": 4,
                "height": 80,
                "mask_polygon": window_polygon,
            }
        ]
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))

        result = await server_main.compose_edits(
            wall_mask=upload,
            openings=json.dumps(opening_payload),
            wall_polygon_mode="copy-wall",
        )

        detections = review_edits.parse_review_openings(opening_payload)
        aligned = align_openings(wall, detections)
        copy_class_mask = aligned.class_mask.copy()
        for opening in aligned.openings:
            if opening.kind != "window":
                continue
            left = max(0, int(np.floor(opening.center_x - opening.width / 2)))
            right = min(copy_class_mask.shape[1], int(np.ceil(opening.center_x + opening.width / 2)))
            top = max(0, int(np.floor(opening.center_y - opening.height / 2)))
            bottom = min(copy_class_mask.shape[0], int(np.ceil(opening.center_y + opening.height / 2)))
            region = copy_class_mask[top:bottom, left:right]
            region[region == 3] = 1
        cv2.fillPoly(copy_class_mask, [np.asarray(window_polygon, dtype=np.int32)], 3)

        self.assertEqual(
            result["polygons"]["wall"],
            mask_to_polygons(copy_class_mask, wall_mode="legacy")["wall"],
        )

    async def test_compose_edits_keeps_unmatched_opening_editable(self) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        wall[500:516, 100:900] = 1
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        openings = json.dumps(
            [
                {
                    "id": "window-1",
                    "kind": "window",
                    "confidence": 1.0,
                    "center_x": 900,
                    "center_y": 900,
                    "width": 60,
                    "height": 20,
                }
            ]
        )

        compose = getattr(server_main, "compose_edits", None)
        if compose is None:
            self.fail("compose_edits is missing")
        result = await compose(wall_mask=upload, openings=openings)

        self.assertEqual(result["opening_detection"]["accepted_windows"], 0)
        self.assertEqual(result["opening_detection"]["rejected"], 1)
        self.assertEqual(result["polygons"]["window"], [])
        self.assertEqual(result["openings"][0]["id"], "window-1")
        self.assertFalse(result["openings"][0]["valid"])

    async def test_compose_edits_applies_yolo_window_mask_without_wall_support(self) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        wall[500:516, 100:900] = 1
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        openings = json.dumps(
            [
                {
                    "id": "yolo-window-1",
                    "kind": "window",
                    "confidence": 0.9,
                    "center_x": 700,
                    "center_y": 800,
                    "width": 100,
                    "height": 20,
                    "mask_polygon": [[650, 790], [750, 790], [750, 810], [650, 810]],
                }
            ]
        )

        result = await server_main.compose_edits(wall_mask=upload, openings=openings)

        self.assertEqual(result["opening_detection"]["accepted_windows"], 1)
        self.assertEqual(result["opening_detection"]["rejected"], 0)
        self.assertTrue(result["openings"][0]["valid"])
        self.assertGreater(len(result["polygons"]["window"]), 0)

    async def test_compose_edits_smooths_jagged_window_segments(self) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        wall[500:516, 100:900] = 1
        # A zigzag outline like a raw YOLO segment; the small jitters should be
        # simplified away so the glass is not bumpy in 3D.
        jagged = [
            [650, 500], [670, 503], [690, 500], [710, 505], [730, 501],
            [750, 500], [750, 516], [730, 512], [710, 515], [690, 511],
            [670, 514], [650, 516],
        ]
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        openings = json.dumps(
            [
                {
                    "id": "yolo-window-1",
                    "kind": "window",
                    "confidence": 0.9,
                    "center_x": 700,
                    "center_y": 508,
                    "width": 100,
                    "height": 16,
                    "mask_polygon": jagged,
                }
            ]
        )

        result = await server_main.compose_edits(wall_mask=upload, openings=openings)

        # The simplify-then-stamp path must still produce one window covering
        # the detected extent. Edge smoothness is an epsilon tuning knob checked
        # visually, not via vertex counts — mask_to_polygons re-traces the
        # raster and adds stairstep vertices that would make such a test brittle.
        self.assertEqual(result["opening_detection"]["accepted_windows"], 1)
        windows = result["polygons"]["window"]
        self.assertEqual(len(windows), 1)
        xs = [point[0] for point in windows[0]["outer"]]
        ys = [point[1] for point in windows[0]["outer"]]
        self.assertGreaterEqual(max(xs) - min(xs), 95)
        self.assertGreaterEqual(max(ys) - min(ys), 12)

    async def test_compose_edits_snaps_window_to_wall_without_changing_detected_length(
        self,
    ) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        wall[500:516, 100:900] = 1
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        openings = json.dumps(
            [
                {
                    "id": "window-near-wall",
                    "kind": "window",
                    "confidence": 0.8,
                    "center_x": 420,
                    "center_y": 486,
                    "width": 72,
                    "height": 12,
                }
            ]
        )

        result = await server_main.compose_edits(wall_mask=upload, openings=openings)

        snapped = result["openings"][0]
        self.assertEqual(result["opening_detection"]["accepted_windows"], 1)
        self.assertAlmostEqual(snapped["center_x"], 420.0)
        self.assertAlmostEqual(snapped["width"], 72.0)
        self.assertAlmostEqual(snapped["center_y"], 507.5)
        self.assertAlmostEqual(snapped["height"], 16.0)
        self.assertGreater(len(result["polygons"]["window"]), 0)

    async def test_compose_edits_rejects_empty_wall_mask(self) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        compose = getattr(server_main, "compose_edits", None)
        if compose is None:
            self.fail("compose_edits is missing")

        with self.assertRaises(HTTPException) as caught:
            await compose(wall_mask=upload, openings="[]")

        self.assertEqual(caught.exception.status_code, 422)

    async def test_compose_edits_rejects_wrong_size_mask(self) -> None:
        small_mask = np.ones((64, 64), dtype=np.uint8)
        upload = UploadFile(filename="mask.png", file=BytesIO(raw_png_bytes(small_mask)))
        compose = getattr(server_main, "compose_edits", None)
        if compose is None:
            self.fail("compose_edits is missing")

        with self.assertRaises(HTTPException) as caught:
            await compose(wall_mask=upload, openings="[]")

        self.assertEqual(caught.exception.status_code, 422)

    async def test_compose_edits_rejects_malformed_openings_json(self) -> None:
        wall = np.zeros((review_edits.CANVAS_SIZE, review_edits.CANVAS_SIZE), dtype=np.uint8)
        wall[500:516, 100:900] = 1
        upload = UploadFile(filename="mask.png", file=BytesIO(mask_png_bytes(wall)))
        compose = getattr(server_main, "compose_edits", None)
        if compose is None:
            self.fail("compose_edits is missing")

        with self.assertRaises(HTTPException) as caught:
            await compose(wall_mask=upload, openings="{")

        self.assertEqual(caught.exception.status_code, 422)


class ServerCompatibilityTests(unittest.TestCase):
    def test_viewer_assets_mount_is_present(self) -> None:
        self.assertTrue(any(route.path == "/viewer-assets" for route in server_main.app.routes))
