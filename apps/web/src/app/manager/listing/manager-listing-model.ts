import {
  normalizeManagerListingFloorPlan,
  type ManagerListingFloorPlan,
} from "./manager-listing-media";

export interface TradeListing {
  id: string;
  ownerId: string;
  roomId?: string;
  title: string;
  roomType: string;
  location: string;
  detailAddress?: string;
  buildingName?: string;
  tradeType: "월세" | "반전세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  status?: "노출중" | "계약완료";
  images?: string[];
  floorPlan?: unknown;
  description: string;
  createdAt: string;
}

export interface ManagerListingRow {
  id: string;
  title: string;
  address: string;
  priceLabel: string;
  statusLabel: "노출중" | "계약완료";
  coverImage?: string;
  photoCount: number;
  has3D: boolean;
  createdAt: string;
  roomType: string;
  tradeType: "월세" | "반전세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  detailAddress: string;
  buildingName: string;
  description: string;
  images: string[];
  floorPlan: ManagerListingFloorPlan | null;
}

function priceLabel(listing: TradeListing): string {
  const deposit = listing.depositManwon.toLocaleString("ko-KR");
  if (listing.tradeType === "월세" || listing.tradeType === "반전세") {
    return `${listing.tradeType} ${deposit}/${listing.monthlyRentManwon.toLocaleString("ko-KR")}`;
  }
  return `${listing.tradeType} ${deposit}만`;
}

export function toManagerListingRows(
  listings: readonly TradeListing[],
  ownerId: string,
): ManagerListingRow[] {
  return listings
    .filter((listing) => listing.ownerId === ownerId)
    .map(toManagerListingRow)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const UNGROUPED_BUILDING_LABEL = "건물 미지정";

/** 건물명 기준으로 매물을 묶는다 — 건물명이 없는 매물은 "건물 미지정" 그룹 맨 뒤로. */
export function groupListingsByBuilding(
  listings: readonly ManagerListingRow[],
): Array<{ buildingName: string; listings: ManagerListingRow[] }> {
  const groups = new Map<string, ManagerListingRow[]>();
  for (const listing of listings) {
    const key = listing.buildingName || UNGROUPED_BUILDING_LABEL;
    const group = groups.get(key);
    if (group) group.push(listing);
    else groups.set(key, [listing]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === UNGROUPED_BUILDING_LABEL) return 1;
      if (b === UNGROUPED_BUILDING_LABEL) return -1;
      return a.localeCompare(b, "ko-KR");
    })
    .map(([buildingName, grouped]) => ({ buildingName, listings: grouped }));
}

export function toManagerListingRow(listing: TradeListing): ManagerListingRow {
  const floorPlan = normalizeManagerListingFloorPlan(listing.floorPlan);
  const images = Array.isArray(listing.images) ? listing.images.filter(Boolean) : [];
  return {
    id: listing.id,
    title: listing.title,
    address: [listing.location, listing.detailAddress].filter(Boolean).join(" "),
    priceLabel: priceLabel(listing),
    statusLabel: listing.status === "계약완료" ? "계약완료" : "노출중",
    coverImage: images[0],
    photoCount: images.length,
    has3D: Boolean(floorPlan),
    createdAt: listing.createdAt,
    roomType: listing.roomType,
    tradeType: listing.tradeType,
    depositManwon: listing.depositManwon,
    monthlyRentManwon: listing.monthlyRentManwon,
    location: listing.location,
    detailAddress: listing.detailAddress ?? "",
    buildingName: listing.buildingName?.trim() ?? "",
    description: listing.description,
    images,
    floorPlan,
  };
}
