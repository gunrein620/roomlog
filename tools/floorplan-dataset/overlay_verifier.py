#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from dataset_common import (
    DEFAULT_DATASET_ROOT,
    SCRIPT_DIR,
    TRAINING,
    VALIDATION,
    SourceImageIndex,
    class_label,
    drawing_types_label,
    list_plan_records,
    parse_drawing_types,
    read_label_json,
    target_annotations,
    write_json,
)


def score_record(record) -> tuple[int, int, int, int]:
    sliding_door = sum(count for key, count in record.subtypes.items() if "door:미닫이문" in key)
    sliding_window = sum(count for key, count in record.subtypes.items() if "window:미닫이창" in key)
    door = record.counts.get("door", 0)
    window = record.counts.get("window", 0)
    wall = record.counts.get("wall", 0)
    return (sliding_door * 12 + min(door, 8) * 5 + min(window, 24) * 2 + min(wall, 8), sliding_window, door, window)


def choose_diverse(records: list, samples: int) -> list:
    selected: list = []
    selected_keys: set[tuple[str, str]] = set()

    def add(record) -> bool:
        key = (record.split, record.image_file_name)
        if key in selected_keys:
            return False
        selected.append(record)
        selected_keys.add(key)
        return True

    sliding_doors = [
        record for record in records if any("door:미닫이문" in key for key in record.subtypes)
    ]
    for record in sorted(sliding_doors, key=score_record, reverse=True)[: max(1, samples // 4)]:
        add(record)

    groups: dict[tuple[str, str, str], list] = {}
    for record in records:
        if record.counts.get("door", 0) == 0 and record.counts.get("window", 0) == 0:
            continue
        groups.setdefault((record.split, record.prefix, record.orientation), []).append(record)

    for key in sorted(groups):
        groups[key].sort(key=score_record, reverse=True)

    while len(selected) < samples and groups:
        progressed = False
        for key in sorted(list(groups)):
            bucket = groups[key]
            while bucket:
                record = bucket.pop(0)
                if add(record):
                    progressed = True
                    break
            if len(selected) >= samples:
                break
            if not bucket:
                groups.pop(key, None)
        if not progressed:
            break

    if len(selected) < samples:
        for record in sorted(records, key=score_record, reverse=True):
            add(record)
            if len(selected) >= samples:
                break

    return selected[:samples]


def overlay_spec(coco: dict) -> dict:
    image = (coco.get("images") or [])[0]
    boxes = []
    for annotation in target_annotations(coco):
        x, y, width, height = (float(value) for value in annotation["bbox"])
        boxes.append(
            {
                "class_name": annotation["_target_category"],
                "label": class_label(annotation),
                "x": x,
                "y": y,
                "w": width,
                "h": height,
            }
        )
    return {
        "source_width": float(image["width"]),
        "source_height": float(image["height"]),
        "boxes": boxes,
    }


def render_overlay(record, source_index: SourceImageIndex, output_dir: Path, max_dim: int) -> Path:
    coco = read_label_json(record.label_zip, record.label_entry)
    output_path = output_dir / f"{record.split.lower()}__{record.stem}__overlay.png"
    renderer = SCRIPT_DIR / "render_overlay.swift"
    with tempfile.TemporaryDirectory(prefix="roomlog-overlay-") as tmp_name:
        tmp_dir = Path(tmp_name)
        source_path = tmp_dir / record.image_file_name
        spec_path = tmp_dir / "overlay.json"
        module_cache = tmp_dir / "swift-module-cache"
        module_cache.mkdir(parents=True, exist_ok=True)
        source_index.extract_to(record.image_file_name, source_path)
        write_json(spec_path, overlay_spec(coco))
        result = subprocess.run(
            [
                "swift",
                "-module-cache-path",
                str(module_cache),
                str(renderer),
                "--input",
                str(source_path),
                "--spec",
                str(spec_path),
                "--output",
                str(output_path),
                "--max-dim",
                str(max_dim),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"Overlay renderer failed for {record.image_file_name}\n"
                f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
            )
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Render bbox overlays for AI Hub TL_STR floor-plan samples without extracting the full dataset."
    )
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET_ROOT)
    parser.add_argument("--output-dir", type=Path, default=SCRIPT_DIR / "overlays")
    parser.add_argument("--samples", type=int, default=8)
    parser.add_argument("--max-dim", type=int, default=1600)
    parser.add_argument(
        "--drawing-types",
        default="FP",
        help="Comma-separated drawing TYPE tokens from filenames, e.g. FP or FP,CS. Use ALL to disable filtering.",
    )
    args = parser.parse_args()
    drawing_types = parse_drawing_types(args.drawing_types)

    all_records = []
    for split in (TRAINING, VALIDATION):
        all_records.extend(list_plan_records(args.dataset_root, split, drawing_types))
    selected = choose_diverse(all_records, args.samples)
    print(f"drawing_types={drawing_types_label(drawing_types)} selected={len(selected)}")

    indexes = {
        TRAINING: SourceImageIndex(args.dataset_root, TRAINING),
        VALIDATION: SourceImageIndex(args.dataset_root, VALIDATION),
    }
    try:
        for record in selected:
            path = render_overlay(record, indexes[record.split], args.output_dir, args.max_dim)
            subtype_summary = ", ".join(f"{key}={value}" for key, value in sorted(record.subtypes.items()))
            print(
                f"{path} "
                f"[split={record.split} image={record.image_file_name} "
                f"type={record.drawing_type} "
                f"door={record.counts.get('door', 0)} window={record.counts.get('window', 0)} "
                f"wall={record.counts.get('wall', 0)} subtypes={subtype_summary or '-'}]"
            )
    finally:
        for index in indexes.values():
            index.close()


if __name__ == "__main__":
    main()
