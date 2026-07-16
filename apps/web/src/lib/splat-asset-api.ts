import type { RegistrationPointPair, SplatTransform } from "@/app/splat-tour/tour-types";
import type { SplatAssetStatus } from "@roomlog/types";

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
  /** 공개 뷰어 동봉 가구 — 연결된 도면(floorPlanId)/매물 스냅샷의 furnitures. 미검증 JSON이라 웹에서 isValidPlacedFurniture로 거른다. */
  furnitures?: unknown[] | null;
  capturedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
    throw new Error(`splat-asset API ${response.status}: ${detail || response.statusText}`);
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

export async function deleteSplatAsset(id: string): Promise<{ id: string; deleted: boolean }> {
  const response = await fetch(apiUrl(`/splat-assets/${encodeURIComponent(id)}`), { method: "DELETE" });
  return asJson<{ id: string; deleted: boolean }>(response);
}
