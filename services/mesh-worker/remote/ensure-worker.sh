#!/usr/bin/env bash
# SSM mesh 변환 전에 레포·NVMe 컨테이너 런타임·mesh-worker 이미지를 멱등하게 준비한다.
set -Eeuo pipefail

REPO_DIR="${MESH_WORKER_REPO_DIR:-/home/ubuntu/roomlog}"
REPO_URL="${MESH_WORKER_REPO_URL:-https://github.com/gunrein620/roomlog.git}"
REPO_USER="${MESH_WORKER_REPO_USER:-ubuntu}"
WORKER_BRANCH="${MESH_WORKER_BRANCH:-main}"
WORKER_IMAGE="mesh-worker:test"
LOCK_FILE="${MESH_WORKER_LOCK_FILE:-/home/ubuntu/.roomlog-mesh-worker.lock}"
LOCK_WAIT_TIMEOUT_SECONDS=1200
GIT_TIMEOUT_SECONDS=300
BOOTSTRAP_TIMEOUT_SECONDS=900
IMAGE_INSPECT_TIMEOUT_SECONDS=20
IMAGE_BUILD_TIMEOUT_SECONDS=360
CURRENT_STAGE="초기화"

die() {
  printf 'ERROR: ensure-worker: [%s] %s\n' "$CURRENT_STAGE" "$*" >&2
  exit 1
}

print_nvme_diagnostics() {
  printf '%s\n' '--- NVMe 안전 진단 (/proc/mounts) ---' >&2
  awk '$2 == "/opt/dlami/nvme" { found=1; print } END { if (!found) print "NVMe mount record 없음" }' \
    /proc/mounts >&2 || true
  printf '%s\n' '--- NVMe 안전 진단 (lsblk) ---' >&2
  timeout 10s lsblk -o NAME,TYPE,FSTYPE,SIZE,MOUNTPOINTS >&2 || \
    printf '%s\n' 'WARN: lsblk 진단 실패 또는 timeout' >&2
  for config_file in /etc/containerd/config.toml /etc/docker/daemon.json; do
    printf '%s\n' "--- 설정 파일: $config_file ---" >&2
    if [[ -r "$config_file" ]]; then
      cat "$config_file" >&2 || true
    else
      printf '%s\n' '읽을 수 없음' >&2
    fi
  done
}

on_error() {
  local rc="$?"
  trap - ERR
  printf 'ERROR: ensure-worker: [%s] 준비 실패 (exit=%s)\n' "$CURRENT_STAGE" "$rc" >&2
  if [[ "$CURRENT_STAGE" == "NVMe 재초기화" ]]; then
    print_nvme_diagnostics || true
  fi
  exit "$rc"
}
trap on_error ERR

if [[ "$EUID" -ne 0 ]]; then
  die "NVMe 런타임을 복구하려면 root로 실행해야 합니다."
fi

for required_command in git flock id lsblk readlink runuser timeout; do
  command -v "$required_command" >/dev/null 2>&1 || die "$required_command 명령을 찾을 수 없습니다."
done
id "$REPO_USER" >/dev/null 2>&1 || die "레포 사용자 계정을 찾을 수 없습니다: $REPO_USER"

git check-ref-format --branch "$WORKER_BRANCH" >/dev/null 2>&1 || \
  die "유효하지 않은 브랜치 이름입니다: $WORKER_BRANCH"

CURRENT_STAGE="준비 잠금 획득"
if [[ "${MESH_WORKER_PREP_LOCKED:-0}" == "1" ]]; then
  # SSM 인라인 부트스트랩이 같은 EBS 잠금의 fd 9를 넘긴 경우 재잠금으로 교착하지 않는다.
  [[ -e "/proc/$$/fd/9" ]] || die "상속됐다고 표시된 준비 잠금 fd 9가 없습니다."
  inherited_lock="$(readlink "/proc/$$/fd/9")"
  [[ "$inherited_lock" == "$LOCK_FILE" ]] || \
    die "상속된 준비 잠금 경로가 다릅니다: $inherited_lock (기대: $LOCK_FILE)"
  printf '준비 잠금 유지: %s (SSM 부트스트랩에서 상속)\n' "$LOCK_FILE"
else
  mkdir -p -- "$(dirname -- "$LOCK_FILE")"
  exec 9>"$LOCK_FILE"
  flock -x -w "$LOCK_WAIT_TIMEOUT_SECONDS" 9 || \
    die "${LOCK_WAIT_TIMEOUT_SECONDS}초 안에 준비 잠금을 얻지 못했습니다: $LOCK_FILE"
  printf '준비 잠금 획득: %s\n' "$LOCK_FILE"
fi

CURRENT_STAGE="레포 확보"
mkdir -p -- "$(dirname -- "$REPO_DIR")"
if [[ ! -d "$REPO_DIR/.git" ]]; then
  printf '레포 없음 — %s 브랜치를 %s에 클론합니다.\n' "$WORKER_BRANCH" "$REPO_DIR"
  timeout --signal=TERM --kill-after=10s "${GIT_TIMEOUT_SECONDS}s" \
    runuser -u "$REPO_USER" -- git clone --branch "$WORKER_BRANCH" --single-branch \
      "$REPO_URL" "$REPO_DIR"
  printf '레포 클론 완료: %s (%s)\n' "$REPO_DIR" "$WORKER_BRANCH"
else
  printf '레포 있음 — origin/%s로 동기화합니다.\n' "$WORKER_BRANCH"
  timeout --signal=TERM --kill-after=10s "${GIT_TIMEOUT_SECONDS}s" \
    runuser -u "$REPO_USER" -- git -c "safe.directory=$REPO_DIR" -C "$REPO_DIR" \
      fetch --prune origin \
      "+refs/heads/$WORKER_BRANCH:refs/remotes/origin/$WORKER_BRANCH"
  timeout --signal=TERM --kill-after=10s "${GIT_TIMEOUT_SECONDS}s" \
    runuser -u "$REPO_USER" -- git -c "safe.directory=$REPO_DIR" -C "$REPO_DIR" reset --hard \
      "refs/remotes/origin/$WORKER_BRANCH"
  printf '레포 동기화 완료: origin/%s\n' "$WORKER_BRANCH"
fi

CURRENT_STAGE="NVMe 재초기화"
BOOTSTRAP_SCRIPT="$REPO_DIR/scripts/reconstruct/remote/bootstrap-nvme.sh"
[[ -f "$BOOTSTRAP_SCRIPT" ]] || die "NVMe bootstrap 스크립트가 없습니다: $BOOTSTRAP_SCRIPT"
printf 'NVMe 상태 확인/복구 시작: %s\n' "$BOOTSTRAP_SCRIPT"
# 기존 bootstrap 내부의 mount·Docker 진단이 고장 난 NVMe에서 멈춰도 SSM 명령이 영구 대기하지 않게
# 스크립트 전체에 상한을 둔다. stale 판정·런타임 재초기화 로직은 복사하지 않고 그대로 재사용한다.
timeout --signal=TERM --kill-after=10s "${BOOTSTRAP_TIMEOUT_SECONDS}s" bash "$BOOTSTRAP_SCRIPT"
printf 'NVMe 상태 확인/복구 완료\n'

CURRENT_STAGE="mesh-worker 이미지 확인"
if timeout --signal=TERM --kill-after=5s "${IMAGE_INSPECT_TIMEOUT_SECONDS}s" \
  docker image inspect "$WORKER_IMAGE" >/dev/null 2>&1; then
  printf '이미지 있음 — 빌드 건너뜀: %s\n' "$WORKER_IMAGE"
else
  inspect_rc="$?"
  case "$inspect_rc" in
    1) ;;
    124|137)
      die "docker image inspect가 ${IMAGE_INSPECT_TIMEOUT_SECONDS}초 안에 끝나지 않았습니다."
      ;;
    *)
      die "docker image inspect가 예기치 않게 실패했습니다(exit=$inspect_rc)."
      ;;
  esac

  CURRENT_STAGE="mesh-worker 이미지 빌드"
  printf '이미지 없음 — 빌드 시작: %s\n' "$WORKER_IMAGE"
  cd "$REPO_DIR"
  timeout --signal=TERM --kill-after=10s "${IMAGE_BUILD_TIMEOUT_SECONDS}s" \
    docker build -f services/mesh-worker/Dockerfile -t "$WORKER_IMAGE" .

  CURRENT_STAGE="mesh-worker 이미지 검증"
  timeout --signal=TERM --kill-after=5s "${IMAGE_INSPECT_TIMEOUT_SECONDS}s" \
    docker image inspect "$WORKER_IMAGE" >/dev/null
  printf '이미지 빌드 완료: %s\n' "$WORKER_IMAGE"
fi

CURRENT_STAGE="완료"
printf 'mesh-worker 준비 완료\n'
