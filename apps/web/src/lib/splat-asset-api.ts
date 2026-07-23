import type { RegistrationPointPair, SpawnView, SplatTransform } from "@/app/splat-tour/tour-types";
import type {
  RoomPlanCaptureFloorPlan,
  SplatAssetStatus,
  SplatIntakeCompleteRequest,
  SplatIntakePresignRequest,
  SplatIntakePresignResponse
} from "@roomlog/types";

// web → NestJS(api) splat 자산 CRUD 클라이언트.
// 픽 UI/뷰어가 이 헬퍼로 서버와 통신한다. 정합 결과(transform)는 solver(③a)가
// 계산하지만, 이 헬퍼 자체는 solver와 무관하게 동작한다.

// PROCESSING: 원본 영상/캡처만 접수된 상태 — fileUrl은 빈 문자열, videoUrl에 원본. spz가 나오면 UPLOADED로 승격.

export interface SplatAsset {
  id: string;
  roomId: string;
  /** 직접등록 매물(TradeListing) 연결 — 매물 파이프라인으로 접수된 자산만 값이 있다. */
  listingId: string | null;
  floorPlanId: string | null;
  fileUrl: string;
  fileKind: string;
  sizeBytes: number | null;
  /** PROCESSING 접수 시 원본 영상 경로. spz 직접 업로드면 null. */
  videoUrl: string | null;
  status: SplatAssetStatus;
  transform: SplatTransform | null;
  registrationPairs: RegistrationPointPair[] | null;
  /** 자산별 투어 진입 초기 카메라 시점. 소유자가 저장, null이면 뷰어가 SPAWN_VIEW 상수로 폴백. 미검증 JSON이라 웹에서 resolveTourSpawnView로 거른다. */
  spawnView?: SpawnView | null;
  /** 공개 뷰어 동봉 가구 — 연결된 도면(floorPlanId)/매물 스냅샷의 furnitures. 미검증 JSON이라 웹에서 isValidPlacedFurniture로 거른다. */
  furnitures?: unknown[] | null;
  /** 공개 뷰어 동봉 벽 — 연결된 도면(floorPlanId)/매물 스냅샷의 벽. 미검증 JSON이라 웹에서 planWallsFromPayload로 거른다. */
  walls?: unknown[] | null;
  /** RoomPlan(iOS) 캡처 도면(roomplan.json) — intake/complete가 저장. splat과 같은 ARSession이라
   * 좌표계가 같아 정합 없이 항등으로 쓸 수 있다. 미검증 JSON이라 웹에서 planWallsFromCaptureFloorPlan으로 거른다. */
  captureFloorPlan?: unknown | null;
  capturedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isWalkingTourAvailableAsset(asset: Pick<SplatAsset, "status" | "fileUrl">): boolean {
  return (asset.status === "REGISTERED" || asset.status === "UPLOADED") && asset.fileUrl.trim().length > 0;
}

export function hasWalkingTourAvailableAsset(assets: Pick<SplatAsset, "status" | "fileUrl">[]): boolean {
  return assets.some(isWalkingTourAvailableAsset);
}

export interface CreateSplatAssetInput {
  roomId: string;
  fileUrl: string;
  floorPlanId?: string;
  fileKind?: string;
  sizeBytes?: number;
  capturedAt?: string;
}

function apiUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || "/api";
  const normalized = base.replace(/\/$/, "");
  return normalized.endsWith("/api") ? `${normalized}${path}` : `${normalized}/api${path}`;
}

/** 루트 상대(/api/...) fileUrl을 API 오리진으로 절대화한다. base가 상대(/api)면 same-origin이므로 그대로 둔다. */
export function resolveAssetFileUrl(fileUrl: string): string {
  if (/^https?:\/\//.test(fileUrl)) return fileUrl;
  if (!fileUrl.startsWith("/")) return fileUrl;
  if (fileUrl.startsWith("/api/vendor-completion-files/")) return fileUrl;

  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  try {
    const url = new URL(base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fileUrl;
    return `${url.origin}${fileUrl}`;
  } catch {
    return fileUrl;
  }
}

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(
      `splat-asset API ${response.status}: ${detail || response.statusText}`
    ) as Error & { status?: number };
    // 호출부가 HTTP 상태로 분기(폴백 vs 즉시 실패)할 수 있게 상태 코드를 동봉한다.
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
}

export async function listSplatAssets(roomId: string): Promise<SplatAsset[]> {
  const response = await fetch(apiUrl(`/splat-assets?roomId=${encodeURIComponent(roomId)}`), {
    cache: "no-store"
  });
  return asJson<SplatAsset[]>(response);
}

/** 직접등록 매물에 연결된 splat 자산 목록 — 내 매물 카드의 3D 투어 상태 칩이 소비한다. */
export async function listSplatAssetsByListing(listingId: string): Promise<SplatAsset[]> {
  const response = await fetch(apiUrl(`/splat-assets?listingId=${encodeURIComponent(listingId)}`), {
    cache: "no-store"
  });
  return asJson<SplatAsset[]>(response);
}

export interface IntakeSplatAssetInput {
  listingId: string;
  /** Room 브리지 생성용 메타(없으면 서버 기본값) */
  title?: string;
  address?: string;
  /** 영상(video/*), Record3D 캡처 zip(.zip) 또는 스캔앱 스플랫(.spz) 파일 */
  file: File;
}

/**
 * 매물 등록 STEP 02의 영상/캡처 zip/스플랫 접수 — 멀티파트.
 * 서버가 파일 종류를 판별해 .spz → UPLOADED(정합 대기), 영상/zip → PROCESSING(제작 중)으로 만든다.
 */
export async function intakeSplatAsset(input: IntakeSplatAssetInput): Promise<SplatAsset> {
  const form = new FormData();
  form.append("listingId", input.listingId);
  if (input.title) form.append("title", input.title);
  if (input.address) form.append("address", input.address);
  form.append("file", input.file);
  const response = await fetch(apiUrl("/splat-assets/intake"), { method: "POST", body: form });
  return asJson<SplatAsset>(response);
}

/**
 * intakeSplatAsset과 동일한 접수 규약(멀티파트 field `listingId/title/address/file`)이되,
 * 업로드 진행률(onProgress, 0~100)을 보고한다. fetch()는 업로드 진행 이벤트를 못 주므로
 * XMLHttpRequest로 전환했다 — 매물 등록 흐름의 백그라운드 업로드(상단 진행바)가 이걸 쓴다.
 * 인증은 same-origin 쿠키가 자동 동봉된다(fetch와 동일).
 */
export function intakeSplatAssetWithProgress(
  input: IntakeSplatAssetInput,
  onProgress?: (percent: number) => void
): Promise<SplatAsset> {
  const form = new FormData();
  form.append("listingId", input.listingId);
  if (input.title) form.append("title", input.title);
  if (input.address) form.append("address", input.address);
  form.append("file", input.file);

  return new Promise<SplatAsset>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl("/splat-assets/intake"));
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        // 100%는 서버 응답(onload) 시점에만 — 전송 완료 후 서버 처리 대기 구간을 99%로 둔다.
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(xhr.response as SplatAsset);
      } else {
        const detail = typeof xhr.response === "string" ? xhr.response : "";
        reject(new Error(`splat-asset API ${xhr.status}: ${detail || xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error("splat-asset API 업로드 네트워크 오류"));
    xhr.onabort = () => reject(new Error("splat-asset API 업로드 취소"));
    xhr.send(form);
  });
}

/**
 * S3 직접 업로드(presigned PUT) 발급 요청 — docs/splat-direct-upload.md. 서버가 소유권·확장자·
 * 상한(직접 2GB, 폴백 800MB)을 검사한 뒤 `{ mode: "direct", uploadUrl, key, headers }`를 주거나,
 * S3 미설정 환경(로컬 dev)에서는 `{ mode: "multipart" }`를 줘서 기존 멀티파트 경로로 폴백하라고 신호한다.
 */
export async function requestSplatIntakePresign(
  input: SplatIntakePresignRequest
): Promise<SplatIntakePresignResponse> {
  const response = await fetch(apiUrl("/splat-assets/intake/presign"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return asJson<SplatIntakePresignResponse>(response);
}

/**
 * S3 직접 업로드 완료 통보 — PUT이 끝난 뒤 서버가 HEAD로 실재/크기를 검증하고 SplatAsset을
 * 생성한다. 응답 형태는 기존 멀티파트 intake()와 동일해 상위 코드가 분기를 몰라도 된다.
 */
export async function completeSplatIntake(input: SplatIntakeCompleteRequest): Promise<SplatAsset> {
  const response = await fetch(apiUrl("/splat-assets/intake/complete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return asJson<SplatAsset>(response);
}

/**
 * presigned URL로 파일 본체를 XHR PUT한다 (FormData 아님 — File을 그대로 body에 싣는다).
 * S3 서명에 포함된 헤더(Content-Type 등)를 그대로 실어야 서명이 맞는다.
 * **주의**: presigned URL은 cross-origin이라 쿠키를 실으면 서명이 깨진다 — withCredentials를
 * 켜지 않는다(기본값 false 유지).
 */
export function uploadToPresignedUrl(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        const detail = typeof xhr.response === "string" ? xhr.response : "";
        reject(new Error(`S3 직접 업로드 ${xhr.status}: ${detail || xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error("S3 직접 업로드 네트워크 오류"));
    xhr.onabort = () => reject(new Error("S3 직접 업로드 취소"));
    xhr.send(file);
  });
}

/**
 * 매물 등록 STEP 02 접수 오케스트레이션 — presign을 먼저 물어 S3 직접 업로드 가능 여부를
 * 판단한다. `mode === "multipart"`(S3 비활성)면 기존 `intakeSplatAssetWithProgress`로 완전히
 * 동일하게 위임한다. `mode === "direct"`면 S3로 PUT(진행률 0~97) 후 complete를 호출해
 * 100%로 마감한다.
 * 멀티파트 폴백은 "presign 엔드포인트가 없거나(404, 구버전 api) 네트워크 오류"일 때만 —
 * 400/403 같은 검증 실패까지 폴백하면 어차피 거부될 대용량 파일을 서버로 통째로
 * 올리게 돼(힙 버퍼링) 이 기능의 목적 자체가 무너진다. 검증 실패는 즉시 throw해
 * 상위(tour-upload-store)의 에러 배너로 보낸다. 업로드/complete 실패도 그대로 throw.
 */
export async function intakeSplatAssetSmart(
  input: IntakeSplatAssetInput,
  onProgress?: (percent: number) => void
): Promise<SplatAsset> {
  let presign: SplatIntakePresignResponse;
  try {
    presign = await requestSplatIntakePresign({
      listingId: input.listingId,
      fileName: input.file.name,
      sizeBytes: input.file.size,
      mimeType: input.file.type || undefined
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === undefined || status === 404) {
      return intakeSplatAssetWithProgress(input, onProgress);
    }
    throw error;
  }

  if (presign.mode === "multipart") {
    return intakeSplatAssetWithProgress(input, onProgress);
  }

  await uploadToPresignedUrl(presign.uploadUrl, presign.headers, input.file, (percent) => {
    onProgress?.(Math.min(97, Math.round((percent / 100) * 97)));
  });

  const asset = await completeSplatIntake({
    listingId: input.listingId,
    key: presign.key,
    title: input.title,
    address: input.address
  });
  onProgress?.(100);
  return asset;
}

/**
 * 제작 실패(FAILED) 자산 재큐잉 — 파일 없이 호출하면 이미 저장된 원본으로 재시도(원클릭),
 * 파일을 주면 원본을 교체 후 재시도(멀티파트). 서버가 status=PROCESSING·jobState=QUEUED로 되돌린다.
 * intakeSplatAsset과 같은 멀티파트 규약(field `file`) — 인증은 쿠키→Bearer BFF 프록시가 처리한다.
 */
export async function requeueSplatAsset(id: string, file?: File): Promise<SplatAsset> {
  const init: RequestInit = { method: "PATCH" };
  if (file) {
    const form = new FormData();
    form.append("file", file);
    init.body = form;
  }
  const response = await fetch(apiUrl(`/splat-assets/${encodeURIComponent(id)}/requeue`), init);
  return asJson<SplatAsset>(response);
}

export async function getSplatAsset(id: string): Promise<SplatAsset> {
  const response = await fetch(apiUrl(`/splat-assets/${encodeURIComponent(id)}`), { cache: "no-store" });
  return asJson<SplatAsset>(response);
}

export async function createSplatAsset(input: CreateSplatAssetInput): Promise<SplatAsset> {
  const response = await fetch(apiUrl("/splat-assets"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return asJson<SplatAsset>(response);
}

/** 2점 정합 결과 반영 — transform 저장 + status REGISTERED 승격. floorPlanId를 주면 자산에 연결한다(공개 뷰어 가구용). */
export async function registerSplatAsset(
  id: string,
  transform: SplatTransform,
  registrationPairs?: RegistrationPointPair[],
  floorPlanId?: string
): Promise<SplatAsset> {
  const response = await fetch(apiUrl(`/splat-assets/${encodeURIComponent(id)}/registration`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transform, registrationPairs, ...(floorPlanId ? { floorPlanId } : {}) })
  });
  return asJson<SplatAsset>(response);
}

/** 자산별 투어 진입 시점 저장 — 소유자가 "현재 시점을 기본으로 저장"을 눌렀을 때 호출한다. */
export async function updateSplatAssetSpawnView(id: string, spawnView: SpawnView): Promise<SplatAsset> {
  const response = await fetch(apiUrl(`/splat-assets/${encodeURIComponent(id)}/spawn-view`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spawnView })
  });
  return asJson<SplatAsset>(response);
}

export interface AutoRegisterPreviewCandidate {
  transform: SplatTransform;
  score: number;
}

export interface AutoRegisterPreviewResult {
  best: AutoRegisterPreviewCandidate;
  /** best를 제외한 나머지 후보, score 오름차순(더 나은 것 먼저). */
  alternatives: AutoRegisterPreviewCandidate[];
  confidence: "auto" | "ambiguous" | "failed";
  /** 매칭에 쓴 소유자 도면이 서버 FloorPlan row일 때만 값을 가짐(TradeListing 스냅샷 매칭이면 null). */
  floorPlanId: string | null;
}

/**
 * A4a — RoomPlan(iOS) 캡처 도면 × 자산에 연결된 소유자 도면(walls3D)의 서버 자동정합 프리뷰.
 * PREVIEW ONLY(서버가 저장하지 않음) — 확정은 registerSplatAsset을 별도로 호출한다.
 * 시임: captureFloorPlan은 지금 클라이언트가 넘기지만, iOS 인테이크가 붙으면 서버가 자산에 저장된
 * roomplan.json에서 직접 읽는 경로로 대체될 수 있다(이 함수 시그니처는 그대로 유지될 가능성이 높다).
 */
export async function previewAutoRegisterSplatAsset(
  id: string,
  captureFloorPlan: RoomPlanCaptureFloorPlan
): Promise<AutoRegisterPreviewResult> {
  const response = await fetch(apiUrl(`/splat-assets/${encodeURIComponent(id)}/auto-register-preview`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ captureFloorPlan })
  });
  return asJson<AutoRegisterPreviewResult>(response);
}

export async function deleteSplatAsset(id: string): Promise<{ id: string; deleted: boolean }> {
  const response = await fetch(apiUrl(`/splat-assets/${encodeURIComponent(id)}`), { method: "DELETE" });
  return asJson<{ id: string; deleted: boolean }>(response);
}
