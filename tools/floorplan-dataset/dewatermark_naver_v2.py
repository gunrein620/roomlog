#!/usr/bin/env python3
"""Per-image Naver floorplan watermark removal by inverse alpha compositing.

This script preserves the source images directory and writes a fresh training
partition:
  - included cleaned images: .run/floorplan-datasets/naver/images_clean
  - excluded originals:     .run/floorplan-datasets/naver/images_excluded
  - comparison samples:     tools/floorplan-dataset/samples_v2
"""

from __future__ import annotations

import argparse
import json
import shutil
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}
BASE_W = 923
BASE_H = 676
BAND_X0 = 225 / BASE_W
BAND_X1 = 700 / BASE_W
BAND_Y0 = 230 / BASE_H
BAND_Y1 = 445 / BASE_H

ROOT = Path(__file__).resolve().parents[2]
TOOL_DIR = Path(__file__).resolve().parent
DEFAULT_DATASET = ROOT / ".run/floorplan-datasets/naver"
DEFAULT_SRC = DEFAULT_DATASET / "images"
DEFAULT_DST = DEFAULT_DATASET / "images_clean"
DEFAULT_EXCLUDED = DEFAULT_DATASET / "images_excluded"
DEFAULT_SAMPLES = TOOL_DIR / "samples_v2"
DEFAULT_STATS = DEFAULT_SAMPLES / "dewatermark_v2_stats.jsonl"
DEFAULT_REPORT = DEFAULT_SAMPLES / "REPORT.md"


@dataclass
class ProcessedImage:
    file: str
    width: int
    height: int
    variant: str
    excluded: bool
    structural_overlap_ratio: float
    watermark_pixels: int
    alpha_pixels: int
    alpha_mean: float
    alpha_max: float
    response_before: float
    response_after: float
    response_reduction_ratio: float
    structural_pixels: int
    structural_pixel_retention_ratio: float
    structural_pixel_max_absdiff: int
    dark_alpha_mean: float
    output_path: str


@dataclass
class Detection:
    alpha: np.ndarray
    watermark_mask: np.ndarray
    structural_mask: np.ndarray
    structural_overlap_ratio: float
    variant: str


def image_files(src: Path) -> list[Path]:
    return sorted(p for p in src.iterdir() if p.suffix.lower() in IMAGE_EXTS)


def clean_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for child in path.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def assert_safe_outputs(src: Path, outputs: list[Path]) -> None:
    src_resolved = src.resolve()
    for out in outputs:
        if out.resolve() == src_resolved:
            sys.exit(f"Refusing to use source directory as output: {out}")


def band_rect(height: int, width: int) -> tuple[int, int, int, int]:
    x0 = max(0, min(width - 1, int(round(width * BAND_X0))))
    x1 = max(x0 + 1, min(width, int(round(width * BAND_X1))))
    y0 = max(0, min(height - 1, int(round(height * BAND_Y0))))
    y1 = max(y0 + 1, min(height, int(round(height * BAND_Y1))))
    return x0, y0, x1, y1


def median_kernel(height: int, width: int) -> int:
    k = max(41, int(round(min(height, width) * 0.09)))
    if k % 2 == 0:
        k += 1
    return min(k, 91)


def structural_line_mask(gray: np.ndarray) -> np.ndarray:
    dark = (gray < 85).astype(np.uint8) * 255
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(dark, 8)
    out = np.zeros_like(dark, dtype=bool)
    for idx in range(1, count):
        x, y, w, h, area = stats[idx]
        long_or_tall = w >= 25 or h >= 25
        very_long = w >= 45 or h >= 45
        if (area >= 120 and long_or_tall) or (area >= 55 and very_long):
            out[labels == idx] = True
    return out


def classify_variant(mask: np.ndarray, boxes: list[tuple[int, int, int, int, int, float]]) -> str:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return "flat_or_low_contrast"
    width = int(xs.max() - xs.min() + 1)
    height = int(ys.max() - ys.min() + 1)
    pixels = int(mask.sum())
    if height > 72 and width > 180:
        return "NHN_BUSINESS_PLATFORM"
    if width > 210:
        return "NAVER_FINANCIAL"
    if width < 125 and pixels >= 180:
        return "NBP"
    return "NAVER"


def detect_watermark(im: np.ndarray) -> Detection:
    height, width = im.shape[:2]
    x0, y0, x1, y1 = band_rect(height, width)
    bg = cv2.medianBlur(im, median_kernel(height, width))

    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    bg_hsv = cv2.cvtColor(bg, cv2.COLOR_BGR2HSV)
    v = hsv[:, :, 2].astype(np.float32)
    bg_v = bg_hsv[:, :, 2].astype(np.float32)
    s = hsv[:, :, 1].astype(np.float32)
    bg_s = bg_hsv[:, :, 1].astype(np.float32)

    im_f = im.astype(np.float32)
    bg_f = bg.astype(np.float32)
    overlay_delta = 255.0 - bg_f
    alpha_raw = np.sum((im_f - bg_f) * overlay_delta, axis=2) / np.maximum(
        np.sum(overlay_delta * overlay_delta, axis=2), 18.0 * 18.0 * 3.0
    )
    alpha_raw = np.clip(alpha_raw, 0.0, 0.62)

    white = np.array([255, 255, 255], np.float32)
    dist_to_white = np.sqrt(np.sum((white - im_f) ** 2, axis=2))
    bg_dist_to_white = np.sqrt(np.sum((white - bg_f) ** 2, axis=2))
    white_gain = bg_dist_to_white - dist_to_white
    lift = v - bg_v
    sat_drop = bg_s - s

    band = np.zeros((height, width), dtype=bool)
    band[y0:y1, x0:x1] = True
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    structural = structural_line_mask(gray)
    near_structure = cv2.dilate(
        structural.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=1
    ) > 0

    candidate = (
        band
        & (gray > 105)
        & (lift > 4.0)
        & (white_gain > 16.0)
        & (alpha_raw > 0.018)
        & (s < 90.0)
        & (sat_drop > 4.0)
        & ((bg_s > 30.0) | (bg_dist_to_white > 60.0))
    )

    candidate_u8 = candidate.astype(np.uint8) * 255
    words = cv2.dilate(candidate_u8, np.ones((3, 11), np.uint8), iterations=1)
    words = cv2.morphologyEx(words, cv2.MORPH_CLOSE, np.ones((3, 7), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(words, 8)

    selected = np.zeros_like(candidate_u8)
    box_support = np.zeros_like(candidate, dtype=bool)
    boxes: list[tuple[int, int, int, int, int, float]] = []
    for idx in range(1, count):
        x, y, w, h, _area = stats[idx]
        if not (12 <= w <= 330 and 3 <= h <= 55 and (w / max(h, 1)) >= 1.35):
            continue
        original_pixels = (labels == idx) & (candidate_u8 > 0)
        pixel_count = int(original_pixels.sum())
        if pixel_count < 8:
            continue
        if pixel_count / float(w * h) < 0.007:
            continue
        near_ratio = float((original_pixels & near_structure).sum()) / float(pixel_count)
        if near_ratio > 0.65 and w < 90:
            continue
        selected[original_pixels] = 255
        boxes.append((int(x), int(y), int(w), int(h), pixel_count, near_ratio))
        pad = 3
        ys = slice(max(0, y - pad), min(height, y + h + pad))
        xs = slice(max(0, x - pad), min(width, x + w + pad))
        box_support[ys, xs] |= (
            band[ys, xs]
            & (gray[ys, xs] > 100)
            & (alpha_raw[ys, xs] > 0.008)
            & (white_gain[ys, xs] > 10.0)
            & (s[ys, xs] < 105.0)
            & ((sat_drop[ys, xs] > 1.5) | (bg_s[ys, xs] > 40.0))
        )

    support = (cv2.dilate(selected, np.ones((3, 3), np.uint8), iterations=1) > 0) | box_support
    support &= band & (alpha_raw > 0.008) & (gray > 100)
    alpha = alpha_raw * support
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.6)
    alpha[(gray < 100) | (~band)] = 0.0

    watermark_mask = cv2.dilate(
        (selected > 0).astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1
    ) > 0
    if watermark_mask.any():
        overlap = float((structural & watermark_mask).sum()) / float(watermark_mask.sum())
    else:
        overlap = 0.0

    return Detection(
        alpha=alpha.astype(np.float32),
        watermark_mask=watermark_mask,
        structural_mask=structural,
        structural_overlap_ratio=overlap,
        variant=classify_variant(selected > 0, boxes),
    )


def inverse_composite(im: np.ndarray, alpha: np.ndarray, gain: float, max_alpha: float) -> np.ndarray:
    a = np.clip(alpha * gain, 0.0, max_alpha)[..., None]
    restored = (im.astype(np.float32) - a * 255.0) / np.clip(1.0 - a, 1e-3, 1.0)
    out = np.clip(restored, 0, 255).astype(np.uint8)
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    out[gray < 95] = im[gray < 95]
    return out


def response_metric(im: np.ndarray, mask: np.ndarray) -> float:
    if not mask.any():
        return 0.0
    height, width = im.shape[:2]
    bg = cv2.medianBlur(im, median_kernel(height, width))
    im_f = im.astype(np.float32)
    bg_f = bg.astype(np.float32)
    overlay_delta = 255.0 - bg_f
    response = np.sum((im_f - bg_f) * overlay_delta, axis=2) / np.maximum(
        np.sum(overlay_delta * overlay_delta, axis=2), 18.0 * 18.0 * 3.0
    )
    response = np.clip(response, 0.0, None)
    return float(response[mask].mean())


def write_image(path: Path, im: np.ndarray) -> None:
    params: list[int] = []
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        params = [cv2.IMWRITE_JPEG_QUALITY, 100, cv2.IMWRITE_JPEG_OPTIMIZE, 1]
    elif path.suffix.lower() == ".png":
        params = [cv2.IMWRITE_PNG_COMPRESSION, 3]
    if not cv2.imwrite(str(path), im, params):
        raise OSError(f"Could not write image: {path}")


def compare_sample(original: np.ndarray, cleaned: np.ndarray, title: str) -> np.ndarray:
    height = max(original.shape[0], cleaned.shape[0])
    width = original.shape[1] + cleaned.shape[1] + 12
    canvas = np.full((height + 34, width, 3), 255, dtype=np.uint8)
    canvas[34 : 34 + original.shape[0], : original.shape[1]] = original
    x = original.shape[1] + 12
    canvas[34 : 34 + cleaned.shape[0], x : x + cleaned.shape[1]] = cleaned
    cv2.putText(canvas, "before", (10, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.putText(canvas, "after", (x + 10, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 0), 1, cv2.LINE_AA)
    cv2.putText(canvas, title[:90], (170, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 180), 1, cv2.LINE_AA)
    return canvas


def pick_samples(records: list[ProcessedImage], sample_count: int) -> list[ProcessedImage]:
    chosen: list[ProcessedImage] = []
    seen: set[str] = set()

    def add(items: list[ProcessedImage], limit: int = 1) -> None:
        added = 0
        for rec in items:
            if rec.file in seen:
                continue
            chosen.append(rec)
            seen.add(rec.file)
            added += 1
            if added >= limit:
                return

    for variant in ["NHN_BUSINESS_PLATFORM", "NAVER", "NAVER_FINANCIAL", "NBP"]:
        group = [r for r in records if r.variant == variant]
        group.sort(key=lambda r: (r.response_reduction_ratio, r.watermark_pixels), reverse=True)
        add(group, 2)

    flat = [
        r for r in records
        if not r.excluded and r.structural_overlap_ratio < 0.02 and r.watermark_pixels > 120
    ]
    flat.sort(key=lambda r: (r.response_reduction_ratio, r.watermark_pixels), reverse=True)
    add(flat, 3)

    overlap = [r for r in records if r.excluded]
    overlap.sort(key=lambda r: r.structural_overlap_ratio, reverse=True)
    add(overlap, 4)

    remaining = sorted(
        records,
        key=lambda r: (r.excluded, r.response_reduction_ratio, r.watermark_pixels),
        reverse=True,
    )
    add(remaining, max(0, sample_count - len(chosen)))
    return chosen[:sample_count]


def json_ready(rec: ProcessedImage) -> dict[str, Any]:
    return {
        "file": rec.file,
        "width": rec.width,
        "height": rec.height,
        "variant": rec.variant,
        "excluded": rec.excluded,
        "structural_overlap_ratio": rec.structural_overlap_ratio,
        "watermark_pixels": rec.watermark_pixels,
        "alpha_pixels": rec.alpha_pixels,
        "alpha_mean": rec.alpha_mean,
        "alpha_max": rec.alpha_max,
        "response_before": rec.response_before,
        "response_after": rec.response_after,
        "response_reduction_ratio": rec.response_reduction_ratio,
        "structural_pixels": rec.structural_pixels,
        "structural_pixel_retention_ratio": rec.structural_pixel_retention_ratio,
        "structural_pixel_max_absdiff": rec.structural_pixel_max_absdiff,
        "dark_alpha_mean": rec.dark_alpha_mean,
        "output_path": rec.output_path,
    }


def manifest_summary(dataset_root: Path) -> dict[str, int]:
    manifest = dataset_root / "manifest.jsonl"
    if not manifest.exists():
        return {"entries": 0, "unique_image_urls": 0, "duplicate_image_urls": 0}
    entries = 0
    urls: list[str] = []
    for line in manifest.read_text().splitlines():
        if not line.strip():
            continue
        entries += 1
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        url = rec.get("imageUrl")
        if isinstance(url, str) and url:
            urls.append(url)
    unique = len(set(urls))
    return {
        "entries": entries,
        "unique_image_urls": unique,
        "duplicate_image_urls": max(0, len(urls) - unique),
    }


def write_report(
    records: list[ProcessedImage],
    src: Path,
    dst: Path,
    excluded: Path,
    samples: Path,
    stats: Path,
    report: Path,
    threshold: float,
    dataset_root: Path,
) -> None:
    total = len(records)
    excluded_count = sum(1 for r in records if r.excluded)
    included_count = total - excluded_count
    by_variant: dict[str, int] = {}
    for rec in records:
        by_variant[rec.variant] = by_variant.get(rec.variant, 0) + 1

    reductions = [r.response_reduction_ratio for r in records if r.watermark_pixels > 0]
    retention = [r.structural_pixel_retention_ratio for r in records if r.structural_pixels > 0]
    dark_alpha = [r.dark_alpha_mean for r in records if r.structural_pixels > 0]
    manifest = manifest_summary(dataset_root)

    def pct(value: float) -> str:
        return f"{value * 100:.2f}%"

    lines = [
        "# Naver Floorplan Dewatermark v2 Report",
        "",
        f"- Source originals: `{src.resolve()}`",
        f"- Clean included output: `{dst.resolve()}`",
        f"- Excluded output: `{excluded.resolve()}`",
        f"- Samples: `{samples.resolve()}`",
        f"- Stats JSONL: `{stats.resolve()}`",
        f"- Exclusion threshold: structural overlap > {pct(threshold)}",
        "",
        "## Counts",
        "",
        f"- Total source images: {total}",
        f"- Included clean images: {included_count}",
        f"- Excluded images: {excluded_count}",
        f"- Manifest entries: {manifest['entries']}",
        f"- Unique manifest image URLs: {manifest['unique_image_urls']}",
        f"- Duplicate manifest image URLs: {manifest['duplicate_image_urls']}",
        "",
        "## Estimated Variant Counts",
        "",
    ]
    for variant in sorted(by_variant):
        lines.append(f"- {variant}: {by_variant[variant]}")

    lines.extend([
        "",
        "## Verification Metrics",
        "",
        f"- Mean watermark response reduction: {pct(statistics.fmean(reductions) if reductions else 0.0)}",
        f"- Median watermark response reduction: {pct(statistics.median(reductions) if reductions else 0.0)}",
        f"- Mean structural-pixel retention: {pct(statistics.fmean(retention) if retention else 1.0)}",
        f"- Minimum structural-pixel retention: {pct(min(retention) if retention else 1.0)}",
        f"- Mean alpha on structural pixels: {statistics.fmean(dark_alpha) if dark_alpha else 0.0:.6f}",
        "",
        "## Notes",
        "",
        "- Detection is per image and does not use a global watermark model.",
        "- Removal is inverse compositing with a near-white overlay color and semi-transparent alpha.",
        "- Pixels classified as dark structure are restored from the source image before writing output.",
        "- Source originals are kept unchanged; excluded files are partitioned into the excluded output directory.",
    ])
    report.write_text("\n".join(lines) + "\n")


def process(args: argparse.Namespace) -> int:
    src = args.src
    dst = args.dst
    excluded_dir = args.excluded
    samples_dir = args.samples
    stats_path = args.stats
    report_path = args.report
    dataset_root = src.parent

    if not src.exists():
        sys.exit(f"Source directory does not exist: {src}")
    assert_safe_outputs(src, [dst, excluded_dir, samples_dir])
    clean_dir(dst)
    clean_dir(excluded_dir)
    clean_dir(samples_dir)

    files = image_files(src)
    records: list[ProcessedImage] = []
    cleaned_cache: dict[str, np.ndarray] = {}

    with stats_path.open("w") as stats_file:
        for idx, path in enumerate(files, 1):
            im = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if im is None:
                print(f"[{idx}/{len(files)}] unreadable: {path.name}", file=sys.stderr)
                continue

            detection = detect_watermark(im)
            cleaned = inverse_composite(im, detection.alpha, args.gain, args.max_alpha)
            excluded = detection.structural_overlap_ratio > args.overlap_threshold

            if excluded:
                output_path = excluded_dir / path.name
                shutil.copy2(path, output_path)
            else:
                output_path = dst / path.name
                write_image(output_path, cleaned)

            response_before = response_metric(im, detection.watermark_mask)
            response_after = response_metric(cleaned, detection.watermark_mask)
            if response_before > 1e-8:
                reduction = max(-1.0, min(1.0, (response_before - response_after) / response_before))
            else:
                reduction = 0.0

            absdiff = np.max(np.abs(cleaned.astype(np.int16) - im.astype(np.int16)), axis=2)
            structural_pixels = int(detection.structural_mask.sum())
            if structural_pixels:
                retention = float((absdiff[detection.structural_mask] <= 1).sum()) / float(structural_pixels)
                max_absdiff = int(absdiff[detection.structural_mask].max())
                dark_alpha = float(detection.alpha[detection.structural_mask].mean())
            else:
                retention = 1.0
                max_absdiff = 0
                dark_alpha = 0.0

            alpha_pixels = int((detection.alpha > 0.005).sum())
            alpha_nonzero = detection.alpha[detection.alpha > 0.005]
            rec = ProcessedImage(
                file=path.name,
                width=int(im.shape[1]),
                height=int(im.shape[0]),
                variant=detection.variant,
                excluded=excluded,
                structural_overlap_ratio=detection.structural_overlap_ratio,
                watermark_pixels=int(detection.watermark_mask.sum()),
                alpha_pixels=alpha_pixels,
                alpha_mean=float(alpha_nonzero.mean()) if len(alpha_nonzero) else 0.0,
                alpha_max=float(alpha_nonzero.max()) if len(alpha_nonzero) else 0.0,
                response_before=response_before,
                response_after=response_after,
                response_reduction_ratio=reduction,
                structural_pixels=structural_pixels,
                structural_pixel_retention_ratio=retention,
                structural_pixel_max_absdiff=max_absdiff,
                dark_alpha_mean=dark_alpha,
                output_path=str(output_path.resolve()),
            )
            records.append(rec)
            cleaned_cache[path.name] = cleaned
            stats_file.write(json.dumps(json_ready(rec), ensure_ascii=False) + "\n")

            if idx % 25 == 0 or idx == len(files):
                print(f"[{idx}/{len(files)}] processed")

    sample_records = pick_samples(records, args.sample_count)
    for i, rec in enumerate(sample_records, 1):
        original_path = src / rec.file
        original = cv2.imread(str(original_path), cv2.IMREAD_COLOR)
        cleaned = cleaned_cache.get(rec.file)
        if original is None or cleaned is None:
            continue
        sample_name = (
            f"sample_{i:02d}_{rec.variant}_{'excluded' if rec.excluded else 'included'}_"
            f"{Path(rec.file).stem}.jpg"
        )
        title = (
            f"{rec.variant} | {'excluded' if rec.excluded else 'included'} | "
            f"overlap {rec.structural_overlap_ratio * 100:.1f}%"
        )
        write_image(samples_dir / sample_name, compare_sample(original, cleaned, title))

    write_report(
        records,
        src,
        dst,
        excluded_dir,
        samples_dir,
        stats_path,
        report_path,
        args.overlap_threshold,
        dataset_root,
    )
    print(f"done: total={len(records)} included={sum(not r.excluded for r in records)} excluded={sum(r.excluded for r in records)}")
    print(f"clean: {dst.resolve()}")
    print(f"excluded: {excluded_dir.resolve()}")
    print(f"samples/report: {samples_dir.resolve()}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC)
    parser.add_argument("--dst", type=Path, default=DEFAULT_DST)
    parser.add_argument("--excluded", type=Path, default=DEFAULT_EXCLUDED)
    parser.add_argument("--samples", type=Path, default=DEFAULT_SAMPLES)
    parser.add_argument("--stats", type=Path, default=DEFAULT_STATS)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--overlap-threshold", type=float, default=0.06)
    parser.add_argument("--gain", type=float, default=1.02)
    parser.add_argument("--max-alpha", type=float, default=0.65)
    parser.add_argument("--sample-count", type=int, default=16)
    args = parser.parse_args()
    return process(args)


if __name__ == "__main__":
    sys.exit(main())
