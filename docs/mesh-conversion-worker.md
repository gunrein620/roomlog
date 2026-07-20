# USDZ→GLB 변환 워커 (mesh-worker)

임차인이 iOS Object Capture로 가구를 스캔하면 USDZ가 S3로 직행 업로드된다(`apps/api/src/tenant-furniture/`,
C-2). 웹 뷰어(three.js)는 USDZ를 못 읽으므로 GLB로 변환해야 하고, 그 변환을 맡는 게 이 문서가 다루는
`services/mesh-worker/`다.

**상태(2026-07-20)**: 코드 완성 + API 단위검증 34/34·mesh-worker 스케일 회귀검증 4/4 통과 +
**GPU EC2에서 Blender 실물 변환 검증 완료**.
Blender 4.2.22 LTS의 헤드리스 실행과 Python API 호환을 확인했고, 프로덕션에 업로드된 실제 Object
Capture USDZ 2건이 모두 GLB로 변환됐다. import bbox와 export extent도 소수점 6~7자리까지 일치했다.
다만 프로덕션 배포 배선, GLB presigned PUT·콜백 경로, 실제 워커 시크릿, 텍스처·머티리얼 보존은 아직
확인하지 않았다. 아래 "배포 전 반드시 확인"의 미체크 항목을 닫기 전엔 프로덕션에 올리지 말 것.

---

## 왜 GPU가 아닌가 (조사 결론)

USDZ→GLB는 순수 CPU 작업(포맷 변환, 렌더링 없음)이다. 이 레포엔 이미 GPU 재구성 파이프라인
(`apps/api/src/reconstruction/`)이 있지만 그 패턴을 그대로 복사하지 않았다 — 이유:

1. **GPU가 필요 없다.** g6e.2xlarge(L40S, ~$2.2/h)를 켜는 건 낭비다.
2. **오케스트레이터의 "큐 2틱 공백 시 인스턴스 정지"가 이 작업엔 함정이다** — CPU 변환은 인스턴스
   기동/SSM 온라인 대기만으로 GPU 재구성보다 오래 걸릴 수 있고, stop은 GPU 박스의 인스턴스스토어
   (NVMe)를 초기화해 buildstrap이 재실패하는 알려진 함정(`gpu-box-nvme-architecture` 메모리 참고)과
   똑같이 재현된다 — 얻는 것 없이 위험만 옮겨오는 셈.

그래서 mesh-worker 자체는 GPU 오케스트레이터에 묶지 않고, docker-compose가 직접 관리하는 경량 CPU
컨테이너로 설계했다. 원래 의도는 앱 EC2에서 항상 켜 두는 것이지만 실제 배치 위치는 아직 확정되지
않았다. 아래 GPU 박스 선택지는 GPU가 필요해서가 아니라 2026-07-20 검증에 쓴 기존 호스트를 재사용하는
경우다.

## 왜 Blender headless인가

검토한 대안:

| 도구 | 판단 |
|---|---|
| **Blender `--background --python`** | **채택.** USD 임포터가 내장(자체 번들 `libusd_ms.so`, 시스템 pxr 불필요) — Apple RealityKit/ARKit이 만든 USDZ에 대한 실전 검증이 가장 많다. glTF 익스포터가 Khronos 공식 레퍼런스 구현 중 하나로 유지보수가 가장 활발하다. 컨테이너 설치 비용(~350MB tar.xz + X11 계열 공유 라이브러리 몇 개)은 있지만 GPU 인스턴스 비용에 비하면 무시할 수준. |
| `usd-core`(pip) + `usd2gltf`(kcoley) | pxr Python 바인딩만으로 Blender 없이 변환 가능해 이미지가 더 가벼워질 수 있었으나, `usd2gltf`는 개인 유지보수 프로젝트라 최신 USDZ 변형에 대한 실전 검증이 Blender만큼 넓지 않다고 판단해 기각. |
| `usdcat`/`usdzip` 등 USD CLI | 포맷 변환기가 아니라 검사·압축 도구 — glTF를 못 만든다. (참고용으로만 씀, 아래 검증 섹션.) |

## 아키텍처 — S3 직행 원칙

```
tenant-furniture.service.ts (queueMeshConversion)
  → storageAdapter.presignUpload()로 GLB 업로드용 presigned PUT 미리 발급
  → mesh-conversion-dispatcher.ts가 HTTP POST mesh-worker:5001/convert (202=접수)
       └─ mesh-worker (server.mjs)
            → usdzUrl에서 직접 pull (S3 공개 URL, GET)
            → Blender headless로 GLB 변환 (blender/usdz_to_glb.py)
            → 스케일 검증 (import bbox ↔ export bbox, ±5%)
            → presigned URL로 GLB를 S3에 직접 PUT
            → 결과 URL만 API에 콜백 (POST .../mesh-conversion/complete { glbUrl })
```

서버(api)는 메타데이터(presigned URL 발급, 상태 전이)만 다루고 GLB 바이트 자체는 절대 api 프로세스를
거치지 않는다 — "S3=벌크 버스, 서버=두뇌" 원칙(reconstruction 모듈과 동일).

## 파일 맵

- `apps/api/src/tenant-furniture/mesh-conversion-dispatcher.ts` — 디스패치 포트(인터페이스) + HTTP 구현
  + env 미설정 시 즉시 실패하는 널 구현. `TenantFurnitureService`가 이 인터페이스에만 의존해 테스트가
  진짜 워커 없이도 가능하다(`tenant-furniture.spec.ts`의 `queueMeshConversion dispatch` describe 블록).
- `services/mesh-worker/server.mjs` — `POST /convert`(잡 접수) · `GET /healthz`. 프레임워크 없이 plain
  `node:http` — 엔드포인트 2개짜리 서비스에 Express/Nest는 과하다고 판단.
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
| `MESH_WORKER_URL` | api | mesh-worker의 base URL(`http://mesh-worker:5001`). 비어 있으면 `queueMeshConversion`이 dispatch() 호출 즉시 실패 → FAILED. |
| `PUBLIC_API_BASE_URL` | api | reconstruction과 공유. mesh-worker가 콜백을 보낼 API 주소 계산에 쓰인다. |
| `GPU_WORKER_SECRET` | api + mesh-worker | 콜백(`x-worker-secret`) 인증. **reconstruction과 동일 시크릿을 공유한다** — 새 시크릿을 안 만든 이유: 이미 완성돼 있던 `tenant-furniture.controller.ts`의 콜백 게이트(`requireWorkerSecret`)가 이 변수를 그대로 쓰고 있었다(내가 바꾼 게 아니라 받은 계약). mesh-worker의 `/convert` 인바운드 인증도 같은 값을 재사용한다(`MESH_WORKER_ACCEPT_SECRET`로 오버라이드 가능). |
| `BLENDER_BIN` | mesh-worker | 기본 `/opt/blender/blender`(Dockerfile이 심음). 로컬 macOS에서 워커를 직접 띄워 테스트할 땐 `brew install --cask blender` 후 `/Applications/Blender.app/Contents/MacOS/Blender`로 오버라이드. |
| `BLENDER_TIMEOUT_MS` | mesh-worker | Blender 프로세스 상한(기본 5분). 가구 하나 변환치고 넉넉하지만 최초 배포 후 실측해 조정. |

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

## 프로덕션 배선 갭 — 아직 서비스가 뜨지 않음

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

배치 위치에 따라 필요한 배선이 다르다.

- **앱 EC2**(ap-northeast-2, t3.medium)에 두면 `deploy.yml`의 `build`·`up` 서비스 목록에
  `mesh-worker`를 추가해야 한다.
- **GPU 박스**(us-east-1)에 두면 `deploy.yml`은 앱 EC2에만 SSH하므로 손댈 필요가 없고,
  `MESH_WORKER_URL`을 GPU 박스 주소로 배선해야 한다. 리전·VPC가 다르고 현재 둘을 잇는 사설 연결이 없어
  공개 인터넷을 타므로 고정 IP(Elastic IP)가 필요하다. 현재는 EIP가 없어 stop/start마다 주소가 바뀐다.

어느 쪽에 둘지는 아직 결정되지 않았다.

## 배포 전 반드시 확인 (사람 손 TODO)

- [x] **Dockerfile 빌드가 실제로 성공하는가.** ✅ **확인됨(2026-07-20).** GPU EC2
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
  `splat-register-black-box-cors` 메모리 참고). 이번 검증은 Blender 변환만 격리 실행해 GLB 업로드·콜백
  경로를 타지 않았으므로 미확인이다.
- [ ] **GPU_WORKER_SECRET을 실제 값으로 교체.** 로컬 compose 기본값(`roomlog-local-worker-secret`)은
  프로덕션에 절대 쓰지 말 것. 아직 교체하지 않았다.
- [ ] **mesh-worker의 프로덕션 배치 위치와 배선을 확정한다.** 앱 EC2에 함께 띄울지 GPU 박스에 둘지
  결정되지 않았고, 현재 `deploy.yml`은 어느 쪽도 배포하지 않는다.

### 검증 로그(이 작업 중 실행한 것)

- `apps/api`: `pnpm build:api` 통과, `node --test -r ts-node/register src/tenant-furniture/*.spec.ts` 34개 전부 통과(디스패치 성공/실패, presign 누락, usdzUrl 누락, 워커 미배선, HTTP 200/4xx/5xx/네트워크에러 케이스 포함).
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
