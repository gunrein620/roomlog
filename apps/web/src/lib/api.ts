// 공용 API 클라이언트. 백엔드 NestJS(/api/*)를 호출한다.
// 기존 페이지들이 인라인으로 쓰던 NEXT_PUBLIC_API_URL 패턴을 한 곳으로 모은다.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const apiUrl = (path: string) => `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

export type PropertyType = "apt" | "offi";

export type MarketTransaction = {
  complexName: string;
  tradeType: "월세" | "전세";
  depositManwon: number;
  monthlyRentManwon: number;
  areaM2: number;
  floor: number | null;
  buildYear: number | null;
  dong: string;
  sggCode: string;
  dealDate: string;
  propertyType: PropertyType;
};

export type MarketSummary = {
  lawdCd: string;
  propertyType: PropertyType;
  count: number;
  monthlyCount: number;
  jeonseCount: number;
  avgDepositManwon: number;
  avgMonthlyRentManwon: number;
  avgJeonseDepositManwon: number;
  recent: MarketTransaction[];
};

// 앱이 테마로 쓰는 동 → 법정동 시군구 코드. 백엔드 /api/market/regions와 일치.
const DONG_TO_LAWD: Array<{ keyword: string; lawdCd: string; center: [number, number] }> = [
  { keyword: "방배", lawdCd: "11650", center: [37.4816, 126.9971] },
  { keyword: "성수", lawdCd: "11200", center: [37.5445, 127.0559] },
  { keyword: "역삼", lawdCd: "11680", center: [37.5006, 127.0366] }
];

export function regionForLocation(location: string): { lawdCd: string; center: [number, number] } {
  const hit = DONG_TO_LAWD.find((region) => location.includes(region.keyword));
  return hit ?? { lawdCd: DONG_TO_LAWD[0].lawdCd, center: DONG_TO_LAWD[0].center };
}

export function propertyTypeForRoom(roomType: string): PropertyType {
  return roomType.includes("오피스텔") ? "offi" : "apt";
}

/** 만원 단위 정수를 "1.4억 / 76만" 형태의 한국어 금액 문자열로 변환. */
export function formatManwon(manwon: number): string {
  if (!manwon || manwon <= 0) {
    return "-";
  }
  if (manwon >= 10000) {
    const eok = manwon / 10000;
    const rounded = Math.round(eok * 10) / 10;
    return `${rounded}억`;
  }
  return `${Math.round(manwon)}만`;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(apiUrl(path), { signal });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null; // 네트워크/서버 오류 시 null → 호출부가 하드코딩 폴백 유지.
  }
}

export function getMarketSummary(
  params: { lawdCd: string; propertyType: PropertyType; months?: number },
  signal?: AbortSignal
): Promise<MarketSummary | null> {
  const query = new URLSearchParams({
    lawdCd: params.lawdCd,
    propertyType: params.propertyType,
    months: String(params.months ?? 3)
  });
  return getJson<MarketSummary>(`/api/market/summary?${query.toString()}`, signal);
}

export function getMarketTransactions(
  params: { lawdCd: string; propertyType: PropertyType; months?: number },
  signal?: AbortSignal
): Promise<MarketTransaction[] | null> {
  const query = new URLSearchParams({
    lawdCd: params.lawdCd,
    propertyType: params.propertyType,
    months: String(params.months ?? 3)
  });
  return getJson<MarketTransaction[]>(`/api/market/transactions?${query.toString()}`, signal);
}

// --- 매물(가상 시드) ----------------------------------------------------------
// 백엔드 apps/api/src/listings/listings.data.ts 의 Listing 스키마와 일치.

export type TradeType = "월세" | "전세" | "매매";
export type PropertyKind = "원룸" | "투룸" | "쓰리룸" | "오피스텔" | "아파트" | "빌라";

export type Listing = {
  id: string;
  title: string;
  headline: string;
  registeredAt: string;
  status: "거래중" | "거래완료";
  viewCount: number;
  tradeType: TradeType;
  depositManwon: number;
  monthlyRentManwon: number;
  salePriceManwon: number;
  maintenanceManwon: number;
  maintenanceIncludes: string[];
  loanManwon: number;
  availableFrom: string;
  contractMonths: number;
  kind: PropertyKind;
  areaExclusiveM2: number;
  areaSupplyM2: number;
  floor: number;
  totalFloors: number;
  rooms: number;
  bathrooms: number;
  direction: string;
  buildYear: number;
  parking: boolean;
  elevator: boolean;
  heating: string;
  address: string;
  jibunAddress: string;
  dong: string;
  lawdCd: string;
  lat: number;
  lng: number;
  nearestStation: string;
  walkMinutes: number;
  options: string[];
  petsAllowed: boolean;
  tags: string[];
  coverImage: string;
  gallery: string[];
  tourId: string | null;
  registrantType: "집주인" | "중개사";
  brokerName: string;
  contactPhone: string;
  responseMinutes: number;
  verified: boolean;
  safetyScore: number;
};

/** 거래 조건을 "월세 1000/130" / "전세 4.6억" 형태의 표시 문자열로 변환. */
export function formatListingPrice(listing: Listing): string {
  if (listing.tradeType === "월세") {
    return `월세 ${listing.depositManwon}/${listing.monthlyRentManwon}`;
  }
  if (listing.tradeType === "전세") {
    return `전세 ${formatManwon(listing.depositManwon)}`;
  }
  return `매매 ${formatManwon(listing.salePriceManwon)}`;
}

export function getListings(
  filters?: { kind?: PropertyKind; tradeType?: TradeType; lawdCd?: string; petsAllowed?: boolean },
  signal?: AbortSignal
): Promise<Listing[] | null> {
  const query = new URLSearchParams();
  if (filters?.kind) query.set("kind", filters.kind);
  if (filters?.tradeType) query.set("tradeType", filters.tradeType);
  if (filters?.lawdCd) query.set("lawdCd", filters.lawdCd);
  if (filters?.petsAllowed) query.set("petsAllowed", "true");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return getJson<Listing[]>(`/api/listings${suffix}`, signal);
}

export function getListing(id: string, signal?: AbortSignal): Promise<Listing | null> {
  return getJson<Listing>(`/api/listings/${id}`, signal);
}
