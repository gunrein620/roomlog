import type { RegistrationPointPair, SplatTransform } from "@/app/splat-tour/tour-types";

// web → NestJS(api) splat 자산 CRUD 클라이언트.
// 픽 UI/뷰어가 이 헬퍼로 서버와 통신한다. 정합 결과(transform)는 solver(③a)가
// 계산하지만, 이 헬퍼 자체는 solver와 무관하게 동작한다.

export type SplatAssetStatus = "UPLOADED" | "REGISTERED" | "FAILED";

export interface SplatAsset {
  id: string;
  roomId: string;
  floorPlanId: string | null;
  fileUrl: string;
  fileKind: string;
  sizeBytes: number | null;
  status: SplatAssetStatus;
  transform: SplatTransform | null;
  registrationPairs: RegistrationPointPair[] | null;
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
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const normalized = base.replace(/\/$/, "");
  return normalized.endsWith("/api") ? `${normalized}${path}` : `${normalized}/api${path}`;
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

/** 2점 정합 결과 반영 — transform 저장 + status REGISTERED 승격. */
export async function registerSplatAsset(
  id: string,
  transform: SplatTransform,
  registrationPairs?: RegistrationPointPair[]
): Promise<SplatAsset> {
  const response = await fetch(apiUrl(`/splat-assets/${encodeURIComponent(id)}/registration`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transform, registrationPairs })
  });
  return asJson<SplatAsset>(response);
}

export async function deleteSplatAsset(id: string): Promise<{ id: string; deleted: boolean }> {
  const response = await fetch(apiUrl(`/splat-assets/${encodeURIComponent(id)}`), { method: "DELETE" });
  return asJson<{ id: string; deleted: boolean }>(response);
}
