# 3D 투어 영상 S3 직접 업로드 (presigned PUT) 설계

> 상태: 설계 확정 대기 · 2026-07-17 · 작성: 설계 세션 (구현은 서브에이전트/Codex 위임)

## 배경 / 문제

매물 등록 STEP 02의 3D 투어 영상(600~800MB)이 현재 `POST /api/splat-assets/intake` 멀티파트로
서버를 통과한다. Next BFF(`app/api/splat-assets/[[...path]]/route.ts`)는 스트림 패스스루라 무해하지만,
Nest의 `FileInterceptor`(multer 기본 memoryStorage)가 **파일 전체를 힙에 버퍼링**한다
(`splat-asset.controller.ts:55` → `file.buffer`). 800MB 업로드 2건이 겹치면 힙 1.6GB —
api 전체(티켓·결제 포함)가 GC 압박을 받는다. 또 GPU 워커가 같은 파일을 `/api/files`에서
curl로 재다운로드해(`gpu-job.sh:168`) 서버 egress가 파일당 ~800MB 추가 발생한다.

## 목표

- 브라우저 → **S3 presigned PUT 직접 업로드**. 서버는 서명 발급 + 완료 검증만 (바이트 무통과).
- GPU 워커는 S3 public URL에서 직접 다운로드 (서버 egress 0).
- **S3 미설정 환경(로컬 dev)은 기존 멀티파트 경로로 자동 폴백** — 로컬 개발 흐름 불변.
- 업로드 진행바(상단 배너) UX 유지.

## 비목표 (이번 스코프 밖)

- GPU 콜백(.spz 회수, `reconstruction/complete` 멀티파트 ≤500MB) 변경 — spz는 상대적으로 작아 유지.
- `requeue`(실패 재시도)의 새 파일 업로드 직접화 — 후속 PR. 이번엔 기존 멀티파트 유지.
- private 버킷 + presigned GET — 현 시스템(뷰어 fileUrl 직접 로드·워커 curl)이 퍼블릭 읽기 전제라 유지.
- 원본 영상 축소(프레임 추출/비트레이트) — 별도 트랙.

## 전체 흐름

```
[브라우저]                         [Next BFF]        [Nest api]              [S3]
    │ ① POST /api/splat-assets/intake/presign (JSON, 수 KB)
    │ ──────────────────────────────▶ 프록시 ─────▶ 소유권·확장자·크기 검증
    │                                              presigned PUT 발급 ──────▶ (서명만)
    │ ◀───────────────────────────── { uploadUrl, key, headers } ◀──
    │ ② XHR PUT (파일 본체, 진행률) ────────────────────────────────────────▶ 저장
    │ ③ POST /api/splat-assets/intake/complete { listingId, key }
    │ ──────────────────────────────▶ 프록시 ─────▶ HEAD로 실재·크기 검증
    │                                              Room upsert + SplatAsset 생성
    │ ◀───────────────────────────── SplatAsset (기존 intake 응답과 동일)
    │
[GPU 워커] ◀── curl (S3 public URL = videoUrl, 기존 absolutize 그대로) ──── [S3]
```

presign 응답이 `{ mode: "multipart" }`면(=S3 비활성) 클라이언트는 기존
`intakeSplatAssetWithProgress` 멀티파트 경로로 폴백한다.

---

## Task 0 — 타입 계약 (`packages/types`)

`packages/types/src/splat-pipeline.ts`에 추가 후 `index.ts` re-export 확인
(이미 splat-pipeline이 re-export되고 있으면 추가 작업 없음):

```ts
/** 매물 3D 투어 소스 직접 업로드(presigned PUT) — 요청. */
export interface SplatIntakePresignRequest {
  listingId: string;
  fileName: string;
  sizeBytes: number;
  mimeType?: string;
}

/** presign 응답 — multipart면 기존 멀티파트 intake로 폴백하라는 뜻. */
export type SplatIntakePresignResponse =
  | { mode: "multipart" }
  | {
      mode: "direct";
      /** presigned PUT URL — 이 URL로 파일 본체를 PUT */
      uploadUrl: string;
      /** S3 object key — complete 호출에 그대로 전달 */
      key: string;
      /** PUT 요청에 반드시 실어야 하는 헤더 (Content-Type 등, 서명에 포함됨) */
      headers: Record<string, string>;
      expiresAt: string;
    };

/** 직접 업로드 완료 통보 — 응답은 기존 intake와 동일한 SplatAsset. */
export interface SplatIntakeCompleteRequest {
  listingId: string;
  key: string;
  title?: string;
  address?: string;
}
```

## Task A — api (Nest, `apps/api/src/splat-asset` + `roomlog/storage.service.ts`)

### A-1. 스토리지 어댑터 확장 (`storage.service.ts`)

`FileStorageAdapter`에 **옵셔널** 능력 추가 (LocalStorageAdapter는 미구현 = 직접 업로드 불가 신호):

```ts
export type PresignedUpload = {
  uploadUrl: string;
  key: string;
  headers: Record<string, string>;
  expiresAt: Date;
  /** 저장 후 공개 접근 URL (videoUrl/fileUrl에 기록될 값) */
  publicUrl: string;
};

export interface FileStorageAdapter {
  save(...): Promise<StoredFile>;
  read(...): Promise<Buffer | null>;
  /** presigned PUT 발급. 미지원 어댑터(local)는 정의하지 않는다. */
  presignUpload?(input: { key: string; mimeType: string; expiresInSeconds: number }): Promise<PresignedUpload>;
  /** 업로드 완료 검증용 HEAD. 없으면 null. */
  headObject?(key: string): Promise<{ sizeBytes: number; mimeType: string | null } | null>;
}
```

- `S3StorageAdapter`에 `@aws-sdk/s3-request-presigner`의 `getSignedUrl(client, new PutObjectCommand({Bucket, Key, ContentType}), {expiresIn})`으로 구현. `headers`엔 `{ "Content-Type": mimeType }`.
- `headObject`는 `HeadObjectCommand`. `publicUrl`은 기존 save와 같은 규칙(`${publicBaseUrl}/${key}`).
- **의존성**: `apps/api/package.json`에 `@aws-sdk/s3-request-presigner` 추가 (`@aws-sdk/client-s3`는 기존 사용 중 — 같은 메이저 버전으로).

### A-2. presign 엔드포인트 (`splat-asset.controller.ts` + `splat-asset.service.ts`)

`POST splat-assets/intake/presign` — LANDLORD 가드 + `assertListingOwner` (기존 intake와 동일).

서비스 로직:
1. `fileName`/`mimeType`을 기존 `classifyIntakeFile`과 **같은 규칙**으로 분류(buffer 없이 이름·mime만으로 동작하게 소폭 리팩터). 허용 외 확장자 → 400 (기존 문구 재사용).
2. `sizeBytes > MAX_UPLOAD_BYTES`(800MB) → 400 (기존 문구 재사용).
3. 어댑터에 `presignUpload`가 없으면 → `{ mode: "multipart" }` 반환 (200).
4. key 생성: `` `splat-intake/${listingId}/${safeUploadedFileName(`splat-${kind}`, fileName, ext)}` ``
   — **key에 listingId를 박아** complete 시 소유권-키 바인딩을 검증한다.
5. `presignUpload({ key, mimeType, expiresInSeconds: 3600 })` → `{ mode: "direct", ... }` 반환.

### A-3. complete 엔드포인트

`POST splat-assets/intake/complete` — LANDLORD 가드 + `assertListingOwner`.

서비스 로직:
1. `key`가 `splat-intake/${listingId}/`로 시작하지 않으면 403 — 남의 presign 키 도용 차단.
2. `headObject(key)` — 없으면 400("업로드가 완료되지 않았습니다"). `sizeBytes > 800MB`면 400
   (presign 후 클라가 서명 우회로 큰 파일을 넣는 경우의 서버측 최종 방어).
3. key 확장자로 분류(classify) 후 **기존 `intake()`의 후반부와 동일하게**: Room upsert →
   `splatAsset.create` (`videoUrl`/`fileUrl` = 어댑터 publicUrl, splat이면 UPLOADED, 영상/zip이면
   PROCESSING+QUEUED, sizeBytes는 HEAD 결과). 기존 intake()와 로직 중복이 생기지 않게
   공통 private 메서드(`createIntakeAsset(...)`)로 추출 권장.

### A-4. 기존 경로 유지

멀티파트 `POST intake`는 그대로 둔다(로컬 폴백 + 하위호환). GPU 오케스트레이터/워커는 **무변경** —
`absolutize`는 절대 URL을 그대로 통과시키므로 S3 public URL인 videoUrl이 그대로 SOURCE_URL이 된다.

### A-5. 테스트 (`node --test`, 기존 spec 스타일 따라)

- presign: 비소유자 403 / 확장자 불허 400 / 800MB 초과 400 / S3 비활성 시 multipart 모드.
- complete: 키-listingId 불일치 403 / HEAD 부재 400 / 정상 시 SplatAsset 생성(status·jobState·videoUrl).
- 어댑터는 fake(presignUpload/headObject 스텁)로 주입 — 실제 AWS 호출 없이.

## Task B — web (`apps/web/src/lib`)

### B-1. `splat-asset-api.ts`

- `requestSplatIntakePresign(input): Promise<SplatIntakePresignResponse>` — `apiUrl("/splat-assets/intake/presign")` JSON POST (쿠키→Bearer는 기존 BFF 캐치올 프록시가 처리, 추가 배선 불필요).
- `completeSplatIntake(input): Promise<SplatAsset>` — 같은 방식.
- `uploadToPresignedUrl(url, headers, file, onProgress)` — XHR `PUT`, `xhr.upload.onprogress`
  (기존 `intakeSplatAssetWithProgress`의 XHR 패턴 재사용). body는 `File` 그대로 (FormData 아님).
  **주의: presigned URL로의 PUT은 crossorigin이며 쿠키를 실으면 안 된다** (`withCredentials` 기본 false 유지).
- 오케스트레이션 함수 `intakeSplatAssetSmart(input, onProgress)`:
  1. presign 호출 (진행률 0)
  2. `mode === "multipart"` → 기존 `intakeSplatAssetWithProgress`로 위임 (동작 완전 동일)
  3. `mode === "direct"` → PUT 업로드 (진행률 0~97) → complete (성공 시 100) → SplatAsset 반환
  4. presign/PUT 단계 실패 시 에러 throw — 상위(store)의 기존 에러 배너 흐름 그대로.

### B-2. `tour-upload-store.ts`

`startTourUpload`의 `intakeSplatAssetWithProgress` 호출을 `intakeSplatAssetSmart`로 교체 (한 줄).
나머지(배너·beforeunload·에러 타이머) 무변경.

### B-3. 테스트

기존 web 유닛 스타일에 맞춰 smart 함수의 폴백 분기(멀티파트 모드)만 커버해도 충분.

## Task D — 인프라/문서 (코드 밖, 일부는 사람 작업)

1. **버킷 CORS** (S3 콘솔 또는 IaC — 배포 담당 확인 필요):
   ```json
   [{
     "AllowedMethods": ["PUT"],
     "AllowedOrigins": ["https://www.woo-zu.com", "https://woo-zu.com", "http://localhost:3000"],
     "AllowedHeaders": ["content-type"],
     "ExposeHeaders": ["ETag"],
     "MaxAgeSeconds": 3600
   }]
   ```
   (뷰어의 GET용 CORS는 별도 이슈로 이미 트래킹 중 — 위 항목과 병합 배포 권장.)
2. **읽기 접근**: `splat-intake/*`가 기존 업로드물과 같은 공개 읽기 정책/CloudFront 커버리지에 들어가는지 확인 (GPU 워커 curl + requeue가 의존).
3. **env**: 신규 env 없음. 기존 `S3_UPLOADS_ENABLED=true` + `S3_BUCKET_NAME` (+ IAM에 `s3:PutObject/GetObject/HeadObject` on `splat-intake/*`)으로 활성화.
4. `.env.example`·CLAUDE.md 3D 파이프라인 절에 직접 업로드 경로 한 줄 반영.
5. (선택) S3 lifecycle: `splat-intake/`의 미완료 멀티파트 업로드 7일 후 abort. complete 안 된 고아 객체는 스케일상 방치 허용 — 백로그.

## 실패 모드 정리

| 상황 | 결과 |
|---|---|
| presign 후 PUT 실패/중단 | 클라 에러 배너(기존 흐름). S3에 흔적 없음 또는 부분 없음 |
| PUT 성공, complete 미호출(탭 강제 종료) | 고아 S3 객체 — DB 레코드 없음, 기능 영향 없음 (백로그: lifecycle) |
| 서명 우회 800MB 초과 업로드 | complete의 HEAD 검증이 400 |
| 남의 listingId로 complete | assertListingOwner 403 + 키 프리픽스 검증 403 |
| S3 비활성(로컬 dev) | presign이 multipart 모드 반환 → 기존 경로, 동작 불변 |

## 검증 계획

1. `bash scripts/verify.sh` (typecheck + 빌드 + health) 통과.
2. 로컬(S3 off): 매물 등록 → 영상 업로드가 **기존 멀티파트로 폴백**되어 진행바·자산 생성 정상.
3. api 유닛: A-5 spec 통과 (`node --test`).
4. S3 on 검증(스테이징/프로드): 실제 presign → 브라우저 PUT → complete → 오케스트레이터가
   S3 URL로 dispatch → GPU 잡 정상 — CORS 적용 이후에만 가능.

## 작업 분배 계획

| 태스크 | 범위 | 실행자(안) | 선행 |
|---|---|---|---|
| 0 | types 계약 | Task A 에이전트가 겸임 (5분 분량) | — |
| A | api presign/complete/어댑터/테스트 | 서브에이전트(sonnet) 또는 Codex | 0 |
| B | web 클라 3함수 + store 교체 | 서브에이전트(sonnet) | 0 (A와 병렬, 계약만 공유) |
| D | CORS/env/문서 | 서브에이전트(haiku) + 사람(버킷 설정) | — |
| 통합검증 | verify.sh + 로컬 폴백 확인 | 메인 세션이 최종 확인 | A, B |

worktree 병렬 기준 충돌 지점: `packages/types/src/splat-pipeline.ts`(Task 0 선행으로 회피),
그 외 A(api)와 B(web)는 파일 겹침 없음.
