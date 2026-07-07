#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dataset_common import (
    DEFAULT_DATASET_ROOT,
    TRAINING,
    VALIDATION,
    SourceImageIndex,
    drawing_types_label,
    is_unknown_door,
    list_plan_records,
    map_annotation_class,
    parse_drawing_types,
    read_label_json,
    resize_png_with_sips,
    scaled_bbox,
    seeded_subset,
    target_annotations,
    write_json,
)


YOLO_CLASS_NAMES = ["wall", "hinged_door", "sliding_door", "window"]
YOLO_CLASS_TO_ID = {name: index for index, name in enumerate(YOLO_CLASS_NAMES)}


def yolo_bbox(bbox: list[Any], image_width: int, image_height: int) -> list[float]:
    x, y, width, height = (float(value) for value in bbox)
    center_x = (x + width / 2.0) / image_width
    center_y = (y + height / 2.0) / image_height
    return [
        round(center_x, 6),
        round(center_y, 6),
        round(width / image_width, 6),
        round(height / image_height, 6),
    ]


def write_data_yaml(output_dir: Path) -> None:
    lines = [
        f"path: {output_dir.resolve()}",
        "train: images/train",
        "val: images/val",
        "names:",
    ]
    lines.extend(f"  {index}: {name}" for index, name in enumerate(YOLO_CLASS_NAMES))
    (output_dir / "data.yaml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def export_split(
    dataset_root: Path,
    split: str,
    output_split: str,
    records: list,
    output_dir: Path,
    max_dim: int,
    unknown_door: str,
) -> tuple[list[dict], int]:
    image_dir = output_dir / "images" / output_split
    label_dir = output_dir / "labels" / output_split
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)

    source_index = SourceImageIndex(dataset_root, split)
    manifest: list[dict] = []
    unknown_door_count = 0
    try:
        for record in records:
            source_coco = read_label_json(record.label_zip, record.label_entry)
            mapped_annotations = []
            for annotation in target_annotations(source_coco):
                if is_unknown_door(annotation):
                    unknown_door_count += 1
                class_name = map_annotation_class(annotation, "4", unknown_door)
                if class_name is None:
                    continue
                mapped_annotations.append((annotation, class_name))
            if not mapped_annotations:
                continue

            out_name = f"{record.stem}.png"
            out_image_path = image_dir / out_name
            with tempfile.TemporaryDirectory(prefix="roomlog-yolo-export-") as tmp_name:
                tmp_dir = Path(tmp_name)
                extracted_path = tmp_dir / record.image_file_name
                source_zip, source_member = source_index.extract_to(record.image_file_name, extracted_path)
                new_width, new_height = resize_png_with_sips(extracted_path, out_image_path, max_dim)

            scale_x = new_width / record.width
            scale_y = new_height / record.height
            counts = {name: 0 for name in YOLO_CLASS_NAMES}
            label_lines = []
            for annotation, class_name in mapped_annotations:
                counts[class_name] += 1
                normalized = yolo_bbox(
                    scaled_bbox(annotation["bbox"], scale_x, scale_y),
                    image_width=new_width,
                    image_height=new_height,
                )
                values = " ".join(f"{value:.6f}" for value in normalized)
                label_lines.append(f"{YOLO_CLASS_TO_ID[class_name]} {values}")

            label_path = label_dir / f"{record.stem}.txt"
            label_path.write_text("\n".join(label_lines) + "\n", encoding="utf-8")
            manifest.append(
                {
                    "split": split,
                    "output_split": output_split,
                    "image": str(Path("images") / output_split / out_name),
                    "label": str(Path("labels") / output_split / f"{record.stem}.txt"),
                    "source_image": record.image_file_name,
                    "source_label_zip": str(record.label_zip),
                    "source_label_entry": record.label_entry,
                    "source_image_zip": str(source_zip),
                    "source_image_entry": source_member,
                    "original_size": [record.width, record.height],
                    "export_size": [new_width, new_height],
                    "drawing_type": record.drawing_type,
                    "counts": counts,
                }
            )
    finally:
        source_index.close()

    return manifest, unknown_door_count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert AI Hub TL_STR/VL_STR labels to a YOLO dataset for Roomlog floor-plan training."
    )
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET_ROOT)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path.home() / "Desktop" / "roomlog-floorplan-yolo-door4",
    )
    parser.add_argument("--train-count", type=int, default=1500)
    parser.add_argument("--val-count", type=int, default=300)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-dim", type=int, default=1600)
    parser.add_argument("--unknown-door", choices=("drop", "hinged"), default="drop")
    parser.add_argument(
        "--drawing-types",
        default="FP",
        help="Comma-separated drawing TYPE tokens from filenames, e.g. FP or FP,CS. Use ALL to disable filtering.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Replace an existing output directory.")
    args = parser.parse_args()

    drawing_types = parse_drawing_types(args.drawing_types)
    if args.output_dir.exists():
        if not args.overwrite:
            raise SystemExit(f"Output directory exists; pass --overwrite to replace it: {args.output_dir}")
        shutil.rmtree(args.output_dir)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    train_records = seeded_subset(list_plan_records(args.dataset_root, TRAINING, drawing_types), args.train_count, args.seed)
    val_records = seeded_subset(list_plan_records(args.dataset_root, VALIDATION, drawing_types), args.val_count, args.seed + 1)

    train_manifest, train_unknown_doors = export_split(
        args.dataset_root,
        TRAINING,
        "train",
        train_records,
        args.output_dir,
        args.max_dim,
        args.unknown_door,
    )
    val_manifest, val_unknown_doors = export_split(
        args.dataset_root,
        VALIDATION,
        "val",
        val_records,
        args.output_dir,
        args.max_dim,
        args.unknown_door,
    )
    write_data_yaml(args.output_dir)

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_root": str(args.dataset_root),
        "drawing_types": drawing_types_label(drawing_types),
        "format": "yolo",
        "class_mode": "4-door-split",
        "unknown_door": args.unknown_door,
        "classes": YOLO_CLASS_NAMES,
        "taxonomy": {
            "구조_벽체": "wall",
            "구조_출입문/여닫이문": "hinged_door",
            "구조_출입문/미닫이문": "sliding_door",
            "구조_출입문/기타문": None,
            "구조_창호": "window",
        },
        "max_dim": args.max_dim,
        "seed": args.seed,
        "requested_counts": {"train": args.train_count, "val": args.val_count},
        "exported_counts": {"train": len(train_manifest), "val": len(val_manifest)},
        "unknown_door_annotations": {"train": train_unknown_doors, "val": val_unknown_doors},
        "records": train_manifest + val_manifest,
    }
    write_json(args.output_dir / "manifest.json", manifest)

    print(f"Exported YOLO dataset: {args.output_dir}")
    print(f"  drawing_types: {drawing_types_label(drawing_types)}")
    print(f"  classes: {', '.join(YOLO_CLASS_NAMES)}")
    print(f"  train images: {len(train_manifest)}")
    print(f"  val images: {len(val_manifest)}")
    print(f"  data.yaml: {args.output_dir / 'data.yaml'}")
    print(f"  manifest: {args.output_dir / 'manifest.json'}")
    if args.unknown_door == "drop":
        print(f"  dropped unknown doors: train={train_unknown_doors} val={val_unknown_doors}")


if __name__ == "__main__":
    main()
