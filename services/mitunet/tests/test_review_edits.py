import base64
import unittest
from io import BytesIO

import numpy as np
from PIL import Image

from buildingcv.review_edits import decode_wall_mask_png, encode_wall_mask_png


class ReviewEditTests(unittest.TestCase):
    def test_binary_mask_png_round_trip_is_lossless(self) -> None:
        mask = np.zeros((1024, 1024), dtype=np.uint8)
        mask[100:130, 50:900] = 1

        encoded = encode_wall_mask_png(mask)
        decoded = decode_wall_mask_png(base64.b64decode(encoded))

        np.testing.assert_array_equal(decoded, mask)

    def test_decode_rejects_non_1024_mask(self) -> None:
        image = Image.new("L", (64, 64), 255)
        buffer = BytesIO()
        image.save(buffer, format="PNG")

        with self.assertRaisesRegex(ValueError, "1024 x 1024"):
            decode_wall_mask_png(buffer.getvalue())


if __name__ == "__main__":
    unittest.main()
