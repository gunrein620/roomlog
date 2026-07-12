import type { TradeListing } from "./manager-listing-model";

export interface ManagerListingUpdateInput {
  title: string;
  roomType: string;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  detailAddress: string;
  description: string;
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
    description: input.description.trim(),
  };
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
