"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Bed,
  Bell,
  BriefcaseBusiness,
  Building,
  Building2,
  CalendarClock,
  ChevronRight,
  Copy,
  DoorOpen,
  Heart,
  HomeIcon,
  House,
  Layers3,
  MapPinned,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Ruler,
  Search,
  Share2,
  SlidersHorizontal,
  UserRound,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  formatManwon,
  getMarketSummary,
  propertyTypeForRoom,
  regionForLocation,
  type MarketSummary
} from "../lib/api";
import {
  DEMO_COST_QUEUE_SUMMARY,
  DEMO_COSTS,
  DEMO_DISCLOSURE_SETTING,
  DEMO_MONTHLY_SUMMARY,
  DEMO_RECEIPTS
} from "../lib/demo-cost";
import {
  DEMO_VENDOR_DUPLICATE_CANDIDATES,
  DEMO_VENDOR_JOBS,
  DEMO_VENDOR_PERF,
  DEMO_VENDORS
} from "../lib/demo-vendor-mgmt";
import {
  WoozuLoginScreen,
  type AppRole,
  type AuthMode,
  type ViewerProfile
} from "./_components/WoozuLoginScreen";
import { MobileRoleMenu } from "./_components/MobileRoleMenu";
import TourActionBell from "./_components/TourActionBell";
import TourUploadBanner from "./_components/TourUploadBanner";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { intakeSplatAsset, listSplatAssetsByListing, type SplatAsset } from "@/lib/splat-asset-api";
import type { ListingFloorPlan3D } from "./_components/ListingTourRoom3D";
import {
  demoListings as listings,
  demoMapItems,
  getListingPriceRows,
  isRemotePhoto,
  LISTING_PHOTO_PLACEHOLDER,
  listingDetailAddressLabel,
  listingRegisteredAgoLabel,
  mapListings,
  monthlyDealLabel,
  tradeListingToCard,
  tradePriceLabel,
  TRADE_LISTING_NO_PREFIX,
  type Listing,
  type MapDealTone,
  type MapPanelItem,
  type TradeListing
} from "../lib/listing-catalog";
import { savedConditions } from "./my/flows/my-shared";
import LandlordMyPage from "./my/flows/LandlordMyPage";
import TenantMyPage from "./my/flows/TenantMyPage";
import {
  naverMapScriptUrl,
  NaverMapPreview,
  type MapMarkerInput,
  type NaverGeocodeResponse,
  type NaverMapViewport
} from "./_components/NaverMapPreview";
import { loadSavedListingNos, toggleSavedListingNo } from "../lib/saved-listings";
import { hasCapability, unifiedLoginPath } from "../lib/unified-login";
import { TradeChatCenter } from "./_components/TradeChatCenter";
import {
  OWNER_DRAFT_STORAGE_KEY,
  emptyOwnerForm,
  formatDraftSavedAt,
  initialOwnerListings,
  parseOwnerDraft,
  serializeOwnerDraft
} from "../lib/owner-draft";

type AppTab = "home" | "map" | "saved" | "inquiry" | "sell" | "living";
type MapResultTab = "rooms" | "complexes" | "agents";
type MapPoint = { lat: number; lng: number };
type MapQueryType = "neighborhood" | "address" | "road" | "building" | "station" | "place";
type MapQueryPrecision = "neighborhood" | "address" | "point";
type MapSearchContext = {
  source: "default" | "search" | "user-location";
  label: string;
  center: MapPoint;
  radiusM: number;
  queryType?: MapQueryType;
  precision?: MapQueryPrecision;
  addressText?: string;
  description?: string;
};
type MapResolvedQuery = MapSearchContext & {
  source: "search";
  queryType: MapQueryType;
  precision: MapQueryPrecision;
  addressText: string;
  description: string;
};
type MapLocationStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable";
type MapQueryStatus = "idle" | "resolving" | "resolved" | "fallback";
type MapListingGroup = {
  groupKey: string;
  listings: MapPanelItem[];
  representative: MapPanelItem;
  lat: number;
  lng: number;
  title: string;
  price: string;
  mapLabel: string;
  dealTone?: MapDealTone;
  clusterLabel: string;
  updated: string;
};





const protectedRoleConfig = {
  tenant: {
    sessionRole: "TENANT",
    intent: "tenant",
    redirectTo: "/living"
  },
  landlord: {
    sessionRole: "LANDLORD",
    intent: "landlord",
    redirectTo: "/sell"
  }
} as const;

const normalizeAppRole = (value: string | null): AppRole | null => {
  if (value === "seeker" || value === "tenant" || value === "landlord") return value;
  return null;
};

const normalizeAppTab = (value: string | null): AppTab | null => {
  if (value === "home" || value === "map" || value === "saved" || value === "inquiry" || value === "sell" || value === "living") {
    return value;
  }
  // 레거시 딥링크 하위호환: mypage는 이제 역할별 탭으로 분리됐다.
  if (value === "mypage") return "sell";
  return null;
};

const normalizeAuthMode = (value: string | null): AuthMode | null => {
  if (value === "login" || value === "signup") return value;
  return null;
};

const appRoleForViewer = (viewer: ViewerProfile): AppRole => {
  if (viewer.role === "TENANT") return "tenant";
  if (viewer.role === "LANDLORD") return "landlord";
  return "seeker";
};

const categories = [
  { label: "전체", Icon: Building },
  { label: "원룸", Icon: DoorOpen },
  { label: "투룸", Icon: Bed },
  { label: "오피스텔", Icon: BriefcaseBusiness },
  { label: "아파트", Icon: Building2 },
  { label: "빌라", Icon: House },
  { label: "단기임대", Icon: CalendarClock }
];

// 카테고리 ↔ 매물 매칭 — 홈 피드 필터와 카테고리 카드의 실제 매물 수가 같은 규칙을 쓴다.
const listingMatchesCategory = (label: string, listing: Listing): boolean => {
  if (label === "전체") return true;
  if (label === "원룸" || label === "오피스텔" || label === "아파트" || label === "빌라") {
    return listing.roomType === label;
  }
  if (label === "투룸") return listing.spec.includes("투룸") || listing.spec.includes("복층");
  if (label === "단기임대") return listing.tags.includes("단기") || listing.tags.includes("단기임대");
  return false;
};

const quickFilters = ["월세", "전세", "관리비 포함", "반려동물", "주차", "풀옵션"];

const sortOptions = [
  { label: "정확도순", description: "실매물 확인, 응답률, 거리 기준으로 추천" },
  { label: "최신순", description: "오늘 확인되거나 새로 올라온 매물 먼저" },
  { label: "낮은 월세순", description: "월세 부담이 낮은 매물부터 확인" },
  { label: "3D 투어 우선", description: "3D 투어가 준비된 매물을 상단에 배치" }
];


const searchSuggestions = {
  recent: ["서초구 방배동", "내방역 원룸", "강남역 오피스텔"],
  districts: ["방배동", "서초동", "역삼동", "성수동", "마포구 공덕동"],
  subways: ["내방역 7호선", "강남역 2호선", "서울숲역 수인분당", "공덕역 5호선"]
};

const notificationItems = [
  {
    label: "새 매물",
    title: "방배동 월세 조건에 맞는 확인매물 3개",
    body: "3D 투어 가능 매물 1개가 포함되어 있습니다.",
    time: "방금"
  },
  {
    label: "문의",
    title: "내방역 푸른공인중개사 답변 대기",
    body: "평균 응답 8분 기준으로 문자 답변이 접수됐습니다.",
    time: "5분 전"
  }
];

// 하드코딩 데모 지표/추천/체크리스트 상수들 제거 — 데모 컨셉 정리(4d1010a8 후속)


const DEFAULT_MAP_CONTEXT: MapSearchContext = {
  source: "default",
  label: "서초구 방배동",
  center: { lat: 37.4875, lng: 126.9931 },
  radiusM: 2500,
  queryType: "neighborhood",
  precision: "neighborhood"
};
const MAP_SEARCH_RADIUS_M = 2500;
const MAP_SEARCH_RADIUS_BY_PRECISION: Record<MapQueryPrecision, number> = {
  neighborhood: MAP_SEARCH_RADIUS_M,
  address: 800,
  point: 1000
};
const MAP_QUERY_TYPE_LABELS: Record<MapQueryType, string> = {
  neighborhood: "동네",
  address: "주소",
  road: "도로명",
  building: "장소",
  station: "역",
  place: "랜드마크"
};

const formatAreaTitle = (area: string) => area.replace(/^서울특별시\s*/, "").replace(/^서초구\s*/, "");

let naverMapServiceLoadPromise: Promise<boolean> | null = null;

function waitForNaverMapService(script?: HTMLScriptElement | null): Promise<boolean> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;

    const finish = (isReady: boolean) => {
      if (settled) return;
      settled = true;
      resolve(isReady);
    };
    const check = () => {
      if (window.naver?.maps?.Service) {
        finish(true);
        return;
      }

      if (Date.now() - startedAt > 7000) {
        finish(false);
        return;
      }

      window.setTimeout(check, 100);
    };

    script?.addEventListener("error", () => finish(false), { once: true });
    check();
  });
}

function loadNaverMapService(): Promise<boolean> {
  if (typeof window === "undefined" || !naverMapScriptUrl) return Promise.resolve(false);
  if (window.naver?.maps?.Service) return Promise.resolve(true);
  if (naverMapServiceLoadPromise) return naverMapServiceLoadPromise;

  const existingScript =
    (document.getElementById("naver-map-script") as HTMLScriptElement | null) ??
    (document.getElementById("naver-map-loader") as HTMLScriptElement | null);
  const script = existingScript ?? document.createElement("script");

  if (!existingScript) {
    script.id = "naver-map-script";
    script.src = naverMapScriptUrl;
    script.async = true;
    document.head.appendChild(script);
  }

  naverMapServiceLoadPromise = waitForNaverMapService(script).finally(() => {
    if (!window.naver?.maps?.Service) {
      naverMapServiceLoadPromise = null;
    }
  });
  return naverMapServiceLoadPromise;
}

type NaverGeocodeAddress = NonNullable<NonNullable<NaverGeocodeResponse["v2"]>["addresses"]>[number];

function compactAddressLabel(value: string) {
  return value.trim().replace(/^대한민국\s*/, "").replace(/^서울특별시\s*/, "");
}

function addressParts(address?: { roadAddress?: string; jibunAddress?: string }) {
  const addressText = (address?.jibunAddress || address?.roadAddress || "").trim();
  return addressText.split(/\s+/).filter(Boolean);
}

function isStationMapQuery(query: string) {
  return /역(\s|$)/.test(query.trim());
}

function isNeighborhoodMapQuery(query: string) {
  return /(동|가|읍|면|리)$/.test(query.trim());
}

function hasAddressNumberSignal(query: string) {
  return /\d/.test(query);
}

function hasRoadNameSignal(query: string) {
  return /(로|길)\s*\d*/.test(query);
}

const MAP_ADMIN_ALIASES: Record<string, string> = {
  서울: "서울특별시",
  서울시: "서울특별시",
  부산: "부산광역시",
  부산시: "부산광역시",
  대구: "대구광역시",
  대구시: "대구광역시",
  인천: "인천광역시",
  인천시: "인천광역시",
  광주: "광주광역시",
  광주시: "광주광역시",
  대전: "대전광역시",
  대전시: "대전광역시",
  울산: "울산광역시",
  울산시: "울산광역시",
  세종: "세종특별자치시",
  세종시: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  강원도: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전남: "전라남도",
  전북: "전북특별자치도",
  전라북도: "전북특별자치도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
  제주도: "제주특별자치도"
};

type ParsedMapSearch = {
  normalized: string;
  adminTokens: string[];
  roadNames: string[];
  otherTokens: string[];
};

function normalizeMapSearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[()[\]{},]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalMapAdminToken(token: string) {
  return MAP_ADMIN_ALIASES[token] ?? token;
}

function parseMapSearch(value: string): ParsedMapSearch {
  const normalized = normalizeMapSearchText(value);
  const words = normalized.split(" ").filter(Boolean);
  const roadNames = Array.from(
    new Set(normalized.match(/[가-힣a-z0-9·.-]+(?:대로|로|길)/g) ?? [])
  );
  const adminTokens = Array.from(
    new Set(
      words
        .filter(
          (word) =>
            Boolean(MAP_ADMIN_ALIASES[word]) ||
            /(특별시|광역시|특별자치시|특별자치도|도|시|군|구|읍|면|동|리)$/.test(word)
        )
        .map(canonicalMapAdminToken)
    )
  );
  const structuralTokens = new Set([...adminTokens, ...roadNames]);
  const otherTokens = words.filter((word) => {
    if (word === "대한민국") return false;
    const canonicalWord = canonicalMapAdminToken(word);
    if (structuralTokens.has(canonicalWord)) return false;
    return !roadNames.includes(word);
  });

  return { normalized, adminTokens, roadNames, otherTokens };
}

function mapAddressMatchesExplicitQuery(query: string, address: string) {
  const parsedQuery = parseMapSearch(query);
  const parsedAddress = parseMapSearch(address);
  const hasExplicitBuildingNumber = parsedQuery.otherTokens.some((token) => /^\d+(?:-\d+)?$/.test(token));
  const queryBuildingNumbers = parsedQuery.roadNames.length > 0
    ? parsedQuery.otherTokens.filter((token) => /^\d+(?:-\d+)?$/.test(token))
    : [];
  const addressWords = normalizeMapSearchText(address).split(" ");
  const roadMatches = (queryRoad: string) =>
    parsedAddress.roadNames.some((addressRoad) => {
      if (addressRoad === queryRoad) return true;
      if (hasExplicitBuildingNumber || !queryRoad.endsWith("로") || !addressRoad.startsWith(queryRoad)) return false;
      return /^\d+(?:번)?길$/.test(addressRoad.slice(queryRoad.length));
    });
  return (
    parsedQuery.adminTokens.every((token) => parsedAddress.adminTokens.includes(token)) &&
    parsedQuery.roadNames.every(roadMatches) &&
    queryBuildingNumbers.every((number) => addressWords.includes(number))
  );
}

function mapListingMatchesQuery(listing: MapPanelItem, query: string) {
  const parsedQuery = parseMapSearch(query);
  if (!parsedQuery.normalized) return true;

  const addressText = [listing.distance, listing.detailAddress ?? ""].join(" ");
  if (!mapAddressMatchesExplicitQuery(query, addressText)) return false;

  const searchableText = normalizeMapSearchText(
    [listing.title, listing.price, listing.meta, listing.distance, listing.detailAddress ?? "", ...listing.flags].join(" ")
  );
  const searchableWords = searchableText.split(" ");
  return parsedQuery.otherTokens.every((token) =>
    /^\d+(?:-\d+)?$/.test(token) ? searchableWords.includes(token) : searchableText.includes(token)
  );
}

function inferMapQueryType(query: string, address?: { roadAddress?: string; jibunAddress?: string }): MapQueryType {
  const compactQuery = query.trim().replace(/\s+/g, " ");
  if (isStationMapQuery(compactQuery)) return "station";
  if (isNeighborhoodMapQuery(compactQuery)) return "neighborhood";
  if (hasRoadNameSignal(compactQuery) && address?.roadAddress) return "road";
  if (hasAddressNumberSignal(compactQuery)) return address?.roadAddress ? "road" : "address";
  return address?.roadAddress || address?.jibunAddress ? "building" : "neighborhood";
}

function precisionForMapQueryType(type: MapQueryType): MapQueryPrecision {
  if (type === "neighborhood") return "neighborhood";
  if (type === "station" || type === "building" || type === "place") return "point";
  return "address";
}

function mapQueryLabelFromAddress(query: string, address?: { roadAddress?: string; jibunAddress?: string }) {
  const compactQuery = query.trim().replace(/\s+/g, " ");
  const queryType = inferMapQueryType(compactQuery, address);
  if (queryType === "station") return compactQuery;
  if (queryType === "building") return compactQuery;
  if ((queryType === "road" || queryType === "address") && (address?.roadAddress || address?.jibunAddress)) {
    return compactAddressLabel(address.roadAddress || address.jibunAddress || compactQuery);
  }

  const parts = addressParts(address);
  const district = [...parts].reverse().find((part) => /(구|군)$/.test(part));
  const neighborhood = [...parts].reverse().find((part) => /(동|가|읍|면|리)$/.test(part));

  if (district && neighborhood) return `${district} ${neighborhood}`;
  if (neighborhood) return neighborhood;
  return compactQuery;
}

function mapQueryDescription(queryType: MapQueryType, precision: MapQueryPrecision, addressText: string) {
  const radius = MAP_SEARCH_RADIUS_BY_PRECISION[precision];
  return `${MAP_QUERY_TYPE_LABELS[queryType]} 기준 · 반경 ${formatDistanceLabel(radius)} · ${addressText}`;
}

function resolvedMapQueryFromAddress(query: string, address?: NaverGeocodeAddress): MapResolvedQuery | null {
  const lat = Number(address?.y);
  const lng = Number(address?.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const queryType = inferMapQueryType(query, address);
  const precision = precisionForMapQueryType(queryType);
  const addressText = compactAddressLabel(address?.roadAddress || address?.jibunAddress || query);
  const label = mapQueryLabelFromAddress(query, address);

  return {
    source: "search",
    label,
    center: { lat, lng },
    radiusM: MAP_SEARCH_RADIUS_BY_PRECISION[precision],
    queryType,
    precision,
    addressText,
    description: mapQueryDescription(queryType, precision, addressText)
  };
}

async function resolveMapQueryCandidates(query: string): Promise<MapResolvedQuery[]> {
  const keyword = query.trim();
  if (!keyword) return [];

  const isReady = await loadNaverMapService();
  const service = window.naver?.maps?.Service;
  if (!isReady || !service) return [];

  return new Promise((resolve) => {
    try {
      service.geocode({ query: keyword }, (status: string, response: NaverGeocodeResponse) => {
        if (status !== service.Status.OK) {
          resolve([]);
          return;
        }

        const seen = new Set<string>();
        const candidates = (response.v2?.addresses ?? [])
          .filter((address) =>
            mapAddressMatchesExplicitQuery(
              keyword,
              [address.roadAddress ?? "", address.jibunAddress ?? ""].join(" ")
            )
          )
          .map((address) => resolvedMapQueryFromAddress(keyword, address))
          .filter((candidate): candidate is MapResolvedQuery => Boolean(candidate))
          .filter((candidate) => {
            const key = `${candidate.label}|${candidate.center.lat.toFixed(6)}|${candidate.center.lng.toFixed(6)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 5);
        resolve(candidates);
      });
    } catch {
      resolve([]);
    }
  });
}

type NaverLocalPlaceSearchResponse = {
  configured?: boolean;
  message?: string;
  items?: Array<{
    kind?: "address" | "place";
    title?: string;
    category?: string;
    description?: string;
    address?: string;
    roadAddress?: string;
    canonicalAddress?: string;
    lat?: number;
    lng?: number;
  }>;
};

type ExternalMapSearchResult = {
  candidates: MapResolvedQuery[];
  errorMessage?: string;
};

async function resolveLocalPlaceCandidates(query: string): Promise<ExternalMapSearchResult> {
  const keyword = query.trim();
  if (!keyword) return { candidates: [] };

  try {
    const response = await fetch(`/api/map/search?q=${encodeURIComponent(keyword)}`, { cache: "no-store" });
    const payload = (await response.json()) as NaverLocalPlaceSearchResponse;
    if (!response.ok || payload.configured === false) {
      return {
        candidates: [],
        errorMessage: payload.message || "지역 검색 서비스를 확인할 수 없습니다."
      };
    }

    const seen = new Set<string>();
    const candidates: MapResolvedQuery[] = [];
    let addressCandidateCount = 0;

    for (const item of payload.items ?? []) {
      const addressText = item.roadAddress?.trim() || item.address?.trim() || "";
      const label = item.title?.trim() || addressText;
      if (!label || !mapAddressMatchesExplicitQuery(keyword, addressText)) continue;

      if (item.kind === "address" || item.canonicalAddress) {
        addressCandidateCount += 1;
        const canonicalAddress = item.canonicalAddress?.trim() || addressText;
        const geocoded = (await resolveMapQueryCandidates(canonicalAddress))[0];
        if (!geocoded) continue;

        const key = `address|${geocoded.center.lat.toFixed(6)}|${geocoded.center.lng.toFixed(6)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          ...geocoded,
          label,
          radiusM: MAP_SEARCH_RADIUS_M,
          queryType: "road",
          precision: "address",
          addressText: canonicalAddress,
          description: [item.category?.trim(), canonicalAddress].filter(Boolean).join(" · ")
        });
        continue;
      }

      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const key = `${label}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const detail = [item.category?.trim(), addressText].filter(Boolean).join(" · ");
      candidates.push({
        source: "search",
        label,
        center: { lat, lng },
        radiusM: MAP_SEARCH_RADIUS_M,
        queryType: "place",
        precision: "point",
        addressText,
        description: detail || item.description?.trim() || "네이버 지역 검색 결과"
      });
    }

    return {
      candidates: candidates.slice(0, 5),
      errorMessage:
        addressCandidateCount > 0 && candidates.length === 0
          ? "도로명주소는 확인했지만 지도 좌표를 확인하지 못했습니다."
          : undefined
    };
  } catch {
    return { candidates: [], errorMessage: "지역 검색 서비스 연결에 실패했습니다." };
  }
}

const distanceBetweenMeters = (from: MapPoint, to: MapPoint) => {
  const earthRadiusM = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const fromLat = toRad(from.lat);
  const toLat = toRad(to.lat);
  const deltaLat = toRad(to.lat - from.lat);
  const deltaLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatDistanceLabel = (meters: number) => {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)}m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)}km`;
};

const MAP_POPUP_VIEWPORT_SCOPE_MULTIPLIER = 2.4;

const midpointLongitude = (west: number, east: number) => {
  if (west <= east) return (west + east) / 2;
  const midpoint = (west + east + 360) / 2;
  return midpoint > 180 ? midpoint - 360 : midpoint;
};

const isLongitudeWithinBounds = (lng: number, west: number, east: number) =>
  west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;

const isMapPointInsideViewport = (point: MapPoint, viewport: NaverMapViewport | null) => {
  if (!viewport) return true;
  return (
    point.lat >= viewport.south &&
    point.lat <= viewport.north &&
    isLongitudeWithinBounds(point.lng, viewport.west, viewport.east)
  );
};

const mapViewportMaxSpanMeters = (viewport: NaverMapViewport | null) => {
  if (!viewport) return 0;
  const centerLat = (viewport.north + viewport.south) / 2;
  const centerLng = midpointLongitude(viewport.west, viewport.east);
  const widthM = distanceBetweenMeters(
    { lat: centerLat, lng: viewport.west },
    { lat: centerLat, lng: viewport.east }
  );
  const heightM = distanceBetweenMeters(
    { lat: viewport.south, lng: centerLng },
    { lat: viewport.north, lng: centerLng }
  );
  return Math.max(widthM, heightM);
};

const mapListingGroupKey = (listing: MapPanelItem) => {
  if (!Number.isFinite(listing.lat) || !Number.isFinite(listing.lng)) return listing.listingNo;
  return `${listing.lat.toFixed(5)}:${listing.lng.toFixed(5)}`;
};

const mapBuildingTitle = (listing: MapPanelItem) =>
  listing.title
    .replace(/\s+\d{2,4}\s*호?$/u, "")
    .replace(/\s+/g, " ")
    .trim() || listing.title;

const mapGroupPriceLabel = (listings: MapPanelItem[]) => {
  if (listings.length === 1) return listings[0].price;
  const monthlyRents = listings.map((listing) => listing.monthlyRent).filter((rent) => Number.isFinite(rent) && rent < 900);
  if (monthlyRents.length !== listings.length) return `${listings.length}개 매물`;
  const minRent = Math.min(...monthlyRents);
  const maxRent = Math.max(...monthlyRents);
  return minRent === maxRent ? `월 ${minRent}만` : `월 ${minRent}~${maxRent}만`;
};

const mapGroupLabel = (listings: MapPanelItem[]) => {
  if (listings.length === 1) return listings[0].mapLabel;
  const monthlyRents = listings.map((listing) => listing.monthlyRent).filter((rent) => Number.isFinite(rent) && rent < 900);
  if (monthlyRents.length !== listings.length) return `${listings.length}개`;
  const minRent = Math.min(...monthlyRents);
  const maxRent = Math.max(...monthlyRents);
  return minRent === maxRent ? `${minRent}만` : `${minRent}~${maxRent}만`;
};

const groupMapListings = (listings: MapPanelItem[]): MapListingGroup[] => {
  const groups = new Map<string, MapPanelItem[]>();
  listings.forEach((listing) => {
    const key = mapListingGroupKey(listing);
    groups.set(key, [...(groups.get(key) ?? []), listing]);
  });

  return Array.from(groups.entries()).map(([groupKey, groupListings]) => {
    const representative = groupListings[0];
    const title = groupListings.length > 1 ? mapBuildingTitle(representative) : representative.title;
    const dealTone = groupListings.every((listing) => listing.dealTone === "jeonse") ? "jeonse" : representative.dealTone;
    return {
      groupKey,
      listings: groupListings,
      representative,
      lat: representative.lat,
      lng: representative.lng,
      title,
      price: mapGroupPriceLabel(groupListings),
      mapLabel: mapGroupLabel(groupListings),
      dealTone,
      clusterLabel: groupListings.length > 1 ? `${groupListings.length}개` : representative.clusterLabel,
      updated: groupListings.length > 1 ? "건물 매물" : representative.updated
    };
  });
};



const bottomTabs: Array<{ key: AppTab; label: string; Icon: LucideIcon; href: string }> = [
  { key: "home", label: "홈", Icon: HomeIcon, href: "#home-title" },
  { key: "map", label: "지도", Icon: MapPinned, href: "#map-list" },
  { key: "saved", label: "찜", Icon: Heart, href: "#saved-list" },
  { key: "inquiry", label: "채팅", Icon: MessageCircle, href: "#inquiry" }
];

const mapResultTabs: Array<{ key: MapResultTab; label: string }> = [
  { key: "rooms", label: "전체 방" },
  { key: "complexes", label: "단지" },
  { key: "agents", label: "중개사무소" }
];



const resetWindowScroll = () => {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  document.querySelectorAll<HTMLElement>(".service-frame, .screen, .home-screen, .map-screen, .listing-detail-screen").forEach((element) => {
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
};

const resetWindowScrollSoon = () => {
  resetWindowScroll();
  requestAnimationFrame(() => {
    resetWindowScroll();
    requestAnimationFrame(resetWindowScroll);
  });
  window.setTimeout(resetWindowScroll, 120);
  window.setTimeout(resetWindowScroll, 320);
};


/** 직접등록 매물을 지도 패널 아이템으로 투영 — 좌표 없으면 NaN(마커 제외, 목록에는 노출). */
function tradeListingToMapItem(listing: TradeListing, index: number, total: number): MapPanelItem {
  const shortPrice =
    listing.tradeType === "월세" || listing.tradeType === "반전세"
      ? monthlyDealLabel(listing.depositManwon, listing.monthlyRentManwon)
      : tradePriceLabel(listing);
  return {
    listingNo: `${TRADE_LISTING_NO_PREFIX}${listing.id}`,
    title: listing.title,
    price: tradePriceLabel(listing),
    meta: `${listing.roomType} · 집주인 직접`,
    distance: listing.location,
    detailAddress: listing.detailAddress,
    updated: listingRegisteredAgoLabel(listing.createdAt),
    flags: ["집주인 직접"],
    image: (Array.isArray(listing.images) && listing.images[0]) || LISTING_PHOTO_PLACEHOLDER,
    lat: typeof listing.lat === "number" ? listing.lat : Number.NaN,
    lng: typeof listing.lng === "number" ? listing.lng : Number.NaN,
    mapLabel: shortPrice,
    dealTone: listing.tradeType === "전세" ? "jeonse" : "monthly",
    clusterLabel: "직접",
    verifyStatus: "집주인 직접 등록",
    responseStatus: "채팅 문의 가능",
    tourStatus: "방문 예약",
    accuracyRank: 0,
    recencyRank: index - total, // 서버 목록은 최신순 — 데모(0~2)보다 항상 앞선다
    monthlyRent: listing.monthlyRentManwon,
    has3DTour: false
  };
}

const getMapFilterSummary = (filter: string) => {
  if (filter === "원룸·투룸") {
    return "원룸·복층 중심";
  }

  if (filter === "보증금") {
    return "낮은 월세 우선";
  }

  if (filter === "안전") {
    return "안심 점수 높은 순";
  }

  if (filter === "3D 가능") {
    return "3D 투어 가능";
  }

  if (filter === "찜한 매물") {
    return "관심목록 기준";
  }

  return "시세 지도 기준";
};

const complexCards = [
  {
    name: "방배 루미에르",
    address: "방배동 103-8 · 내방역 5분",
    deal: "월세 평균 1000/118",
    count: "확인매물 14개",
    badge: "3D 단지투어",
    score: "생활점수 91"
  },
  {
    name: "방배 명지 해든터",
    address: "방배중앙로 생활권 · 큰길가",
    deal: "전월세 평균 8% 안정",
    count: "최근 등록 6개",
    badge: "실거주 리뷰",
    score: "교통점수 88"
  }
];

const agentCards = [
  {
    name: "내방역 푸른공인중개사",
    manager: "대표 김하늘",
    rating: "평점 4.8",
    response: "평균 응답 8분",
    inventory: "확인매물 126개",
    tags: ["현장촬영", "문자문의"]
  },
  {
    name: "방배 스마트부동산",
    manager: "소장 박서준",
    rating: "평점 4.6",
    response: "오늘 문의 12건",
    inventory: "3D 가능 18개",
    tags: ["신축 전문", "야간 상담", "전세 상담"]
  }
];









function SavedListingsSection({
  allListings,
  savedListingNos,
  openListing,
  onToggleSaved
}: {
  /** 데모 + 직접등록(TRADE-) 병합 피드 — 정적 배열만 보면 서버 매물 찜이 목록에서 빠진다. */
  allListings: Listing[];
  savedListingNos: string[];
  openListing: (listing: Listing) => void;
  onToggleSaved: (listingNo: string) => void;
}) {
  const savedListings = allListings.filter((listing) => savedListingNos.includes(listing.listingNo));

  return (
    <section className="screen saved-screen" id="saved-list" aria-labelledby="saved-title">
      <div className="section-title no-margin">
        <div>
          <h2 id="saved-title">찜한 매물</h2>
          <p>최근 본 방과 비교하기 좋은 매물을 모아뒀습니다.</p>
        </div>
        <strong>{savedListings.length}개</strong>
      </div>

      <div className="saved-card-list">
        {savedListings.length > 0 ? (
          savedListings.map((listing) => (
            <article className="saved-card" key={listing.listingNo}>
              <button type="button" onClick={() => openListing(listing)}>
                <Image src={listing.image} alt={`${listing.title} 찜한 매물 사진`} width={240} height={180} unoptimized={isRemotePhoto(listing.image)} />
                <span>
                  <b>{listing.price}</b>
                  <strong>{listing.title}</strong>
                  <em>{listing.location}</em>
                  {listing.detailAddress ? <em>세부주소: {listing.detailAddress}</em> : null}
                </span>
              </button>
              <div>
                <small>{listing.score} · {listing.badges.join(" · ")}</small>
                <button type="button" onClick={() => onToggleSaved(listing.listingNo)}>찜 해제</button>
              </div>
            </article>
          ))
        ) : (
          <article className="saved-empty-card">
            <strong>아직 찜한 매물이 없습니다</strong>
            <p>추천 매물이나 지도 결과에서 하트를 누르면 여기에 모입니다.</p>
          </article>
        )}
      </div>
    </section>
  );
}

function InquiryHubSection({
  onRequireLogin,
  focusThreadId,
  composeListing
}: {
  onRequireLogin: () => void;
  focusThreadId?: string;
  composeListing?: { listingNo: string; title: string };
}) {
  return (
    <section className="screen inquiry-screen" id="inquiry" aria-labelledby="inquiry-title">
      <div className="section-title no-margin">
        <div>
          <h2 id="inquiry-title">채팅</h2>
          <p>매물을 보고 연락한 사람들과의 채팅이 모두 여기에 모입니다.</p>
        </div>
      </div>

      {/* 매물 거래 채팅(당근식) — 매물을 보고 연락한 사람(구매자)과 집주인의 채팅을 한 곳에서 본다.
          세입자↔관리자 소통 채널(tenant/manager messaging)과는 별개다.
          QA: roleFilter="buyer" 고정 탓에 집주인이 채팅 탭에서 받은 채팅을 못 보던 문제 → 필터 해제.
          variant="hub": 데스크톱 브라우저는 목록+대화 2패널, 앱(PWA·좁은 화면)은 채팅 목록 단일 패널. */}
      <div className="inquiry-chat-panel">
        <TradeChatCenter
          variant="hub"
          emptyText="매물 상세의 '문자문의'로 첫 채팅을 시작해보세요. 받은 채팅도 여기로 들어옵니다."
          onRequireLogin={onRequireLogin}
          focusThreadId={focusThreadId}
          composeListing={composeListing}
        />
      </div>
    </section>
  );
}




function FilterBottomSheet({
  isOpen,
  activeCategory,
  activeQuickFilters,
  resultCount,
  onClose,
  onApply,
  onCategoryChange,
  onQuickFilterToggle
}: {
  isOpen: boolean;
  activeCategory: string;
  activeQuickFilters: string[];
  resultCount: number;
  onClose: () => void;
  onApply: () => void;
  onCategoryChange: (category: string) => void;
  onQuickFilterToggle: (filter: string) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="filter-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="filter-sheet" aria-modal="true" role="dialog" aria-labelledby="filter-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>필터</span>
            <h2 id="filter-sheet-title">조건 좁히기</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="필터 닫기">×</button>
        </header>

        <div className="filter-summary-card" aria-label="현재 필터 요약">
          <div>
            <span>현재 조건</span>
            <strong>{[activeCategory, ...activeQuickFilters].join(" · ") || "전체"}</strong>
          </div>
          <em>예상 {resultCount}개</em>
        </div>

        <div className="filter-sheet-section">
          <strong>거래 유형</strong>
          <div className="filter-segment-grid">
            {["월세", "전세", "단기", "매매"].map((dealType) => (
              <button
                className={activeQuickFilters.includes(dealType) ? "active" : ""}
                type="button"
                key={dealType}
                onClick={() => {
                  if (dealType === "단기" || dealType === "매매") {
                    return;
                  }

                  onQuickFilterToggle(dealType);
                }}
              >
                {dealType}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-sheet-section">
          <strong>매물 유형</strong>
          <div className="filter-option-grid">
            {categories.slice(0, 4).map((category) => (
              <button
                className={activeCategory === category.label ? "active" : ""}
                type="button"
                key={category.label}
                onClick={() => onCategoryChange(category.label)}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-sheet-section">
          <strong>조건</strong>
          <div className="filter-chip-cloud">
            {quickFilters.map((filter) => (
              <button
                className={activeQuickFilters.includes(filter) ? "active" : ""}
                type="button"
                key={filter}
                onClick={() => onQuickFilterToggle(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-range-panel" aria-label="가격 범위">
          <div>
            <strong>가격 범위</strong>
            <span>보증금 1,000만 이하 · 월세 130만 이하</span>
          </div>
          <div className="filter-range-bars">
            <label>
              <span>보증금</span>
              <input type="range" min="0" max="5000" value="1000" readOnly aria-label="보증금 최대 1000만원" />
            </label>
            <label>
              <span>월세</span>
              <input type="range" min="0" max="200" value="130" readOnly aria-label="월세 최대 130만원" />
            </label>
          </div>
        </div>

        <div className="filter-price-grid">
          <label>
            보증금
            <span>1,000만원 이하</span>
          </label>
          <label>
            월세
            <span>130만원 이하</span>
          </label>
          <label>
            관리비
            <span>포함 우선</span>
          </label>
        </div>

        <button className="filter-apply-button" type="button" onClick={onApply}>
          조건 적용하고 {resultCount}개 보기
        </button>
      </section>
    </div>
  );
}

function SearchBottomSheet({
  isOpen,
  currentArea,
  isResolving = false,
  isMapMode = false,
  queryCandidates = [],
  candidateKeyword = "",
  recentSearches,
  onClose,
  onClearRecentSearches,
  onSelectArea,
  onSelectCandidate
}: {
  isOpen: boolean;
  currentArea: string;
  isResolving?: boolean;
  isMapMode?: boolean;
  queryCandidates?: MapResolvedQuery[];
  candidateKeyword?: string;
  recentSearches: string[];
  onClose: () => void;
  onClearRecentSearches: () => void;
  onSelectArea: (area: string) => void | Promise<void>;
  onSelectCandidate?: (keyword: string, candidate: MapResolvedQuery) => void;
}) {
  const [searchValue, setSearchValue] = useState(currentArea);

  useEffect(() => {
    if (isOpen) {
      setSearchValue(currentArea);
    }
  }, [currentArea, isOpen]);

  const submitSearch = () => {
    const keyword = searchValue.trim();

    if (!keyword || isResolving) {
      return;
    }

    onSelectArea(keyword);
  };
  const normalizedSearchValue = searchValue.trim() || currentArea;
  const searchPreviewCount = normalizedSearchValue.includes("강남") || normalizedSearchValue.includes("역삼") ? 22 : normalizedSearchValue.includes("성수") ? 19 : 42;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="search-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="search-sheet" role="dialog" aria-modal="true" aria-labelledby="search-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>통합검색</span>
            <h2 id="search-sheet-title">어디에서 방을 찾을까요?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="검색 닫기">×</button>
        </header>

        <form className="search-sheet-input" onSubmit={(event) => {
          event.preventDefault();
          submitSearch();
        }}>
          <Search size={20} strokeWidth={2.4} aria-hidden="true" />
          <input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} aria-label="통합 검색어" />
          <button type="submit" disabled={isResolving}>{isResolving ? "확인 중" : "검색"}</button>
        </form>

        {!isMapMode ? (
          <section className="search-live-preview" aria-label="검색 결과 미리보기">
            <div>
              <span>바로 보기</span>
              <strong>{normalizedSearchValue} 주변 확인매물</strong>
              <p>지도에서 시세, 3D 투어, 중개사 응답 상태를 함께 비교합니다.</p>
            </div>
            <div className="search-live-stats">
              <span>
                <b>{searchPreviewCount}개</b>
                예상 매물
              </span>
              <span>
                <b>{Math.max(3, Math.round(searchPreviewCount * 0.28))}개</b>
                3D 가능
              </span>
              <span>
                <b>8분</b>
                평균 응답
              </span>
            </div>
            <button type="button" onClick={submitSearch} disabled={isResolving}>
              {isResolving ? "위치 확인 중" : <>지도에서 {normalizedSearchValue} 보기</>}
            </button>
          </section>
        ) : null}

        {queryCandidates.length > 0 ? (
          <section className="search-result-candidates" aria-label="주소 검색 결과">
            <div>
              <strong>검색 결과</strong>
              <span>{candidateKeyword} 기준 {queryCandidates.length}곳</span>
            </div>
            <div className="search-candidate-list">
              {queryCandidates.map((candidate) => (
                <button
                  type="button"
                  key={`${candidate.label}-${candidate.center.lat}-${candidate.center.lng}`}
                  onClick={() => onSelectCandidate?.(candidateKeyword || candidate.label, candidate)}
                  disabled={isResolving}
                >
                  <span>{MAP_QUERY_TYPE_LABELS[candidate.queryType]}</span>
                  <strong>{candidate.label}</strong>
                  <small>{candidate.description}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {!isMapMode ? (
          <section className="search-condition-strip" aria-label="추천 검색 조건">
            {savedConditions.slice(0, 3).map((condition) => (
              <button type="button" key={condition.label} onClick={() => onSelectArea(condition.area)} disabled={isResolving}>
                <span>{condition.category}</span>
                <strong>{condition.label}</strong>
              </button>
            ))}
          </section>
        ) : null}

        <section className="search-suggestion-section" aria-label="최근 검색">
          <div>
            <strong>최근 검색</strong>
            <button type="button" onClick={onClearRecentSearches}>전체삭제</button>
          </div>
          <div className="search-chip-row">
            {recentSearches.length > 0 ? (
              recentSearches.map((keyword) => (
                <button type="button" key={keyword} onClick={() => onSelectArea(keyword)} disabled={isResolving}>
                  {keyword}
                </button>
              ))
            ) : (
              <span className="recent-empty">최근 검색어가 없습니다</span>
            )}
          </div>
        </section>

        {!isMapMode ? (
          <>
            <section className="search-suggestion-section" aria-label="인기 지역">
              <div>
                <strong>인기 지역</strong>
                <span>실매물 많은 순</span>
              </div>
              <div className="district-rank-list">
                {searchSuggestions.districts.map((district, index) => (
                  <button type="button" key={district} onClick={() => onSelectArea(district)} disabled={isResolving}>
                    <b>{index + 1}</b>
                    <span>{district}</span>
                    <em>{index === 0 ? "42개" : `${28 - index * 3}개`}</em>
                  </button>
                ))}
              </div>
            </section>

            <section className="search-suggestion-section" aria-label="지하철 추천">
              <div>
                <strong>지하철로 찾기</strong>
                <span>도보 10분 기준</span>
              </div>
              <div className="subway-suggestion-grid">
                {searchSuggestions.subways.map((station) => (
                  <button type="button" key={station} onClick={() => onSelectArea(station)} disabled={isResolving}>
                    {station}
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : null}

      </section>
    </div>
  );
}

function SortBottomSheet({
  isOpen,
  activeSort,
  onClose,
  onSelect
}: {
  isOpen: boolean;
  activeSort: string;
  onClose: () => void;
  onSelect: (sort: string) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="sort-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="sort-sheet" role="dialog" aria-modal="true" aria-labelledby="sort-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>매물 정렬</span>
            <h2 id="sort-sheet-title">정렬 방식</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="정렬 닫기">×</button>
        </header>

        <div className="sort-option-list">
          {sortOptions.map((option) => (
            <button
              className={activeSort === option.label ? "active" : ""}
              type="button"
              key={option.label}
              onClick={() => onSelect(option.label)}
            >
              <span>{option.label}</span>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function NotificationSheet({
  isOpen,
  onClose
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="notification-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="notification-sheet" role="dialog" aria-modal="true" aria-labelledby="notification-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>알림센터</span>
            <h2 id="notification-sheet-title">알림</h2>
            <p>새 매물, 문의를 한 번에 확인합니다.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="알림 닫기">×</button>
        </header>

        <div className="notification-list">
          {notificationItems.map((item) => (
            <article key={item.title}>
              <div>
                <span>{item.label}</span>
                <small>{item.time}</small>
              </div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </article>
          ))}
        </div>

        <button className="notification-action" type="button" onClick={onClose}>
          확인
        </button>
      </section>
    </div>
  );
}


// 탭 ↔ URL 경로 매핑 — 탭 전환은 shallow pushState(컴포넌트 유지), 직접 진입은 라우트가 initialTab을 준다.
const TAB_PATHS: Record<AppTab, string> = {
  home: "/",
  map: "/map",
  saved: "/saved",
  inquiry: "/inquiry",
  sell: "/sell",
  living: "/living"
};

const tabForPathname = (pathname: string): AppTab | null => {
  const entry = Object.entries(TAB_PATHS).find(([, path]) => path === pathname);
  return entry ? (entry[0] as AppTab) : null;
};

export default function HomeApp({ initialTab = "home" }: { initialTab?: AppTab }) {
  const [activeRole, setActiveRole] = useState<AppRole>("seeker");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AppTab>(initialTab);
  const [selectedArea, setSelectedArea] = useState(DEFAULT_MAP_CONTEXT.label);
  const [mapTopbarSearchValue, setMapTopbarSearchValue] = useState("");
  const [mapSearchContext, setMapSearchContext] = useState<MapSearchContext>(DEFAULT_MAP_CONTEXT);
  const [hasResolvedMapContext, setHasResolvedMapContext] = useState(false);
  const [mapViewport, setMapViewport] = useState<NaverMapViewport | null>(null);
  const [mapLocationStatus, setMapLocationStatus] = useState<MapLocationStatus>("idle");
  const [mapQueryStatus, setMapQueryStatus] = useState<MapQueryStatus>("idle");
  const [mapQueryCandidates, setMapQueryCandidates] = useState<MapResolvedQuery[]>([]);
  const [mapQueryCandidateKeyword, setMapQueryCandidateKeyword] = useState("");
  const [mapSearchMatchedListingNos, setMapSearchMatchedListingNos] = useState<string[]>([]);
  const [mapSearchErrorMessage, setMapSearchErrorMessage] = useState("");
  const mapLocationRequestedRef = useRef(false);
  const mapContextRequestIdRef = useRef(0);
  const categoryStripRef = useRef<HTMLElement | null>(null);
  const categoryDragStateRef = useRef({
    didMove: false,
    isDragging: false,
    pointerId: -1,
    scrollLeft: 0,
    startX: 0
  });
  const [recentSearches, setRecentSearches] = useState(searchSuggestions.recent);
  const [activeCategory, setActiveCategory] = useState(categories[0].label);
  const [activeQuickFilters, setActiveQuickFilters] = useState<string[]>([]);
  // 홈 검색창 키워드 — 매물명/위치/스펙/태그를 즉시 필터링한다 (QA: 검색창 직접 입력).
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeMapFilter, setActiveMapFilter] = useState("시세");
  const [activeSort, setActiveSort] = useState(sortOptions[0].label);
  const [activeMapResultTab, setActiveMapResultTab] = useState<MapResultTab>("rooms");
  const [selectedMapListingNo, setSelectedMapListingNo] = useState(demoMapItems[0]?.listingNo ?? "");
  // 찜은 localStorage와 동기화 — 상세 라우트(/listing/[id])와 같은 키를 써서 라우트를 오가도 유지된다.
  // 기본값은 빈 목록 — 계정과 무관하게 데모 매물이 찜돼 있던 하드코딩 제거.
  const [savedListingNos, setSavedListingNos] = useState<string[]>([]);
  useEffect(() => {
    setSavedListingNos(loadSavedListingNos([]));
  }, []);
  // 문의 전송 직후 채팅으로 바로 진입할 스레드 id (채팅 탭 TradeChatCenter로 전달)
  const [buyerFocusThreadId, setBuyerFocusThreadId] = useState<string | undefined>(undefined);
  // 상세 "문자로 문의하기"로 진입 시 이 매물의 대화(초안)를 바로 연다 (/inquiry?compose=&title=)
  const [composeListing, setComposeListing] = useState<{ listingNo: string; title: string } | undefined>(undefined);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isSearchSheetOpen, setIsSearchSheetOpen] = useState(false);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [isNotificationSheetOpen, setIsNotificationSheetOpen] = useState(false);
  const [viewer, setViewer] = useState<ViewerProfile | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [isRouteReady, setIsRouteReady] = useState(false);
  const [isDevRolePreview, setIsDevRolePreview] = useState(false);
  // URL ?role=/flow= 딥링크가 역할을 정했는지 — 정했다면 계정 기반 자동 역할이 덮지 않는다.
  const urlRoleAppliedRef = useRef(false);
  // 집 내놓기 시작 모드(/?flow=listing) — 관리 콘솔 보호와 분리된 비보호 등록 진입.
  // LANDLORD capability가 없는 계정도 등록 폼까지는 로그인 루프 없이 접근한다.
  const [isListingStartMode, setIsListingStartMode] = useState(false);
  const isAuthHistoryPushedRef = useRef(false);
  // 공개된 집주인 직접등록 매물 — 모든 계정의 홈 피드 맨 앞에 합류한다.
  const [tradeListings, setTradeListings] = useState<TradeListing[]>([]);
  // 등록 직후 홈 피드 복귀 시에도 호출한다 — 30초 폴링을 기다리지 않고 방금 등록한 매물이 바로 보이게.
  const loadTradeListings = useCallback(
    () =>
      fetch("/api/trade/listings/public", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: TradeListing[]) => {
          if (Array.isArray(data)) setTradeListings(data);
        })
        .catch(() => undefined),
    []
  );
  useEffect(() => {
    const load = loadTradeListings;
    load();
    const timer = window.setInterval(load, 30000);
    // 다른 탭/앱에 다녀오면 즉시 갱신 — 30초 폴링만으로는 "새로고침해야 보이는" 답답함이 남는다.
    const reloadOnReturn = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", reloadOnReturn);
    document.addEventListener("visibilitychange", reloadOnReturn);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", reloadOnReturn);
      document.removeEventListener("visibilitychange", reloadOnReturn);
    };
  }, [loadTradeListings]);

  function requestMapCurrentLocation(force = false) {
    if (!force && mapLocationRequestedRef.current) return;

    if (!navigator.geolocation) {
      mapLocationRequestedRef.current = true;
      setMapLocationStatus("unavailable");
      return;
    }

    const requestId = ++mapContextRequestIdRef.current;
    mapLocationRequestedRef.current = true;
    setMapQueryCandidates([]);
    setMapQueryCandidateKeyword("");
    setMapQueryStatus("idle");
    setMapLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== mapContextRequestIdRef.current) return;

        const center = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
          setMapLocationStatus("unavailable");
          return;
        }

        setMapSearchContext({
          source: "user-location",
          label: "내 위치 주변",
          center,
          radiusM: 3000
        });
        setMapSearchMatchedListingNos([]);
        setHasResolvedMapContext(true);
        setSelectedArea("내 위치 주변");
        setActiveMapResultTab("rooms");
        setMapLocationStatus("granted");
      },
      (error) => {
        if (requestId !== mapContextRequestIdRef.current) return;
        setMapLocationStatus(error.code === 1 ? "denied" : "unavailable");
      },
      {
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 1000 * 60 * 5
      }
    );
  }

  useEffect(() => {
    if (activeTab !== "map" || hasResolvedMapContext) return;
    requestMapCurrentLocation();
    // 지도 탭 첫 진입 때 한 번만 현재 위치를 요청한다. 검색/수동 위치 변경은 별도 액션이 소유한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, hasResolvedMapContext]);

  // 실사진 있는 매물을 앞으로 — 사진 없는 등록(목업 폴백 카드)이 첫 화면을 가리지 않게 한다.
  // sort는 안정 정렬이라 같은 그룹 안에서는 서버의 최신순이 유지된다.
  // 계약완료 매물은 공개 피드에서 제외한다(집주인 마이페이지/관리 콘솔에서만 관리).
  useEffect(() => {
    if (hasResolvedMapContext || mapQueryStatus === "fallback") {
      setMapTopbarSearchValue(selectedArea);
    }
  }, [hasResolvedMapContext, mapQueryStatus, selectedArea]);

  const sortedTradeListings = tradeListings
    .filter((listing) => listing.status !== "계약완료")
    .sort((a, b) => Number((b.images?.length ?? 0) > 0) - Number((a.images?.length ?? 0) > 0));
  const allListings = [...sortedTradeListings.map(tradeListingToCard), ...listings];
  const selectedAreaTitle = formatAreaTitle(selectedArea);
  const hasVisibleMapContext = hasResolvedMapContext && mapQueryStatus !== "fallback";
  const mapAreaTitle =
    hasResolvedMapContext || mapQueryStatus === "fallback" ? selectedAreaTitle : "";
  const mapAreaDisplayTitle = mapAreaTitle || "지역 미선택";
  const activeFilterSummary = [activeCategory, ...activeQuickFilters].join(" · ");
  const visibleHomeListings = allListings.filter((listing) => {
    const categoryMatches = listingMatchesCategory(activeCategory, listing);
    // 거래유형(월세/전세/매매/단기)끼리는 OR — 둘 다 켜면 "월세 또는 전세"다 (QA: every()로 AND 되던 버그).
    const dealTypeFilters = activeQuickFilters.filter((filter) => ["월세", "전세", "매매", "단기"].includes(filter));
    const dealTypeMatches =
      dealTypeFilters.length === 0 || dealTypeFilters.some((filter) => listing.price.includes(filter) || listing.tags.includes(filter));
    const quickFilterMatches = activeQuickFilters
      .filter((filter) => !dealTypeFilters.includes(filter))
      .every((filter) => {
        if (filter === "관리비 포함") {
          return listing.maintenanceFee !== "15만원";
        }

        if (filter === "반려동물") {
          return listing.tags.includes("반려동물");
        }

        return listing.tags.includes(filter);
      });
    const keyword = searchKeyword.trim().toLowerCase();
    const keywordMatches =
      !keyword ||
      [listing.title, listing.location, listingDetailAddressLabel(listing), listing.spec, listing.price, ...listing.tags, ...listing.badges]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

    return categoryMatches && dealTypeMatches && quickFilterMatches && keywordMatches;
  });
  const visibleHomeCount = visibleHomeListings.length;
  const mapFilterSummary = getMapFilterSummary(activeMapFilter);
  const mapFilterOptions = ["시세", "원룸·투룸", "보증금", "안전", "3D 가능", "찜한 매물"];
  // 직접등록 매물을 지도 목록·마커에 합류 — 좌표(lat/lng) 있는 매물은 지도에 찍히고, 없는 매물도 목록에는 뜬다.
  const allMapItems = [
    ...tradeListings.map((listing, index) => tradeListingToMapItem(listing, index, tradeListings.length)),
    ...demoMapItems
  ];
  // 검색어에 명시된 행정구역·도로명을 모두 만족하는 매물만 표시한다.
  const hasAreaSearchQuery = Boolean(parseMapSearch(mapAreaTitle).normalized);
  const areaMatchedMapItems = hasAreaSearchQuery
    ? allMapItems.filter((listing) => mapListingMatchesQuery(listing, mapAreaTitle))
    : allMapItems;
  // 지역 검색 결과가 없을 때 다른 지역의 매물을 섞지 않는다.
  const areaScopedMapItems = hasAreaSearchQuery ? areaMatchedMapItems : allMapItems;
  const isLocationScopedMap = hasResolvedMapContext && mapSearchContext.source === "user-location";
  const isSearchScopedMap = hasResolvedMapContext && mapSearchContext.source === "search";
  const isDistanceScopedMap = isLocationScopedMap || isSearchScopedMap;
  const distanceCandidateMapItems = !hasResolvedMapContext
    ? mapQueryStatus === "fallback"
      ? areaScopedMapItems
      : []
    : isDistanceScopedMap
      ? allMapItems
      : areaScopedMapItems;
  const mapItemsWithDistance = distanceCandidateMapItems.map((listing) => {
    const hasCoordinates = Number.isFinite(listing.lat) && Number.isFinite(listing.lng);
    return {
      ...listing,
      distanceFromCenterM: hasCoordinates
        ? distanceBetweenMeters(mapSearchContext.center, { lat: listing.lat, lng: listing.lng })
        : Number.POSITIVE_INFINITY
    };
  });
  const nearbyMapItems = isDistanceScopedMap
    ? mapItemsWithDistance.filter((listing) => listing.distanceFromCenterM <= mapSearchContext.radiusM)
    : [];
  const explicitlyMatchedMapItems = isSearchScopedMap
    ? mapItemsWithDistance.filter((listing) => mapSearchMatchedListingNos.includes(listing.listingNo))
    : [];
  const isRadiusEmptyMap =
    isDistanceScopedMap && nearbyMapItems.length === 0 && explicitlyMatchedMapItems.length === 0;
  const isAreaSearchEmptyMap =
    !isDistanceScopedMap && hasAreaSearchQuery && areaMatchedMapItems.length === 0;
  const isMapContextEmpty = !hasResolvedMapContext && mapQueryStatus !== "fallback";
  const locationScopedMapItems = isSearchScopedMap
    ? Array.from(
        new Map(
          [...explicitlyMatchedMapItems, ...nearbyMapItems].map((listing) => [listing.listingNo, listing])
        ).values()
      )
    : isDistanceScopedMap
      ? nearbyMapItems
    : mapItemsWithDistance;
  const visibleMapListings = locationScopedMapItems
    .filter((listing) => {
      if (activeMapFilter === "찜한 매물") {
        return savedListingNos.includes(listing.listingNo);
      }

      if (activeMapFilter === "3D 가능") {
        return listing.has3DTour;
      }

      if (activeMapFilter === "원룸·투룸") {
        return listing.meta.includes("원룸") || listing.meta.includes("복층");
      }

      return true;
    })
    .sort((a, b) => {
      if (activeMapFilter === "보증금") {
        return a.monthlyRent - b.monthlyRent;
      }

      if (activeMapFilter === "안전") {
        return Number(b.flags[0].replace(/\D/g, "") || 0) - Number(a.flags[0].replace(/\D/g, "") || 0);
      }

      if (activeSort === "최신순") {
        return a.recencyRank - b.recencyRank;
      }

      if (activeSort === "낮은 월세순") {
        return a.monthlyRent - b.monthlyRent;
      }

      if (activeSort === "3D 투어 우선") {
        return Number(b.has3DTour) - Number(a.has3DTour) || a.accuracyRank - b.accuracyRank;
      }

      if (isDistanceScopedMap) {
        return (a.distanceFromCenterM ?? Number.POSITIVE_INFINITY) - (b.distanceFromCenterM ?? Number.POSITIVE_INFINITY);
      }

      return a.accuracyRank - b.accuracyRank;
    });
  const marketAverageBaseListings = visibleMapListings.filter((listing) => listing.meta.includes("원룸"));
  const marketAverageListings = marketAverageBaseListings.length > 0 ? marketAverageBaseListings : visibleMapListings;
  const marketAverageRent =
    marketAverageListings.length > 0
      ? Math.round(marketAverageListings.reduce((total, listing) => total + listing.monthlyRent, 0) / marketAverageListings.length)
      : null;
  const mapMarketAreaLabel = isLocationScopedMap ? "현재 위치 주변" : mapAreaDisplayTitle;
  // 지도 생활권 요약 — 전부 표시 매물 기준 실계산("3D 가능 12개" 같은 고정 수치 제거).
  const dynamicMapInsightItems = [
    {
      label: "전월세 평균",
      value: marketAverageRent !== null ? `월 ${marketAverageRent}만` : "매물 없음",
      caption: `${mapMarketAreaLabel} ${marketAverageBaseListings.length > 0 ? "원룸" : "표시 매물"} 기준`
    },
    {
      label: "3D 가능",
      value: `${visibleMapListings.filter((listing) => listing.has3DTour).length}개`,
      caption: "투어 우선 보기"
    }
  ];
  const mapScopeLabel = isLocationScopedMap
    ? "현재 위치"
    : mapSearchContext.queryType
      ? MAP_QUERY_TYPE_LABELS[mapSearchContext.queryType]
      : "검색";
  const mapLocationSummary =
    mapQueryStatus === "resolving"
      ? "검색 위치 확인 중"
      : mapLocationStatus === "requesting"
      ? "현재 위치 확인 중"
      : isDistanceScopedMap
        ? isRadiusEmptyMap
          ? `${mapScopeLabel} 반경 ${formatDistanceLabel(mapSearchContext.radiusM)} 내 매물 없음`
          : `${mapScopeLabel} 반경 ${formatDistanceLabel(mapSearchContext.radiusM)}`
        : mapQueryStatus === "fallback"
          ? "검색 지역 확인 실패 · 지도 표시 안 함"
        : mapLocationStatus === "denied"
          ? "위치 권한 미허용 · 지역을 검색해 주세요"
        : mapLocationStatus === "unavailable"
          ? "위치 확인 불가 · 지역을 검색해 주세요"
          : !hasResolvedMapContext
            ? "지역을 검색하거나 내 위치를 확인해 주세요"
            : "지역 검색 기준";
  const mapListingDistanceLabel = (listing: { distance: string; distanceFromCenterM?: number }) =>
    isDistanceScopedMap && Number.isFinite(listing.distanceFromCenterM)
      ? `${isLocationScopedMap ? "현재 위치" : `${mapScopeLabel} 위치`} ${formatDistanceLabel(listing.distanceFromCenterM ?? 0)} · ${listing.distance}`
      : listing.distance;
  const mapRoomsFeedback = isMapContextEmpty
    ? mapQueryStatus === "resolving" || mapLocationStatus === "requesting"
      ? "표시할 위치를 확인하고 있습니다."
      : "지역을 검색하거나 내 위치 보기를 선택해 주세요."
    : mapSearchErrorMessage
      ? mapSearchErrorMessage
    : isAreaSearchEmptyMap
      ? `"${mapAreaDisplayTitle}" 검색 결과가 없습니다.`
    : isRadiusEmptyMap
      ? `${mapScopeLabel} 반경 ${formatDistanceLabel(mapSearchContext.radiusM)} 안에 표시할 매물이 없습니다.`
    : activeMapFilter === "찜한 매물"
      ? `관심목록에 저장한 매물 ${visibleMapListings.length}개를 보여줍니다.`
    : `${activeSort} · ${mapFilterSummary} 조건으로 우선 매물 ${visibleMapListings.length}개를 먼저 보여줍니다.`;
  const mapEmptyTitle = isMapContextEmpty
    ? mapQueryStatus === "resolving" || mapLocationStatus === "requesting"
      ? "위치를 확인하고 있습니다"
      : "지역을 선택해 주세요"
    : mapSearchErrorMessage
      ? "검색 서비스를 확인해 주세요"
    : isAreaSearchEmptyMap
      ? "검색 결과가 없습니다"
    : isRadiusEmptyMap
      ? isLocationScopedMap
        ? "내 위치 반경 내 매물이 없습니다"
        : "반경 내 매물이 없습니다"
    : activeMapFilter === "찜한 매물"
      ? "찜한 매물이 없습니다"
    : "조건에 맞는 매물이 없습니다";
  const mapEmptyDescription = isMapContextEmpty
    ? "지역 검색 또는 내 위치 보기를 이용하면 주변 매물을 표시합니다."
    : mapSearchErrorMessage
      ? mapSearchErrorMessage
    : isAreaSearchEmptyMap
      ? `"${mapAreaDisplayTitle}"에 일치하는 매물이 없습니다. 다른 지역이나 주소로 검색해 주세요.`
    : isRadiusEmptyMap
      ? `${isLocationScopedMap ? "현재 위치" : mapAreaDisplayTitle} 기준 ${formatDistanceLabel(mapSearchContext.radiusM)} 안에 표시할 매물이 없습니다.`
    : activeMapFilter === "찜한 매물"
      ? "관심목록에 저장한 매물이 있으면 지도와 목록에 함께 표시됩니다."
    : `${activeSort} · ${mapFilterSummary} 조건에 맞는 매물이 없습니다.`;
  const mapViewportSpanM = mapViewportMaxSpanMeters(mapViewport);
  const mapPopupScopeRadiusM = isDistanceScopedMap ? mapSearchContext.radiusM : MAP_SEARCH_RADIUS_M;
  const isMapViewportOutsidePopupScope =
    mapViewport !== null &&
    mapViewportSpanM > mapPopupScopeRadiusM * MAP_POPUP_VIEWPORT_SCOPE_MULTIPLIER;
  const mapOverlayListings = isMapViewportOutsidePopupScope ? [] : visibleMapListings;
  const mapPopupCandidates = mapOverlayListings.filter((listing) => {
    if (!Number.isFinite(listing.lat) || !Number.isFinite(listing.lng)) return false;
    return isMapPointInsideViewport({ lat: listing.lat, lng: listing.lng }, mapViewport);
  });
  const mapPopupGroups = groupMapListings(mapPopupCandidates);
  const selectedMapGroup =
    mapPopupGroups.find((group) => group.listings.some((listing) => listing.listingNo === selectedMapListingNo)) ?? mapPopupGroups[0];
  const selectedMapListing =
    selectedMapGroup?.listings.find((listing) => listing.listingNo === selectedMapListingNo) ?? selectedMapGroup?.representative;
  // 지도 마커 = 좌표가 유효한 매물을 건물/좌표 단위로 묶어서 겹침을 방지한다.
  const mapMarkers = groupMapListings(mapOverlayListings.filter((listing) => Number.isFinite(listing.lat) && Number.isFinite(listing.lng))).map(
    (group) => ({
      lat: group.lat,
      lng: group.lng,
      mapLabel: group.mapLabel,
      dealTone: group.dealTone,
      clusterLabel: group.clusterLabel,
      title: group.title,
      price: group.price
    })
  );
  const findListingCardByNo = (listingNo: string) => allListings.find((listing) => listing.listingNo === listingNo);

  // 실시간 채팅 신호 — 상대가 보낸 trade:updated만 채팅 탭 밖에서 배지를 켠다(탭 진입 시 해제).
  const [unseenTradeCount, setUnseenTradeCount] = useState(0);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    if (!viewer) return; // 소켓 인증 티켓은 로그인 세션 기반 — 비로그인 재연결 루프 방지

    const socket = getRealtimeSocket();
    const onTradeUpdated = (payload: { threadId?: string; senderId?: string }) => {
      if (payload.senderId && payload.senderId === viewer.userId) return;
      if (activeTabRef.current !== "inquiry") {
        setUnseenTradeCount((count) => count + 1);
      }
    };
    socket.on("trade:updated", onTradeUpdated);
    return () => {
      socket.off("trade:updated", onTradeUpdated);
    };
  }, [viewer]);

  useEffect(() => {
    if (activeTab === "inquiry") setUnseenTradeCount(0);
  }, [activeTab]);

  const inquiryBadgeCount = unseenTradeCount;

  // 상세는 이제 라우트(/listing/[id]) — 공유 가능한 URL로 이동한다(1단계 라우트 분리).
  // 채팅 시작도 상세의 문의하기가 담당한다 — 홈 카드에는 별도 액션 버튼을 두지 않는다.
  const openListing = (listing: Listing) => {
    router.push(`/listing/${encodeURIComponent(listing.listingNo)}`);
  };

  const activateTab = (tab: AppTab) => {
    setAuthMode(null);
    setActiveTab(tab);
    // 탭 = URL 경로. pushState(shallow)라 컴포넌트가 유지되고(필터·검색 상태 보존)
    // 뒤로/앞으로 가기는 popstate 핸들러가 경로→탭으로 되돌린다.
    if (typeof window !== "undefined" && window.location.pathname !== TAB_PATHS[tab]) {
      window.history.pushState(null, "", TAB_PATHS[tab]);
    }
    resetWindowScrollSoon();
  };

  const openAuthScreen = (mode: AuthMode) => {
    setAuthMode(mode);
    if (!isAuthHistoryPushedRef.current) {
      window.history.pushState({ roomlogAuthScreen: true }, "", window.location.href);
      isAuthHistoryPushedRef.current = true;
    }
    resetWindowScrollSoon();
  };

  // 로그인 화면의 "집우집주" 로고를 눌렀을 때: 뒤로가기와 동일하게 동작하도록
  // pushState로 쌓아둔 히스토리를 그대로 소비한다(중복 엔트리 방지).
  const closeAuthScreen = () => {
    if (isAuthHistoryPushedRef.current) {
      isAuthHistoryPushedRef.current = false;
      window.history.back();
      return;
    }
    setAuthMode(null);
    resetWindowScrollSoon();
  };

  const completeServiceAuth = (profile: ViewerProfile) => {
    // 로그인 화면을 열 때 push한 히스토리 엔트리를 여기서도 소비한다 —
    // 성공 후 뒤로가기가 로그인 화면으로 되돌아가지 않게 (closeAuthScreen과 동일 원칙, QA 5).
    if (isAuthHistoryPushedRef.current) {
      isAuthHistoryPushedRef.current = false;
      window.history.back();
    }

    const nextRole = appRoleForViewer(profile);
    setViewer(profile);
    setAuthMode(null);
    setIsDevRolePreview(false);
    setActiveRole(nextRole);
    // 로그인 직후 도착지: 임대인→매물등록, 세입자→세입자, 그 외→홈.
    setActiveTab(nextRole === "landlord" ? "sell" : nextRole === "tenant" ? "living" : "home");
    resetWindowScrollSoon();
  };

  const toggleQuickFilter = (filter: string) => {
    setActiveQuickFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]
    );
  };

  const beginCategoryDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const strip = categoryStripRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;

    categoryDragStateRef.current = {
      didMove: false,
      isDragging: true,
      pointerId: event.pointerId,
      scrollLeft: strip.scrollLeft,
      startX: event.clientX
    };
    strip.setPointerCapture?.(event.pointerId);
  };

  const moveCategoryDrag = (event: PointerEvent<HTMLElement>) => {
    const dragState = categoryDragStateRef.current;
    if (!dragState.isDragging || dragState.pointerId !== event.pointerId) return;

    const strip = categoryStripRef.current;
    if (!strip) return;

    const deltaX = event.clientX - dragState.startX;
    if (Math.abs(deltaX) > 4) {
      dragState.didMove = true;
      event.preventDefault();
    }
    strip.scrollLeft = dragState.scrollLeft - deltaX;
  };

  const endCategoryDrag = (event: PointerEvent<HTMLElement>) => {
    const dragState = categoryDragStateRef.current;
    if (!dragState.isDragging || dragState.pointerId !== event.pointerId) return;

    categoryStripRef.current?.releasePointerCapture?.(event.pointerId);
    dragState.isDragging = false;
    dragState.pointerId = -1;

    if (dragState.didMove) {
      window.setTimeout(() => {
        categoryDragStateRef.current.didMove = false;
      }, 0);
    }
  };

  const selectCategory = (category: string) => {
    if (categoryDragStateRef.current.didMove) {
      categoryDragStateRef.current.didMove = false;
      return;
    }

    setActiveCategory(category);
  };

  const toggleSavedListing = (listingNo: string) => {
    setSavedListingNos((current) => toggleSavedListingNo(current, listingNo));
  };

  const applyMapAreaSelection = (area: string, context: MapSearchContext) => {
    setSelectedArea(area);
    setMapSearchContext(context);
    setMapQueryCandidates([]);
    setMapQueryCandidateKeyword("");
  };

  const finishMapSearch = (keyword: string, status: MapQueryStatus) => {
    setMapQueryStatus(status);
    setRecentSearches((current) => [keyword, ...current.filter((item) => item !== keyword)].slice(0, 5));
    setIsSearchSheetOpen(false);
    setActiveMapResultTab("rooms");
    activateTab("map");
  };

  const applyResolvedMapCandidate = (keyword: string, candidate: MapResolvedQuery) => {
    setMapSearchErrorMessage("");
    setMapSearchMatchedListingNos(
      allMapItems
        .filter((listing) => mapListingMatchesQuery(listing, keyword))
        .map((listing) => listing.listingNo)
    );
    applyMapAreaSelection(candidate.label, candidate);
    setHasResolvedMapContext(true);
    finishMapSearch(keyword, "resolved");
  };

  const applyMatchedMapListings = (keyword: string, matches: MapPanelItem[]) => {
    setMapSearchErrorMessage("");
    setMapSearchMatchedListingNos(matches.map((listing) => listing.listingNo));
    const parsedQuery = parseMapSearch(keyword);
    const matchedRegions = new Set(
      matches
        .map((listing) => parseMapSearch(listing.distance).adminTokens.join("|"))
        .filter(Boolean)
    );
    if (parsedQuery.adminTokens.length === 0 && matchedRegions.size > 1) {
      applyUnresolvedMapSearch(keyword);
      return;
    }

    const positioned = matches.filter(
      (listing) => Number.isFinite(listing.lat) && Number.isFinite(listing.lng)
    );
    if (positioned.length === 0) {
      applyUnresolvedMapSearch(keyword);
      return;
    }

    const center = positioned.reduce(
      (total, listing) => ({ lat: total.lat + listing.lat, lng: total.lng + listing.lng }),
      { lat: 0, lng: 0 }
    );
    center.lat /= positioned.length;
    center.lng /= positioned.length;
    const queryType: MapQueryType = parsedQuery.roadNames.length > 0
      ? "road"
      : parsedQuery.adminTokens.length > 0
        ? "neighborhood"
        : "building";
    const precision = precisionForMapQueryType(queryType);

    applyMapAreaSelection(keyword, {
      source: "default",
      label: keyword,
      center,
      radiusM: MAP_SEARCH_RADIUS_BY_PRECISION[precision],
      queryType,
      precision,
      addressText: keyword,
      description: `${MAP_QUERY_TYPE_LABELS[queryType]} 매물 주소 일치`
    });
    setHasResolvedMapContext(true);
    finishMapSearch(keyword, "resolved");
  };

  const applyUnresolvedMapSearch = (keyword: string, errorMessage = "") => {
    setMapSearchErrorMessage(errorMessage);
    setMapSearchMatchedListingNos(
      allMapItems
        .filter((listing) => mapListingMatchesQuery(listing, keyword))
        .map((listing) => listing.listingNo)
    );
    applyMapAreaSelection(keyword, {
      source: "default",
      label: keyword,
      center: mapSearchContext.center,
      radiusM: DEFAULT_MAP_CONTEXT.radiusM
    });
    finishMapSearch(keyword, "fallback");
  };

  const runMapSearch = async (keyword: string, openCandidateSheet: boolean) => {
    const requestId = ++mapContextRequestIdRef.current;
    setMapSearchErrorMessage("");
    setMapQueryCandidates([]);
    setMapQueryCandidateKeyword(keyword);
    setMapQueryStatus("resolving");
    const parsedQuery = parseMapSearch(keyword);
    const matchingListings = allMapItems.filter((listing) => mapListingMatchesQuery(listing, keyword));
    const hasExplicitLocation = parsedQuery.adminTokens.length > 0;

    const hasPositionedMatchingListing = matchingListings.some(
      (listing) => Number.isFinite(listing.lat) && Number.isFinite(listing.lng)
    );

    if (hasExplicitLocation && hasPositionedMatchingListing) {
      applyMatchedMapListings(keyword, matchingListings);
      return;
    }

    if (hasExplicitLocation && matchingListings.length > 0) {
      const listingAddressQueries = Array.from(
        new Set(
          matchingListings
            .map((listing) => listing.distance.trim())
            .filter(Boolean)
        )
      );

      for (const listingAddress of listingAddressQueries) {
        const listingCandidate = (await resolveMapQueryCandidates(listingAddress))[0];
        if (requestId !== mapContextRequestIdRef.current) return;
        if (listingCandidate) {
          applyResolvedMapCandidate(keyword, listingCandidate);
          return;
        }
      }
    }

    const candidates = await resolveMapQueryCandidates(keyword);
    if (requestId !== mapContextRequestIdRef.current) return;

    if (candidates.length > 1) {
      setMapQueryCandidates(candidates);
      setMapQueryStatus("resolved");
      setIsSearchSheetOpen(true);
      return;
    }

    const resolvedContext = candidates[0];
    if (resolvedContext) {
      applyResolvedMapCandidate(keyword, resolvedContext);
      return;
    }

    const shouldSearchNaverLocal =
      parsedQuery.roadNames.length > 0 ||
      parsedQuery.otherTokens.length > 0 ||
      parsedQuery.adminTokens.length === 0;
    if (shouldSearchNaverLocal) {
      const externalSearch = await resolveLocalPlaceCandidates(keyword);
      if (requestId !== mapContextRequestIdRef.current) return;
      const placeCandidates = externalSearch.candidates;

      if (placeCandidates.length > 1) {
        setMapQueryCandidates(placeCandidates);
        setMapQueryStatus("resolved");
        setIsSearchSheetOpen(true);
        return;
      }

      if (placeCandidates[0]) {
        applyResolvedMapCandidate(keyword, placeCandidates[0]);
        return;
      }

      if (externalSearch.errorMessage) {
        applyUnresolvedMapSearch(keyword, externalSearch.errorMessage);
        return;
      }
    }

    if (matchingListings.length > 0) {
      applyMatchedMapListings(keyword, matchingListings);
      return;
    }

    applyUnresolvedMapSearch(keyword);
  };

  const selectSearchArea = async (area: string) => {
    const keyword = area.trim();
    if (!keyword) return;
    await runMapSearch(keyword, false);
  };

  const submitMapTopbarSearch = async () => {
    const keyword = mapTopbarSearchValue.trim();
    if (!keyword) {
      setMapTopbarSearchValue(selectedArea);
      return;
    }

    await runMapSearch(keyword, true);
  };

  useEffect(() => {
    if (activeRole && !authMode) {
      resetWindowScrollSoon();
    }
  }, [activeRole, activeTab, authMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = normalizeAuthMode(params.get("auth"));
    const role = normalizeAppRole(params.get("role"));
    const tab = normalizeAppTab(params.get("tab"));
    const flow = params.get("flow");
    // 상세 라우트에서 문의 전송 직후 /?tab=inquiry&thread=<id>로 돌아온다 — 해당 대화를 바로 연다.
    const focusThread = params.get("thread");
    if (focusThread) {
      setBuyerFocusThreadId(focusThread);
    }
    // 상세 "문자로 문의하기" → /inquiry?compose=<listingNo>&title=<제목> — 이 매물 대화(초안)를 연다.
    const composeNo = params.get("compose");
    if (composeNo) {
      setComposeListing({ listingNo: composeNo, title: params.get("title") ?? "매물 문의" });
      setActiveTab("inquiry");
      window.history.replaceState(null, "", TAB_PATHS.inquiry + window.location.hash);
      setIsRouteReady(true);
      return;
    }

    if (auth) {
      setAuthMode(auth);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      resetWindowScrollSoon();
    } else if (flow === "listing") {
      // 집 내놓기 시작 — capability 가드를 타지 않는 등록 진입점.
      // /login의 "관리 중인 집 연결 필요" CTA가 여기로 온다 (로그인 루프 방지, QA 2).
      urlRoleAppliedRef.current = true;
      setActiveRole("landlord");
      setActiveTab("sell");
      setIsListingStartMode(true);
      setAuthMode(null);
      window.history.replaceState(null, "", TAB_PATHS.sell + window.location.hash);
      resetWindowScrollSoon();
    } else if (role) {
      urlRoleAppliedRef.current = true;
      setActiveRole(role);
      // 레거시 ?role=&tab=mypage 딥링크 하위호환: 역할별 전용 탭으로 보낸다.
      const nextTab: AppTab = role === "landlord" ? "sell" : role === "tenant" ? "living" : tab ?? "home";
      setActiveTab(nextTab);
      setAuthMode(null);
      setIsDevRolePreview(false);
      window.history.replaceState(null, "", TAB_PATHS[nextTab] + window.location.hash);
      resetWindowScrollSoon();
    } else if (tab) {
      // 레거시 ?tab= 딥링크 — 새 탭 경로로 정규화한다(상세 라우트의 문의 복귀 등).
      setActiveTab(tab);
      window.history.replaceState(null, "", TAB_PATHS[tab] + window.location.hash);
      resetWindowScrollSoon();
    } else if (focusThread) {
      // /inquiry?thread=<id>처럼 경로 진입 + 스레드 지목 — 파라미터만 정리한다.
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    } else if (initialTab === "home" && window.location.pathname === "/") {
      // URL이 진실 — "/"로 들어오면 홈을 보여준다. 탭 전환은 pushState로 경로를 남기므로
      // 새로고침은 어차피 그 경로(/map 등)로 복원된다. 이전의 "마지막 탭 복원"은
      // 링크 공유·주소창 직접 진입 때 홈 대신 엉뚱한 탭이 떠서 제거했다.
      // 역할 프리뷰만 세션에서 복원한다(네비 구성 유지, 화면은 홈).
      const storedRole = normalizeAppRole(window.sessionStorage.getItem("woozuLastRole"));
      if (storedRole && storedRole !== "seeker") {
        urlRoleAppliedRef.current = true;
        setIsDevRolePreview(true);
        setActiveRole(storedRole);
      }
    }
    setIsRouteReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회: URL 파라미터/세션 복원
  }, []);

  // 현재 탭/역할을 세션에 남겨 새로고침 복원에 쓴다 (브라우저 탭 단위 — 새 탭은 홈부터 시작).
  useEffect(() => {
    if (!isRouteReady || typeof window === "undefined") return;
    window.sessionStorage.setItem("woozuLastTab", activeTab);
    window.sessionStorage.setItem("woozuLastRole", activeRole);
  }, [activeTab, activeRole, isRouteReady]);

  // 로그인 화면이 열려 있는 동안 브라우저 뒤로가기를 누르면 홈으로 돌아가도록 처리.
  // 탭 경로(pushState) 사이의 뒤로/앞으로 가기도 여기서 경로→탭으로 복원한다.
  useEffect(() => {
    function handlePopState() {
      isAuthHistoryPushedRef.current = false;
      setAuthMode((current) => (current ? null : current));
      const tab = tabForPathname(window.location.pathname);
      if (tab) {
        setActiveTab(tab);
        resetWindowScrollSoon();
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let isAlive = true;

    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!isAlive) return;
        if (!response.ok) {
          setViewer(null);
          setIsAuthChecked(true);
          return;
        }

        setViewer((await response.json()) as ViewerProfile);
        setIsAuthChecked(true);
      })
      .catch(() => {
        if (isAlive) {
          setViewer(null);
          setIsAuthChecked(true);
        }
      });

    return () => {
      isAlive = false;
    };
  }, []);

  // 역할은 로그인 계정의 capability에서 자동 결정된다.
  // (URL 딥링크가 역할을 명시했으면 그 선택을 존중, 이후 전환은 상단 메뉴 탭이 담당)
  useEffect(() => {
    if (!viewer || urlRoleAppliedRef.current) return;
    setActiveRole(
      hasCapability(viewer, "LANDLORD") ? "landlord" : hasCapability(viewer, "TENANT") ? "tenant" : "seeker"
    );
  }, [viewer]);

  // 집 내놓기 시작 모드는 보호 대상에서 제외 — 등록 시작은 capability가 아니라
  // 매물 등록 자체가 LANDLORD 관계를 만드는 진입점이다. 관리 콘솔(/manager/*)은 계속 서버 가드.
  // 페이지는 이제 탭이 직접 결정한다: 매물등록(sell)=임대인, 세입자(living)=세입자.
  const protectedConfig =
    activeTab === "sell"
      ? isListingStartMode
        ? null
        : protectedRoleConfig.landlord
      : activeTab === "living"
        ? protectedRoleConfig.tenant
        : null;
  const isProtectedRolePage = Boolean(protectedConfig);
  const canAccessProtectedRolePage =
    !protectedConfig ||
    isDevRolePreview ||
    (viewer ? hasCapability(viewer, protectedConfig.sessionRole) : false);

  useEffect(() => {
    if (!isRouteReady || !isAuthChecked || !protectedConfig || canAccessProtectedRolePage) return;

    window.location.href = unifiedLoginPath(protectedConfig.intent, protectedConfig.redirectTo);
  }, [canAccessProtectedRolePage, isAuthChecked, isRouteReady, protectedConfig]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setViewer(null);
    setActiveRole("seeker");
    setActiveTab("home");
    setAuthMode(null);
    setIsDevRolePreview(false);
  };

  if (authMode) {
    return (
      <WoozuLoginScreen
        mode={authMode}
        onAuthenticated={completeServiceAuth}
        onGoHome={closeAuthScreen}
      />
    );
  }

  if (isProtectedRolePage && (!isAuthChecked || !canAccessProtectedRolePage)) {
    return (
      <main className="app-canvas">
        <section className="auth-check-screen" aria-live="polite">
          <strong>로그인 확인 중</strong>
          <span>WOOZU 계정 로그인 후, 계정에 연결된 집 정보로 이어집니다.</span>
        </section>
      </main>
    );
  }

  // 매물 상세는 /listing/[id] 라우트로 분리됐다 — openListing이 router.push로 이동한다.
  return (
    <main className="app-canvas">
      <div className="service-frame with-bottom-tabs" aria-label="집우집주 부동산 앱">
        <header className="web-topbar" aria-label="웹 상단 메뉴">
          <div className="web-topbar-inner">
            <button className="web-logo" type="button" onClick={() => activateTab("home")}>
              <span className="web-logo-icon" aria-hidden="true">
                <svg className="web-logo-roof" viewBox="0 0 140 68" fill="none">
                  <path d="M18 58 L70 18 L122 58" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="61" y="33" width="8" height="8" rx="2.4" fill="#ec6a86" />
                  <rect x="71" y="33" width="8" height="8" rx="2.4" fill="#ec6a86" />
                  <rect x="61" y="43" width="8" height="8" rx="2.4" fill="#ec6a86" />
                  <rect x="71" y="43" width="8" height="8" rx="2.4" fill="#ec6a86" />
                </svg>
              </span>
              집우집주<span>WOOZU</span>
            </button>
            <nav className="web-nav" aria-label="주요 메뉴">
              <button className={activeTab === "map" ? "active" : ""} type="button" onClick={() => activateTab("map")}>지도</button>
              <button className={activeTab === "saved" ? "active" : ""} type="button" onClick={() => activateTab("saved")}>관심목록</button>
              <button className={activeTab === "inquiry" ? "active" : ""} type="button" onClick={() => activateTab("inquiry")}>
                채팅
                {inquiryBadgeCount > 0 ? <span className="nav-badge">{inquiryBadgeCount}</span> : null}
              </button>
              <button className={activeTab === "living" ? "active" : ""} type="button" onClick={() => activateTab("living")}>세입자</button>
              <button type="button" onClick={() => { window.location.href = "/manager/home/00"; }}>관리</button>
              <button className={activeTab === "sell" ? "active" : ""} type="button" onClick={() => activateTab("sell")}>매물등록</button>
            </nav>
            <div className="web-topbar-actions">
              {/* 역할은 상단 메뉴(세입자·관리·매물등록)에서 직접 진입한다 — 별도 역할 셀렉트/칩 없음. */}
              {viewer ? (
                <>
                  {/* 임대인 계정만: 재구성 완료(정합 필요)·실패(재업로드) 자산을 상단에서 상시 알린다. */}
                  {hasCapability(viewer, "LANDLORD") ? <TourActionBell /> : null}
                  <div className="web-profile-menu" aria-label="로그인 사용자">
                    <span className="web-profile-avatar" aria-hidden="true">{viewer.name.slice(0, 1)}</span>
                    <span className="web-profile-name">{viewer.name}</span>
                    <button className="web-logout" type="button" onClick={logout}>로그아웃</button>
                  </div>
                </>
              ) : (
                <>
                  <button className="web-login" type="button" onClick={() => openAuthScreen("login")}>로그인</button>
                  <button className="web-signup" type="button" onClick={() => { window.location.href = "/signup"; }}>회원가입</button>
                </>
              )}
            </div>
          </div>
        </header>
        {/* 상단 네비 바로 아래 전역 진행바 — 3D 투어 백그라운드 업로드 중 어느 탭에서든 보인다. */}
        <TourUploadBanner />
        {activeTab === "home" ? (
        <section className="screen home-screen" aria-labelledby="home-title">
          <header className="app-header">
            <div>
              <p className="brand-kicker">{selectedAreaTitle} 주변</p>
              <h1 id="home-title">{selectedAreaTitle} 조건에 맞는 방 {visibleHomeCount}개</h1>
              <span className="active-condition-chip">선택 조건 {activeFilterSummary}</span>
            </div>
            <button className="round-button" type="button" aria-label="알림" onClick={() => setIsNotificationSheetOpen(true)}>
              <Bell size={19} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </header>

          <div className="web-hero-head" aria-hidden="true">
            <h1>방 구할 땐, 우주에서</h1>
            <p className="web-hero-sub">전월세부터 매매까지 | 방문 전 3D로 먼저 둘러보세요</p>
          </div>

          <label className="search-box">
            {/* 아이콘 클릭 = 지역 선택 시트, 입력창 = 바로 타이핑해 매물 필터 (QA: onFocus 시트가 타이핑을 막던 문제) */}
            <button type="button" aria-label="지역 선택" onClick={() => setIsSearchSheetOpen(true)} style={{ display: "inline-flex", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}>
              <Search size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <input
              value={searchKeyword}
              placeholder="매물명, 지역, 조건 검색"
              aria-label="매물 검색"
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
            <button type="button" aria-label="필터" onClick={() => setIsFilterSheetOpen(true)}>
              <SlidersHorizontal size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </label>

          <nav
            ref={categoryStripRef}
            className="category-strip"
            aria-label="매물 유형"
            onPointerDown={beginCategoryDrag}
            onPointerMove={moveCategoryDrag}
            onPointerUp={endCategoryDrag}
            onPointerCancel={endCategoryDrag}
            onPointerLeave={endCategoryDrag}
          >
            {categories.map((category) => {
              const CategoryIcon = category.Icon;
              // 하드코딩 수치 대신 지금 피드에 실제로 있는 매물 수를 보여준다.
              const count = allListings.filter((listing) => listingMatchesCategory(category.label, listing)).length;

              return (
                <button
                  className={activeCategory === category.label ? "category-card active" : "category-card"}
                  type="button"
                  key={category.label}
                  onClick={() => selectCategory(category.label)}
                >
                  <i aria-hidden="true">
                    <CategoryIcon size={18} strokeWidth={2.4} />
                  </i>
                  <span>{category.label}</span>
                  <strong>{count.toLocaleString("ko-KR")}</strong>
                </button>
              );
            })}
          </nav>

          <div className="quick-filter-row" aria-label="빠른 필터">
            {quickFilters.map((filter) => (
              <button
                className={activeQuickFilters.includes(filter) ? "active" : ""}
                type="button"
                key={filter}
                onClick={() => toggleQuickFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="filter-feedback" role="status" aria-label={`선택 조건 ${activeFilterSummary}, 확인매물 ${visibleHomeCount}개`}>
            <strong>{activeFilterSummary}</strong>
            <span>확인매물 {visibleHomeCount}개를 보여주는 중</span>
          </div>

          <div className="section-title">
            <div>
              <h2>추천 매물</h2>
              <p>{activeFilterSummary} 조건에 맞는 매물을 보여줍니다.</p>
            </div>
            <a href="#map-list" onClick={(event) => {
              event.preventDefault();
              activateTab("map");
            }}>전체</a>
          </div>

          <div className="listing-feed">
            {visibleHomeListings.length > 0 ? (
              <>
                {visibleHomeListings.map((listing) => (
                  <article className="listing-card" key={listing.listingNo}>
                    <button className="listing-card-action" type="button" onClick={() => openListing(listing)}>
                      <div className="listing-photo">
                        <Image src={listing.image} alt={`${listing.title} 사진`} width={1200} height={800} unoptimized={isRemotePhoto(listing.image)} />
                        <div className="badge-row">
                          {listing.badges.map((badge) => (
                            <span key={badge}>{badge}</span>
                          ))}
                        </div>
                      </div>
                      {/* 카드 본문은 가격·제목·핵심 스펙만 — 신뢰 배지는 사진 위, 나머지는 상세에서. */}
                      <div className="listing-body">
                        <div>
                          <strong>{listing.price}</strong>
                          <span className="listing-updated">{listing.updated}</span>
                        </div>
                        <h3>{listing.title}</h3>
                        <p>{listing.spec}</p>
                        <small>{listing.location}</small>
                      </div>
                    </button>
                    <button
                      className={savedListingNos.includes(listing.listingNo) ? "save-listing-button saved" : "save-listing-button"}
                      type="button"
                      aria-label={`${listing.title} 찜하기`}
                      onClick={() => toggleSavedListing(listing.listingNo)}
                    >
                      <Heart size={22} fill={savedListingNos.includes(listing.listingNo) ? "currentColor" : "none"} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  </article>
                ))}
                {/* "방배동 생활권 요약"(평균 8분·39개 등 하드코딩 수치) 카드 제거 — 데모 컨셉 정리 */}
              </>
            ) : (
              <article className="listing-empty-card">
                <strong>조건에 맞는 추천 매물이 없습니다</strong>
                <p>필터를 줄이거나 지도에서 주변 매물을 더 넓게 확인해보세요.</p>
                <button type="button" onClick={() => {
                  setActiveCategory("오피스텔");
                  setActiveQuickFilters(["월세"]);
                }}>
                  기본 조건으로 보기
                </button>
              </article>
            )}
          </div>

          {/* 하드코딩 데모 컨셉 섹션(내 조건 요약·AI중개사 추천·저장한 검색 조건·지역 지표) 제거 —
              가짜 수치가 실데이터처럼 보이던 문제. 실데이터가 생기면 그때 실계산으로 되살린다. */}
          <article className="map-entry-card">
            <div className="map-entry-copy">
              <span>지도 기반 검색</span>
              <h2>원하는 블록만 직접 그려 매물 보기</h2>
              <p>전월세 평균가와 주변 생활권을 같이 확인합니다.</p>
              <a href="#map-list" onClick={(event) => {
                event.preventDefault();
                activateTab("map");
              }}>지도 열기</a>
            </div>
            <div className="map-provider-status">
              <strong>실시간 지도 연동</strong>
              <span>네이버 지도</span>
              <small>시세 · 안전 · 3D 투어 매물 표시</small>
            </div>
          </article>

          {/* 하드코딩 데모 컨셉 섹션(빠른 서비스 메뉴·신뢰 정보·실거주 체크·동네정보 랭킹) 제거 —
              가짜 수치("최근 본 방 3개")와 미구현 약속("헛걸음 보상")이 실기능처럼 보이던 문제. */}
        </section>
        ) : null}

        {activeTab === "map" ? (
        <section className="screen map-screen" id="map-list" aria-labelledby="map-title">
          <form
            className="map-topbar"
            onSubmit={(event) => {
              event.preventDefault();
              void submitMapTopbarSearch();
            }}
          >
            <label>
              <Search size={20} strokeWidth={2.4} aria-hidden="true" />
              <input
                value={mapTopbarSearchValue}
                onChange={(event) => setMapTopbarSearchValue(event.target.value)}
                aria-label="지도 검색어"
                placeholder="동네, 역, 주소 검색"
              />
            </label>
            <button
              className="map-location-action-button"
              type="button"
              onClick={() => requestMapCurrentLocation(true)}
              aria-label="현재 위치 주변 매물 보기"
              title="내 위치 주변"
              disabled={mapLocationStatus === "requesting"}
            >
              <span className="map-location-action-label">내 위치 보기</span>
              <MapPinned size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setIsFilterSheetOpen(true)} aria-label="필터">
              <SlidersHorizontal size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </form>

          <div className="map-filter-row">
            {mapFilterOptions.map((filter) => (
              <button
                className={activeMapFilter === filter ? "active" : ""}
                type="button"
                key={filter}
                onClick={() => setActiveMapFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="map-context-bar" aria-label="지도 요약 정보">
            <strong>{mapAreaDisplayTitle} {activeMapFilter}</strong>
            <span>{mapLocationSummary}</span>
            <span>{mapFilterSummary}</span>
            <span>결과 {visibleMapListings.length}개</span>
          </div>

          {hasVisibleMapContext ? (
            <section className="map-insight-strip" aria-label="지도 생활권 요약">
              {dynamicMapInsightItems.map((item) => (
                <article key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.caption}</small>
                </article>
              ))}
            </section>
          ) : null}

          <div className="map-canvas-stack">
            {hasVisibleMapContext ? (
              <NaverMapPreview
                className="map-stage"
                center={mapSearchContext.center}
                showCenterMarker={isDistanceScopedMap}
                address={isSearchScopedMap ? mapSearchContext.addressText ?? mapAreaDisplayTitle : null}
                title={isLocationScopedMap ? "현재 위치" : mapAreaDisplayTitle}
                markers={mapMarkers}
                onViewportChange={setMapViewport}
              />
            ) : (
              <div className="map-unresolved-state" role="status">
                <MapPinned size={30} strokeWidth={2.2} aria-hidden="true" />
                <strong>
                  {mapQueryStatus === "fallback"
                    ? mapSearchErrorMessage
                      ? "검색 서비스를 확인해 주세요"
                      : areaMatchedMapItems.length > 0
                      ? "지도 위치를 하나로 정할 수 없습니다"
                      : "검색 위치를 확인할 수 없습니다"
                    : mapLocationStatus === "requesting"
                      ? "현재 위치를 확인하고 있습니다"
                      : "표시할 지역이 없습니다"}
                </strong>
                <p>
                  {mapQueryStatus === "fallback"
                    ? mapSearchErrorMessage
                      ? mapSearchErrorMessage
                      : areaMatchedMapItems.length > 0
                      ? "동일한 이름의 지역이 여러 곳이거나 매물 좌표가 없습니다. 시·군·구를 함께 검색해 주세요."
                      : "일치하는 지역이나 매물이 없습니다. 지역명을 더 정확히 입력해 주세요."
                    : mapLocationStatus === "requesting"
                      ? "위치 확인이 끝나면 지도를 표시합니다."
                      : "지역을 검색하거나 내 위치 보기를 선택해 주세요."}
                </p>
              </div>
            )}
          </div>

          <div className="result-sheet">
            <div className="sheet-handle" aria-hidden="true" />
            <nav className="sheet-tabs" aria-label="지도 결과 탭">
              {mapResultTabs.map((tab) => (
                <button
                  className={activeMapResultTab === tab.key ? "active" : ""}
                  type="button"
                  key={tab.key}
                  onClick={() => setActiveMapResultTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="section-title compact">
              <div>
                <h2 id="map-title">
                  {activeMapResultTab === "rooms" ? `${mapAreaDisplayTitle} 매물 ${visibleMapListings.length}개` : null}
                  {activeMapResultTab === "complexes" ? `${mapAreaDisplayTitle} 단지 ${hasVisibleMapContext ? 18 : 0}곳` : null}
                  {activeMapResultTab === "agents" ? `인근 중개사무소 ${hasVisibleMapContext ? 9 : 0}곳` : null}
                </h2>
                <p>시세 지도 · {mapFilterSummary} · {activeSort}</p>
              </div>
              {activeMapResultTab === "rooms" ? (
                <button type="button" onClick={() => setIsSortSheetOpen(true)}>{activeSort}</button>
              ) : (
                <button type="button" onClick={() => setActiveMapResultTab("rooms")}>매물 보기</button>
              )}
            </div>

            <section className="map-result-summary" aria-label="지도 결과 요약">
              <article>
                <span>확인매물</span>
                <strong>{visibleMapListings.length}개</strong>
              </article>
              <article>
                <span>3D 가능</span>
                <strong>{visibleMapListings.filter((listing) => listing.has3DTour).length}개</strong>
              </article>
              {/* "평균 응답 8분" 하드코딩 지표 제거 — 실측 데이터가 생기면 되살린다 */}
            </section>

            {activeMapResultTab === "rooms" ? (
              <>
                <p className="map-sort-feedback">
                  {mapRoomsFeedback}
                </p>

                <div className="map-list">
                  {visibleMapListings.length === 0 ? (
                    <article className="map-empty-card" role="status">
                      <strong>{mapEmptyTitle}</strong>
                      <p>{mapEmptyDescription}</p>
                    </article>
                  ) : visibleMapListings.map((listing) => (
                    <article className="map-listing" key={listing.listingNo}>
                      <button
                        className={selectedMapListing?.listingNo === listing.listingNo ? "map-listing-action active" : "map-listing-action"}
                        type="button"
                        onFocus={() => setSelectedMapListingNo(listing.listingNo)}
                        onMouseEnter={() => setSelectedMapListingNo(listing.listingNo)}
                        onClick={() => {
                          setSelectedMapListingNo(listing.listingNo);
                          const card = findListingCardByNo(listing.listingNo);
                          if (card) openListing(card);
                        }}
                      >
                        <div
                          className="map-listing-thumb"
                          style={{ backgroundImage: `url(${listing.image})` }}
                          role="img"
                          aria-label={`${listing.title} 썸네일`}
                        >
                          {/* 검증 절차를 거치지 않은 직접등록 매물에 "확인매물" 신뢰 배지를 붙이지 않는다 */}
                          <span>{listing.listingNo.startsWith(TRADE_LISTING_NO_PREFIX) ? "직접 등록" : "확인매물"}</span>
                        </div>
                        <div className="map-listing-copy">
                          <div className="map-card-badge-row">
                            <span>{listing.listingNo.startsWith(TRADE_LISTING_NO_PREFIX) ? "집주인 직접" : "실매물 확인"}</span>
                            <span>{listing.updated}</span>
                          </div>
                          <h3 title={listing.title}>{listing.title}</h3>
                          <strong className={listing.dealTone === "jeonse" ? "map-price-text is-jeonse" : "map-price-text"}>{listing.price}</strong>
                          <p>{listing.meta}</p>
                          <small>{mapListingDistanceLabel(listing)}</small>
                          {listing.detailAddress?.trim() ? <small>세부주소: {listing.detailAddress.trim()}</small> : null}
                          <div className="map-card-tags">
                            {listing.flags.map((flag) => (
                              <em key={flag}>{flag}</em>
                            ))}
                          </div>
                          <div className="map-verification-row" aria-label={`${listing.title} 확인 상태`}>
                            <span>{listing.verifyStatus}</span>
                            <span>{listing.responseStatus}</span>
                            <span>{listing.tourStatus}</span>
                          </div>
                        </div>
                      </button>
                      <button
                        className={savedListingNos.includes(listing.listingNo) ? "saved" : ""}
                        type="button"
                        aria-label={`${listing.title} 저장`}
                        onClick={() => toggleSavedListing(listing.listingNo)}
                      >
                        <Heart size={20} fill={savedListingNos.includes(listing.listingNo) ? "currentColor" : "none"} strokeWidth={2.4} aria-hidden="true" />
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : null}

            {activeMapResultTab === "complexes" ? (
              <div className="complex-map-list">
                {complexCards.map((complex) => (
                  <article className="complex-map-card" key={complex.name}>
                    <div>
                      <span>{complex.badge}</span>
                      <h3>{complex.name}</h3>
                      <p>{complex.address}</p>
                    </div>
                    <dl>
                      <div>
                        <dt>시세</dt>
                        <dd>{complex.deal}</dd>
                      </div>
                      <div>
                        <dt>매물</dt>
                        <dd>{complex.count}</dd>
                      </div>
                      <div>
                        <dt>평가</dt>
                        <dd>{complex.score}</dd>
                      </div>
                    </dl>
                    <button type="button" onClick={() => setActiveMapResultTab("rooms")}>단지 매물 보기</button>
                  </article>
                ))}
              </div>
            ) : null}

            {activeMapResultTab === "agents" ? (
              <div className="agent-map-list">
                {agentCards.map((agent) => (
                  <article className="agent-map-card" key={agent.name}>
                    <div className="agent-map-header">
                      <span>공인중개사무소</span>
                      <strong>{agent.rating}</strong>
                    </div>
                    <h3>{agent.name}</h3>
                    <p>{agent.manager} · {agent.response} · {agent.inventory}</p>
                    <div>
                      {agent.tags.map((tag) => (
                        <em key={tag}>{tag}</em>
                      ))}
                    </div>
                    <footer>
                      <button type="button" onClick={() => setActiveMapResultTab("rooms")}>보유 매물</button>
                      <button type="button" onClick={() => activateTab("inquiry")}>채팅하기</button>
                    </footer>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>
        ) : null}

        {activeTab === "saved" ? (
        <SavedListingsSection
          allListings={allListings}
          savedListingNos={savedListingNos}
          openListing={openListing}
          onToggleSaved={toggleSavedListing}
        />
        ) : null}
        {activeTab === "inquiry" ? (
          <InquiryHubSection onRequireLogin={() => openAuthScreen("login")} focusThreadId={buyerFocusThreadId} composeListing={composeListing} />
        ) : null}
        {activeTab === "sell" ? (
          <LandlordMyPage
            onGoHome={() => {
              // 등록 성공 팝업 확인 → 홈 피드로. 목록을 즉시 갱신해 방금 등록한 매물이 바로 보이게 한다.
              void loadTradeListings();
              activateTab("home");
            }}
          />
        ) : null}
        {activeTab === "living" ? (
          <TenantMyPage
            onGoInquiry={() => activateTab("inquiry")}
            onGoHome={() => activateTab("home")}
          />
        ) : null}

        <nav className="bottom-tabs" aria-label="앱 하단 메뉴">
          {bottomTabs.map((item) => (
            <a
              className={activeTab === item.key ? "active" : ""}
              href={item.href}
              key={item.label}
              onClick={(event) => {
                event.preventDefault();
                activateTab(item.key);
              }}
            >
              <item.Icon size={22} strokeWidth={2.3} aria-hidden="true" />
              {item.label}
              {item.key === "inquiry" && inquiryBadgeCount > 0 ? <span className="tab-dot" aria-label={`읽지 않은 채팅 ${inquiryBadgeCount}건`} /> : null}
            </a>
          ))}
          <MobileRoleMenu
            activeTab={activeTab === "living" || activeTab === "sell" ? activeTab : null}
            onSelectTenant={() => activateTab("living")}
            onSelectListing={() => activateTab("sell")}
            onSelectManager={() => { window.location.href = "/manager/home/00"; }}
          />
        </nav>

        <FilterBottomSheet
          isOpen={isFilterSheetOpen}
          activeCategory={activeCategory}
          activeQuickFilters={activeQuickFilters}
          resultCount={activeTab === "map" ? visibleMapListings.length : visibleHomeCount}
          onClose={() => setIsFilterSheetOpen(false)}
          onApply={() => setIsFilterSheetOpen(false)}
          onCategoryChange={setActiveCategory}
          onQuickFilterToggle={toggleQuickFilter}
        />
        <SearchBottomSheet
          isOpen={isSearchSheetOpen}
          currentArea={selectedArea}
          isResolving={mapQueryStatus === "resolving"}
          isMapMode={activeTab === "map"}
          queryCandidates={mapQueryCandidates}
          candidateKeyword={mapQueryCandidateKeyword}
          recentSearches={recentSearches}
          onClose={() => {
            setIsSearchSheetOpen(false);
            setMapQueryCandidates([]);
            setMapQueryCandidateKeyword("");
          }}
          onClearRecentSearches={() => setRecentSearches([])}
          onSelectArea={selectSearchArea}
          onSelectCandidate={applyResolvedMapCandidate}
        />
        <SortBottomSheet
          isOpen={isSortSheetOpen}
          activeSort={activeSort}
          onClose={() => setIsSortSheetOpen(false)}
          onSelect={(sort) => {
            setActiveSort(sort);
            setIsSortSheetOpen(false);
          }}
        />
        <NotificationSheet
          isOpen={isNotificationSheetOpen}
          onClose={() => setIsNotificationSheetOpen(false)}
        />
      </div>
    </main>
  );
}
