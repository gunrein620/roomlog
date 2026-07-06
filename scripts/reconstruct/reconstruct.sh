#!/usr/bin/env bash
# 영상 → splat 재구성 파이프라인 (경우 '영상만'의 핵심 조각)
#
#   영상 → 키프레임+COLMAP(SfM) → gsplat 학습(splatfacto) → .ply → .spz
#
# nerfstudio(ns-*)와 node(npx)가 PATH에 있다고 가정한다. 셋업은 README.md 참고.
# GPU 박스(AWS g6e.2xlarge / L40S 48GB)에서 실행. L40S면 기본 재구성엔 넉넉하다.
#
# 사용:  bash reconstruct.sh <video.mp4> [작업이름] [학습iters]
# 예:    bash reconstruct.sh room1.mp4 room1 15000
set -euo pipefail

VIDEO="${1:?사용법: reconstruct.sh <video.mp4> [name] [iters]}"
NAME="${2:-$(basename "${VIDEO%.*}")}"
ITERS="${3:-15000}"            # 원룸 소형은 15k면 충분(기본 30k는 ~2배 시간)
FRAMES="${FRAMES:-300}"        # 1~2분 영상에서 뽑을 키프레임 목표 수(①은 균등 샘플링)

ROOT="runs/${NAME}"
DATA="${ROOT}/proc"           # ns-process-data 산출(images + colmap + transforms.json)
EXPORT="${ROOT}/export"       # ns-export 산출(splat.ply)
mkdir -p "$ROOT"

echo "▶ [1/4] 키프레임 추출 + COLMAP (SfM 카메라 포즈)  — 수 분"
# ns-process-data가 ffmpeg 프레임추출 → COLMAP feature/match/mapper를 한 번에 처리.
ns-process-data video --data "$VIDEO" --output-dir "$DATA" --num-frames-target "$FRAMES"

echo "▶ [2/4] gsplat 학습 (splatfacto), iters=${ITERS}  — L40S에서 수~수십 분"
ns-train splatfacto \
  --data "$DATA" \
  --max-num-iterations "$ITERS" \
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

echo "▶ [4/4] .spz 압축 (웹 전송용 — 뷰어가 로드하는 포맷)"
SPZ="${ROOT}/${NAME}.spz"
if command -v node >/dev/null 2>&1; then
  npx --yes @playcanvas/splat-transform "$PLY" "$SPZ"
  echo "✓ 완료: $SPZ  ($(du -h "$SPZ" | cut -f1))"
  echo ""
  echo "다음: 이 파일을 웹앱으로 내려 apps/web/public/samples/room.spz 로 교체 →"
  echo "      /splat-tour 새로고침. (파일명 유지 시 tour-viewer.tsx 수정 불필요)"
else
  echo "⚠ node 없음 — 컨테이너 밖 호스트나 웹앱에서 아래를 실행:"
  echo "  npx @playcanvas/splat-transform $PLY apps/web/public/samples/room.spz"
fi
