#!/usr/bin/env bash
# Rebuild the ephemeral NVMe Docker state before every GPU reconstruction job.
set -Eeuo pipefail

RECON_IMAGE="roomlog/recon:capture"
UPSTREAM_IMAGE="ghcr.io/nerfstudio-project/nerfstudio:1.1.3"
CURRENT_STEP="initialization"

die() {
  printf 'ERROR: bootstrap-nvme: %s\n' "$*" >&2
  exit 1
}

on_error() {
  local rc="$?"
  printf 'ERROR: bootstrap-nvme failed during %s (exit=%s)\n' "$CURRENT_STEP" "$rc" >&2
  exit "$rc"
}
trap on_error ERR

if [[ "${EUID}" -ne 0 ]]; then
  die "must run as root"
fi

CURRENT_STEP="starting Docker"
if ! docker info >/dev/null 2>&1; then
  if command -v systemctl >/dev/null 2>&1; then
    systemctl start docker >/dev/null 2>&1 || \
      printf 'WARN: systemctl start docker failed; waiting for an existing daemon\n' >&2
  else
    printf 'WARN: systemctl is unavailable; waiting for Docker directly\n' >&2
  fi

  deadline=$((SECONDS + 180))
  until docker info >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      die "Docker daemon did not respond within 180 seconds"
    fi
    sleep 3
  done
fi
printf 'Docker daemon is ready\n'

CURRENT_STEP="restoring reconstruction image"
if docker image inspect "$RECON_IMAGE" >/dev/null 2>&1; then
  printf 'Reconstruction image already present: %s\n' "$RECON_IMAGE"
else
  requested_tar="${GPU_IMAGE_TAR:-/home/ssm-user/recon-capture.tar}"
  tar_path=""
  for candidate in \
    "$requested_tar" \
    /home/ssm-user/recon-capture.tar \
    /opt/dlami/recon-capture.tar \
    /root/recon-capture.tar; do
    if [[ -f "$candidate" ]]; then
      tar_path="$candidate"
      break
    fi
  done

  if [[ -n "$tar_path" ]]; then
    printf 'Loading reconstruction image from %s\n' "$tar_path"
    docker load < "$tar_path"
    docker image inspect "$RECON_IMAGE" >/dev/null 2>&1 || \
      die "image archive loaded but did not provide $RECON_IMAGE"
  else
    printf 'No EBS image archive found; pulling %s\n' "$UPSTREAM_IMAGE"
    docker pull "$UPSTREAM_IMAGE"
    docker tag "$UPSTREAM_IMAGE" "$RECON_IMAGE"
    printf 'Tagged upstream fallback as %s; gpu-job.sh will inject build-essential/python3-dev\n' \
      "$RECON_IMAGE"
  fi
fi

CURRENT_STEP="verifying reconstruction image"
docker image inspect "$RECON_IMAGE" >/dev/null 2>&1 || \
  die "reconstruction image is unavailable after restore: $RECON_IMAGE"

CURRENT_STEP="creating NVMe job root"
mkdir -p /opt/dlami/nvme/jobs
chmod 700 /opt/dlami/nvme/jobs
printf 'NVMe job root is ready: /opt/dlami/nvme/jobs\n'
