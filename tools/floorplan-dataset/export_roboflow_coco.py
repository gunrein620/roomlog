#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from dataset_common import (
    DEFAULT_DATASET_ROOT,
    SCRIPT_DIR,
    TRAINING,
    VALIDATION,
    SourceImageIndex,
    category_id_for_class,
    drawing_types_label,
    is_unknown_door,
    list_plan_records,
    map_annotation_class,
    parse_drawing_types,
    read_label_json,
    resize_png_with_sips,
    scaled_bbox,
    scaled_segmentation,
    seeded_subset,
    target_annotations,
    target_categories,
    write_json,
)


def build_coco_shell(class_mode: str) -> dict:
    return {
        "info": {
            "description": "Roomlog floor-plan opening detector export from AI Hub #239 TL_STR",
            "version": "1.0",
            "year": datetime.now(timezone.utc).year,
            "date_created": datetime.now(timezone.utc).isoformat(),
        },
        "licenses": [],
        "images": [],
        "annotations": [],
        "categories": target_categories(class_mode),
    }


def attribute_bucket(annotation: dict) -> str:
    target = annotation["_target_category"]
    subtype = annotation.get("_subtype")
    if not subtype:
        return "missing"
    if target == "door" and subtype in {"미닫이문", "여닫이문"}:
        return subtype
    if target == "window" and subtype in {"미닫이창", "여닫이창"}:
        return subtype
    return "other"


def print_dataset_stats(dataset_root: Path, drawing_types, sample_count: int, seed: int) -> None:
    train_records = list_plan_records(dataset_root, TRAINING, drawing_types)
    val_records = list_plan_records(dataset_root, VALIDATION, drawing_types)
    print(f"drawing_types={drawing_types_label(drawing_types)}")
    print(f"FP pool counts: Training={len(train_records)} Validation={len(val_records)}")

    sample = seeded_subset(train_records, sample_count, seed)
    coverage: dict[str, Counter] = {
        "door": Counter(),
        "window": Counter(),
        "wall": Counter(),
    }
    other_values: dict[str, Counter] = {
        "door": Counter(),
        "window": Counter(),
        "wall": Counter(),
    }
    for record in sample:
        coco = read_label_json(record.label_zip, record.label_entry)
        for annotation in target_annotations(coco):
            target = annotation["_target_category"]
            bucket = attribute_bucket(annotation)
            coverage[target][bucket] += 1
            subtype = annotation.get("_subtype")
            if subtype and bucket == "other":
                other_values[target][str(subtype)] += 1

    print(f"attribute coverage sample: split=Training plans={len(sample)} seed={seed}")
    for class_name in ("door", "window", "wall"):
        counter = coverage[class_name]
        total = sum(counter.values())
        print(f"  {class_name}: total={total}")
        for key, value in sorted(counter.items()):
            print(f"    {key}: {value}")
        if other_values[class_name]:
            print(f"    other_values: {dict(other_values[class_name])}")


def export_split(
    dataset_root: Path,
    split: str,
    output_split: str,
    records: list,
    output_dir: Path,
    max_dim: int,
    class_mode: str,
    unknown_door: str,
    starting_image_id: int = 1,
    starting_annotation_id: int = 1,
) -> tuple[int, int, list[dict], int]:
    split_dir = output_dir / output_split
    split_dir.mkdir(parents=True, exist_ok=True)
    coco_out = build_coco_shell(class_mode)
    manifest: list[dict] = []
    source_index = SourceImageIndex(dataset_root, split)
    image_id = starting_image_id
    annotation_id = starting_annotation_id
    unknown_door_count = 0
    try:
        for record in records:
            source_coco = read_label_json(record.label_zip, record.label_entry)
            annotations = target_annotations(source_coco)
            mapped_annotations = []
            for annotation in annotations:
                if is_unknown_door(annotation):
                    unknown_door_count += 1
                class_name = map_annotation_class(annotation, class_mode, unknown_door)
                if class_name is None:
                    continue
                mapped_annotations.append((annotation, class_name))
            if not mapped_annotations:
                continue
            out_name = f"{record.stem}.png"
            out_image_path = split_dir / out_name
            with tempfile.TemporaryDirectory(prefix="roomlog-export-") as tmp_name:
                tmp_dir = Path(tmp_name)
                extracted_path = tmp_dir / record.image_file_name
                source_zip, source_member = source_index.extract_to(record.image_file_name, extracted_path)
                new_width, new_height = resize_png_with_sips(extracted_path, out_image_path, max_dim)

            scale_x = new_width / record.width
            scale_y = new_height / record.height
            coco_out["images"].append(
                {
                    "id": image_id,
                    "width": new_width,
                    "height": new_height,
                    "file_name": out_name,
                }
            )
            exported_counts = {category["name"]: 0 for category in target_categories(class_mode)}
            for annotation, class_name in mapped_annotations:
                bbox = scaled_bbox(annotation["bbox"], scale_x, scale_y)
                exported_counts[class_name] += 1
                area = float(annotation.get("area", bbox[2] * bbox[3])) * scale_x * scale_y
                coco_out["annotations"].append(
                    {
                        "id": annotation_id,
                        "image_id": image_id,
                        "category_id": category_id_for_class(class_name, class_mode),
                        "bbox": [round(value, 3) for value in bbox],
                        "area": round(area, 3),
                        "segmentation": scaled_segmentation(
                            annotation.get("segmentation", []), scale_x, scale_y
                        ),
                        "iscrowd": int(annotation.get("iscrowd", 0)),
                        "attributes": {
                            "source_category": annotation["_korean_category"],
                            "source_subtype": annotation.get("_subtype"),
                            "export_class": class_name,
                        },
                    }
                )
                annotation_id += 1
            manifest.append(
                {
                    "split": split,
                    "output_split": output_split,
                    "image": out_name,
                    "source_image": record.image_file_name,
                    "source_label_zip": str(record.label_zip),
                    "source_label_entry": record.label_entry,
                    "source_image_zip": str(source_zip),
                    "source_image_entry": source_member,
                    "original_size": [record.width, record.height],
                    "export_size": [new_width, new_height],
                    "drawing_type": record.drawing_type,
                    "counts": exported_counts,
                }
            )
            image_id += 1
    finally:
        source_index.close()

    write_json(split_dir / "_annotations.coco.json", coco_out)
    return image_id, annotation_id, manifest, unknown_door_count


def manifest_path_for_output(output_dir: Path) -> Path:
    return output_dir.with_name(f"{output_dir.name}.manifest.json")


def maybe_upload(output_dir: Path, upload: bool, batch_name: str) -> None:
    if not upload:
        return
    required = {
        "ROBOFLOW_API_KEY": os.environ.get("ROBOFLOW_API_KEY"),
        "ROBOFLOW_WORKSPACE": os.environ.get("ROBOFLOW_WORKSPACE"),
        "ROBOFLOW_PROJECT": os.environ.get("ROBOFLOW_PROJECT"),
    }
    missing = [key for key, value in required.items() if not value]
    if missing:
        raise SystemExit(f"--upload requires env vars: {', '.join(missing)}")

    try:
        import roboflow
    except ImportError as exc:
        raise SystemExit(
            "Roboflow SDK is required for --upload. Install it with `pip install roboflow`."
        ) from exc

    rf = roboflow.Roboflow(api_key=required["ROBOFLOW_API_KEY"])
    workspace = rf.workspace(required["ROBOFLOW_WORKSPACE"])
    workspace.upload_dataset(
        str(output_dir),
        project_name=required["ROBOFLOW_PROJECT"],
        num_workers=8,
        project_license="Private",
        project_type="object-detection",
        batch_name=batch_name,
        num_retries=2,
    )
    print(
        "Uploaded dataset to Roboflow "
        f"workspace={required['ROBOFLOW_WORKSPACE']} project={required['ROBOFLOW_PROJECT']} "
        f"batch={batch_name}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert AI Hub TL_STR/VL_STR COCO-per-image labels to a Roboflow-ready COCO dataset."
    )
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET_ROOT)
    parser.add_argument("--output-dir", type=Path, default=SCRIPT_DIR / "export" / "roomlog-openings-coco")
    parser.add_argument("--train-count", type=int, default=1500)
    parser.add_argument("--val-count", type=int, default=300)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-dim", type=int, default=1600)
    parser.add_argument("--class-mode", choices=("3", "4"), default="3")
    parser.add_argument("--unknown-door", choices=("drop", "hinged"), default="drop")
    parser.add_argument(
        "--drawing-types",
        default="FP",
        help="Comma-separated drawing TYPE tokens from filenames, e.g. FP or FP,CS. Use ALL to disable filtering.",
    )
    parser.add_argument(
        "--report-stats",
        action="store_true",
        help="Print FP pool counts and subtype coverage sample, then exit without exporting images.",
    )
    parser.add_argument("--stats-sample-count", type=int, default=300)
    parser.add_argument("--overwrite", action="store_true", help="Replace an existing output directory.")
    parser.add_argument("--upload", action="store_true", help="Upload with Roboflow SDK; requires ROBOFLOW_* env vars.")
    parser.add_argument("--batch-name", default="aihub-239", help="Roboflow upload batch name.")
    args = parser.parse_args()
    drawing_types = parse_drawing_types(args.drawing_types)

    if args.report_stats:
        print_dataset_stats(args.dataset_root, drawing_types, args.stats_sample_count, args.seed)
        return

    if args.output_dir.exists():
        if not args.overwrite:
            raise SystemExit(f"Output directory exists; pass --overwrite to replace it: {args.output_dir}")
        shutil.rmtree(args.output_dir)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    train_records = seeded_subset(list_plan_records(args.dataset_root, TRAINING, drawing_types), args.train_count, args.seed)
    val_records = seeded_subset(list_plan_records(args.dataset_root, VALIDATION, drawing_types), args.val_count, args.seed + 1)

    next_image_id, next_annotation_id, train_manifest, train_unknown_doors = export_split(
        args.dataset_root,
        TRAINING,
        "train",
        train_records,
        args.output_dir,
        args.max_dim,
        args.class_mode,
        args.unknown_door,
    )
    _, _, val_manifest, val_unknown_doors = export_split(
        args.dataset_root,
        VALIDATION,
        "valid",
        val_records,
        args.output_dir,
        args.max_dim,
        args.class_mode,
        args.unknown_door,
        next_image_id,
        next_annotation_id,
    )

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_root": str(args.dataset_root),
        "drawing_types": drawing_types_label(drawing_types),
        "class_mode": args.class_mode,
        "unknown_door": args.unknown_door,
        "taxonomy": {"구조_벽체": "wall", "구조_출입문": "door", "구조_창호": "window"},
        "max_dim": args.max_dim,
        "seed": args.seed,
        "requested_counts": {"train": args.train_count, "valid": args.val_count},
        "exported_counts": {"train": len(train_manifest), "valid": len(val_manifest)},
        "unknown_door_annotations": {"train": train_unknown_doors, "valid": val_unknown_doors},
        "records": train_manifest + val_manifest,
    }
    manifest_path = manifest_path_for_output(args.output_dir)
    write_json(manifest_path, manifest)
    maybe_upload(args.output_dir, args.upload, args.batch_name)

    print(f"Exported Roboflow COCO dataset: {args.output_dir}")
    print(f"  drawing_types: {drawing_types_label(drawing_types)}")
    print(f"  class_mode: {args.class_mode}")
    print(f"  train images: {len(train_manifest)} -> {args.output_dir / 'train' / '_annotations.coco.json'}")
    print(f"  valid images: {len(val_manifest)} -> {args.output_dir / 'valid' / '_annotations.coco.json'}")
    print(f"  manifest: {manifest_path}")
    if args.class_mode == "4":
        action = "assigned to hinged_door" if args.unknown_door == "hinged" else "dropped"
        print(f"  warning: unknown door annotations {action}: train={train_unknown_doors} valid={val_unknown_doors}")


if __name__ == "__main__":
    main()
