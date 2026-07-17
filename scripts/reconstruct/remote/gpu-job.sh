#!/usr/bin/env bash
# Stateless SSM reconstruction job. The orchestrator places payload files beside this script.
set -Eeuo pipefail

ASSET_ID="${ASSET_ID:?ASSET_ID is required}"
SOURCE_URL="${SOURCE_URL:?SOURCE_URL is required}"
SOURCE_KIND="${SOURCE_KIND:?SOURCE_KIND is required (record3d-zip or video)}"
CALLBACK_BASE="${CALLBACK_BASE:?CALLBACK_BASE is required}"
WORKER_SECRET="${WORKER_SECRET:?WORKER_SECRET is required}"
ITERS="${ITERS:-30000}"

case "$ASSET_ID" in
  ""|.|..|*[!A-Za-z0-9._-]*)
    printf 'ERROR: ASSET_ID must contain only A-Z, a-z, 0-9, dot, underscore, or hyphen\n' >&2
    exit 2
    ;;
esac
if (( ${#ASSET_ID} > 128 )); then
  printf 'ERROR: ASSET_ID must be at most 128 characters\n' >&2
  exit 2
fi
case "$CALLBACK_BASE" in
  http://*|https://*) ;;
  *) printf 'ERROR: CALLBACK_BASE must be an http(s) URL\n' >&2; exit 2 ;;
esac

CALLBACK_BASE="${CALLBACK_BASE%/}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAGE="initialization"
LAST_ERROR=""
WORK=""
SUCCESS=0
COMPLETE_CALLBACK_SENT=0
FAILURE_CALLBACK_SENT=0
umask 077

if [[ "$(uname -s)" == "Darwin" ]]; then
  # Enables the documented local failure-callback smoke test without Docker, root, or NVMe.
  LOG_DIR="${TMPDIR:-/tmp}"
else
  LOG_DIR="/home/ssm-user"
fi
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/job-$ASSET_ID.log"
: > "$LOG_FILE"
# Keep the complete command stream in the EBS log. Saved descriptors let the EXIT
# trap report callback/cleanup status to SSM without relying on /dev/fd process substitution.
exec 3>&1 4>&2
exec >> "$LOG_FILE" 2>&1

die() {
  printf 'ERROR: [%s] %s\n' "$STAGE" "$*" >&2
  return 1
}

on_error() {
  local rc="$1"
  local line="$2"
  local command="$3"
  printf -v LAST_ERROR 'stage=%s exit=%s line=%s command=%s' "$STAGE" "$rc" "$line" "$command"
  printf 'ERROR: %s\n' "$LAST_ERROR" >&2
}

on_exit() {
  local rc="$1"
  trap - ERR EXIT

  exec 1>&3 2>&4
  exec 3>&- 4>&-

  if [[ -n "$WORK" && -d "$WORK" ]]; then
    rm -rf -- "$WORK" || printf 'WARN: failed to clean work directory: %s\n' "$WORK" >&2
  fi

  if (( rc == 0 && SUCCESS == 1 )); then
    printf 'Reconstruction completed successfully for asset %s\n' "$ASSET_ID"
    rm -f -- "$LOG_FILE"
    exit 0
  fi
  if (( rc == 0 )); then
    rc=1
  fi

  if (( COMPLETE_CALLBACK_SENT == 0 && FAILURE_CALLBACK_SENT == 0 )); then
    FAILURE_CALLBACK_SENT=1
    local payload
    payload="$(python3 - "$STAGE" "$LAST_ERROR" "$LOG_FILE" <<'PY'
import json
import pathlib
import sys

stage, detail, path = sys.argv[1:]
try:
    tail = pathlib.Path(path).read_bytes()[-2048:].decode("utf-8", "replace")
except Exception as exc:
    tail = f"log tail unavailable: {exc}"
message = f"stage: {stage}\n{detail}\nlog tail (last 2048 bytes):\n{tail}"
print(json.dumps({"error": message}, ensure_ascii=False))
PY
    )" || payload='{"error":"job failed; JSON payload generation also failed"}'

    printf 'Sending failure callback for stage: %s\n' "$STAGE" >&2
    curl --connect-timeout 5 --max-time 15 -sfS -X POST \
      "$CALLBACK_BASE/splat-assets/$ASSET_ID/reconstruction/failure" \
      -H "x-worker-secret: $WORKER_SECRET" \
      -H "Content-Type: application/json" \
      -d "$payload" || printf 'WARN: failure callback could not be delivered\n' >&2
  fi

  printf 'Job failed; EBS log retained at %s\n' "$LOG_FILE" >&2
  tail -c 2048 "$LOG_FILE" >&2 || true
  exit "$rc"
}

trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
trap 'on_exit "$?"' EXIT

case "$SOURCE_URL" in
  http://*|https://*) ;;
  *) die "SOURCE_URL must be an http(s) URL" ;;
esac
case "$SOURCE_KIND" in
  record3d-zip|video) ;;
  *) die "SOURCE_KIND must be record3d-zip or video" ;;
esac
if [[ ! "$ITERS" =~ ^[1-9][0-9]*$ ]]; then
  die "ITERS must be a positive integer"
fi

payload_file() {
  local name="$1"
  local candidate
  # SSM flattens payload files beside gpu-job.sh. ../ keeps repo-local execution convenient.
  for candidate in "$SCRIPT_DIR/$name" "$SCRIPT_DIR/../$name"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

copy_payload_file() {
  local name="$1"
  local source
  source="$(payload_file "$name")" || die "payload file missing: $name"
  cp -- "$source" "$WORK/tools/$name"
}

if [[ "$(uname -s)" == "Darwin" ]]; then
  printf 'Local preflight mode: skipping Linux root/Docker/NVMe bootstrap\n'
  WORK_ROOT="${TMPDIR:-/tmp}/roomlog-reconstruct-jobs"
else
  STAGE="bootstrap-nvme"
  BOOTSTRAP="$(payload_file bootstrap-nvme.sh)" || die "payload file missing: bootstrap-nvme.sh"
  bash "$BOOTSTRAP"
  WORK_ROOT="/opt/dlami/nvme/jobs"
fi

STAGE="prepare-workdir"
mkdir -p "$WORK_ROOT"
WORK="$WORK_ROOT/$ASSET_ID"
rm -rf -- "$WORK"
mkdir -p "$WORK/tools"

STAGE="download-source"
printf 'Downloading source for asset %s\n' "$ASSET_ID"
curl --connect-timeout 10 --max-time 3600 -fLSs "$SOURCE_URL" -o "$WORK/src"

STAGE="prepare-container-tools"
copy_payload_file cull_floaters.py

if [[ "$SOURCE_KIND" == "record3d-zip" ]]; then
  command -v unzip >/dev/null 2>&1 || die "unzip is required on the GPU host"
  copy_payload_file record3d_pointinit.py

  STAGE="unpack-record3d"
  mkdir -p "$WORK/input"
  unzip -q "$WORK/src" -d "$WORK/input"
  METADATA="$(find "$WORK/input" -type f -name metadata.json -print -quit)"
  [[ -n "$METADATA" ]] || die "Record3D archive has no metadata.json"
  DATA_DIR="$(dirname -- "$METADATA")"
  [[ -d "$DATA_DIR/depth" ]] || die "Record3D archive has no depth/ beside metadata.json"
  [[ -d "$DATA_DIR/rgb" ]] || die "Record3D archive has no rgb/ beside metadata.json"
  DATA_REL="${DATA_DIR#"$WORK"/}"

  STAGE="record3d-reconstruction"
  docker run --rm --gpus all --shm-size=12gb \
    -v "$WORK:/workspace" -w /workspace \
    -e OPENCV_IO_ENABLE_OPENEXR=1 \
    -e JOB_ASSET_ID="$ASSET_ID" \
    -e JOB_DATA_DIR="/workspace/$DATA_REL" \
    -e JOB_ITERS="$ITERS" \
    roomlog/recon:capture bash -lc '
      set -Eeuo pipefail

      # Fallback upstream image repair. NEVER pip install numpy or gsplat here:
      # both operations were proven to destroy the pinned nerfstudio environment.
      packages=()
      command -v gcc >/dev/null 2>&1 || packages+=(build-essential)
      command -v python3-config >/dev/null 2>&1 || packages+=(python3-dev)
      command -v wget >/dev/null 2>&1 || packages+=(wget)
      if (( ${#packages[@]} )); then
        apt-get update -qq
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${packages[@]}"
      fi

      python3 /workspace/tools/record3d_pointinit.py \
        "$JOB_DATA_DIR" /workspace/recon-data \
        --num-frames 1000 --voxel 0.02 --max-depth 4.0 --conf-min 2 \
        --keyframe-mode sharp

      # RUNBOOK.md section 6 is the measured command source. Keep its viewer mode;
      # max-gauss-ratio is the remote-worker safety addition from the W-C contract.
      # T1 튜닝 레시피(2026-07-16 실측 승자): densify-grad-thresh 절반 + 풀해상도 학습
      # → 표면 스케일 1.05→0.77cm(Scaniverse 0.72 근접), 이방성 2.81x. L4 24GB에서 VRAM ~6GB.
      # opacity 레버(cull-alpha-thresh 0.005)는 눈검증 대기 — 채택 시 cull_floaters min-opacity도 0.02~0.05로 세트 완화 필수.
      ns-train splatfacto \
        --data /workspace/recon-data \
        --pipeline.model.use-scale-regularization True \
        --pipeline.model.max-gauss-ratio 3.0 \
        --pipeline.model.densify-grad-thresh 0.0004 \
        --pipeline.model.num-downscales 0 \
        --max-num-iterations "$JOB_ITERS" \
        --output-dir /workspace/train \
        --viewer.quit-on-train-completion True \
        --experiment-name "$JOB_ASSET_ID" \
        nerfstudio-data --downscale-factor 1 --orientation-method none --center-method none --auto-scale-poses False

      CONFIG="$(find /workspace/train -type f -name config.yml | sort | tail -1)"
      [[ -n "$CONFIG" ]] || { echo "ERROR: config.yml not found after training" >&2; exit 1; }
      mkdir -p /workspace/export
      ns-export gaussian-splat --load-config "$CONFIG" --output-dir /workspace/export
      PLY="$(find /workspace/export -type f -name "*.ply" | sort | tail -1)"
      [[ -n "$PLY" ]] || { echo "ERROR: gaussian-splat PLY not found" >&2; exit 1; }

      python3 /workspace/tools/cull_floaters.py "$PLY" /workspace/clean.ply \
        --min-opacity 0.1 --max-scale 0.5 --max-needle 6.0 --iqr-k 3.0

      if ! command -v node >/dev/null 2>&1; then
        # Same Node 20 installation sequence as setup-container.sh.
        wget -qO- https://deb.nodesource.com/setup_20.x | bash -
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
      fi
      # @2 버전 핀 필수: v3.x CLI는 --spz-version을 잃고 NGSP(v4, 비압축)로 뽑아 뷰어(Spark)가 못 읽는다(2026-07-16 실측).
      # 회전 굽기 금지: point-init 체인은 ARKit 중력 정렬(Y-up)을 그대로 보존한다(축 span 실측으로 확인).
      # 뷰어는 spz 기본 rotX 0 규약으로 그대로 세운다 — 여기서 회전을 추가하면 오히려 눕는다.
      npx --yes @playcanvas/splat-transform@2 -w /workspace/clean.ply \
        --spz-version 3 /workspace/out.spz
    '
else
  copy_payload_file reconstruct.sh

  STAGE="video-reconstruction"
  docker run --rm --gpus all --shm-size=12gb \
    -v "$WORK:/workspace" -w /workspace \
    -e OPENCV_IO_ENABLE_OPENEXR=1 \
    -e JOB_ASSET_ID="$ASSET_ID" \
    -e JOB_ITERS="$ITERS" \
    roomlog/recon:capture bash -lc '
      set -Eeuo pipefail

      # Fallback upstream image repair. NEVER pip install numpy or gsplat here.
      packages=()
      command -v gcc >/dev/null 2>&1 || packages+=(build-essential)
      command -v python3-config >/dev/null 2>&1 || packages+=(python3-dev)
      command -v wget >/dev/null 2>&1 || packages+=(wget)
      if (( ${#packages[@]} )); then
        apt-get update -qq
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${packages[@]}"
      fi
      if ! command -v node >/dev/null 2>&1; then
        # Same Node 20 installation sequence as setup-container.sh.
        wget -qO- https://deb.nodesource.com/setup_20.x | bash -
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
      fi

      cd /workspace
      bash /workspace/tools/reconstruct.sh /workspace/src "$JOB_ASSET_ID" "$JOB_ITERS"
      SPZ="/workspace/runs/$JOB_ASSET_ID/$JOB_ASSET_ID.spz"
      [[ -s "$SPZ" ]] || { echo "ERROR: reconstruct.sh did not produce SPZ" >&2; exit 1; }
      cp -- "$SPZ" /workspace/out.spz
    '
fi

STAGE="validate-output"
[[ -s "$WORK/out.spz" ]] || die "out.spz is missing or empty"
SPZ_SIZE="$(wc -c < "$WORK/out.spz")"
if (( SPZ_SIZE <= 1048576 )); then
  die "out.spz is too small: ${SPZ_SIZE} bytes (must be greater than 1 MiB)"
fi
printf 'Validated out.spz: %s bytes\n' "$SPZ_SIZE"

STAGE="completion-callback"
curl --connect-timeout 10 --max-time 600 -fsS -X POST \
  "$CALLBACK_BASE/splat-assets/$ASSET_ID/reconstruction/complete" \
  -H "x-worker-secret: $WORKER_SECRET" \
  -F "file=@$WORK/out.spz;filename=$ASSET_ID.spz"
COMPLETE_CALLBACK_SENT=1
SUCCESS=1
STAGE="finished"
printf 'Reconstruction completed and callback accepted for asset %s\n' "$ASSET_ID"
