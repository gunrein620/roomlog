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

# --- NVMe container-runtime reinit (stop이 인스턴스스토어를 초기화하는 문제 대응) ----------
# containerd root와 docker data-root는 /opt/dlami/nvme/{containerd,docker}에 있고(설정은
# /etc/containerd/config.toml·/etc/docker/daemon.json — EBS라 stop에도 생존), 데이터만
# 인스턴스스토어라 stop 때 날아간다. 재시작 시 DLAMI가 빈 NVMe를 마운트하는데, docker/
# containerd가 마운트 전에 떠서 snapshotter metadata.db가 마운트에 가려지거나 빈 data-root로
# 떠 있으면 `docker pull`이 "metadata.db: no such file or directory"로 실패한다. → 마운트를
# 기다리고, data-root 디렉토리를 보장한 뒤, 런타임을 재시작해 containerd가 깨끗이 재초기화하게 한다.
NVME_ROOT="/opt/dlami/nvme"
CONTAINERD_META="$NVME_ROOT/containerd/io.containerd.snapshotter.v1.overlayfs/metadata.db"

CURRENT_STEP="waiting for NVMe mount"
mount_deadline=$((SECONDS + 120))
until mountpoint -q "$NVME_ROOT"; do
  if (( SECONDS >= mount_deadline )); then
    die "$NVME_ROOT is not a mountpoint after 120s (instance-store not attached?)"
  fi
  sleep 3
done
printf 'NVMe mounted at %s\n' "$NVME_ROOT"

CURRENT_STEP="reinitializing container runtime on NVMe"
# 멱등: 워밍 상태(메타DB 존재 + docker 정상)면 건너뛴다.
if [[ ! -f "$CONTAINERD_META" ]] || ! docker info >/dev/null 2>&1; then
  printf 'Container storage stale after stop — reinitializing containerd/docker on %s\n' "$NVME_ROOT"
  command -v systemctl >/dev/null 2>&1 || die "systemctl unavailable — cannot reinitialize container runtime"
  systemctl stop docker docker.socket containerd >/dev/null 2>&1 || true
  mkdir -p "$NVME_ROOT/containerd" "$NVME_ROOT/docker"
  systemctl start containerd
  cd_deadline=$((SECONDS + 60))
  until [[ -S /run/containerd/containerd.sock ]]; do
    if (( SECONDS >= cd_deadline )); then
      die "containerd socket did not appear within 60s after restart"
    fi
    sleep 2
  done
  systemctl start docker >/dev/null 2>&1 || true
  printf 'containerd/docker reinitialized on fresh NVMe\n'
fi
# --------------------------------------------------------------------------------------

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
