#!/usr/bin/env python3
from __future__ import annotations

import argparse
import random
import shutil
import threading
import tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dataset_common import (
    DEFAULT_DATASET_ROOT,
    SCRIPT_DIR,
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
    target_categories,
    write_json,
)


@dataclass(frozen=True)
class ExportConfig:
    dataset_root: Path
    source_split: str
    output_split: str
    output_dir: Path
    max_dim: int
    task: str
    class_mode: str
    unknown_door: str
    names: tuple[str, ...]


@dataclass
class ExportedRecord:
    split: str
    output_split: str
    image: str
    label: str
    source_image: str
    source_label_zip: str
    source_label_entry: str
    source_image_zip: str
    source_image_entry: str
    original_size: list[int]
    export_size: list[int]
    drawing_type: str
    line_count: int
    counts: dict[str, int]
    polygon_fallbacks: int
    unknown_door_annotations: int


_WORKER_CONFIG: ExportConfig | None = None
_WORKER_STATE = threading.local()


def class_names(class_mode: str) -> tuple[str, ...]:
    return tuple(str(category["name"]) for category in target_categories(class_mode))


def class_to_id(names: tuple[str, ...]) -> dict[str, int]:
    return {name: index for index, name in enumerate(names)}


def normalized_bbox(bbox: list[float], image_width: int, image_height: int) -> list[float]:
    x, y, width, height = (float(value) for value in bbox)
    return [
        clamp01((x + width / 2.0) / image_width),
        clamp01((y + height / 2.0) / image_height),
        clamp01(width / image_width),
        clamp01(height / image_height),
    ]


def bbox_polygon(bbox: list[float]) -> list[float]:
    x, y, width, height = (float(value) for value in bbox)
    return [x, y, x + width, y, x + width, y + height, x, y + height]


def clamp01(value: float) -> float:
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value


def is_valid_polygon(polygon: Any) -> bool:
    if not isinstance(polygon, list) or len(polygon) < 6 or len(polygon) % 2 != 0:
        return False
    try:
        xs = [float(polygon[index]) for index in range(0, len(polygon), 2)]
        ys = [float(polygon[index]) for index in range(1, len(polygon), 2)]
    except (TypeError, ValueError):
        return False
    return (max(xs) - min(xs)) > 0.0 and (max(ys) - min(ys)) > 0.0


def scaled_valid_polygons(annotation: dict[str, Any], scale_x: float, scale_y: float) -> list[list[float]]:
    segmentation = annotation.get("segmentation")
    raw_polygons: list[Any]
    if isinstance(segmentation, list) and segmentation and all(
        isinstance(value, (int, float)) for value in segmentation
    ):
        raw_polygons = [segmentation]
    elif isinstance(segmentation, list):
        raw_polygons = segmentation
    else:
        raw_polygons = []

    polygons: list[list[float]] = []
    for raw in raw_polygons:
        if not is_valid_polygon(raw):
            continue
        scaled = [
            float(value) * (scale_x if index % 2 == 0 else scale_y)
            for index, value in enumerate(raw)
        ]
        if is_valid_polygon(scaled):
            polygons.append(scaled)
    return polygons


def normalized_polygon(polygon: list[float], image_width: int, image_height: int) -> list[float]:
    values: list[float] = []
    for index, value in enumerate(polygon):
        denominator = image_width if index % 2 == 0 else image_height
        values.append(clamp01(float(value) / denominator))
    return values


def format_line(class_id: int, values: list[float]) -> str:
    return f"{class_id} " + " ".join(f"{value:.6f}" for value in values)


def label_lines_for_annotation(
    annotation: dict[str, Any],
    class_id: int,
    scale_x: float,
    scale_y: float,
    image_width: int,
    image_height: int,
    task: str,
) -> tuple[list[str], int]:
    bbox = scaled_bbox(annotation["bbox"], scale_x, scale_y)
    if task == "detect":
        return [format_line(class_id, normalized_bbox(bbox, image_width, image_height))], 0

    polygons = scaled_valid_polygons(annotation, scale_x, scale_y)
    fallback_count = 0
    if not polygons:
        polygons = [bbox_polygon(bbox)]
        fallback_count = 1

    lines: list[str] = []
    for polygon in polygons:
        normalized = normalized_polygon(polygon, image_width, image_height)
        if len(normalized) >= 6 and len(normalized) % 2 == 0:
            lines.append(format_line(class_id, normalized))
    if not lines:
        normalized = normalized_polygon(bbox_polygon(bbox), image_width, image_height)
        lines.append(format_line(class_id, normalized))
        fallback_count = 1
    return lines, fallback_count


def _init_worker(config: ExportConfig) -> None:
    global _WORKER_CONFIG
    _WORKER_CONFIG = config
    _WORKER_STATE.source_index = SourceImageIndex(config.dataset_root, config.source_split)


def _export_one_worker(record: Any) -> ExportedRecord | None:
    source_index = getattr(_WORKER_STATE, "source_index", None)
    if _WORKER_CONFIG is None or source_index is None:
        raise RuntimeError("YOLO export worker was not initialized")
    return export_one_record(_WORKER_CONFIG, source_index, record)


def export_one_record(
    config: ExportConfig,
    source_index: SourceImageIndex,
    record: Any,
) -> ExportedRecord | None:
    source_coco = read_label_json(record.label_zip, record.label_entry)
    ids = class_to_id(config.names)
    mapped_annotations: list[tuple[dict[str, Any], str]] = []
    unknown_door_count = 0
    for annotation in target_annotations(source_coco):
        if is_unknown_door(annotation):
            unknown_door_count += 1
        class_name = map_annotation_class(annotation, config.class_mode, config.unknown_door)
        if class_name is None:
            continue
        mapped_annotations.append((annotation, class_name))

    if not mapped_annotations:
        return None

    image_dir = config.output_dir / "images" / config.output_split
    label_dir = config.output_dir / "labels" / config.output_split
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)

    out_name = f"{record.stem}.png"
    out_image_path = image_dir / out_name
    with tempfile.TemporaryDirectory(prefix="roomlog-yolo-export-") as tmp_name:
        tmp_dir = Path(tmp_name)
        extracted_path = tmp_dir / record.image_file_name
        source_zip, source_member = source_index.extract_to(record.image_file_name, extracted_path)
        new_width, new_height = resize_png_with_sips(extracted_path, out_image_path, config.max_dim)

    scale_x = new_width / record.width
    scale_y = new_height / record.height
    label_lines: list[str] = []
    counts = {name: 0 for name in config.names}
    polygon_fallbacks = 0

    for annotation, class_name in mapped_annotations:
        lines, fallback_count = label_lines_for_annotation(
            annotation=annotation,
            class_id=ids[class_name],
            scale_x=scale_x,
            scale_y=scale_y,
            image_width=new_width,
            image_height=new_height,
            task=config.task,
        )
        if lines:
            counts[class_name] += len(lines) if config.task == "seg" else 1
            label_lines.extend(lines)
            polygon_fallbacks += fallback_count

    if not label_lines:
        out_image_path.unlink(missing_ok=True)
        return None

    label_path = label_dir / f"{record.stem}.txt"
    label_path.write_text("\n".join(label_lines) + "\n", encoding="utf-8")
    return ExportedRecord(
        split=config.source_split,
        output_split=config.output_split,
        image=str(Path("images") / config.output_split / out_name),
        label=str(Path("labels") / config.output_split / f"{record.stem}.txt"),
        source_image=record.image_file_name,
        source_label_zip=str(record.label_zip),
        source_label_entry=record.label_entry,
        source_image_zip=str(source_zip),
        source_image_entry=source_member,
        original_size=[record.width, record.height],
        export_size=[new_width, new_height],
        drawing_type=record.drawing_type,
        line_count=len(label_lines),
        counts=counts,
        polygon_fallbacks=polygon_fallbacks,
        unknown_door_annotations=unknown_door_count,
    )


def split_training_records(records: list[Any], val_fraction: float, seed: int) -> tuple[list[Any], list[Any]]:
    if not 0.0 <= val_fraction < 1.0:
        raise SystemExit("--val-fraction must be >= 0 and < 1")
    shuffled = list(records)
    random.Random(seed).shuffle(shuffled)
    if len(shuffled) <= 1 or val_fraction == 0.0:
        return sorted(shuffled, key=lambda record: record.image_file_name), []
    val_count = int(round(len(shuffled) * val_fraction))
    val_count = max(1, min(val_count, len(shuffled) - 1))
    val_records = sorted(shuffled[:val_count], key=lambda record: record.image_file_name)
    train_records = sorted(shuffled[val_count:], key=lambda record: record.image_file_name)
    return train_records, val_records


def export_split(
    config: ExportConfig,
    records: list[Any],
    workers: int,
    progress_every: int,
) -> tuple[list[ExportedRecord], Counter[str], int, int]:
    if not records:
        return [], Counter(), 0, 0

    exported: list[ExportedRecord] = []
    class_counts: Counter[str] = Counter()
    unknown_doors = 0
    polygon_fallbacks = 0
    processed = 0
    progress_every = max(1, progress_every)

    if workers <= 1:
        source_index = SourceImageIndex(config.dataset_root, config.source_split)
        try:
            for record in records:
                result = export_one_record(config, source_index, record)
                processed += 1
                if result is not None:
                    exported.append(result)
                    class_counts.update(result.counts)
                    unknown_doors += result.unknown_door_annotations
                    polygon_fallbacks += result.polygon_fallbacks
                if processed % progress_every == 0 or processed == len(records):
                    print(
                        f"  {config.output_split}: processed {processed}/{len(records)} "
                        f"exported={len(exported)}"
                    )
        finally:
            source_index.close()
    else:
        with ThreadPoolExecutor(
            max_workers=workers,
            initializer=_init_worker,
            initargs=(config,),
        ) as executor:
            futures = [executor.submit(_export_one_worker, record) for record in records]
            for future in as_completed(futures):
                result = future.result()
                processed += 1
                if result is not None:
                    exported.append(result)
                    class_counts.update(result.counts)
                    unknown_doors += result.unknown_door_annotations
                    polygon_fallbacks += result.polygon_fallbacks
                if processed % progress_every == 0 or processed == len(records):
                    print(
                        f"  {config.output_split}: processed {processed}/{len(records)} "
                        f"exported={len(exported)}"
                    )

    exported.sort(key=lambda item: item.image)
    return exported, class_counts, unknown_doors, polygon_fallbacks


def write_data_yaml(output_dir: Path, names: tuple[str, ...], include_test: bool) -> None:
    lines = [
        f"path: {output_dir.resolve()}",
        "train: images/train",
        "val: images/val",
    ]
    if include_test:
        lines.append("test: images/test")
    lines.append("names:")
    lines.extend(f"  {index}: {name}" for index, name in enumerate(names))
    (output_dir / "data.yaml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def manifest_payload(
    args: argparse.Namespace,
    drawing_types: tuple[str, ...] | None,
    names: tuple[str, ...],
    train_records: list[Any],
    val_records: list[Any],
    test_records: list[Any],
    exported: dict[str, list[ExportedRecord]],
    counts: dict[str, Counter[str]],
    unknown_doors: dict[str, int],
    polygon_fallbacks: dict[str, int],
) -> dict[str, Any]:
    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_root": str(args.dataset_root),
        "drawing_types": drawing_types_label(drawing_types),
        "format": f"yolo-{args.task}",
        "task": args.task,
        "class_mode": args.class_mode,
        "unknown_door": args.unknown_door,
        "classes": list(names),
        "max_dim": args.max_dim,
        "seed": args.seed,
        "val_fraction": args.val_fraction,
        "include_aihub_validation": args.include_aihub_validation,
        "requested_records": {
            "train_val_pool": len(train_records) + len(val_records),
            "train": len(train_records),
            "val": len(val_records),
            "test": len(test_records),
        },
        "exported_images": {split: len(items) for split, items in exported.items()},
        "class_line_counts": {split: dict(counter) for split, counter in counts.items()},
        "unknown_door_annotations": unknown_doors,
        "polygon_fallbacks": polygon_fallbacks,
        "records": [asdict(record) for split in ("train", "val", "test") for record in exported.get(split, [])],
    }


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be >= 1")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export AI Hub #239 STR floor-plan labels to an Ultralytics YOLO dataset."
    )
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET_ROOT)
    parser.add_argument(
        "--out",
        "--output-dir",
        dest="output_dir",
        type=Path,
        default=SCRIPT_DIR / "export" / "roomlog-openings-yolo",
        help="Output dataset directory.",
    )
    parser.add_argument("--task", choices=("seg", "detect"), default="seg")
    parser.add_argument("--class-mode", choices=("3", "4"), default="3")
    parser.add_argument("--unknown-door", choices=("drop", "hinged"), default="drop")
    parser.add_argument("--train-count", type=int, default=0, help="0 means all AI Hub Training FP plans.")
    parser.add_argument("--val-fraction", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-dim", type=int, default=1600)
    parser.add_argument("--workers", type=positive_int, default=1)
    parser.add_argument("--progress-every", type=positive_int, default=100)
    parser.add_argument(
        "--drawing-types",
        default="FP",
        help="Comma-separated drawing TYPE tokens from filenames, e.g. FP or FP,CS. Use ALL to disable filtering.",
    )
    parser.add_argument(
        "--include-aihub-validation",
        action="store_true",
        help="Also export AI Hub Validation split as YOLO test. Reserved and off by default.",
    )
    parser.add_argument("--test-count", type=int, default=0, help="0 means all AI Hub Validation records if included.")
    parser.add_argument("--overwrite", action="store_true", help="Replace an existing output directory.")
    args = parser.parse_args()

    if args.train_count < 0:
        raise SystemExit("--train-count must be >= 0")
    if args.test_count < 0:
        raise SystemExit("--test-count must be >= 0")

    drawing_types = parse_drawing_types(args.drawing_types)
    names = class_names(args.class_mode)

    if args.output_dir.exists():
        if not args.overwrite:
            raise SystemExit(f"Output directory exists; pass --overwrite to replace it: {args.output_dir}")
        shutil.rmtree(args.output_dir)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    training_pool = seeded_subset(
        list_plan_records(args.dataset_root, TRAINING, drawing_types),
        args.train_count,
        args.seed,
    )
    train_records, val_records = split_training_records(training_pool, args.val_fraction, args.seed + 17)
    test_records: list[Any] = []
    if args.include_aihub_validation:
        test_records = seeded_subset(
            list_plan_records(args.dataset_root, VALIDATION, drawing_types),
            args.test_count,
            args.seed + 1,
        )

    print(f"drawing_types={drawing_types_label(drawing_types)}")
    print(f"task={args.task} class_mode={args.class_mode} names={list(names)}")
    print(f"AI Hub Training pool: {len(training_pool)} -> train={len(train_records)} val={len(val_records)}")
    if args.include_aihub_validation:
        print(f"AI Hub Validation -> test={len(test_records)}")
    else:
        print("AI Hub Validation is reserved and was not exported")

    exported: dict[str, list[ExportedRecord]] = {}
    counts: dict[str, Counter[str]] = {}
    unknown_doors: dict[str, int] = {}
    polygon_fallbacks: dict[str, int] = {}

    split_specs = [
        (TRAINING, "train", train_records),
        (TRAINING, "val", val_records),
    ]
    if args.include_aihub_validation:
        split_specs.append((VALIDATION, "test", test_records))

    for source_split, output_split, records in split_specs:
        config = ExportConfig(
            dataset_root=args.dataset_root,
            source_split=source_split,
            output_split=output_split,
            output_dir=args.output_dir,
            max_dim=args.max_dim,
            task=args.task,
            class_mode=args.class_mode,
            unknown_door=args.unknown_door,
            names=names,
        )
        print(f"Exporting {output_split} from {source_split}: requested={len(records)} workers={args.workers}")
        exported_records, class_counts, unknown_count, fallback_count = export_split(
            config,
            records,
            args.workers,
            args.progress_every,
        )
        exported[output_split] = exported_records
        counts[output_split] = class_counts
        unknown_doors[output_split] = unknown_count
        polygon_fallbacks[output_split] = fallback_count

    write_data_yaml(args.output_dir, names, args.include_aihub_validation)
    write_json(
        args.output_dir / "manifest.json",
        manifest_payload(
            args=args,
            drawing_types=drawing_types,
            names=names,
            train_records=train_records,
            val_records=val_records,
            test_records=test_records,
            exported=exported,
            counts=counts,
            unknown_doors=unknown_doors,
            polygon_fallbacks=polygon_fallbacks,
        ),
    )

    print(f"Exported YOLO dataset: {args.output_dir}")
    print(f"  data.yaml: {args.output_dir / 'data.yaml'}")
    print(f"  manifest: {args.output_dir / 'manifest.json'}")
    for split in ("train", "val", "test"):
        if split not in exported:
            continue
        print(f"  {split} images: {len(exported[split])}")
        for name in names:
            print(f"    {name}: {counts[split].get(name, 0)} lines")
        if args.class_mode == "4" and args.unknown_door == "drop":
            print(f"    dropped unknown doors: {unknown_doors[split]}")
        if args.task == "seg":
            print(f"    bbox polygon fallbacks: {polygon_fallbacks[split]}")


if __name__ == "__main__":
    main()
