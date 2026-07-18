"""MitUNet inference adapter for the wall-only Three.js demo."""

from __future__ import annotations

from typing import TypedDict

import cv2
import numpy as np
import segmentation_models_pytorch as smp
import torch
from PIL import Image

from .mitunet_polygons import ExtractionResult, mask_to_polygons

IMAGE_SIZE = 1024
IMAGENET_MEAN = np.asarray((0.485, 0.456, 0.406), dtype=np.float32)
IMAGENET_STD = np.asarray((0.229, 0.224, 0.225), dtype=np.float32)


class MitUNetResult(TypedDict):
    result: ExtractionResult
    rendered_image: Image.Image


def build_mitunet() -> torch.nn.Module:
    """Match the MiT-B4 + U-Net scSE structure used to train ``best.pth``."""
    segformer = smp.Segformer(encoder_name="mit_b4", encoder_weights=None)
    model = smp.Unet(
        encoder_name="mit_b4",
        encoder_weights=None,
        in_channels=3,
        classes=1,
        decoder_attention_type="scse",
    )
    model.encoder = segformer.encoder
    return model


def resolve_device(name: str) -> torch.device:
    if name != "auto":
        return torch.device(name)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


class MitUNetPolygonExtractor:
    """Predict a binary wall mask, then reuse the repository polygon extractor."""

    def __init__(
        self,
        weights_path: str,
        device: str = "auto",
        threshold: float = 0.5,
    ) -> None:
        self.device = resolve_device(device)
        self.threshold = threshold
        self.model = build_mitunet().to(self.device)
        state = torch.load(weights_path, map_location=self.device, weights_only=True)
        if isinstance(state, dict) and "model" in state:
            state = state["model"]
        self.model.load_state_dict(state, strict=True)
        self.model.eval()

    @torch.inference_mode()
    def _predict_probabilities(self, image: Image.Image) -> tuple[np.ndarray, Image.Image]:
        rgb = np.asarray(image.convert("RGB"))
        resized = cv2.resize(rgb, (IMAGE_SIZE, IMAGE_SIZE), interpolation=cv2.INTER_LINEAR)
        normalized = resized.astype(np.float32) / 255.0
        normalized = (normalized - IMAGENET_MEAN) / IMAGENET_STD
        channels_first = np.ascontiguousarray(normalized.transpose(2, 0, 1))
        tensor = torch.from_numpy(channels_first).unsqueeze(0).to(self.device)

        logits = self.model(tensor)
        probabilities = torch.sigmoid(logits.squeeze(1)).squeeze(0).cpu().numpy()
        return probabilities, Image.fromarray(resized)

    def predict_mask(self, image: Image.Image) -> tuple[np.ndarray, Image.Image]:
        """Return the binary 1024 wall mask and the exact resized RGB image."""
        probabilities, rendered_image = self._predict_probabilities(image)
        wall_mask = (probabilities >= self.threshold).astype(np.uint8)
        return wall_mask, rendered_image

    def extract(self, image: Image.Image) -> MitUNetResult:
        wall_mask, rendered_image = self.predict_mask(image)
        result: ExtractionResult = {
            "canvas_size": [IMAGE_SIZE, IMAGE_SIZE],
            "content_rect": [0, 0, IMAGE_SIZE, IMAGE_SIZE],
            "polygons": mask_to_polygons(wall_mask),
        }
        return {"result": result, "rendered_image": rendered_image}
