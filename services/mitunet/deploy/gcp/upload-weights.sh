#!/usr/bin/env bash
# Upload the two model checkpoints from this machine to the GPU VM.
# Weights are gitignored (~300 MB), so they never travel with the repo.
#
# Run from your LOCAL machine (needs gcloud + the weights in ./weights):
#   deploy/gcp/upload-weights.sh INSTANCE_NAME [ZONE]
#
# Example:
#   deploy/gcp/upload-weights.sh mitunet-gpu us-central1-a
set -euo pipefail

INSTANCE="${1:?Usage: upload-weights.sh INSTANCE_NAME [ZONE]}"
ZONE="${2:-${GCP_ZONE:-us-central1-a}}"
REMOTE_DIR="${REMOTE_DIR:-/opt/floorplan-to-3d-mitunet/weights}"

HERE="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL_WEIGHTS="$HERE/weights"

for f in best.pth yolo-segv1.pt; do
  if [[ ! -f "$LOCAL_WEIGHTS/$f" ]]; then
    echo "Missing $LOCAL_WEIGHTS/$f — cannot upload." >&2
    exit 1
  fi
done

echo "==> Ensuring remote dir exists (may prompt for the service user's sudo)"
gcloud compute ssh "$INSTANCE" --zone "$ZONE" --command \
  "sudo mkdir -p '$REMOTE_DIR' && sudo chown \$(whoami) '$REMOTE_DIR'"

echo "==> Uploading best.pth and yolo-segv1.pt (~300 MB)"
gcloud compute scp \
  "$LOCAL_WEIGHTS/best.pth" \
  "$LOCAL_WEIGHTS/yolo-segv1.pt" \
  "$INSTANCE:$REMOTE_DIR/" --zone "$ZONE"

echo "==> Done. Restart the service to pick them up:"
echo "    gcloud compute ssh $INSTANCE --zone $ZONE --command 'sudo systemctl restart mitunet'"
