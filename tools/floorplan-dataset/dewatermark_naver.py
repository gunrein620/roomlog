#!/usr/bin/env python3
"""네이버 부동산 평면도의 'NHN BUSINESS PLATFORM' 반투명 워터마크 제거기.

네이버 구형 이미지 서버가 923x676 평면도 중앙에 항상 같은 위치·같은 모양으로
반투명 워터마크를 합성해 둔다. 반투명이라 밑의 내용(방 라벨·설비 아이콘)이
비쳐 보이므로, 단순 inpaint(지우고 메꾸기)보다 오버레이를 역산해 걷어내는
쪽이 원본 내용을 살린다. 그 뒤 남는 옅은 잔상만 얇게 inpaint로 마무리한다.

파이프라인:
  1. calibrate : 데이터셋 전체의 픽셀별 median으로 고정 워터마크를 드러내고
                 불투명도 맵(alpha) + 워터마크 색(C) + 글자 마스크를 추정 → 모델 저장
  2. apply     : I' = (I - g*alpha*C) / (1 - g*alpha)   (반투명 역산)
                 이어서 글자 마스크에 반경 2 Telea inpaint로 잔상 제거

모델(alpha/C/mask)은 923x676 네이버 평면도라면 위치가 고정이라 재사용 가능.
추후 크롤로 이미지가 늘어도 --calibrate 다시 돌릴 필요 없음(원하면 갱신).

사용(opencv 필요 — 전용 venv):
  VENV=tools/floorplan-dataset/.venv-dewm/bin/python
  $VENV tools/floorplan-dataset/dewatermark_naver.py --calibrate   # 모델 (재)생성
  $VENV tools/floorplan-dataset/dewatermark_naver.py               # 전체 적용
  $VENV tools/floorplan-dataset/dewatermark_naver.py --preview 5   # 5장 비교본만

기본 입력 : .run/floorplan-datasets/naver/images
기본 출력 : .run/floorplan-datasets/naver/images_clean   (원본은 보존)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

WM_SIZE = (676, 923)  # (h, w) — 워터마크 모델이 유효한 해상도
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = ROOT / ".run/floorplan-datasets/naver/images"
DEFAULT_DST = ROOT / ".run/floorplan-datasets/naver/images_clean"
MODEL_PATH = Path(__file__).resolve().parent / "naver_watermark_model.npz"


def load_images(src: Path) -> list[Path]:
    return sorted(p for p in src.iterdir()
                  if p.suffix.lower() in {".jpg", ".jpeg", ".png"})


def calibrate(src: Path, model_path: Path, gain: float) -> None:
    """데이터셋 median으로 워터마크 모델(alpha, color, mask) 추정 후 저장."""
    files = load_images(src)
    stack = []
    for f in files:
        im = cv2.imread(str(f))
        if im is not None and im.shape[:2] == WM_SIZE:
            stack.append(im)
    if len(stack) < 20:
        sys.exit(f"보정에는 {WM_SIZE} 이미지가 최소 20장 필요합니다 (현재 {len(stack)}장)")
    med = np.median(np.stack(stack).astype(np.float32), axis=0)

    # 워터마크 글자 = 배경보다 밝은 고주파 성분
    g = cv2.cvtColor(med.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    bg = cv2.cvtColor(cv2.medianBlur(med.astype(np.uint8), 31),
                      cv2.COLOR_BGR2GRAY).astype(np.float32)
    resp = np.clip(g - bg, 0, None)
    resp = (resp / (resp.max() + 1e-6) * 255).astype(np.uint8)

    mask = (resp > 24).astype(np.uint8) * 255
    band = np.zeros_like(mask)
    band[298:388, 322:608] = 255           # 중앙 워터마크 영역만
    mask = cv2.bitwise_and(mask, band)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    clean = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= 12:   # 잡티 제거
            clean[lab == i] = 255
    mask = cv2.dilate(clean, np.ones((3, 3), np.uint8), iterations=1)

    # 반투명 모델: med = (1-a)*B + a*C. 배경 B는 median을 inpaint 해서 추정.
    B = cv2.inpaint(med.astype(np.uint8),
                    cv2.dilate(mask, np.ones((5, 5), np.uint8)),
                    5, cv2.INPAINT_TELEA).astype(np.float32)
    diff = med - B
    strong = cv2.cvtColor(np.clip(diff, 0, 255).astype(np.uint8),
                          cv2.COLOR_BGR2GRAY) > 12
    # 채널 일관성이 가장 좋은 워터마크 색 C 선택
    best_c, best_var = 255, None
    for c in range(160, 256, 5):
        C = np.array([c, c, c], np.float32)
        denom = np.where(np.abs(C - B) < 1e-3, 1e-3, C - B)
        a = diff / denom
        var = float(np.mean(np.var(a[strong], axis=1)))
        if best_var is None or var < best_var:
            best_var, best_c = var, c
    C = np.array([best_c, best_c, best_c], np.float32)
    denom = np.where(np.abs(C - B) < 1e-3, 1e-3, C - B)
    alpha = np.clip(np.mean(diff / denom, axis=2), 0, 0.7)
    alpha *= (mask > 0)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)

    np.savez(model_path, alpha=alpha, color=C, mask=mask, gain=np.float32(gain))
    print(f"모델 저장: {model_path}")
    print(f"  워터마크 색 C=({best_c},{best_c},{best_c}), "
          f"alpha max {alpha.max():.3f} / 평균(마스크내) {alpha[mask>0].mean():.3f}, gain {gain}")


def dewatermark(im: np.ndarray, alpha, color, mask, gain: float) -> np.ndarray:
    a = np.clip(alpha * gain, 0, 0.85)[..., None]
    j = np.clip((im.astype(np.float32) - a * color) / np.clip(1 - a, 1e-3, 1),
                0, 255).astype(np.uint8)
    return cv2.inpaint(j, mask, 2, cv2.INPAINT_TELEA)   # 잔상 마무리


def apply_all(src: Path, dst: Path, model_path: Path,
              preview: int, gain_override: float | None) -> None:
    if not model_path.exists():
        sys.exit("모델이 없습니다. 먼저 --calibrate 를 실행하세요.")
    m = np.load(model_path)
    alpha, color, mask = m["alpha"], m["color"], m["mask"]
    gain = gain_override if gain_override is not None else float(m["gain"])

    dst.mkdir(parents=True, exist_ok=True)
    files = load_images(src)
    processed = skipped = 0
    for f in files:
        im = cv2.imread(str(f))
        if im is None:
            continue
        if im.shape[:2] != WM_SIZE:      # 모델 위치가 안 맞으면 원본 복사
            cv2.imwrite(str(dst / f.name), im)
            skipped += 1
            continue
        out = dewatermark(im, alpha, color, mask, gain)
        if preview:
            band = np.full((6, im.shape[1], 3), 255, np.uint8)
            out = np.vstack([im, band, out])   # 원본/처리본 상하 비교
        cv2.imwrite(str(dst / f.name), out,
                    [cv2.IMWRITE_JPEG_QUALITY, 95] if f.suffix.lower() != ".png" else [])
        processed += 1
        if preview and processed >= preview:
            break
    print(f"완료: {processed}장 처리"
          + (f", {skipped}장 원본복사(크기 불일치)" if skipped else "")
          + f" -> {dst}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    ap.add_argument("--dst", type=Path, default=DEFAULT_DST)
    ap.add_argument("--model", type=Path, default=MODEL_PATH)
    ap.add_argument("--calibrate", action="store_true", help="워터마크 모델 (재)생성")
    ap.add_argument("--gain", type=float, default=None,
                    help="불투명도 게인(기본 1.35, 모델에 저장됨)")
    ap.add_argument("--preview", type=int, default=0,
                    help="N장만 원본/처리본 상하 비교 이미지로 출력")
    args = ap.parse_args()

    if args.calibrate:
        calibrate(args.src, args.model, args.gain if args.gain is not None else 1.35)
        return 0
    apply_all(args.src, args.dst, args.model, args.preview, args.gain)
    return 0


if __name__ == "__main__":
    sys.exit(main())
