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

컨테이너 안에는 node가 없을 수 있다 → `.ply`까지만 만들고 `.spz` 변환은 호스트/웹앱에서(아래).

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

Scaniverse 산출물(참고 기준: `apps/web/public/samples/ms_home.spz`, 가우시안 42만)은 ARKit/LiDAR로
포즈를 하드웨어에서 얻는다 — 나쁜 캡처 내성은 걔가 높고, 좋은 캡처의 렌더 품질은 오프라인 GPU 학습이 유리.

## 이 런북이 아직 안 하는 것 (후속)

- **① 키프레임 지능 선택**: 지금은 `ns-process-data`의 균등 샘플링. 블러(라플라시안 분산)·시차 기반
  선별은 미적용. 우리 `capture-validate.ts`(②)는 **업로드 사전 게이트**(흰벽·저조도·제자리회전 반려)라
  역할이 다르다 — 재구성 전에 붙일 자리이지 여기 파이프라인 안이 아니다.
- **⑤ 잡 큐 자동화**: 업로드→큐→GPU 워커→콜백은 범위 밖(데모 이후). 지금은 수동 실행.
- **프리미엄(ArtiFixer)**: 별개 경로. 입력이 spz가 아니라 COLMAP 장면(원본 프레임+포즈)이라
  위 `proc/`가 그 입력을 겸한다. `docs/remote-3d-tour.md` §10·§11 참고.
