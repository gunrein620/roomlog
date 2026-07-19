# USDZ→GLB 변환 워커 (mesh-worker)

임차인이 iOS Object Capture로 가구를 스캔하면 USDZ가 S3로 직행 업로드된다(`apps/api/src/tenant-furniture/`,
C-2). 웹 뷰어(three.js)는 USDZ를 못 읽으므로 GLB로 변환해야 하고, 그 변환을 맡는 게 이 문서가 다루는
`services/mesh-worker/`다.

**상태(2026-07-20 작성)**: 코드는 완성됐지만 **실제 Blender에서 한 번도 실행해보지 못했다**(개발
샌드박스에 Blender 미설치). 아래 "배포 전 반드시 확인" 섹션을 거치기 전엔 프로덕션에 올리지 말 것.

---

## 왜 GPU가 아닌가 (조사 결론)

USDZ→GLB는 순수 CPU 작업(포맷 변환, 렌더링 없음)이다. 이 레포엔 이미 GPU 재구성 파이프라인
(`apps/api/src/reconstruction/`)이 있지만 그 패턴을 그대로 복사하지 않았다 — 이유:

1. **GPU가 필요 없다.** g6e.2xlarge(L40S, ~$2.2/h)를 켜는 건 낭비다.
2. **오케스트레이터의 "큐 2틱 공백 시 인스턴스 정지"가 이 작업엔 함정이다** — CPU 변환은 인스턴스
   기동/SSM 온라인 대기만으로 GPU 재구성보다 오래 걸릴 수 있고, stop은 GPU 박스의 인스턴스스토어
   (NVMe)를 초기화해 buildstrap이 재실패하는 알려진 함정(`gpu-box-nvme-architecture` 메모리 참고)과
   똑같이 재현된다 — 얻는 것 없이 위험만 옮겨오는 셈.

대신 mesh-worker는 **항상 켜져 있는 경량 CPU 컨테이너**로 docker-compose가 직접 관리한다. 기동/정지
수명주기 자체가 없다 — 단순함이 이 선택의 핵심 이유다.

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

## 배포 전 반드시 확인 (사람 손 TODO)

- [ ] **Dockerfile 빌드가 실제로 성공하는가.** `docker build -f services/mesh-worker/Dockerfile -t mesh-worker:test .` — 이 문서 작성 시점에 로컬에서 빌드를 시도했다(아래 "검증 로그" 참고). apt 패키지 이름은 Debian 버전이 바뀌면 달라질 수 있다(`libgl1` 계열이 특히 자주 바뀜).
- [ ] **Blender가 headless로 실제 실행되는가.** `docker run --rm mesh-worker:test /opt/blender/blender --background --version` — 공유 라이브러리 누락 시 `error while loading shared libraries` 로 죽는다. 하나씩 apt로 채워야 한다.
- [ ] **usdz_to_glb.py의 Blender API가 설치된 버전과 맞는가.** `bpy.ops.wm.usd_import`/`export_scene.gltf`의 파라미터 이름은 Blender 마이너 버전 간 바뀐 적이 있다. 실제 Object Capture USDZ 샘플(캡처앱으로 뽑은 실물)로 한 번 돌려보고 GLB를 3D 뷰어로 열어 형태가 맞는지 확인할 것.
- [ ] **스케일이 진짜 보존되는가.** `convert.mjs`의 `assertScalePreserved`(±5%)가 통과해도 그건 "Blender import 시점 bbox ↔ export 시점 bbox"가 서로 어긋나지 않았다는 것만 보장한다 — **원본 USDZ의 실측 미터와 일치하는지는 별도로 줄자 대조가 필요하다**(`docs/tenant-furniture-fit.md`의 2026-07-20 실기 검증 절차를 재사용). 첫 실제 변환 결과물을 `apps/web`의 가구 미리보기(`mesh-anchor.ts`가 소비하는 화면)에 띄워 눈으로도 확인할 것.
- [ ] **S3 버킷 CORS.** GLB presigned PUT은 Object Capture USDZ 업로드와 같은 버킷·같은 CORS 설정을 공유한다(`docs/splat-direct-upload.md`, `woozu-static-file` 버킷 — 이미 CORS 이슈가 있었던 이력 있음, `splat-register-black-box-cors` 메모리 참고).
- [ ] **GPU_WORKER_SECRET을 실제 값으로 교체.** 로컬 compose 기본값(`roomlog-local-worker-secret`)은 프로덕션에 절대 쓰지 말 것.

### 검증 로그(이 작업 중 실행한 것)

- `apps/api`: `pnpm build:api` 통과, `node --test -r ts-node/register src/tenant-furniture/*.spec.ts` 34개 전부 통과(디스패치 성공/실패, presign 누락, usdzUrl 누락, 워커 미배선, HTTP 200/4xx/5xx/네트워크에러 케이스 포함).
- `services/mesh-worker`: Node 문법 체크 통과, `gltf-bbox.mjs`를 합성 GLB JSON 청크로 단위 스모크(정상적으로 min/max 추출 확인), `server.mjs`를 Blender 없이 기동해 `/healthz`(503, blender missing)·`/convert`(시크릿 없음/오답 403·정상 시크릿인데 blender 없음 503) 응답 확인.
- `services/mesh-worker/Dockerfile`: 이미지 빌드를 실제로 시도함 — 성공/실패 여부는 이 문서를 갱신한 커밋 메시지 또는 작업 보고를 확인. **Blender 자체의 headless 실행(usd_import/export_scene.gltf 호출)은 컨테이너 밖에서 검증할 방법이 없어 미검증으로 남아 있다.**

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
