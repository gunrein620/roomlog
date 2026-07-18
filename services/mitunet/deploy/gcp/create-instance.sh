#!/usr/bin/env bash
# Create the GPU VM and a firewall rule that ONLY lets the RoomLog server reach
# the inference port. Run from your LOCAL machine with gcloud configured.
#
#   ROOMLOG_SERVER_IP=203.0.113.10 deploy/gcp/create-instance.sh
#
# Override any of these via env before calling:
#   INSTANCE   (default: mitunet-gpu)
#   ZONE       (default: us-central1-a)   — must have L4/T4 stock
#   MACHINE    (default: g2-standard-4)   — L4; use n1-standard-4 for T4
#   GPU        (default: nvidia-l4,count=1); for T4: nvidia-tesla-t4,count=1
#   PORT       (default: 8012)
#   ROOMLOG_SERVER_IP  (REQUIRED) source IP allowed through the firewall
set -euo pipefail

INSTANCE="${INSTANCE:-mitunet-gpu}"
ZONE="${ZONE:-us-central1-a}"
MACHINE="${MACHINE:-g2-standard-4}"
GPU="${GPU:-type=nvidia-l4,count=1}"
PORT="${PORT:-8012}"
NETWORK_TAG="mitunet-inference"
: "${ROOMLOG_SERVER_IP:?Set ROOMLOG_SERVER_IP to the RoomLog server public IP (or use a /32 range)}"

echo "==> Creating instance $INSTANCE in $ZONE ($MACHINE, $GPU)"
# Deep Learning image ships CUDA + NVIDIA driver so provision.sh can skip it.
gcloud compute instances create "$INSTANCE" \
  --zone "$ZONE" \
  --machine-type "$MACHINE" \
  --accelerator "$GPU" \
  --maintenance-policy TERMINATE \
  --image-family common-cu123 \
  --image-project deeplearning-platform-release \
  --boot-disk-size 100GB \
  --boot-disk-type pd-balanced \
  --tags "$NETWORK_TAG" \
  --metadata install-nvidia-driver=True

echo "==> Creating firewall rule (only $ROOMLOG_SERVER_IP may reach :$PORT)"
gcloud compute firewall-rules create "allow-mitunet-from-roomlog" \
  --direction INGRESS \
  --action ALLOW \
  --rules "tcp:$PORT" \
  --source-ranges "${ROOMLOG_SERVER_IP}/32" \
  --target-tags "$NETWORK_TAG" \
  || echo "  (firewall rule may already exist — skipping)"

echo
echo "==> Instance created. Next:"
echo "  1. SSH in and provision:"
echo "       gcloud compute ssh $INSTANCE --zone $ZONE"
echo "       sudo bash /opt/floorplan-to-3d-mitunet/deploy/gcp/provision.sh"
echo "     (clone the repo to /opt first if the image did not, per README)"
echo "  2. Upload weights from local:"
echo "       deploy/gcp/upload-weights.sh $INSTANCE $ZONE"
echo "  3. Point RoomLog at this VM internal IP:"
echo "       MITUNET_INTERNAL_SERVICE_URL=http://<VM_INTERNAL_IP>:$PORT"
