export interface TradeListing {
  id: string;
  ownerId: string;
  title: string;
  roomType: string;
  location: string;
  detailAddress?: string;
  tradeType: "월세" | "전세" | "매매";
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
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  detailAddress: string;
  description: string;
}

function priceLabel(listing: TradeListing): string {
  const deposit = listing.depositManwon.toLocaleString("ko-KR");
  if (listing.tradeType === "월세") {
    return `월세 ${deposit}/${listing.monthlyRentManwon.toLocaleString("ko-KR")}`;
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

export function toManagerListingRow(listing: TradeListing): ManagerListingRow {
  return {
    id: listing.id,
    title: listing.title,
    address: [listing.location, listing.detailAddress].filter(Boolean).join(" "),
    priceLabel: priceLabel(listing),
    statusLabel: listing.status === "계약완료" ? "계약완료" : "노출중",
    coverImage: listing.images?.[0],
    photoCount: listing.images?.length ?? 0,
    has3D: Boolean(listing.floorPlan),
    createdAt: listing.createdAt,
    roomType: listing.roomType,
    tradeType: listing.tradeType,
    depositManwon: listing.depositManwon,
    monthlyRentManwon: listing.monthlyRentManwon,
    location: listing.location,
    detailAddress: listing.detailAddress ?? "",
    description: listing.description,
  };
}
