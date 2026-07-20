# USDZ→GLB 변환 워커 (mesh-worker)

임차인이 iOS Object Capture로 가구를 스캔하면 USDZ가 S3로 직행 업로드된다(`apps/api/src/tenant-furniture/`,
C-2). 웹 뷰어(three.js)는 USDZ를 못 읽으므로 GLB로 변환해야 하고, 그 변환을 맡는 게 이 문서가 다루는
`services/mesh-worker/`다.

**상태(2026-07-21)**: HTTP·SSM 디스패치와 **SSM 자가 복구 코드 완성** + API 단위검증
44/44·mesh-worker 스케일 회귀검증 4/4 통과 + **GPU EC2에서 Blender 실물 변환 검증 완료** +
**`ensure-worker.sh`·`cli.mjs`를 실제 GPU 박스에서 처음 실행해 파이프라인 전체(다운로드→변환→업로드
시도→콜백)가 exit 0으로 도달하는 것까지 확인**. 실제 배치는 **GPU EC2 + SSM 디스패치**로 결정했고,
`docker-compose.prod.yml`의 `MESH_WORKER_DISPATCH` 기본값을 `ssm`으로 바꿔 배포만 되면 바로 켜지게
했다(`PROD_ENV` 편집 불필요 — `GPU_KEEP_WARM`과 같은 패턴).

Blender 4.2.22 LTS의 헤드리스 실행과 Python API 호환을 확인했고, 프로덕션에 업로드된 실제 Object
Capture USDZ 2건이 모두 GLB로 변환됐다. import bbox와 export extent도 소수점 6~7자리까지 일치했다.

**아직 확인하지 않은 것**: 실제 AWS SSM `SendCommand`로 api가 박스에 명령을 전달하는 경로(이번엔
cli.mjs를 SSM 대신 손으로 직접 실행했다), 진짜 S3 presigned PUT·CORS(로컬 가짜 서버로 대체 검증),
진짜 `GPU_WORKER_SECRET`으로의 콜백 인증, 텍스처·머티리얼 보존, NVMe가 진짜로 초기화된 뒤의 재빌드
타이밍(이번 재빌드 7.6초는 buildkit 캐시가 남아있던 상태 — 콜드 재빌드는 여전히 86초대로 추정만
한다). 아래 "배포 전 반드시 확인"의 미체크 항목을 닫기 전엔 프로덕션에서 이 경로에 의존하지 말 것.

---

## 배치 결정 — GPU 박스 + SSM (성능 때문이 아님)

USDZ→GLB는 렌더링 없는 순수 CPU 포맷 변환이다. 실물 검증에서도 한 건의 USD import와 glTF export가
약 0.2초였으므로 앱 EC2에서 돌려도 성능은 충분하다. 그런데 앱 EC2에 새 상시 컨테이너를 추가하려면
별도 인프라 담당자의 작업이 필요하고, GPU 박스(`i-061e16af461c7c5df`, us-east-1)는 팀이 직접 통제할
수 있다. 배포·로그 확인·재빌드를 같은 팀 안에서 빠르게 반복할 수 있다는 **조직적 이유**로 실제 배치를
GPU 박스로 정했다. GPU 연산을 쓰려고 고른 호스트가 아니다.

앱 EC2(ap-northeast-2)와 GPU 박스는 리전과 VPC가 달라 현재 사설망을 쓸 수 없다. HTTP로 직접
호출하려면 GPU 박스 보안그룹에 공개 인바운드 포트를 열어야 하고, 그 변경 역시 인프라 담당자의 권한이
필요하다. 대신 `apps/api/src/reconstruction/`이 같은 박스에 이미 사용하고 검증한 SSM
`SendCommand` 경로를 재사용한다. SSM 에이전트가 AWS 쪽으로 나가 명령을 받아오는 pull 모델이라 GPU
박스 인바운드 포트는 **0개**다. 완료·실패 콜백도 워커가 API로 보내는 아웃바운드 요청이라 인바운드
개방이 필요 없다.

기존 HTTP 구현은 지우지 않는다. 나중에 mesh-worker를 앱 EC2의 docker-compose로 옮기면 compose 내부
DNS를 쓰는 HTTP가 다시 가장 단순한 경로다. 디스패치 방식만 환경변수로 바꾸도록 두 구현을 함께 둔다.

## 왜 Blender headless인가

검토한 대안:

| 도구 | 판단 |
|---|---|
| **Blender `--background --python`** | **채택.** USD 임포터가 내장(자체 번들 `libusd_ms.so`, 시스템 pxr 불필요) — Apple RealityKit/ARKit이 만든 USDZ에 대한 실전 검증이 가장 많다. glTF 익스포터가 Khronos 공식 레퍼런스 구현 중 하나로 유지보수가 가장 활발하다. 컨테이너 설치 비용(~350MB tar.xz + X11 계열 공유 라이브러리 몇 개)은 있지만 GPU 인스턴스 비용에 비하면 무시할 수준. |
| `usd-core`(pip) + `usd2gltf`(kcoley) | pxr Python 바인딩만으로 Blender 없이 변환 가능해 이미지가 더 가벼워질 수 있었으나, `usd2gltf`는 개인 유지보수 프로젝트라 최신 USDZ 변형에 대한 실전 검증이 Blender만큼 넓지 않다고 판단해 기각. |
| `usdcat`/`usdzip` 등 USD CLI | 포맷 변환기가 아니라 검사·압축 도구 — glTF를 못 만든다. (참고용으로만 씀, 아래 검증 섹션.) |

## 아키텍처 — SSM 디스패치 + S3 직행 원칙

```
tenant-furniture.service.ts (queueMeshConversion)
  → storageAdapter.presignUpload()로 GLB 업로드용 presigned PUT 미리 발급
  → mesh-conversion-dispatcher.ts
       ├─ MESH_WORKER_DISPATCH=ssm
       │    └─ SSM SendCommand (AWS-RunShellScript, 결과 폴링 없음)
       │         └─ GPU 박스의 SSM agent
       │              └─ EBS flock + 인라인 레포 clone/fetch/reset
       │                   └─ services/mesh-worker/remote/ensure-worker.sh
       │                        ├─ 레포 동기화
       │                        ├─ bootstrap-nvme.sh로 NVMe 런타임 복구
       │                        ├─ mesh-worker:test 확인, 없을 때만 빌드
       │                        └─ <b64> | docker run ... /app/cli.mjs ──────┐
       └─ 그 외 + MESH_WORKER_URL 설정                                      │
            └─ HTTP POST mesh-worker:5001/convert (202=접수, server.mjs) ───┤
                                                                            └─ runConversionJob(convert.mjs)
                                                                                 → usdzUrl에서 직접 pull (S3 공개 URL, GET)
                                                                                 → Blender headless로 GLB 변환
                                                                                 → 스케일 검증 (import bbox ↔ export bbox, ±5%)
                                                                                 → presigned URL로 GLB를 S3에 직접 PUT
                                                                                 → 결과 URL만 API에 콜백
```

서버(api)는 메타데이터(presigned URL 발급, 상태 전이)만 다루고 GLB 바이트 자체는 절대 api 프로세스를
거치지 않는다 — "S3=벌크 버스, 서버=두뇌" 원칙(reconstruction 모듈과 동일). SSM은 CommandId가
돌아오면 접수된 것으로 보고 끝내며 실행 결과를 폴링하지 않는다. HTTP가 202만 받고 끝내던 것과 같은
비동기 모델이고, 최종 상태는 워커 콜백으로 전이한다. 준비 단계가 실패하면 EXIT trap이 실패 콜백을
시도한 뒤 원래 non-zero로 끝나며 변환 컨테이너는 실행하지 않는다. 콜백이 API에 도달하면
`meshJobState=FAILED`로 전이하지만, 네트워크 문제로 실패 콜백까지 전달되지 않으면 결과를 폴링하지 않는
현재 모델상 `CONVERTING`에 남을 수 있다.

## 파일 맵

- `apps/api/src/tenant-furniture/mesh-conversion-dispatcher.ts` — 디스패치 포트(인터페이스) + SSM·HTTP
  구현 + env 미설정 시 즉시 실패하는 널 구현. `TenantFurnitureService`가 이 인터페이스에만 의존해
  테스트가 진짜 워커 없이도 가능하다(`tenant-furniture.spec.ts`의 `queueMeshConversion dispatch`
  describe 블록).
- `services/mesh-worker/server.mjs` — `POST /convert`(잡 접수) · `GET /healthz`. 프레임워크 없이 plain
  `node:http` — 엔드포인트 2개짜리 서비스에 Express/Nest는 과하다고 판단.
- `services/mesh-worker/cli.mjs` — stdin의 잡 JSON 한 건을 받아 `runConversionJob`을 실행하는 SSM용
  일회성 진입점. 기본 컨테이너 CMD는 여전히 `server.mjs`이고 SSM 명령에서만 명시적으로 고른다.
- `services/mesh-worker/remote/ensure-worker.sh` — EBS 잠금으로 동시 준비를 직렬화하고, 레포
  clone/fetch/reset→기존 `bootstrap-nvme.sh` 호출→`mesh-worker:test` 확인/필요 시 빌드를 수행하는
  멱등 자가 복구 스크립트. Docker 명령과 bootstrap 호출에는 무한 대기 방지 timeout을 둔다.
- `services/mesh-worker/convert.mjs` — 잡 1건의 파이프라인(다운로드→변환→검증→업로드→콜백), 실패
  경로 전담.
- `services/mesh-worker/gltf-bbox.mjs` — GLB 컨테이너에서 라이브러리 없이 바운딩박스만 뽑는 최소 파서.
- `services/mesh-worker/blender/usdz_to_glb.py` — 실제 변환 로직(Blender Python API).
- `services/mesh-worker/Dockerfile` — Debian bookworm-slim + Blender 4.2 LTS + Node 20.

`services/`(pnpm workspace 밖, `services/mitunet`와 동일 관례)에 둔 이유: `apps/*`/`packages/*`만
pnpm-workspace.yaml 글롭에 걸린다 — mesh-worker를 워크스페이스 멤버로 넣으면 의존성이 하나도 없는데도
`pnpm-lock.yaml` 재생성이 필요해져 기존 `--frozen-lockfile` 빌드가 깨진다. mesh-worker는 Node 내장
기능(fetch·http·child_process)만 쓰므로 워크스페이스에 낄 이유도 없다.

## 환경변수

GPU_* 계열과 동일하게 `.env.example`엔 올리지 않았다(둘 다 PROD_ENV의 배포 시크릿 — 로컬 `.env`
문서화 대상이 아니라는 기존 관례를 따름). `docker-compose.yml`/`docker-compose.prod.yml`에 직접 박혀
있다.

| 변수 | 어디서 읽나 | 의미 |
|---|---|---|
| `MESH_WORKER_DISPATCH` | api | `ssm`이면 GPU 박스에 SSM으로 디스패치. 기본값은 비어 있으며, 이때 `MESH_WORKER_URL`이 있으면 기존 HTTP 경로를 쓴다. |
| `GPU_INSTANCE_ID` | api | SSM 명령을 받을 GPU EC2 ID. reconstruction과 같은 변수를 재사용한다. |
| `GPU_REGION` | api | GPU EC2/SSM 리전. 스토리지 리전과 다르므로 `AWS_REGION`으로 폴백하지 않는다. |
| `MESH_WORKER_BRANCH` | api → SSM | 원격 레포를 맞출 브랜치. 비어 있으면 `main`. 디스패처의 인라인 부트스트랩과 `ensure-worker.sh`가 같은 값을 쓴다. |
| `MESH_WORKER_URL` | api | HTTP 구현의 mesh-worker base URL(`http://mesh-worker:5001`). SSM을 고르지 않았고 이 값도 비어 있으면 `queueMeshConversion`이 dispatch() 호출 즉시 실패 → FAILED. |
| `PUBLIC_API_BASE_URL` | api | reconstruction과 공유. mesh-worker가 콜백을 보낼 API 주소 계산에 쓰인다. |
| `GPU_WORKER_SECRET` | api + mesh-worker | 콜백(`x-worker-secret`) 인증. **reconstruction과 동일 시크릿을 공유한다** — 새 시크릿을 안 만든 이유: 이미 완성돼 있던 `tenant-furniture.controller.ts`의 콜백 게이트(`requireWorkerSecret`)가 이 변수를 그대로 쓰고 있었다(내가 바꾼 게 아니라 받은 계약). mesh-worker의 `/convert` 인바운드 인증도 같은 값을 재사용한다(`MESH_WORKER_ACCEPT_SECRET`로 오버라이드 가능). |
| `BLENDER_BIN` | mesh-worker | 기본 `/opt/blender/blender`(Dockerfile이 심음). 로컬 macOS에서 워커를 직접 띄워 테스트할 땐 `brew install --cask blender` 후 `/Applications/Blender.app/Contents/MacOS/Blender`로 오버라이드. |
| `BLENDER_TIMEOUT_MS` | mesh-worker | Blender 프로세스 상한(기본 5분). 가구 하나 변환치고 넉넉하지만 최초 배포 후 실측해 조정. |

`MESH_WORKER_DISPATCH=ssm`을 골랐는데 `GPU_INSTANCE_ID`, `GPU_REGION`, `PUBLIC_API_BASE_URL`,
`GPU_WORKER_SECRET` 중 하나라도 비어 있으면 HTTP로 몰래 폴백하지 않고 미설정 디스패처가 빠진 변수
이름을 담아 실패시킨다. SSM을 고르지 않은 경우에만 `MESH_WORKER_URL`로 기존 HTTP 구현을 선택한다.

## 로컬 dev에서는 왜 안 되나

`docker compose up`(로컬)은 `S3_UPLOADS_ENABLED`가 기본 꺼짐 → `storageAdapter.presignUpload`가
없음 → `dispatchMeshConversion`이 "GLB 업로드를 위해 S3 저장소가 필요합니다"로 즉시 실패한다. 이건
새로 생긴 제약이 아니라 Object Capture 업로드(C-2) 자체가 이미 그렇다(`presignObjectCapture`가 로컬에선
`{mode:"multipart"}`만 돌려주고 멀티파트 폴백을 구현하지 않는다). 로컬에서 mesh-worker 자체(Blender
변환 로직)만 확인하려면 `.env`에 S3 값을 채우거나, `services/mesh-worker`를 단독 실행해 `/convert`를
수동 curl로 찔러보는 쪽이 현실적이다(아래 참고).

여기서 **워커 실행에 S3 IAM 권한이 필요하다고 오해하면 안 된다.** 워커는 S3 SDK를 쓰지 않는다.
`convert.mjs`의 `downloadUsdz`는 자격증명 없는 평범한 `fetch(usdzUrl)`이고, 그 URL은
`tenant-furniture.service.ts`가 `storageAdapter.publicUrl()`로 만든 공개 URL이다. 따라서 워커에는
`s3:GetObject`나 `s3:ListBucket` 권한이 필요하지 않다. 실제로 2026-07-20 검증 때 IAM 사용자와 EC2
인스턴스 역할 양쪽 모두 해당 버킷에 `s3:ListBucket`이 없었지만 변환에는 아무 지장이 없었다. 필요한
것은 권한이 아니라 URL이며, `GET /api/tenant-furniture`가 `usdzUrl`을 돌려준다. GLB **업로드**는 API가
발급한 presigned PUT을 쓰므로 별개다.

## 프로덕션 배치와 전환 방법

**`.github/workflows/deploy.yml`은 mesh-worker를 배포하지 않는다.** 배포 워크플로는 서비스명을 다음처럼
손으로 나열한다.

```bash
compose -f docker-compose.prod.yml build web api
compose -f docker-compose.prod.yml up -d --no-build --remove-orphans api web
```

mesh-worker는 `docker-compose.yml`과 `docker-compose.prod.yml` 양쪽에 정의돼 있지만 이 목록에는 없다.
2026-07-20 운영 확인 기준으로 **프로덕션에 한 번도 뜬 적이 없었다.** 그 결과 가구 USDZ 업로드는
성공해도 `queueMeshConversion`의 디스패치가 실패한다. 이 예외는 `warn` 로그를 남긴 뒤
`meshJobState=FAILED`로 변환되며 업로드 요청 자체는 실패시키지 않아서, 실제 앱 화면에서는 업로드가
정상으로 보였다. 같은 날 프로덕션 데이터에서도 데모 세입자 가구 중 USDZ가 붙은 2건이
`meshJobState=FAILED`·`meshUrl=null`인 것을 확인했다.

지금 결정한 **GPU 박스 + SSM** 경로에서는 `deploy.yml`이 GPU 박스에 컨테이너를 상시 서비스로 띄울
필요가 없다. API가 `SendCommand`로 기존 `GPU_INSTANCE_ID`·`GPU_REGION`의 박스에 일회성 컨테이너를
실행한다. SSM 명령이 최소 인라인 부트스트랩으로 레포를 확보한 뒤 `ensure-worker.sh`에 NVMe 복구와
이미지 확보를 위임하므로 사람이 매번 다시 클론·빌드할 필요는 없다. **이번 작업에서는 이 자가 복구와
SSM 경로를 실제 박스에 배포하거나 실행하지 않았다.** 가짜 SSM 클라이언트 기반 단위검증을 통과했어도
실제 IAM 권한, SSM 연결 상태, 원격 Docker 복구, GLB PUT·콜백 성공을 대신 증명하지 않는다.

나중에 앱 EC2로 되돌릴 때는 HTTP 구현을 그대로 쓴다. `MESH_WORKER_DISPATCH`를 비우고
`MESH_WORKER_URL=http://mesh-worker:5001`을 설정하면 디스패처 코드 변경은 필요 없다. 앱 EC2에 실제
컨테이너를 함께 올리는 운영 배선으로 바꾼다면 그때 `deploy.yml`의 `build`·`up` 서비스 목록에는
`mesh-worker`를 추가해야 한다.

## SSM 배치의 트레이드오프

- **상시 가동 비용.** 현재 `GPU_KEEP_WARM=1`이 계속 켜져 있어 GPU 박스 비용은 그대로다. 데모 기간에는
  어차피 켜 둘 계획이라 mesh-worker를 얹는 한계비용은 0이지만, 장기 운영으로 넘어가면 GPU 인스턴스
  비용을 다시 검토해야 한다.
- **stop/start 뒤 자가 복구.** stop하면 NVMe의 containerd/Docker 데이터와 `mesh-worker:test` 이미지는
  사라지지만, 박스가 다시 켜져 SSM online이 된 뒤의 다음 변환은 레포 확보→NVMe 재초기화→이미지
  재빌드→변환 순서로 알아서 복구한다. `/home/ubuntu/roomlog` 레포는 EBS에 남을 수 있고, 없을 때만
  다시 클론한다. stop 뒤 첫 변환에서 **mesh-worker 이미지 재빌드만 약 90초**(실측 86초) 추가되며,
  정상 상태의 추가 지연은 재빌드 없이 Git 동기화와 멱등 상태 확인을 하는 수준이다. reconstruction
  이미지 복원까지 필요한 경우 전체 첫 변환 지연은 90초보다 길 수 있고, 전체 cold self-heal은 아직
  실측하지 않았다. 따라서 `GPU_KEEP_WARM=1`은 더 이상 이미지·레포 보존 정확성의 전제가 아니라 cold
  start를 피하는 **속도 최적화**다. 다만 자동 기동이 없는 현재 구조에서는 즉시 가용성에도 영향을 준다.
  지금은 여전히 켜져 있고, 끄는 결정은 별도다.
- **stopped 인스턴스 자동 기동은 없다.** 인스턴스가 stopped면 SSM 자체가 닿지 않으므로 자가 복구는
  "박스가 켜져 있다"를 전제로 한다. 디스패처가 `startInstance()` 후 SSM online을 기다리게 하는 것은
  이번 범위가 아니다. 후속으로 붙이면 idle-stop을 되살려 비용을 낮출 수 있지만 첫 변환에 인스턴스
  부팅 3~5분이 붙는다. 약 0.2초짜리 변환에 이 지연을 붙이는 건 현재 데모에는 맞지 않는다고 판단했다.
- **SSM 명령 이력에 잡 시크릿이 남는다.** 셸 특수문자 사고를 막으려고 잡 JSON을 base64로 넣지만
  암호화나 비밀 은닉 수단은 아니다. SSM 명령 이력을 조회할 수 있는 사람은 문자열을 디코딩해 짧은
  만료의 GLB presigned 업로드 URL과 `GPU_WORKER_SECRET`을 볼 수 있다. 준비 실패 콜백용 헤더에도 같은
  시크릿이 SSM 명령 문자열에 직접 들어간다. 이 노출 범위를 인지하고 SSM 이력 접근권한을 관리해야
  한다. 다만 GPU 박스의 공개 주소로 직접 호출하는 HTTP 경로는 공개 인터넷의 평문 HTTP로 같은
  시크릿을 보내므로 현재 네트워크 조건에서는 더 나쁘다.

## 자가 복구 순서와 남은 전제조건

SSM 명령은 EBS의 `/home/ubuntu/.roomlog-mesh-worker.lock`을 잡은 뒤 다음 순서로 준비한다.

1. `/home/ubuntu/roomlog`가 없으면 공개 GitHub 레포를 clone하고, 있으면 `MESH_WORKER_BRANCH`(기본
   `main`)를 fetch한 뒤 `reset --hard`한다. 이 최소 단계가 레포 안의 준비 스크립트를 먼저 확보해
   닭과 달걀을 끊는다. `ensure-worker.sh`에서도 같은 동기화를 다시 확인한다.
2. 기존 `scripts/reconstruct/remote/bootstrap-nvme.sh`를 호출해 stop 뒤 stale NVMe containerd/Docker
   상태를 재초기화한다. 해당 로직을 mesh-worker 쪽에 복사하지 않는다.
3. `docker image inspect mesh-worker:test`가 성공하면 건너뛰고, 없을 때만 레포 루트에서 이미지를
   빌드한다. 준비가 실패하면 실패 콜백을 시도한 뒤 non-zero로 종료해 변환을 실행하지 않는다.
4. 준비가 끝난 뒤에만 일회성 CLI 컨테이너로 변환을 시작한다.

핵심 인스턴스 수명주기 전제는 **인스턴스가 실행 중이고 SSM managed instance로 online**이어야 한다는
것이다. 그 밖에도 SSM 명령의 root 권한, `git`·`flock`·`runuser`·`timeout`·`curl`·`base64`, GitHub와
이미지 빌드용 outbound network, 정상 NVMe mount와 systemd/Docker가 필요하다.
2026-07-20 같은 GPU EC2에서 Dockerfile 이미지를 빌드했을 때는 **86초·656MB**였다. 이 수치는 해당
시점의 관측값이지 항상 보장되는 SLA가 아니다.

**2026-07-20/21 후속: `ensure-worker.sh`·`cli.mjs`를 실제 GPU 박스에서 처음으로 돌려봤다.** 레포를
`kjw-mesh-worker-verified`로 갱신한 뒤 두 경로 모두 확인:
- **건너뛰기 경로**(이미지 있음): 성공, 0.32초.
- **재빌드 경로**(`docker rmi` 후): 성공, **7.6초** — 다만 이건 이미지만 지운 것이고 **buildkit 캐시는
  NVMe에 그대로 남아 있었다.** `docker data-root`가 `bootstrap-nvme.sh`와 같은 `/opt/dlami/nvme`에
  있으므로, 진짜 stop이 일어나면 캐시까지 같이 초기화된다 — **그 경우 재빌드는 여전히 86초대일 것으로
  본다(미검증).** 이번 테스트가 증명한 건 "재빌드 로직이 실제로 도는가"이지 "stop 후 몇 초 걸리는가"는
  아니다.
- `cli.mjs`를 `docker run --rm -i --entrypoint node mesh-worker:test /app/cli.mjs`로 직접 실행,
  프로덕션 실물 USDZ를 입력으로, 콜백·GLB 업로드는 로컬 가짜 서버로 향하게 해 격리했다. **다운로드 →
  Blender 변환 → PUT 업로드 → 성공 콜백까지 exit 0으로 끝까지 도달**했다(가짜 서버 로그에 `PUT
  /fake-upload: 6323388 bytes received`, `CALLBACK POST .../mesh-conversion/complete:
  {"glbUrl":"..."}`가 정확한 형태로 찍혔다).
- 이 테스트는 **SSM `SendCommand` 자체는 검증하지 않았다** — cli.mjs를 SSM이 실행할 것과 동일한 방식
  (같은 컨테이너·같은 진입점)으로 직접 실행했을 뿐, api가 실제 AWS 자격증명으로 그 명령을 박스까지
  전달하는 경로는 아직 아무도 눌러보지 않았다.
- 부수 발견(코드 버그 아님): 수동 검증 중 root 권한으로 git을 직접 조작해 `.git` 소유권이
  `root:root`로 바뀌어 `ensure-worker.sh`(ubuntu 유저로 git 실행)가 실패한 적이 있었다 — 이 스크립트
  가 아니라 수동 테스트 명령이 원인이었고, SSM 인라인 부트스트랩은 항상 `runuser -u ubuntu`를 쓰므로
  실제 프로덕션 경로에서는 재현되지 않는다. 다만 이 박스에서 사람이 직접 git을 root로 만지면 다음
  자동 실행이 깨질 수 있다는 운영상 주의점으로 남긴다.

## 배포 전 반드시 확인 (사람 손 TODO)

- [x] **기존 Dockerfile 빌드가 실제로 성공하는가.** ✅ **CLI 추가 전 리비전에서 확인됨(2026-07-20).** GPU EC2
  `i-061e16af461c7c5df`(g6.2xlarge, us-east-1)에서 `mesh-worker:test` 이미지 생성 완료, **86초·656MB**.
  Blender tar.xz(334MB)는 약 216MB/s로 받아 이미지 빌드가 병목이 아니었다. 기존의 "20분 이상"은
  macOS Docker Desktop에서 빌드한 값이다. 즉 같은 Dockerfile도 어디서 빌드하느냐에 따라 20분 이상과
  86초로 크게 달라진다. apt 패키지 이름은 Debian 버전이 바뀌면 달라질 수 있다(`libgl1` 계열이 특히
  자주 바뀜).
- [x] **Blender가 headless로 실제 실행되는가.** ✅ **확인됨(2026-07-20).** 같은 GPU EC2 컨테이너에서
  `Blender 4.2.22 LTS (hash 88937221abfc built 2026-06-23 01:31:10)`가 헤드리스로 실행됐다. 공유
  라이브러리 누락은 없었다.
- [x] **usdz_to_glb.py의 Blender API가 설치된 버전과 맞는가.** ✅ **확인됨(2026-07-20).**
  `bpy.ops.wm.usd_import`·`export_scene.gltf` 파라미터가 Blender 4.2.22와 맞았고, 프로덕션의 실제
  Object Capture USDZ 2건이 스크립트 수정 없이 모두 통과했다.
- [x] **변환 전후 스케일과 미터 단위 자릿수가 보존되는가.** ✅ **확인됨(2026-07-20).** 두 샘플의
  import bbox와 export extent가 소수점 6~7자리까지 일치했다. 산출 extent는 각각
  **0.7082 × 0.6085 × 0.9855 m**, **0.6031 × 1.5434 × 0.7490 m**였다. 앱의 RoomPlan 감지 높이
  0.966m·0.762m와 대응 축을 비교하면 약 2% 차이지만, RoomPlan 값은 Object Capture 실측 정답이 아니다.
  이 검증의 판정 기준은 미터급이라는 자릿수가 맞고 1,000배 어긋나지 않았는지였으며 그 기준을 통과했다.
  따라서 이는 **변환 전후 스케일 무손실과 단위 자릿수**의 근거이지, 물체의 절대 실측 정확도를 증명하는
  줄자 대조는 아니다.
- [ ] **텍스처·머티리얼이 보존되는가.** 이번 격리 변환에서는 결과물의 텍스처·머티리얼과 웹 뷰어의
  시각적 형태를 확인하지 않았다.
- [ ] **S3 버킷 CORS.** GLB presigned PUT은 Object Capture USDZ 업로드와 같은 버킷·같은 CORS 설정을
  공유한다(`docs/splat-direct-upload.md`, `woozu-static-file` 버킷 — 이미 CORS 이슈가 있었던 이력 있음,
  `splat-register-black-box-cors` 메모리 참고). 2026-07-20/21 GPU 박스 실행에서 다운로드→변환→PUT
  시도→콜백까지 **파이프라인 순서 자체**는 확인했지만, PUT 대상이 실제 S3가 아니라 로컬 가짜
  서버였다 — **실제 S3 presigned URL·CORS 헤더는 이번에도 타지 않았다.**
- [ ] **GPU_WORKER_SECRET을 실제 값으로 교체.** 로컬 compose 기본값(`roomlog-local-worker-secret`)은
  프로덕션에 절대 쓰지 말 것. 아직 교체하지 않았다.
- [x] **mesh-worker의 프로덕션 배치 위치를 정한다.** ✅ **GPU 박스 + SSM으로 결정(2026-07-20).**
  성능이 아니라 팀이 직접 통제할 수 있는 박스에서 배포 반복 속도를 높이기 위한 선택이다.
- [x] **자가 복구를 실제 GPU 박스에서 부분 검증한다.** ✅ **부분 확인됨(2026-07-20/21).** 건너뛰기
  경로·재빌드 경로 둘 다 실제 root 권한으로 실행해 성공했다. **다만 진짜 stop/start(NVMe 완전
  초기화)는 아직 아무도 재현하지 않았다** — 이번 재빌드는 이미지만 지운 상태였고 buildkit 캐시가
  남아 있어 7.6초였다. stop 후 캐시까지 사라진 진짜 콜드 재빌드는 여전히 미검증이며, 원래 실측한
  86초가 그 경우의 근거값이다.
- [x] **SSM이 실행할 컨테이너 호출을 실제 박스에서 검증한다.** ✅ **확인됨(2026-07-20/21).** `cli.mjs`를
  SSM이 쓸 것과 동일한 `docker run --entrypoint node mesh-worker:test /app/cli.mjs` 형태로 직접
  실행, 프로덕션 실물 USDZ로 다운로드→Blender 변환→PUT→성공 콜백까지 exit 0 도달(콜백·업로드는 로컬
  가짜 서버로 격리). **다만 AWS SSM `SendCommand` 자체, 즉 api가 실제 자격증명으로 이 박스에 명령을
  전달하는 경로는 검증하지 않았다** — 이건 prod 배포 후에만 확인 가능하다.

### 검증 로그(이 작업 중 실행한 것)

- **GPU 박스 실물 실행 — 부분 완료(2026-07-20/21).** 위 체크리스트 두 항목 참고. `ensure-worker.sh`
  건너뛰기·재빌드 경로와 `cli.mjs`의 전체 변환 파이프라인은 실제 root 권한·실제 컨테이너로 실행해
  확인했다. **여전히 미실행인 것**: 진짜 NVMe 콜드 상태에서의 재빌드 타이밍, AWS SSM `SendCommand`를
  통한 실제 디스패치, 실제 S3 presigned PUT·CORS, 실제 `GPU_WORKER_SECRET`으로의 콜백 인증.
- `services/mesh-worker/remote/ensure-worker.sh`: `bash -n` 통과. **2026-07-20/21 GPU 박스에서 실제
  root 권한으로 건너뛰기·재빌드 경로 둘 다 실행해 확인**(위 검증 로그 참고) — 로컬 문법 검사에서 더
  나갔다.
- `apps/api`: 빌드 통과. `node --test -r ts-node/register src/tenant-furniture/*.spec.ts` **44개 전부
  통과**. SSM 테스트는 가짜 클라이언트로 인스턴스 ID·base64 잡 원문·레포 부트스트랩·flock·준비
  스크립트 선행·준비 실패 콜백 명령 포함·SendCommand 실패 전파·팩토리 분기를 확인했고, 기존 HTTP
  200/4xx/5xx·네트워크 오류 테스트도 그대로 통과했다.
- `services/mesh-worker`: Node 문법 검사와 `node --test services/mesh-worker/*.test.mjs` **8개 전부
  통과**. CLI의 성공 exit 0·실패 exit 1·잘못된 stdin, 기존 스케일 4건, 변환 실패 콜백이 정확히 한 번
  전송되는 경로를 가짜 입출력으로 확인했다. **실제 Blender 성공 잡과 GPU 박스 컨테이너 실행도
  2026-07-20/21에 별도로 확인했다**(위 검증 로그 참고) — 이 유닛 테스트는 그와 무관하게 로컬에서
  가짜 입출력으로만 돈다.
- `scripts/verify.sh`: types·ui typecheck와 web·api 빌드는 통과했다. 마지막 API 스모크는 이 실행 환경이
  `0.0.0.0:4000` listen을 `EPERM`으로 막아 health/listings/login 확인을 수행하지 못했고 스크립트 전체는
  exit 1이었다. 애플리케이션은 listen 직전까지 초기화됐으며 SSM 관련 예외는 없었다.
- `pnpm test:api`: 전체 스위트도 실행했으나 이번 diff가 건드리지 않은 `roomlog`·`trade` 테스트의 기존
  단언 실패와 타입 불일치 때문에 전체 exit 1이었다. 이 작업의 tenant-furniture 스위트는 위와 같이
  44/44 통과했다.
- `services/mesh-worker`: Node 문법 체크 통과, `gltf-bbox.mjs`를 합성 GLB JSON 청크로 단위 스모크(정상적으로 min/max 추출 확인), `server.mjs`를 Blender 없이 기동해 `/healthz`(503, blender missing)·`/convert`(시크릿 없음/오답 403·정상 시크릿인데 blender 없음 503) 응답 확인.
- `services/mesh-worker/convert.test.mjs`: `node --test` 스케일 회귀검증 4개 전부 통과(동일 bbox·축 순열
  통과, 실제 스케일 드리프트·0 길이 변 거부).
- `services/mesh-worker/Dockerfile`: **이미지 빌드 성공 확인(2026-07-20).** macOS Docker Desktop에서는
  20분 이상·654MB였고, 아래 후속 GPU EC2 검증에서는 86초·656MB였다.
- **실물 변환 시도 — 미완(2026-07-20 새벽).** 실제 Object Capture USDZ(의자, 9.9MB, `docs/tenant-furniture-fit.md`의 실측 검증에 쓴 바로 그 파일)로 컨테이너 안에서 `usdz_to_glb.py`를 돌려 위 2·3·4번을 한꺼번에 닫으려 했으나 **결론을 내지 못했다**: `docker run`이 7분 넘게 stdout/stderr를 전혀 내지 않았다. 원인 미규명 — 유력 후보는 ① 좀비 빌드 프로세스가 데몬을 물고 있던 여파(`docker images`조차 120초 무응답이었다) ② **Docker Desktop 파일공유 경로 문제** — 마운트한 입력 경로가 `/private/tmp/...` 스크래치패드였는데 Docker Desktop이 공유 허용하지 않는 경로면 컨테이너가 정상 기동하지 못할 수 있다. **다음 시도 때는 입력을 레포 안(예: `services/mesh-worker/.tmp/`)에 두고 돌릴 것.** 재현 명령:
  ```
  docker run --rm -v <입력디렉토리>:/work \
    -v $PWD/services/mesh-worker/blender:/blender:ro \
    --entrypoint blender mesh-worker:test \
    --background --factory-startup --python /blender/usdz_to_glb.py \
    -- /work/in.usdz /work/out.glb /work/meta.json
  ```
  기대값: 산출 GLB의 bbox가 **0.727 × 0.806 × 0.775 m**(원본 USDZ extent)와 일치. 높이(Y)가 특히 신뢰할 수 있는 축이다 — X·Z는 촬영 볼륨에 잘려 있어 원본 자체가 과대추정이지만, **변환 전후 비교**이므로 세 축 모두 보존돼야 정상이다.
- **실물 변환 후속 — 완료(2026-07-20).** GPU EC2 `i-061e16af461c7c5df`(g6.2xlarge,
  us-east-1)에서 입력을 앞서 세운 대책대로 레포 안 `services/mesh-worker/.tmp/`에 두고 같은 컨테이너
  명령을 실행하자 문제없이 완료됐다. 따라서 새벽 시도의 유력 후보 중 **Docker Desktop 파일공유 경로
  문제였을 가능성이 높다.** 다만 Linux 호스트와 입력 경로를 함께 바꾼 후의 성공이라 원인을 단일 변수로
  분리해 확정한 것은 아니다.
  - Blender 헤드리스: `Blender 4.2.22 LTS (hash 88937221abfc built 2026-06-23 01:31:10)`, 공유
    라이브러리 누락 없음.
  - Blender API: `bpy.ops.wm.usd_import`·`export_scene.gltf`가 4.2.22와 호환됐고 스크립트 수정 없이
    통과.
  - 프로덕션의 실제 Object Capture USDZ 2건 모두 성공:
    - `a.usdz` 6,689,162 bytes → `a.glb` 6,323,388 bytes. 산출 extent
      **0.7082 × 0.6085 × 0.9855 m**. USD import 21.00ms, glTF export 0.140s.
    - `b.usdz` 6,844,761 bytes → `b.glb` 6,576,288 bytes. 산출 extent
      **0.6031 × 1.5434 × 0.7490 m**. USD import 20.88ms.
  - 두 건 모두 import bbox와 export extent가 소수점 6~7자리까지 일치해 변환 전후 **스케일 무손실**을
    확인했다. 높이로 대응한 축은 앱에 기록된 RoomPlan 값 0.966m·0.762m와 약 2% 차이였다. RoomPlan
    감지값은 Object Capture의 정확한 실측 정답이 아니므로 정답 대조로 해석하지 않는다. 이번 판정은
    자릿수가 미터급이고 1,000배 어긋나지 않았는지를 기준으로 했으며 통과했다.
  - 이 후속 실행도 Blender 변환만 격리한 것이어서 GLB presigned PUT·콜백 경로와 텍스처·머티리얼
    보존은 확인하지 않았다.

## 로컬에서 워커만 단독 실행해 찔러보기

```bash
cd services/mesh-worker
# macOS: brew install --cask blender 후
BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender" GPU_WORKER_SECRET=dev-secret PORT=5001 node server.mjs

curl http://127.0.0.1:5001/healthz
curl -X POST http://127.0.0.1:5001/convert \
  -H 'Content-Type: application/json' -H 'x-worker-secret: dev-secret' \
  -d '{
    "furnitureId": "tf-test",
    "usdzUrl": "https://example.com/scan.usdz",
    "glbUploadUrl": "https://example.com/presigned-put",
    "glbUploadHeaders": {"Content-Type": "model/gltf-binary"},
    "glbPublicUrl": "https://example.com/out.glb",
    "callbackBase": "http://localhost:4000/api",
    "workerSecret": "dev-secret"
  }'
```
