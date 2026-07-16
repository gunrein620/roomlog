#!/usr/bin/env bash
# Record3D(ARKit+LiDAR) → splat 재구성 파이프라인 — COLMAP 없는 경로 (W1)
#
#   Record3D export(EXR깊이+JPG+포즈) → ns-process-data record3d(포즈 직수입, SfM 생략)
#     → gsplat 학습(splatfacto, LiDAR 점군 초기화) → .ply → .spz
#
# reconstruct.sh(영상→COLMAP 경로)와 형제 스크립트. 차이는 앞단뿐:
#   - 포즈가 ARKit 센서에서 오므로 COLMAP/hloc/포즈게이트 전부 불필요.
#   - PLY_DIR(Record3D의 PLY 시퀀스 export)을 주면 LiDAR 점군으로 가우시안을
#     초기화한다(공식 문서: 랜덤 init 회피) — 흰 벽 면 형성의 1차 레버.
#   - 깊이 loss 감독(dn-splatter)은 W1-B 조건부: 이 스크립트는 P3 체크포인트
#     (transforms.json에 depth가 실렸는지)만 리포트하고 학습은 splatfacto로 한다.
#
# 사용:  bash reconstruct-record3d.sh <EXR+JPG export 폴더> [PLY 폴더] [작업이름] [iters]
# 예:    bash reconstruct-record3d.sh r3d_export r3d_export_ply myroom 15000
#        (PLY 없이)  bash reconstruct-record3d.sh r3d_export "" myroom
set -euo pipefail

EXPORT_DIR="${1:?사용법: reconstruct-record3d.sh <EXR+JPG export 폴더> [PLY 폴더] [name] [iters]}"
PLY_DIR="${2:-}"
NAME="${3:-$(basename "$EXPORT_DIR")}"
ITERS="${4:-15000}"            # 원룸 소형은 15k면 충분(reconstruct.sh와 동일 기준)
VOXEL="${VOXEL:-0.05}"         # LiDAR 점군 다운샘플 간격. 문서 기본 0.8은 원룸엔 너무 성김
                               # (0.8m 간격 ≈ 방 하나에 점 수십 개) → 5cm로 시작해 A/B.

ROOT="runs/${NAME}"
DATA="${ROOT}/proc"
EXPORT="${ROOT}/export"
mkdir -p "$ROOT"

# cv2가 EXR을 기본 거부하는 알려진 함정 — 선제 해제 (Record3D 깊이가 EXR)
export OPENCV_IO_ENABLE_OPENEXR=1

echo "▶ [1/4] Record3D 포즈·프레임 수입 (COLMAP 없음 — ARKit 포즈 직사용)"
if [ -n "$PLY_DIR" ] && [ -d "$PLY_DIR" ]; then
  ns-process-data record3d --data "$EXPORT_DIR" --ply "$PLY_DIR" \
    --voxel-size "$VOXEL" --output-dir "$DATA"
else
  echo "  ⚠ PLY 폴더 없음 — LiDAR 점군 초기화 생략(랜덤 init). 벽 품질 떨어지면"
  echo "    Record3D에서 'Point Cloud(PLY) 시퀀스'로 한 번 더 export해서 2번째 인자로 줄 것."
  ns-process-data record3d --data "$EXPORT_DIR" --output-dir "$DATA"
fi

# P3 체크포인트: 깊이가 어디까지 실렸는지 눈으로 확정 (빌드스펙 §7 첫 항목)
python3 - "$DATA/transforms.json" <<'PY'
import json, sys
t = json.load(open(sys.argv[1]))
frames = t.get("frames", [])
has_depth = any("depth_file_path" in f for f in frames)
has_ply = "ply_file_path" in t
print(f"  프레임 {len(frames)}장 / ply 초기화: {'✓ ' + t['ply_file_path'] if has_ply else '✗ 없음(랜덤 init)'}"
      f" / depth_file_path: {'✓ (depth loss 사용 가능)' if has_depth else '✗ 없음 — 깊이는 init까지만. loss 감독 원하면 W1-B(dn-splatter 브릿지)'}")
PY

echo "▶ [2/4] gsplat 학습 (splatfacto), iters=${ITERS}"
# use-scale-regularization: 길쭉한 needle 가우시안 억제(hloc 실측에서 퇴화 splat 18%가 이 모양).
# MCMC 밀집화 A/B는 두 번째 실행에서: ns-train splatfacto --help로 strategy 플래그 확인 후 비교.
ns-train splatfacto \
  --data "$DATA" \
  --max-num-iterations "$ITERS" \
  --pipeline.model.use-scale-regularization True \
  --output-dir "$ROOT/train" \
  --viewer.quit-on-train-completion True \
  --experiment-name "$NAME"

CONFIG="$(find "$ROOT/train" -name config.yml | sort | tail -1)"
[ -n "$CONFIG" ] || { echo "✗ config.yml 못 찾음 — 학습 실패 확인"; exit 1; }
echo "  config: $CONFIG"

echo "▶ [3/4] .ply 내보내기 (gaussian-splat)"
ns-export gaussian-splat --load-config "$CONFIG" --output-dir "$EXPORT"
PLY="$(find "$EXPORT" -name '*.ply' | sort | tail -1)"
[ -n "$PLY" ] || { echo "✗ .ply 못 찾음"; exit 1; }
echo "  ply: $PLY  ($(du -h "$PLY" | cut -f1))"

echo "▶ [4/4] .spz 압축 (--spz-version 3 필수 — 근거는 reconstruct.sh 주석)"
SPZ="${ROOT}/${NAME}.spz"
if command -v node >/dev/null 2>&1; then
  npx --yes @playcanvas/splat-transform@2 -w "$PLY" --spz-version 3 "$SPZ"  # @2 핀: v3 CLI는 NGSP(v4)로 뽑아 뷰어가 못 읽음(2026-07-16)
  echo "✓ 완료: $SPZ  ($(du -h "$SPZ" | cut -f1))"
else
  echo "⚠ node 없음 — 호스트/웹앱에서: npx @playcanvas/splat-transform $PLY --spz-version 3 <출력>.spz"
fi

echo ""
echo "다음: .spz를 apps/web/public/samples/에 두고 <이름>.tuning.json({\"fit\":\"native\",\"clip\":false})"
echo "      생성 → /splat-tour 드롭존으로 즉시 눈검증 가능. rotX 규약은 spz=0(메모리 참조)."
echo "W1-B(벽이 여전히 뭉개지면): dn-splatter 센서 depth loss — transforms.json에"
echo "      depth_file_path 브릿지 필요 + gsplat 1.0 핀 별도 env. 빌드스펙 §4 참조."
