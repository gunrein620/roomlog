# Deploying the MitUNet inference server on GCP

The RoomLog app calls this server over HTTP at `MITUNET_INTERNAL_SERVICE_URL`.
Nothing here is AWS/GCP specific — this directory just automates the GCP path.

```
┌─────────────────────┐         HTTP :8012          ┌──────────────────────┐
│ RoomLog web server  │ ───────────────────────────▶│ GCP GPU VM           │
│ (any host)          │  MITUNET_INTERNAL_SERVICE_URL│ this server + weights│
└─────────────────────┘                              └──────────────────────┘
```

Only the RoomLog server needs to reach the VM. Do **not** expose port 8012 to
the internet — the firewall rule below restricts it to RoomLog's IP.

## What runs where

| Machine | Needs the repo | Needs `.pth` weights | Key env var |
|---|---|---|---|
| GPU VM (this) | yes (full) | **yes** — `best.pth`, `yolo-segv1.pt` | `ROOMLOG_ALLOWED_ORIGINS`, `BUILDINGCV_DEVICE` |
| RoomLog server | only `viewer/` | no | `MITUNET_INTERNAL_SERVICE_URL`, `MITUNET_PROJECT_ROOT` |

## One-time setup

All local commands assume `gcloud` is installed and authenticated
(`gcloud init`).

### 1. Create the VM + firewall

```bash
ROOMLOG_SERVER_IP=<roomlog server public IP> \
  deploy/gcp/create-instance.sh
```

Defaults to `g2-standard-4` + one L4 in `us-central1-a`. For a cheaper T4:

```bash
MACHINE=n1-standard-4 GPU=type=nvidia-tesla-t4,count=1 \
ROOMLOG_SERVER_IP=<ip> deploy/gcp/create-instance.sh
```

### 2. Provision the server (on the VM)

```bash
gcloud compute ssh mitunet-gpu --zone us-central1-a
# On the VM:
sudo bash /opt/floorplan-to-3d-mitunet/deploy/gcp/provision.sh
```

If the image didn't place the repo at `/opt/floorplan-to-3d-mitunet`, clone it
there first (`provision.sh` will also clone if missing). The script installs
deps, sets up the `mitunet` systemd service, and prints the remaining steps.

### 3. Configure runtime env (on the VM)

```bash
sudo cp /opt/floorplan-to-3d-mitunet/deploy/gcp/mitunet.env.example /etc/mitunet.env
sudo nano /etc/mitunet.env   # set ROOMLOG_ALLOWED_ORIGINS to your RoomLog origin
```

`ROOMLOG_ALLOWED_ORIGINS` must list RoomLog's exact origin(s), comma-separated,
no trailing slash — otherwise the in-viewer "저장하기" button stays disabled.

### 4. Upload weights (from local)

```bash
deploy/gcp/upload-weights.sh mitunet-gpu us-central1-a
```

### 5. Start and verify

```bash
gcloud compute ssh mitunet-gpu --zone us-central1-a --command '
  sudo systemctl start mitunet &&
  curl -s http://127.0.0.1:8012/healthz'
```

Healthy output shows `"device": "cuda"` and `"opening_detection_enabled": true`.
If `device` is `cpu`, the GPU/driver isn't visible — check `nvidia-smi`.

### 6. Point RoomLog at the VM

On the RoomLog server, set (prefer the VM's **internal** IP if both live in the
same VPC):

```
MITUNET_INTERNAL_SERVICE_URL=http://<VM_INTERNAL_IP>:8012
```

Restart RoomLog. Open the floor-plan page — the MitUNet viewer loads through
RoomLog and inference now runs on the GPU VM.

## Updating

```bash
gcloud compute ssh mitunet-gpu --zone us-central1-a --command '
  cd /opt/floorplan-to-3d-mitunet &&
  git pull &&
  .venv/bin/pip install -e ".[serve]" &&
  sudo systemctl restart mitunet'
```

Weights don't change on a code pull; re-run `upload-weights.sh` only when the
model itself changes.

## Notes / gotchas

- **HTTPS:** this server speaks plain HTTP. If RoomLog is HTTPS and calls the VM
  across the public internet, put the VM behind a TLS terminator (GCP HTTPS LB
  or an nginx/Caddy reverse proxy) or keep both in the same VPC and use the
  internal IP. Browsers never talk to this server directly (RoomLog proxies it),
  so mixed-content isn't a browser issue — but server-to-server TLS is still
  good practice over the public internet.
- **Cost:** GPU VMs bill while running. `gcloud compute instances stop
  mitunet-gpu --zone …` when idle; `start` to resume (internal IP is stable,
  ephemeral external IP may change).
- **Torch CUDA build:** `provision.sh` installs torch from default PyPI (CUDA
  12.x wheels). If the VM's driver is older, install a matching build, e.g.
  `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121`.
