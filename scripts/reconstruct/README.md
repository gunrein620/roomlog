# 영상 → splat 재구성 런북 (경우 '영상만')

집주인 영상 1건을 브라우저 재생용 `.spz`로 바꾸는 **장면별 최적화** 파이프라인.
GPU 몇 분짜리 작업이며 매물이 쌓여도 품질은 안 좋아진다 — 품질은 **그 영상의 캡처 품질**이 결정한다
(`docs/remote-3d-tour.md` §1). 재구성 파이프라인 안정화는 데모 이후 과제라, 여기선 **수동 실행 런북**이다.

```
영상 → 키프레임+COLMAP(SfM 포즈) → gsplat 학습(splatfacto) → .ply → .spz → 웹 뷰어
       └─────────── ns-process-data video ────────┘   └ ns-train ┘  └ ns-export ┘  └ splat-transform ┘
```

- **인스턴스**: AWS `g6e.2xlarge` (L40S 48GB). 기본 재구성엔 넉넉(48GB는 원래 프리미엄 ArtiFixer용 하한).
- **출구는 파일 하나**: 뷰어는 `apps/web/public/samples/room.spz`를 로드한다(`tour-viewer.tsx:16`).
  결과 `.spz`를 그 경로로 덮으면 `/splat-tour`가 그대로 렌더한다.

---

## 셋업 — GPU 박스 (Deep Learning AMI, Docker+NVIDIA 툴킷 포함)

의존성 지옥(tiny-cuda-nn/gsplat/COLMAP 빌드)을 피하려고 **nerfstudio 공식 Docker 이미지**를 쓴다.

```sh
# 1) GPU 보이는지 확인
nvidia-smi

# 2) nerfstudio 이미지 (COLMAP+gsplat 포함). 태그는 https://hub.docker.com/r/nerfstudio 확인
docker pull ghcr.io/nerfstudio-project/nerfstudio:latest

# 3) 작업 폴더 마운트해서 셸 진입 (영상을 이 폴더에 둔다)
mkdir -p ~/recon && cd ~/recon
docker run --gpus all -it --rm --shm-size=12gb \
  -v "$PWD":/workspace -w /workspace \
  ghcr.io/nerfstudio-project/nerfstudio:latest bash
```

```sh
# 4) 컨테이너 안에서 포장 누락 채우기 (멱등 — 컨테이너를 새로 띄우면 다시 실행)
bash /workspace/setup-container.sh
```

nerfstudio 이미지는 hloc 코드만 있고 실행 포장 4종이 비어 있다(2026-07-07 실측): SuperGlue
가중치 repo · wget(NetVLAD 다운로드) · hloc↔pycolmap `verify_matches` API 패치 · node(spz 압축).
`setup-container.sh`가 전부 처리한다. 가중치 repo는 `/workspace` 마운트에 남아 컨테이너가
죽어도 유지되고, 나머지 셋은 컨테이너 파일시스템이라 새 컨테이너마다 재실행이 필요하다.
셋업을 안 돌렸으면 `.spz` 변환만 호스트/웹앱에서 따로 할 수도 있다(아래).

> **native 설치가 필요하면**: conda(py3.10) + 박스 CUDA에 맞는 torch + `pip install nerfstudio` +
> `pip install gsplat` + COLMAP(apt). Docker보다 취약하니 첫 실행은 Docker 권장.

---

## 실행

```sh
# 컨테이너 안(또는 ns-*가 PATH에 있는 환경)에서:
bash /workspace/reconstruct.sh room1.mp4 room1 15000
#   $1 영상  $2 작업이름  $3 학습 iters(원룸 15k면 충분, 기본 30k는 ~2배)
#   FRAMES=300 환경변수로 키프레임 목표 수 조절
#   SFM_TOOL=hloc 로 SuperPoint+SuperGlue 포즈 추정(저텍스처 실험) — 같은 영상을
#   colmap 결과와 나란히 비교: SFM_TOOL=hloc bash reconstruct.sh room1.mp4 room1-hloc
```

단계별로 `runs/<name>/` 밑에 쌓인다: `proc/`(COLMAP) → `train/`(체크포인트) → `export/*.ply` → `<name>.spz`.

### .spz 변환만 따로 (node 있는 곳에서)

컨테이너에 node가 없으면 `.ply`를 호스트로 꺼내거나, 레포에서:

```sh
npx @playcanvas/splat-transform runs/room1/export/splat.ply --spz-version 3 apps/web/public/samples/room.spz
```

`@playcanvas/splat-transform`은 ④a 압축 벤치에서 검증된 그 툴이다(`compression-bench.README.md`).

> **`--spz-version 3` 필수**: 기본값(v4, 비압축 "NGSP" 컨테이너)은 뷰어(`@sparkjsdev/spark` 2.1.0 —
> gzip SPZ v1~3만 읽음, npm 최신이 이 버전이라 업그레이드 불가)가 "Invalid gzip header"로 거부한다.
> 실측(2026-07-07): splat-transform 2.1.0(.spz 지원 시작)~2.7.1(최신) 전 구간에서 이 플래그가
> gzip(1f8b) 출력을 낸다 — 버전 고정 불필요. Spark가 v4를 지원하게 되면 플래그 제거.

---

## 웹앱에 연결

```sh
# GPU 박스 → 로컬로 내려받기
scp ubuntu@<box>:~/recon/runs/room1/room1.spz apps/web/public/samples/room.spz
pnpm --filter web dev            # /splat-tour 새로고침
```

파일명을 `room.spz`로 유지하면 코드 수정이 없다. 새 이름을 쓰려면 `tour-viewer.tsx`의
`SPLAT_SRC`만 바꾸면 된다. 정합·미니맵·프리셋은 이미 이 splat 위에서 동작한다(③ 완료분).

---

## 테스트 입력 — 촬영 가이드 (2026-07-06 실측 반영)

첫 실측 결과: 흰 벽+반사 TV+무지 테이블 회의실 영상은 **매칭 방식과 무관하게 전멸**했다
(vocab_tree 22/102 → sequential 2/322 → exhaustive 2/150). COLMAP 포즈는 문턱 게이트라
특징점이 부족하면 설정으로 못 살린다. 촬영이 전부다:

- **텍스처 있는 물건이 항상 프레임에** — 가구·러그·책장·포스터. 흰 벽만 가득한 프레임 금지.
- **아주 천천히, 옆걸음 이동** — 1평 기준 2분+. 제자리 회전 금지(시차가 없으면 깊이도 없다).
- **조명 전부 켜기**, 반사면(TV·거울·통창)은 정면으로 오래 잡지 않기.
- 아이폰 설정→카메라→포맷 **"높은 호환성"**(H.264, HDR 끔). HDR(HLG)로 찍었으면
  로컬에서 톤매핑 후 전송(이번엔 ffmpeg zscale+hable로 해결했음).
- 스크립트가 포즈 매칭률 33% 미만이면 학습 전에 중단한다(포즈 게이트). 좋은 캡처는 80%+가 정상.

로컬 Scaniverse 비교 산출물(저장소 미포함, 가우시안 42만)은 ARKit/LiDAR로
포즈를 하드웨어에서 얻는다 — 나쁜 캡처 내성은 걔가 높고, 좋은 캡처의 렌더 품질은 오프라인 GPU 학습이 유리.

## Record3D 경로 (W1 — COLMAP 없는 파이프라인 검증)

포즈 실패의 진원지(COLMAP)를 우회하는 형제 스크립트: `reconstruct-record3d.sh`.
Record3D 앱(iPhone 12 Pro+, LiDAR)이 ARKit 포즈+LiDAR 깊이를 export하므로 SfM이 통째로 빠진다.
자세한 근거·전략은 Obsidian `룸로그_3D투어_캡처앱_빌드스펙_2026-07-08.md`.

```sh
# 폰: Record3D로 촬영(위 촬영 가이드 SOP 동일) → export 2종:
#   ① "EXR + JPG sequence"  ② "Point Cloud(PLY) sequence"(가우시안 init용, 강력 권장)
# 전송: AirDrop→Mac→croc→GPU 박스 (기존 관행)
bash reconstruct-record3d.sh r3d_export r3d_export_ply myroom 15000
```

- 포즈 게이트 불필요(센서 포즈라 ~100%). 대신 스크립트가 **P3 체크포인트**를 출력한다:
  transforms.json에 ply 초기화·depth_file_path가 실렸는지 — depth loss 감독(dn-splatter)
  필요 여부를 여기서 판정.
- `VOXEL` 환경변수로 LiDAR 점군 다운샘플 조절(기본 0.05m — 문서 기본 0.8은 원룸엔 과성김).
- 컨테이너는 동일 nerfstudio 이미지면 되고 COLMAP/hloc 셋업(setup-container.sh §1·§4) 불필요
  — node(§3)만 .spz 변환에 필요.

## 원격 GPU 잡 (`remote/`)

API 오케스트레이터는 AWS Systems Manager `AWS-RunShellScript` 명령에 아래 파일을 base64로
동봉한다. GPU 인스턴스의 NVMe와 Docker 이미지는 stop 때 사라질 수 있으므로 각 잡이
`bootstrap-nvme.sh`부터 실행한다. 런타임 파일은 원격 임시 디렉터리 한곳에 평탄화해서 둔다.

| 파일 | 역할 |
| --- | --- |
| `remote/bootstrap-nvme.sh` | Docker 대기, EBS tar 복원 또는 nerfstudio 1.1.3 pull, NVMe 잡 루트 준비 |
| `remote/gpu-job.sh` | 다운로드, 분기별 재구성, SPZ 검증·콜백·정리 |
| `record3d_pointinit.py`, `cull_floaters.py` | Record3D 변환과 floater 제거 |
| `reconstruct.sh` | video → COLMAP → splatfacto → SPZ 기존 경로 |

`gpu-job.sh`는 위 런타임 파일들이 자기와 **같은 디렉터리**에 있다고 가정한다. API는 파일
내용을 각각 base64로 인코딩해 원격 임시 디렉터리에 복원한 뒤 `bash gpu-job.sh`를 호출한다.
SSM 명령 전체가 100KB 제한 안에 남도록 RUNBOOK·README·setup 스크립트는 잡 페이로드에
넣지 않는다. `setup-container.sh`의 Node 20 설치 단계는 `gpu-job.sh`가 필요한 경우에만 수행한다.

### 환경변수 계약

| 변수 | 필수 | 기본값 | 의미 |
| --- | --- | --- | --- |
| `ASSET_ID` | 예 | 없음 | 잡·콜백 식별자. 영문자/숫자/`.`/`_`/`-`, 최대 128자 |
| `SOURCE_URL` | 예 | 없음 | 공개 접근 가능한 `http` 또는 `https` 입력 URL |
| `SOURCE_KIND` | 예 | 없음 | `record3d-zip` 또는 `video` |
| `CALLBACK_BASE` | 예 | 없음 | API origin. 예: `https://api.woo-zu.com` |
| `WORKER_SECRET` | 예 | 없음 | 두 콜백의 `x-worker-secret` 헤더 값 |
| `ITERS` | 아니요 | `30000` | splatfacto 최대 iteration 수 |
| `GPU_IMAGE_TAR` | 아니요 | `/home/ssm-user/recon-capture.tar` | EBS의 `roomlog/recon:capture` 이미지 tar 우선 후보 |

### 콜백과 종료 의미

- 성공: `POST {CALLBACK_BASE}/splat-assets/{ASSET_ID}/reconstruction/complete`, multipart 필드
  `file`에 `{ASSET_ID}.spz`를 업로드한다. HTTP 실패는 잡 실패로 전환된다.
- 실패: `POST {CALLBACK_BASE}/splat-assets/{ASSET_ID}/reconstruction/failure`, JSON
  `{"error":"단계명, 실패 명령, 로그 마지막 2KB"}`를 보낸다. 콜백 전송 자체는 15초로 제한하며
  실패해도 원래 잡 종료를 가리지 않는다.
- 성공·실패 모두 `/opt/dlami/nvme/jobs/{ASSET_ID}`를 삭제한다. 실패 로그만 EBS
  `/home/ssm-user/job-{ASSET_ID}.log`에 남긴다.
- 컨테이너에서 `pip install numpy` 또는 `pip install gsplat`은 금지다. upstream fallback에는
  `build-essential`과 `python3-dev`만 잡 컨테이너 시작 시 보충한다.

## 이 런북이 아직 안 하는 것 (후속)

- **① 키프레임 지능 선택**: 지금은 `ns-process-data`의 균등 샘플링. 블러(라플라시안 분산)·시차 기반
  선별은 미적용. 우리 `capture-validate.ts`(②)는 **업로드 사전 게이트**(흰벽·저조도·제자리회전 반려)라
  역할이 다르다 — 재구성 전에 붙일 자리이지 여기 파이프라인 안이 아니다.
- **⑤ 잡 큐 자동화**: 업로드→큐→GPU 워커→콜백은 범위 밖(데모 이후). 지금은 수동 실행.
- **프리미엄(ArtiFixer)**: 별개 경로. 입력이 spz가 아니라 COLMAP 장면(원본 프레임+포즈)이라
  위 `proc/`가 그 입력을 겸한다. `docs/remote-3d-tour.md` §10·§11 참고.
