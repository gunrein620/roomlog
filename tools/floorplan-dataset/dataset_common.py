#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import random
import shutil
import struct
import subprocess
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DATASET_ROOT = Path(
    os.environ.get(
        "AIHUB_FLOORPLAN_ROOT",
        "/Volumes/PROJECTS/239.건축 도면 데이터/01-1.정식개방데이터",
    )
)

TRAINING = "Training"
VALIDATION = "Validation"

KOREAN_TO_TARGET = {
    "구조_벽체": "wall",
    "구조_출입문": "door",
    "구조_창호": "window",
}
TARGET_TO_ID = {"wall": 1, "door": 2, "window": 3}
TARGET_CATEGORIES = [
    {"id": TARGET_TO_ID["wall"], "name": "wall", "supercategory": "structure"},
    {"id": TARGET_TO_ID["door"], "name": "door", "supercategory": "structure"},
    {"id": TARGET_TO_ID["window"], "name": "window", "supercategory": "structure"},
]
FOUR_CLASS_TO_ID = {"wall": 1, "hinged_door": 2, "sliding_door": 3, "window": 4}
FOUR_CLASS_CATEGORIES = [
    {"id": FOUR_CLASS_TO_ID["wall"], "name": "wall", "supercategory": "structure"},
    {"id": FOUR_CLASS_TO_ID["hinged_door"], "name": "hinged_door", "supercategory": "structure"},
    {"id": FOUR_CLASS_TO_ID["sliding_door"], "name": "sliding_door", "supercategory": "structure"},
    {"id": FOUR_CLASS_TO_ID["window"], "name": "window", "supercategory": "structure"},
]
CLASS_ORDER = ("door", "window", "wall")
FOUR_CLASS_ORDER = ("hinged_door", "sliding_door", "window", "wall")
DEFAULT_DRAWING_TYPES = ("FP",)


@dataclass(frozen=True)
class PlanRecord:
    split: str
    label_zip: Path
    label_entry: str
    image_file_name: str
    width: int
    height: int
    counts: dict[str, int]
    subtypes: dict[str, int]
    drawing_type: str

    @property
    def stem(self) -> str:
        return Path(self.image_file_name).stem

    @property
    def prefix(self) -> str:
        parts = self.stem.split("_")
        return "_".join(parts[:3]) if len(parts) >= 3 else self.stem

    @property
    def orientation(self) -> str:
        if self.width == self.height:
            return "square"
        return "landscape" if self.width > self.height else "portrait"


def parse_drawing_types(raw: str | None) -> tuple[str, ...] | None:
    if raw is None:
        return DEFAULT_DRAWING_TYPES
    cleaned = raw.strip()
    if cleaned.lower() in {"all", "*"}:
        return None
    values = tuple(part.strip().upper() for part in cleaned.split(",") if part.strip())
    return values or DEFAULT_DRAWING_TYPES


def drawing_type_from_filename(file_name: str) -> str:
    parts = Path(file_name).stem.split("_")
    if len(parts) >= 3 and parts[2].upper() == "STR":
        return parts[1].upper()
    return "UNKNOWN"


def drawing_types_label(drawing_types: tuple[str, ...] | None) -> str:
    return "ALL" if drawing_types is None else ",".join(drawing_types)


def target_categories(class_mode: str = "3") -> list[dict[str, Any]]:
    categories = TARGET_CATEGORIES if class_mode == "3" else FOUR_CLASS_CATEGORIES
    return [dict(category) for category in categories]


def class_order(class_mode: str = "3") -> tuple[str, ...]:
    return CLASS_ORDER if class_mode == "3" else FOUR_CLASS_ORDER


def category_id_for_class(class_name: str, class_mode: str = "3") -> int:
    ids = TARGET_TO_ID if class_mode == "3" else FOUR_CLASS_TO_ID
    return ids[class_name]


def zip_basename(member_name: str) -> str:
    return PurePosixPath(member_name).name


def require_file(path: Path, description: str) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"{description} not found: {path}")
    return path


def find_label_zip(dataset_root: Path, split: str) -> Path:
    expected = "TL_STR.zip" if split == TRAINING else "VL_STR.zip"
    matches = sorted((dataset_root / split).rglob(expected))
    if not matches:
        raise FileNotFoundError(f"Could not find {expected} below {dataset_root / split}")
    return matches[0]


def find_source_zips(dataset_root: Path, split: str) -> list[Path]:
    names = ("TS_STR_1.zip", "TS_STR_2.zip") if split == TRAINING else ("VS_STR.zip",)
    found: list[Path] = []
    for name in names:
        matches = sorted((dataset_root / split).rglob(name))
        if not matches:
            raise FileNotFoundError(f"Could not find {name} below {dataset_root / split}")
        found.append(matches[0])
    return found


class SourceImageIndex:
    def __init__(self, dataset_root: Path, split: str):
        self.split = split
        self.zip_paths = find_source_zips(dataset_root, split)
        self._zipfiles = [zipfile.ZipFile(path) for path in self.zip_paths]
        self._members: dict[str, tuple[int, str]] = {}
        for zip_index, zf in enumerate(self._zipfiles):
            for member in zf.namelist():
                base = zip_basename(member)
                if base.lower().endswith(".png"):
                    self._members[base.lower()] = (zip_index, member)

    def close(self) -> None:
        for zf in self._zipfiles:
            zf.close()

    def lookup(self, file_name: str) -> tuple[zipfile.ZipFile, str, Path]:
        base = Path(file_name).name.lower()
        if base not in self._members:
            stem = Path(file_name).stem
            fallback = f"{stem}.png".lower()
            if fallback not in self._members:
                raise FileNotFoundError(f"{file_name} not found in {self.split} STR source zips")
            base = fallback
        zip_index, member = self._members[base]
        return self._zipfiles[zip_index], member, self.zip_paths[zip_index]

    def extract_to(self, file_name: str, dest_path: Path) -> tuple[Path, str]:
        zf, member, zip_path = self.lookup(file_name)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(member) as src, dest_path.open("wb") as dst:
            shutil.copyfileobj(src, dst)
        return zip_path, member


def read_label_json(label_zip: Path, entry: str) -> dict[str, Any]:
    with zipfile.ZipFile(label_zip) as zf:
        with zf.open(entry) as src:
            return json.load(src)


def iter_label_jsons(dataset_root: Path, split: str) -> Iterable[tuple[Path, str, dict[str, Any]]]:
    label_zip = find_label_zip(dataset_root, split)
    with zipfile.ZipFile(label_zip) as zf:
        entries = sorted(name for name in zf.namelist() if name.lower().endswith(".json"))
        for entry in entries:
            with zf.open(entry) as src:
                yield label_zip, entry, json.load(src)


def image_meta(coco: dict[str, Any], label_entry: str) -> dict[str, Any]:
    images = coco.get("images") or []
    if len(images) != 1:
        raise ValueError(f"Expected one image in {label_entry}, found {len(images)}")
    return images[0]


def category_name_by_id(coco: dict[str, Any]) -> dict[int, str]:
    return {int(category["id"]): str(category["name"]) for category in coco.get("categories", [])}


def annotation_subtype(category_name: str, attributes: dict[str, Any] | None) -> str | None:
    if not attributes:
        return None
    keys = (category_name, "창호")
    for key in keys:
        value = attributes.get(key)
        if value:
            return str(value)
    return None


def target_annotations(coco: dict[str, Any]) -> list[dict[str, Any]]:
    names = category_name_by_id(coco)
    filtered: list[dict[str, Any]] = []
    for annotation in coco.get("annotations", []):
        category_name = names.get(int(annotation.get("category_id", -1)))
        if category_name not in KOREAN_TO_TARGET:
            continue
        bbox = annotation.get("bbox") or []
        if len(bbox) != 4 or float(bbox[2]) <= 0 or float(bbox[3]) <= 0:
            continue
        copied = dict(annotation)
        copied["_korean_category"] = category_name
        copied["_target_category"] = KOREAN_TO_TARGET[category_name]
        copied["_target_category_id"] = TARGET_TO_ID[KOREAN_TO_TARGET[category_name]]
        copied["_subtype"] = annotation_subtype(category_name, annotation.get("attributes") or {})
        filtered.append(copied)
    return filtered


def summarize_plan(coco: dict[str, Any], split: str, label_zip: Path, label_entry: str) -> PlanRecord:
    image = image_meta(coco, label_entry)
    annotations = target_annotations(coco)
    counts = Counter(annotation["_target_category"] for annotation in annotations)
    subtypes = Counter(
        f"{annotation['_target_category']}:{annotation['_subtype']}"
        for annotation in annotations
        if annotation.get("_subtype")
    )
    return PlanRecord(
        split=split,
        label_zip=label_zip,
        label_entry=label_entry,
        image_file_name=str(image.get("file_name") or f"{Path(label_entry).stem}.PNG"),
        width=int(image["width"]),
        height=int(image["height"]),
        counts={name: int(counts.get(name, 0)) for name in TARGET_TO_ID},
        subtypes=dict(subtypes),
        drawing_type=drawing_type_from_filename(str(image.get("file_name") or label_entry)),
    )


def list_plan_records(
    dataset_root: Path,
    split: str,
    drawing_types: tuple[str, ...] | None = DEFAULT_DRAWING_TYPES,
) -> list[PlanRecord]:
    records: list[PlanRecord] = []
    for label_zip, entry, coco in iter_label_jsons(dataset_root, split):
        record = summarize_plan(coco, split, label_zip, entry)
        if drawing_types is not None and record.drawing_type not in drawing_types:
            continue
        if sum(record.counts.values()) > 0:
            records.append(record)
    return records


def seeded_subset(records: list[PlanRecord], count: int, seed: int) -> list[PlanRecord]:
    ordered = sorted(records, key=lambda record: record.image_file_name)
    if count <= 0 or count >= len(ordered):
        return ordered
    rng = random.Random(seed)
    selected = rng.sample(ordered, count)
    return sorted(selected, key=lambda record: record.image_file_name)


def read_png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as src:
        header = src.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"Not a PNG file or missing IHDR: {path}")
    width, height = struct.unpack(">II", header[16:24])
    return int(width), int(height)


def resize_png_with_sips(input_path: Path, output_path: Path, max_dim: int) -> tuple[int, int]:
    require_file(input_path, "input image")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["sips", "-Z", str(max_dim), str(input_path), "--out", str(output_path)]
    result = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(
            f"sips failed for {input_path} -> {output_path}\n"
            f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return read_png_size(output_path)


def scaled_bbox(bbox: list[Any], scale_x: float, scale_y: float) -> list[float]:
    x, y, width, height = (float(value) for value in bbox)
    return [x * scale_x, y * scale_y, width * scale_x, height * scale_y]


def scaled_segmentation(segmentation: Any, scale_x: float, scale_y: float) -> Any:
    if not isinstance(segmentation, list):
        return segmentation
    scaled: list[Any] = []
    for polygon in segmentation:
        if not isinstance(polygon, list):
            scaled.append(polygon)
            continue
        next_polygon: list[float] = []
        for index, value in enumerate(polygon):
            factor = scale_x if index % 2 == 0 else scale_y
            next_polygon.append(float(value) * factor)
        scaled.append(next_polygon)
    return scaled


def bbox_iou(left: list[float], right: list[float]) -> float:
    lx1, ly1, lw, lh = left
    rx1, ry1, rw, rh = right
    lx2, ly2 = lx1 + lw, ly1 + lh
    rx2, ry2 = rx1 + rw, ry1 + rh
    ix1, iy1 = max(lx1, rx1), max(ly1, ry1)
    ix2, iy2 = min(lx2, rx2), min(ly2, ry2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    intersection = iw * ih
    union = lw * lh + rw * rh - intersection
    return intersection / union if union > 0 else 0.0


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def class_label(annotation: dict[str, Any]) -> str:
    target = annotation["_target_category"]
    subtype = annotation.get("_subtype")
    return f"{target}/{subtype}" if subtype else target


def map_annotation_class(
    annotation: dict[str, Any],
    class_mode: str = "3",
    unknown_door: str = "drop",
) -> str | None:
    target = annotation["_target_category"]
    if class_mode == "3":
        return target
    if target == "wall" or target == "window":
        return target
    if target != "door":
        return None
    subtype = annotation.get("_subtype")
    if subtype == "여닫이문":
        return "hinged_door"
    if subtype == "미닫이문":
        return "sliding_door"
    if unknown_door == "hinged":
        return "hinged_door"
    return None


def is_unknown_door(annotation: dict[str, Any]) -> bool:
    return annotation["_target_category"] == "door" and annotation.get("_subtype") not in {
        "여닫이문",
        "미닫이문",
    }


def normalize_model_class(name: str) -> str | None:
    cleaned = str(name).strip().lower()
    aliases = {
        "door": "door",
        "doors": "door",
        "hinged_door": "hinged_door",
        "hinged-door": "hinged_door",
        "hinged door": "hinged_door",
        "sliding_door": "sliding_door",
        "sliding-door": "sliding_door",
        "sliding door": "sliding_door",
        "window": "window",
        "windows": "window",
        "wall": "wall",
        "walls": "wall",
        "구조_출입문": "door",
        "출입문": "door",
        "문": "door",
        "구조_창호": "window",
        "창호": "window",
        "창": "window",
        "구조_벽체": "wall",
        "벽체": "wall",
        "벽": "wall",
    }
    return aliases.get(cleaned)
