import type { TradeListing } from "./manager-listing-model";
import type { ManagerListingFloorPlan } from "./manager-listing-media";

export interface ManagerListingUpdateInput {
  title: string;
  roomType: string;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  detailAddress: string;
  buildingName: string;
  description: string;
  images: string[];
  floorPlan: ManagerListingFloorPlan | null;
}

export function buildManagerListingUpdatePayload(
  input: ManagerListingUpdateInput,
): ManagerListingUpdateInput {
  return {
    title: input.title.trim(),
    roomType: input.roomType.trim(),
    tradeType: input.tradeType,
    depositManwon: Number(input.depositManwon) || 0,
    monthlyRentManwon: Number(input.monthlyRentManwon) || 0,
    location: input.location.trim(),
    detailAddress: input.detailAddress.trim(),
    buildingName: input.buildingName.trim(),
    description: input.description.trim(),
    images: input.images.filter((url) => typeof url === "string" && url.trim()),
    floorPlan: input.floorPlan,
  };
}

export async function uploadManagerListingPhotos(
  files: readonly File[],
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  if (files.length === 0) return [];

  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const response = await fetchImpl("/api/trade/uploads", { method: "POST", body: form });
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new Error(message || "사진 업로드에 실패했습니다.");
  }

  return Array.isArray(data?.images)
    ? data.images.filter((url: unknown): url is string => typeof url === "string" && Boolean(url))
    : [];
}

async function request<T>(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
    throw new Error(message || "매물 요청을 처리하지 못했습니다.");
  }

  return data as T;
}

export function updateManagerListing(
  listingId: string,
  input: ManagerListingUpdateInput,
  fetchImpl: typeof fetch = fetch,
): Promise<TradeListing> {
  return request(
    `/api/trade/listings/${encodeURIComponent(listingId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(buildManagerListingUpdatePayload(input)),
    },
    fetchImpl,
  );
}

export async function removeManagerListing(
  listingId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await request(
    `/api/trade/listings/${encodeURIComponent(listingId)}`,
    { method: "DELETE" },
    fetchImpl,
  );
}
