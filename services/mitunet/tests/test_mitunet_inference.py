import unittest
from inspect import signature

import torch
from PIL import Image

from buildingcv.mitunet import MitUNetPolygonExtractor


class StaticWallModel:
    def __call__(self, _tensor: torch.Tensor) -> torch.Tensor:
        logits = torch.full((1, 1, 1024, 1024), -10.0)
        logits[:, :, 100:220, 100:120] = 10.0
        logits[:, :, 500:510, 500:510] = 10.0
        return logits


class MitUNetInferenceTests(unittest.TestCase):
    def test_default_threshold_is_fixed_at_half(self) -> None:
        threshold = signature(MitUNetPolygonExtractor).parameters["threshold"].default

        self.assertEqual(threshold, 0.5)

    def test_predict_mask_returns_raw_thresholded_wall_mask(self) -> None:
        extractor = MitUNetPolygonExtractor.__new__(MitUNetPolygonExtractor)
        extractor.device = torch.device("cpu")
        extractor.threshold = 0.5
        extractor.model = StaticWallModel()

        wall_mask, rendered = extractor.predict_mask(Image.new("RGB", (32, 32), "white"))

        self.assertEqual(rendered.size, (1024, 1024))
        self.assertTrue(wall_mask[150, 110])
        self.assertTrue(wall_mask[505, 505])

if __name__ == "__main__":
    unittest.main()
