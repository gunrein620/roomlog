#!/usr/bin/env bash
# Provision a fresh GCP GPU VM to run the MitUNet inference server.
#
# Run this ONCE on a new Ubuntu 22.04 / Debian instance that has an NVIDIA GPU
# (e.g. g2-standard-4 with an L4, or an n1 + T4). It installs the NVIDIA driver,
# Python, the project with its `serve` extras, and a systemd service. It does
# NOT upload model weights — see deploy/gcp/README.md for that step.
#
# Usage (as a sudo-capable user):
#   sudo bash deploy/gcp/provision.sh
#
# Idempotent: safe to re-run. Tune with env vars before calling:
#   MITUNET_USER   service account to run under (default: current SUDO_USER)
#   MITUNET_DIR    checkout path            (default: /opt/floorplan-to-3d-mitunet)
#   MITUNET_PORT   listen port             (default: 8012)
set -euo pipefail

MITUNET_USER="${MITUNET_USER:-${SUDO_USER:-$(whoami)}}"
MITUNET_DIR="${MITUNET_DIR:-/opt/floorplan-to-3d-mitunet}"
MITUNET_PORT="${MITUNET_PORT:-8012}"
REPO_URL="${REPO_URL:-https://github.com/Yytsi/floorplan-to-3d.git}"

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/gcp/provision.sh" >&2
  exit 1
fi

log "Installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  git python3-pip software-properties-common \
  libgl1 libglib2.0-0 ca-certificates curl

# The project needs Python >= 3.11. Ubuntu 22.04's universe repo only carries a
# release *candidate* (3.11.0~rc1), so pull a proper release from deadsnakes.
# Newer distros (24.04+) already ship a good 3.11+, so only add the PPA when the
# available candidate is an rc or missing entirely.
log "Ensuring Python 3.11+"
if ! apt-cache policy python3.11 2>/dev/null | grep -q 'Candidate: 3\.11\.[0-9]' ||
   apt-cache policy python3.11 2>/dev/null | grep -q 'Candidate:.*rc'; then
  add-apt-repository -y ppa:deadsnakes/ppa
  apt-get update -y
fi
apt-get install -y --no-install-recommends python3.11 python3.11-venv python3.11-dev

python3.11 --version

# --- NVIDIA driver -----------------------------------------------------------
# Skip if a working driver is already present (GCP "Deep Learning" images ship
# one; bare Ubuntu images do not).
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
  log "NVIDIA driver already present"
else
  log "Installing NVIDIA driver (ubuntu-drivers autoinstall)"
  apt-get install -y ubuntu-drivers-common
  ubuntu-drivers autoinstall || {
    echo "Driver autoinstall failed. On GCP, prefer a Deep Learning VM image" >&2
    echo "which ships the driver, or install manually, then re-run this script." >&2
    exit 1
  }
  echo "A reboot is required for the new driver. Re-run this script after reboot." >&2
  echo "  sudo reboot" >&2
fi

# --- Source ------------------------------------------------------------------
# Three supported states, in order:
#   1. a git checkout      -> refresh it
#   2. code already staged -> leave it alone (rsync/scp upload, e.g. when the
#                             branch you want isn't pushed anywhere yet)
#   3. nothing             -> clone REPO_URL
if [[ -d "$MITUNET_DIR/.git" ]]; then
  log "Updating existing checkout at $MITUNET_DIR"
  git -C "$MITUNET_DIR" fetch --all --prune
elif [[ -f "$MITUNET_DIR/pyproject.toml" ]]; then
  log "Using code already present at $MITUNET_DIR (not a git checkout — skipping clone)"
else
  log "Cloning $REPO_URL -> $MITUNET_DIR"
  git clone "$REPO_URL" "$MITUNET_DIR"
fi
chown -R "$MITUNET_USER":"$MITUNET_USER" "$MITUNET_DIR"

# --- Python venv + deps ------------------------------------------------------
log "Creating virtualenv and installing serve extras"
sudo -u "$MITUNET_USER" bash -euo pipefail <<EOF
cd "$MITUNET_DIR"
python3.11 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip wheel
# Torch CUDA wheels come from the default PyPI index for CUDA 12.x. If your
# driver is older, pin an index, e.g.:
#   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -e ".[serve]"
EOF

# --- systemd service ---------------------------------------------------------
log "Installing systemd service mitunet.service"
sed \
  -e "s|@USER@|$MITUNET_USER|g" \
  -e "s|@DIR@|$MITUNET_DIR|g" \
  -e "s|@PORT@|$MITUNET_PORT|g" \
  "$MITUNET_DIR/deploy/gcp/mitunet.service" > /etc/systemd/system/mitunet.service

systemctl daemon-reload
systemctl enable mitunet.service

log "Provisioning complete"
cat <<EOF

Next steps:
  1. Upload weights to $MITUNET_DIR/weights/ (best.pth, yolo-segv1.pt).
     See deploy/gcp/README.md.
  2. Set ROOMLOG_ALLOWED_ORIGINS in /etc/mitunet.env (copy from
     deploy/gcp/mitunet.env.example) to your RoomLog origin(s).
  3. Start the service:
       sudo systemctl start mitunet
       systemctl status mitunet
       curl -s http://127.0.0.1:$MITUNET_PORT/healthz | python3 -m json.tool
EOF
