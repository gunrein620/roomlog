#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import tempfile
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dataset_common import (
    DEFAULT_DATASET_ROOT,
    SCRIPT_DIR,
    VALIDATION,
    SourceImageIndex,
    bbox_iou,
    class_order,
    drawing_types_label,
    list_plan_records,
    map_annotation_class,
    normalize_model_class,
    parse_drawing_types,
    read_label_json,
    resize_png_with_sips,
    scaled_bbox,
    seeded_subset,
    target_annotations,
    write_json,
)


def gt_boxes_for_record(
    record,
    max_dim: int,
    source_index: SourceImageIndex,
    tmp_dir: Path,
    class_mode: str,
    unknown_door: str,
) -> tuple[dict, Path, tuple[int, int]]:
    coco = read_label_json(record.label_zip, record.label_entry)
    extracted = tmp_dir / record.image_file_name
    resized = tmp_dir / f"{record.stem}.png"
    source_index.extract_to(record.image_file_name, extracted)
    new_width, new_height = resize_png_with_sips(extracted, resized, max_dim)
    scale_x = new_width / record.width
    scale_y = new_height / record.height
    boxes = defaultdict(list)
    for annotation in target_annotations(coco):
        class_name = map_annotation_class(annotation, class_mode, unknown_door)
        if class_name is None:
            continue
        boxes[class_name].append(scaled_bbox(annotation["bbox"], scale_x, scale_y))
    return boxes, resized, (new_width, new_height)


def infer_roboflow(
    image_path: Path,
    model_id: str,
    api_key: str,
    api_url: str,
    confidence: int,
    overlap: int,
    timeout: int,
    classes: tuple[str, ...],
) -> list[dict]:
    params = {
        "api_key": api_key,
        "confidence": str(confidence),
        "overlap": str(overlap),
        "format": "json",
        "classes": ",".join(classes),
    }
    url = f"{api_url.rstrip('/')}/{model_id}?{urllib.parse.urlencode(params)}"
    body = base64.b64encode(image_path.read_bytes())
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    predictions = payload.get("predictions", payload if isinstance(payload, list) else [])
    parsed: list[dict] = []
    for prediction in predictions:
        class_name = normalize_model_class(prediction.get("class", ""))
        if class_name is None or class_name not in classes:
            continue
        width = float(prediction.get("width", 0.0))
        height = float(prediction.get("height", 0.0))
        center_x = float(prediction.get("x", 0.0))
        center_y = float(prediction.get("y", 0.0))
        if width <= 0 or height <= 0:
            continue
        parsed.append(
            {
                "class": class_name,
                "confidence": float(prediction.get("confidence", 0.0)),
                "bbox": [center_x - width / 2.0, center_y - height / 2.0, width, height],
                "raw": prediction,
            }
        )
    return parsed


def update_metrics(
    metrics: dict,
    gt_by_class: dict,
    predictions: list[dict],
    iou_threshold: float,
    classes: tuple[str, ...],
) -> None:
    pred_by_class = defaultdict(list)
    for prediction in predictions:
        pred_by_class[prediction["class"]].append(prediction)

    for class_name in classes:
        gt_boxes = list(gt_by_class.get(class_name, []))
        matched_gt: set[int] = set()
        class_predictions = sorted(
            pred_by_class.get(class_name, []), key=lambda item: item["confidence"], reverse=True
        )
        for prediction in class_predictions:
            best_index = None
            best_iou = 0.0
            for index, gt_box in enumerate(gt_boxes):
                if index in matched_gt:
                    continue
                iou = bbox_iou(prediction["bbox"], gt_box)
                if iou > best_iou:
                    best_iou = iou
                    best_index = index
            if best_index is not None and best_iou >= iou_threshold:
                metrics[class_name]["tp"] += 1
                matched_gt.add(best_index)
            else:
                metrics[class_name]["fp"] += 1
        metrics[class_name]["fn"] += len(gt_boxes) - len(matched_gt)


def finalize_metrics(metrics: dict, classes: tuple[str, ...]) -> dict:
    finalized = {}
    totals = {"tp": 0, "fp": 0, "fn": 0}
    for class_name in classes:
        tp = int(metrics[class_name]["tp"])
        fp = int(metrics[class_name]["fp"])
        fn = int(metrics[class_name]["fn"])
        totals["tp"] += tp
        totals["fp"] += fp
        totals["fn"] += fn
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        finalized[class_name] = {
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision": round(precision, 6),
            "recall": round(recall, 6),
            "f1": round(f1, 6),
        }
    precision = totals["tp"] / (totals["tp"] + totals["fp"]) if totals["tp"] + totals["fp"] else 0.0
    recall = totals["tp"] / (totals["tp"] + totals["fn"]) if totals["tp"] + totals["fn"] else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    finalized["overall_micro"] = {
        **totals,
        "precision": round(precision, 6),
        "recall": round(recall, 6),
        "f1": round(f1, 6),
    }
    return finalized


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate a Roboflow floor-plan detector against AI Hub VL_STR validation labels."
    )
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET_ROOT)
    parser.add_argument("--output-dir", type=Path, default=SCRIPT_DIR / "eval")
    parser.add_argument("--model", default=os.environ.get("ROBOFLOW_FLOOR_PLAN_MODEL"))
    parser.add_argument("--api-key", default=os.environ.get("ROBOFLOW_API_KEY"))
    parser.add_argument("--api-url", default=os.environ.get("ROBOFLOW_API_URL", "https://detect.roboflow.com"))
    parser.add_argument("--limit", type=int, default=0, help="0 means the full validation split.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-dim", type=int, default=1600)
    parser.add_argument("--class-mode", choices=("3", "4"), default="3")
    parser.add_argument("--unknown-door", choices=("drop", "hinged"), default="drop")
    parser.add_argument(
        "--drawing-types",
        default="FP",
        help="Comma-separated drawing TYPE tokens from filenames, e.g. FP or FP,CS. Use ALL to disable filtering.",
    )
    parser.add_argument("--confidence", type=int, default=40)
    parser.add_argument("--overlap", type=int, default=30)
    parser.add_argument("--iou-threshold", type=float, default=0.5)
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--sleep", type=float, default=0.0, help="Optional delay between Roboflow requests.")
    parser.add_argument("--dry-run", action="store_true", help="Stream/resize/scale GT only; skip Roboflow calls.")
    args = parser.parse_args()
    drawing_types = parse_drawing_types(args.drawing_types)
    classes = class_order(args.class_mode)

    records = list_plan_records(args.dataset_root, VALIDATION, drawing_types)
    selected = seeded_subset(records, args.limit, args.seed) if args.limit else sorted(records, key=lambda r: r.image_file_name)

    if not args.dry_run and (not args.model or not args.api_key):
        raise SystemExit("Set ROBOFLOW_FLOOR_PLAN_MODEL and ROBOFLOW_API_KEY, or pass --dry-run.")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report_path = args.output_dir / (f"dry_run_{timestamp}.json" if args.dry_run else f"metrics_{timestamp}.json")
    metrics = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})
    image_reports: list[dict] = []
    source_index = SourceImageIndex(args.dataset_root, VALIDATION)
    try:
        for index, record in enumerate(selected, start=1):
            with tempfile.TemporaryDirectory(prefix="roomlog-eval-") as tmp_name:
                gt_by_class, image_path, resized_size = gt_boxes_for_record(
                    record,
                    args.max_dim,
                    source_index,
                    Path(tmp_name),
                    args.class_mode,
                    args.unknown_door,
                )
                gt_counts = {class_name: len(gt_by_class.get(class_name, [])) for class_name in classes}
                if args.dry_run:
                    predictions = []
                else:
                    predictions = infer_roboflow(
                        image_path,
                        args.model or "",
                        args.api_key or "",
                        args.api_url,
                        args.confidence,
                        args.overlap,
                        args.timeout,
                        classes,
                    )
                    update_metrics(metrics, gt_by_class, predictions, args.iou_threshold, classes)
                    if args.sleep > 0 and index < len(selected):
                        time.sleep(args.sleep)
                image_reports.append(
                    {
                        "image": record.image_file_name,
                        "drawing_type": record.drawing_type,
                        "resized_size": resized_size,
                        "ground_truth": gt_counts,
                        "prediction_count": len(predictions),
                    }
                )
                print(
                    f"[{index}/{len(selected)}] {record.image_file_name} "
                    f"type={record.drawing_type} gt={gt_counts} predictions={len(predictions)}"
                )
    finally:
        source_index.close()

    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "model": args.model,
        "api_url": args.api_url,
        "dataset_root": str(args.dataset_root),
        "drawing_types": drawing_types_label(drawing_types),
        "class_mode": args.class_mode,
        "unknown_door": args.unknown_door,
        "validation_images": len(selected),
        "max_dim": args.max_dim,
        "confidence": args.confidence,
        "overlap": args.overlap,
        "iou_threshold": args.iou_threshold,
        "images": image_reports,
    }
    if not args.dry_run:
        report["metrics"] = finalize_metrics(metrics, classes)
    write_json(report_path, report)

    print(f"Report: {report_path}")
    if not args.dry_run:
        print("class,tp,fp,fn,precision,recall,f1")
        for class_name, values in report["metrics"].items():
            print(
                f"{class_name},{values['tp']},{values['fp']},{values['fn']},"
                f"{values['precision']},{values['recall']},{values['f1']}"
            )


if __name__ == "__main__":
    main()
