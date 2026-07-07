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
SFM_TOOL="${SFM_TOOL:-colmap}" # colmap(SIFT) | hloc(SuperPoint+SuperGlue — 저텍스처 실험용)

ROOT="runs/${NAME}"
DATA="${ROOT}/proc"           # ns-process-data 산출(images + colmap + transforms.json)
EXPORT="${ROOT}/export"       # ns-export 산출(splat.ply)
mkdir -p "$ROOT"

echo "▶ [1/4] 키프레임 추출 + SfM 카메라 포즈 (${SFM_TOOL})  — 수 분"
# ns-process-data가 ffmpeg 프레임추출 → feature/match/mapper를 한 번에 처리.
if [ "$SFM_TOOL" = "hloc" ]; then
  # 실험(2026-07-07~): SIFT가 전멸한 흰벽·반사면 영상에서 학습 기반 특징점(SuperPoint)이
  # 통하는지 검증. hloc은 nerfstudio 컨테이너에 포함돼 있으나 첫 실행 시 모델 다운로드.
  ns-process-data video --data "$VIDEO" --output-dir "$DATA" --num-frames-target "$FRAMES" \
    --sfm-tool hloc --feature-type superpoint_aachen --matcher-type superglue
else
  ns-process-data video --data "$VIDEO" --output-dir "$DATA" --num-frames-target "$FRAMES"
fi
# 매칭은 기본 vocab_tree 유지. sequential은 실측(2026-07-06, room1)에서 322장 중 2장만
# 포즈 성공 — 특징점 빈곤 구간에서 사슬이 끊기면 전체가 조각남. vocab_tree는 22/102,
# exhaustive는 2/150 — 셋 다 전멸이라 SIFT 자체의 한계로 결론(→ hloc 실험).

# 포즈 게이트: 매칭률이 바닥이면 학습은 GPU 낭비다 (실측: 2장으로도 15k iters 완주해버림)
POSED=$(python3 -c "import json;print(len(json.load(open('$DATA/transforms.json'))['frames']))" 2>/dev/null || echo 0)
echo "  포즈 성공: ${POSED}장 / 목표 ${FRAMES}장"
if [ "$POSED" -lt $((FRAMES / 3)) ]; then
  echo "✗ 포즈 매칭률 33% 미만 — 원인은 대개 캡처(흰 벽·반사면·빠른 이동). 학습 중단."
  echo "  README '테스트 입력'의 촬영 가이드로 재촬영 후 다시 실행하세요."
  exit 1
fi

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
# --spz-version 3 필수: splat-transform 기본값(v4, 비압축 "NGSP" 컨테이너)은 뷰어
# (@sparkjsdev/spark 2.1.0 — gzip SPZ v1~3만 읽음, npm 최신이 이 버전이라 업그레이드 불가)가
# "Invalid gzip header"로 거부한다. 실측(2026-07-07): splat-transform 2.1.0(.spz 지원 시작)부터
# 최신 2.7.1까지 전 구간에서 --spz-version 3가 gzip(1f8b) 출력을 낸다 — 버전 고정 불필요,
# 플래그만 있으면 됨. 업그레이드 조건: Spark가 v4(비압축)를 지원하게 되면 플래그 제거.
if command -v node >/dev/null 2>&1; then
  npx --yes @playcanvas/splat-transform "$PLY" --spz-version 3 "$SPZ"
  echo "✓ 완료: $SPZ  ($(du -h "$SPZ" | cut -f1))"
  echo ""
  echo "다음: 이 파일을 웹앱 apps/web/public/samples/ 에 두고, 같은 basename의 <이름>.tuning.json"
  echo "      ({ \"fit\": \"native\", \"clip\": false })을 만든 뒤 tour-viewer.tsx의 SPLAT_SRC를"
  echo "      갱신 → /splat-tour 새로고침. (높이는 뷰어의 바닥 스냅이 자동 보정)"
else
  echo "⚠ node 없음 — 컨테이너 밖 호스트나 웹앱에서 아래를 실행:"
  echo "  npx @playcanvas/splat-transform $PLY --spz-version 3 apps/web/public/samples/room.spz"
fi
