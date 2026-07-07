#!/usr/bin/env bash
# nerfstudio 컨테이너 사전 셋업 — 컨테이너를 새로 띄울 때마다 1회 실행 (전부 멱등, 재실행 안전)
#
# 배경(2026-07-07 실측): nerfstudio 공식 이미지는 hloc 코드를 담고 있지만 실행 포장이 4곳 비어 있다.
#   ① SuperGluePretrainedNetwork 저장소(SuperPoint/SuperGlue 가중치) — import 즉시 ModuleNotFoundError
#   ② wget — NetVLAD(529MB) 다운로드가 내부에서 호출
#   ③ hloc(구버전) ↔ pycolmap(신버전) API 불일치 — verify_matches가 kwargs 대신
#      TwoViewGeometryOptions 객체를 요구해 SuperGlue 매칭 완료 직후 TypeError로 사망
#   ④ node — 마지막 단계 .spz 압축(@playcanvas/splat-transform)이 필요
#
# ①은 /workspace(호스트 ~/recon) 마운트에 남아 컨테이너가 죽어도 유지된다.
# ②③④는 컨테이너 파일시스템 소속이라 컨테이너를 새로 만들면 이 스크립트를 다시 돌려야 한다.
#
# 사용(컨테이너 안, /workspace에서):  bash setup-container.sh
set -euo pipefail

echo "▶ [1/4] SuperGluePretrainedNetwork (hloc 특징점·매처 가중치, ~50MB)"
if [ -d /workspace/SuperGluePretrainedNetwork/models/weights ]; then
  echo "  이미 있음 — 스킵"
else
  git clone --depth 1 https://github.com/magicleap/SuperGluePretrainedNetwork.git \
    /workspace/SuperGluePretrainedNetwork
fi

echo "▶ [2/4] wget"
if command -v wget >/dev/null 2>&1; then
  echo "  이미 있음 — 스킵"
else
  apt-get update -qq && apt-get install -y -qq wget
fi

echo "▶ [3/4] node 20 (.spz 압축용)"
if command -v node >/dev/null 2>&1; then
  echo "  이미 있음 — 스킵 ($(node --version))"
else
  # 주의: nerfstudio 이미지엔 curl이 없다 — [2/4]에서 깐 wget 사용
  wget -qO- https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

echo "▶ [4/4] hloc↔pycolmap API 패치 (verify_matches kwargs → TwoViewGeometryOptions)"
TRI="$(python3 -c 'import hloc, pathlib; print(pathlib.Path(hloc.__file__).parent / "triangulation.py")')"
if grep -q "__vm_opts" "$TRI"; then
  echo "  이미 패치됨 — 스킵"
else
  python3 - "$TRI" <<'PY'
import re, sys, pathlib
p = pathlib.Path(sys.argv[1])
s = p.read_text()
pat = re.compile(r"pycolmap\.verify_matches\(\s*([\w.]+),\s*([\w.]+),[^)]*\)", re.S)
s2, n = pat.subn(
    lambda m: "pycolmap.verify_matches(str(" + m.group(1) + "), str(" + m.group(2) + "), options=__vm_opts())",
    s, count=1)
assert n == 1, "verify_matches 호출을 못 찾음 — hloc 버전이 바뀌었는지 확인"
s2 += (
    "\n\ndef __vm_opts():\n"
    "    o = pycolmap.TwoViewGeometryOptions()\n"
    "    o.ransac.max_num_trials = 20000\n"
    "    o.ransac.min_inlier_ratio = 0.1\n"
    "    return o\n"
)
p.write_text(s2)
print("  패치 완료:", p)
PY
fi

echo ""
echo "✓ 셋업 완료. hloc 실행 예:"
echo "  SFM_TOOL=hloc FRAMES=900 bash reconstruct.sh <video.mp4> <name>"
