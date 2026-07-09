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
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import { getRealtimeSocket } from "@/lib/realtime-client";
import { intakeSplatAsset, listSplatAssetsByListing, type SplatAsset } from "@/lib/splat-asset-api";
import type { ListingFloorPlan3D } from "./_components/ListingTourRoom3D";
import {
  demoListings as listings,
  demoMapItems,
  getListingPriceRows,
  isRemotePhoto,
  mapListings,
  neighborhoodItems,
  tradeListingToCard,
  tradePriceLabel,
  TRADE_LISTING_NO_PREFIX,
  type Listing,
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
  type NaverGeocodeResponse
} from "./_components/NaverMapPreview";
import { InquirySheet } from "./_components/ListingDetailView";
import { loadSavedListingNos, toggleSavedListingNo } from "../lib/saved-listings";
import { submitTradeInquiry } from "../lib/trade-inquiry";
import { hasCapability, unifiedLoginPath } from "../lib/unified-login";
import {
  pickInquiryTargetNo,
  withNewInquiry,
  type InquiryItem,
  type InquiryPayload
} from "../lib/inquiry-flow";
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
type MapSearchContext = {
  source: "default" | "search" | "user-location";
  label: string;
  center: MapPoint;
  radiusM: number;
};
type MapLocationStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable";
type MapQueryStatus = "idle" | "resolving" | "resolved" | "fallback";





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
  if (value === "login" || value === "signup" || value === "broker") return value;
  return null;
};

const appRoleForViewer = (viewer: ViewerProfile): AppRole => {
  if (viewer.role === "TENANT") return "tenant";
  if (viewer.role === "LANDLORD") return "landlord";
  return "seeker";
};

const categories = [
  { label: "전체", count: "1,287", Icon: Building },
  { label: "원룸", count: "632", Icon: DoorOpen },
  { label: "투룸", count: "248", Icon: Bed },
  { label: "오피스텔", count: "186", Icon: BriefcaseBusiness },
  { label: "아파트", count: "91", Icon: Building2 },
  { label: "빌라", count: "73", Icon: House },
  { label: "단기임대", count: "57", Icon: CalendarClock }
];

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

const marketSignals = [
  { label: "전월세 평균", value: "월 76만", caption: "방배동 원룸 기준" },
  { label: "실매물 확인", value: "92%", caption: "최근 7일 확인율" },
  { label: "문의 응답", value: "8분", caption: "파트너 평균" }
];

const conditionSummaryItems = [
  { label: "예산", value: "보증금 1,000만 · 월세 130만 이하" },
  { label: "입주", value: "즉시입주 · 풀옵션 우선" },
  { label: "생활권", value: "내방역 도보 10분 · 주차 가능" }
];

const homeServiceActions = [
  { label: "최근 본 방", value: "3개", body: "가격·위치 비교하기" },
  { label: "문의 대기", value: "1건", body: "평균 8분 내 답변" },
  { label: "방 내놓기", value: "무료", body: "집주인 등록 바로가기" }
];


const residentChecklist = [
  { label: "등기·권리", value: "위험 낮음" },
  { label: "관리비", value: "상세 공개" },
  { label: "주변소음", value: "보통" },
  { label: "채광", value: "남동향" }
];

const mapInsightItems = [
  { label: "전월세 평균", value: "월 76만", caption: "방배동 원룸" },
  { label: "안전시설", value: "CCTV 12곳", caption: "치안센터 1곳" },
  { label: "즐겨찾기", value: "조건 저장", caption: "지도 조건 알림" },
  { label: "3D 가능", value: "12개", caption: "투어 우선 보기" }
];


const savedComparisonItems = [
  { label: "저장 조건", value: "월세 130 이하", caption: "방배동 · 내방역" },
  { label: "가격 변동", value: "변동 없음", caption: "최근 7일 기준" },
  { label: "방문 후보", value: "오늘 3시", caption: "2개 매물 가능" }
];

const homeWebSummaryItems = [
  { label: "중개사 응답", value: "평균 8분" },
  { label: "오늘 확인", value: "39개" },
  { label: "3D 가능", value: "12개" },
  { label: "안전시설", value: "CCTV 12곳" }
];

const aiBrokerSuggestions = [
  { label: "방문 추천", value: "방배 루미에르", body: "예산·역세권·3D 투어 조건이 가장 잘 맞습니다." },
  { label: "가격 주의", value: "관리비 확인", body: "월세가 낮은 매물은 관리비 포함 여부를 먼저 보세요." },
  { label: "대체 후보", value: "성수 복층", body: "반려동물 조건을 유지하면 성수동 매물이 더 넓습니다." }
];

const neighborhoodRankItems = [
  { rank: "1", label: "교통", value: "내방역 도보 5분" },
  { rank: "2", label: "생활", value: "편의점 4곳 · 카페 7곳" },
  { rank: "3", label: "안전", value: "CCTV 12곳 · 치안센터 1곳" }
];


const DEFAULT_MAP_CONTEXT: MapSearchContext = {
  source: "default",
  label: "서초구 방배동",
  center: { lat: 37.4875, lng: 126.9931 },
  radiusM: 2500
};
const MAP_SEARCH_RADIUS_M = 2500;

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

function mapQueryLabelFromAddress(query: string, address?: { roadAddress?: string; jibunAddress?: string }) {
  const compactQuery = query.trim().replace(/\s+/g, " ");
  if (/역$/.test(compactQuery)) return compactQuery;

  const addressText = (address?.jibunAddress || address?.roadAddress || "").trim();
  const parts = addressText.split(/\s+/).filter(Boolean);
  const district = [...parts].reverse().find((part) => /(구|군)$/.test(part));
  const neighborhood = [...parts].reverse().find((part) => /(동|가|읍|면|리)$/.test(part));

  if (district && neighborhood) return `${district} ${neighborhood}`;
  if (neighborhood) return neighborhood;
  return compactQuery;
}

async function resolveMapQuery(query: string): Promise<MapSearchContext | null> {
  const keyword = query.trim();
  if (!keyword) return null;

  const isReady = await loadNaverMapService();
  const service = window.naver?.maps?.Service;
  if (!isReady || !service) return null;

  return new Promise((resolve) => {
    try {
      service.geocode({ query: keyword }, (status: string, response: NaverGeocodeResponse) => {
        if (status !== service.Status.OK) {
          resolve(null);
          return;
        }

        const address = response.v2?.addresses?.[0];
        const lat = Number(address?.y);
        const lng = Number(address?.x);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          resolve(null);
          return;
        }

        resolve({
          source: "search",
          label: mapQueryLabelFromAddress(keyword, address),
          center: { lat, lng },
          radiusM: MAP_SEARCH_RADIUS_M
        });
      });
    } catch {
      resolve(null);
    }
  });
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



const bottomTabs: Array<{ key: AppTab; label: string; Icon: LucideIcon; href: string }> = [
  { key: "home", label: "홈", Icon: HomeIcon, href: "#home-title" },
  { key: "map", label: "지도", Icon: MapPinned, href: "#map-list" },
  { key: "saved", label: "찜", Icon: Heart, href: "#saved-list" },
  { key: "inquiry", label: "문의", Icon: MessageCircle, href: "#inquiry" },
  { key: "living", label: "세입자", Icon: UserRound, href: "#my-page" },
  { key: "sell", label: "매물등록", Icon: House, href: "#my-page" }
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
    listing.tradeType === "월세"
      ? `${listing.depositManwon}/${listing.monthlyRentManwon}`
      : tradePriceLabel(listing);
  return {
    listingNo: `${TRADE_LISTING_NO_PREFIX}${listing.id}`,
    title: listing.title,
    price: tradePriceLabel(listing),
    meta: `${listing.roomType} · 집주인 직접`,
    distance: listing.location,
    updated: "방금 등록",
    flags: ["집주인 직접"],
    image: (Array.isArray(listing.images) && listing.images[0]) || "/listing-studio.jpg",
    lat: typeof listing.lat === "number" ? listing.lat : Number.NaN,
    lng: typeof listing.lng === "number" ? listing.lng : Number.NaN,
    mapLabel: shortPrice,
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
    tags: ["헛걸음 보상", "현장촬영", "문자문의"]
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

const trustItems = [
  { title: "안심 리포트", body: "등기·시세·권리관계 요약" },
  { title: "주변 안전", body: "CCTV, 치안센터, 야간동선" },
  { title: "헛걸음 보상", body: "정보 불일치 신고 접수 가능" }
];

// QA: 데모 문의(답변 포함)가 세션마다 "문의 1" 배지를 되살리던 문제 — 실제 문의만 쌓이도록 빈 목록으로 시작.
const initialInquiries: InquiryItem[] = [];







function SavedListingsSection({
  savedListingNos,
  openListing,
  onToggleSaved
}: {
  savedListingNos: string[];
  openListing: (listing: Listing) => void;
  onToggleSaved: (listingNo: string) => void;
}) {
  const savedListings = listings.filter((listing) => savedListingNos.includes(listing.listingNo));

  return (
    <section className="screen saved-screen" id="saved-list" aria-labelledby="saved-title">
      <div className="section-title no-margin">
        <div>
          <h2 id="saved-title">찜한 매물</h2>
          <p>최근 본 방과 비교하기 좋은 매물을 모아뒀습니다.</p>
        </div>
        <strong>{savedListings.length}개</strong>
      </div>

      <section className="saved-compare-strip" aria-label="찜한 매물 비교 요약">
        {savedComparisonItems.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.caption}</small>
          </article>
        ))}
      </section>

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
  focusThreadId
}: {
  onRequireLogin: () => void;
  focusThreadId?: string;
}) {
  return (
    <section className="screen inquiry-screen" id="inquiry" aria-labelledby="inquiry-title">
      <div className="section-title no-margin">
        <div>
          <h2 id="inquiry-title">문의센터</h2>
          <p>보낸 문의와 받은 문의가 모두 채팅으로 이어집니다.</p>
        </div>
      </div>

      {/* 서버 스레드 기반 문의 채팅 — 보낸 문의(구매자)와 받은 문의(집주인)를 한 곳에서 본다.
          QA: roleFilter="buyer" 고정 탓에 집주인이 문의 탭에서 받은 문의를 못 보던 문제 → 필터 해제.
          variant="hub": 데스크톱 브라우저는 목록+대화 2패널, 앱(PWA·좁은 화면)은 채팅 목록 단일 패널. */}
      <div className="inquiry-chat-panel">
        <TradeChatCenter
          variant="hub"
          emptyText="매물 상세의 '문자문의'로 첫 문의를 보내보세요. 받은 문의도 여기로 들어옵니다."
          onRequireLogin={onRequireLogin}
          focusThreadId={focusThreadId}
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

        <div className="filter-sheet-section compact">
          <strong>입주 조건</strong>
          <div className="filter-priority-grid">
            {[
              ["즉시입주", "오늘 방문 가능"],
              ["확인매물", "실제 방문 확인"],
              ["3D 투어", "방문 전 구조 확인"],
              ["안심분석", "권리관계 요약"]
            ].map(([label, caption]) => (
              <button type="button" key={label}>
                <span>{label}</span>
                <small>{caption}</small>
              </button>
            ))}
          </div>
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
  recentSearches,
  onClose,
  onClearRecentSearches,
  onSelectArea
}: {
  isOpen: boolean;
  currentArea: string;
  isResolving?: boolean;
  recentSearches: string[];
  onClose: () => void;
  onClearRecentSearches: () => void;
  onSelectArea: (area: string) => void | Promise<void>;
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

        <section className="search-condition-strip" aria-label="추천 검색 조건">
          {savedConditions.slice(0, 3).map((condition) => (
            <button type="button" key={condition.label} onClick={() => onSelectArea(condition.area)} disabled={isResolving}>
              <span>{condition.category}</span>
              <strong>{condition.label}</strong>
            </button>
          ))}
        </section>

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
  const [mapSearchContext, setMapSearchContext] = useState<MapSearchContext>(DEFAULT_MAP_CONTEXT);
  const [mapLocationStatus, setMapLocationStatus] = useState<MapLocationStatus>("idle");
  const [mapQueryStatus, setMapQueryStatus] = useState<MapQueryStatus>("idle");
  const mapLocationRequestedRef = useRef(false);
  const mapContextRequestIdRef = useRef(0);
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
  const [savedListingNos, setSavedListingNos] = useState<string[]>([listings[0].listingNo, listings[2].listingNo]);
  useEffect(() => {
    setSavedListingNos(loadSavedListingNos([listings[0].listingNo, listings[2].listingNo]));
  }, []);
  const [inquiries, setInquiries] = useState<InquiryItem[]>(initialInquiries);
  // 통합 문의 sheet가 열려 있는 대상 매물 번호 (매물 상세 밖에서 문의를 시작할 때 사용)
  const [inquiryComposeListingNo, setInquiryComposeListingNo] = useState<string | null>(null);
  // 문의 전송 직후 채팅으로 바로 진입할 스레드 id (문의센터 TradeChatCenter로 전달)
  const [buyerFocusThreadId, setBuyerFocusThreadId] = useState<string | undefined>(undefined);
  const [seenInquiryIds, setSeenInquiryIds] = useState<number[]>([]);
  const [viewedListingNos, setViewedListingNos] = useState<string[]>([]);
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
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/trade/listings/public", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: TradeListing[]) => {
          if (!cancelled && Array.isArray(data)) setTradeListings(data);
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 30000);
    // 다른 탭/앱에 다녀오면 즉시 갱신 — 30초 폴링만으로는 "새로고침해야 보이는" 답답함이 남는다.
    const reloadOnReturn = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", reloadOnReturn);
    document.addEventListener("visibilitychange", reloadOnReturn);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", reloadOnReturn);
      document.removeEventListener("visibilitychange", reloadOnReturn);
    };
  }, []);

  function requestMapCurrentLocation(force = false) {
    if (!force && mapLocationRequestedRef.current) return;

    if (!navigator.geolocation) {
      mapLocationRequestedRef.current = true;
      setMapLocationStatus("unavailable");
      return;
    }

    const requestId = ++mapContextRequestIdRef.current;
    mapLocationRequestedRef.current = true;
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
    if (activeTab !== "map" || mapSearchContext.source !== "default" || selectedArea !== DEFAULT_MAP_CONTEXT.label) return;
    requestMapCurrentLocation();
    // 지도 탭 첫 진입 때 한 번만 현재 위치를 요청한다. 검색/수동 위치 변경은 별도 액션이 소유한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, mapSearchContext.source, selectedArea]);

  // 실사진 있는 매물을 앞으로 — 사진 없는 등록(목업 폴백 카드)이 첫 화면을 가리지 않게 한다.
  // sort는 안정 정렬이라 같은 그룹 안에서는 서버의 최신순이 유지된다.
  // 계약완료 매물은 공개 피드에서 제외한다(집주인 마이페이지/관리 콘솔에서만 관리).
  const sortedTradeListings = tradeListings
    .filter((listing) => listing.status !== "계약완료")
    .sort((a, b) => Number((b.images?.length ?? 0) > 0) - Number((a.images?.length ?? 0) > 0));
  const allListings = [...sortedTradeListings.map(tradeListingToCard), ...listings];
  const selectedAreaTitle = formatAreaTitle(selectedArea);
  const activeFilterSummary = [activeCategory, ...activeQuickFilters].join(" · ");
  const visibleHomeListings = allListings.filter((listing) => {
    const categoryMatches =
      activeCategory === "전체"
        ? true
        : activeCategory === "원룸"
        ? listing.roomType === "원룸"
        : activeCategory === "오피스텔"
          ? listing.roomType === "오피스텔"
          : activeCategory === "투룸"
            ? listing.spec.includes("투룸") || listing.spec.includes("복층")
            : false;
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
      [listing.title, listing.location, listing.spec, listing.price, ...listing.tags, ...listing.badges]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

    return categoryMatches && dealTypeMatches && quickFilterMatches && keywordMatches;
  });
  const visibleHomeCount = visibleHomeListings.length;
  const mapFilterSummary = getMapFilterSummary(activeMapFilter);
  // 직접등록 매물을 지도 목록·마커에 합류 — 좌표(lat/lng) 있는 매물은 지도에 찍히고, 없는 매물도 목록에는 뜬다.
  const allMapItems = [
    ...tradeListings.map((listing, index) => tradeListingToMapItem(listing, index, tradeListings.length)),
    ...demoMapItems
  ];
  // 지역 검색이 개수·목록에 실제 반영되도록 지역 토큰으로 필터 (QA: 지역 바꿔도 개수가 그대로던 표기이상).
  // 토큰 = 선택 지역의 마지막 단어에서 동/역/구 접미사 제거(예: "서초구 방배동"→"방배").
  const areaSearchToken = (selectedAreaTitle.split(" ").pop() ?? "").replace(/(동|역|구)$/, "").trim();
  const areaMatchedMapItems = areaSearchToken
    ? allMapItems.filter((listing) =>
        [listing.title, listing.meta, listing.distance].join(" ").includes(areaSearchToken)
      )
    : allMapItems;
  // 매칭이 하나도 없으면 전체로 폴백 — 데모 데이터 범위 밖 지역을 골라도 지도가 텅 비지 않게.
  const areaScopedMapItems = areaMatchedMapItems.length > 0 ? areaMatchedMapItems : allMapItems;
  const isLocationScopedMap = mapSearchContext.source === "user-location";
  const isSearchScopedMap = mapSearchContext.source === "search";
  const isDistanceScopedMap = isLocationScopedMap || isSearchScopedMap;
  const distanceCandidateMapItems = isDistanceScopedMap ? allMapItems : areaScopedMapItems;
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
  const isRadiusEmptyMap = isDistanceScopedMap && nearbyMapItems.length === 0;
  const locationScopedMapItems = isDistanceScopedMap
    ? (
        nearbyMapItems.length > 0
          ? nearbyMapItems
          : []
      )
    : mapItemsWithDistance;
  const visibleMapListings = locationScopedMapItems
    .filter((listing) => {
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
  const mapScopeLabel = isLocationScopedMap ? "현재 위치" : "검색";
  const mapLocationSummary =
    mapQueryStatus === "resolving"
      ? "검색 위치 확인 중"
      : mapLocationStatus === "requesting"
      ? "현재 위치 확인 중"
      : isDistanceScopedMap
        ? isRadiusEmptyMap
          ? `${mapScopeLabel} 반경 ${formatDistanceLabel(mapSearchContext.radiusM)} 내 매물 없음`
          : isLocationScopedMap
            ? `현재 위치 반경 ${formatDistanceLabel(mapSearchContext.radiusM)}`
            : `검색 반경 ${formatDistanceLabel(mapSearchContext.radiusM)}`
        : mapQueryStatus === "fallback"
          ? "주소 확인 실패 · 문자열 기준"
        : mapLocationStatus === "denied"
          ? "위치 권한 미허용 · 기본 지역"
        : mapLocationStatus === "unavailable"
          ? "위치 확인 불가 · 기본 지역"
          : selectedArea === DEFAULT_MAP_CONTEXT.label
            ? "기본 지역 기준"
            : "지역 검색 기준";
  const mapListingDistanceLabel = (listing: { distance: string; distanceFromCenterM?: number }) =>
    isDistanceScopedMap && Number.isFinite(listing.distanceFromCenterM)
      ? `${isLocationScopedMap ? "현재 위치" : "검색 위치"} ${formatDistanceLabel(listing.distanceFromCenterM ?? 0)} · ${listing.distance}`
      : listing.distance;
  const mapRoomsFeedback = isRadiusEmptyMap
    ? `${mapScopeLabel} 반경 ${formatDistanceLabel(mapSearchContext.radiusM)} 안에 표시할 매물이 없습니다.`
    : `${activeSort} · ${mapFilterSummary} 조건으로 우선 매물 ${visibleMapListings.length}개를 먼저 보여줍니다.`;
  const mapEmptyTitle = isRadiusEmptyMap
    ? isLocationScopedMap
      ? "내 위치 반경 내 매물이 없습니다"
      : "반경 내 매물이 없습니다"
    : "조건에 맞는 매물이 없습니다";
  const mapEmptyDescription = isRadiusEmptyMap
    ? `${isLocationScopedMap ? "현재 위치" : selectedAreaTitle} 기준 ${formatDistanceLabel(mapSearchContext.radiusM)} 안에 표시할 매물이 없습니다.`
    : `${activeSort} · ${mapFilterSummary} 조건에 맞는 매물이 없습니다.`;
  const selectedMapListing = visibleMapListings.find((listing) => listing.listingNo === selectedMapListingNo) ?? visibleMapListings[0];
  // 지도 마커 = 좌표가 유효한 매물만 (직접등록 매물 포함 — QA: 지도에 매물 안 찍힘)
  const mapMarkers = visibleMapListings.filter((listing) => Number.isFinite(listing.lat) && Number.isFinite(listing.lng));
  const findListingCardByNo = (listingNo: string) => allListings.find((listing) => listing.listingNo === listingNo);

  const inquiryComposeListing = inquiryComposeListingNo
    ? allListings.find((listing) => listing.listingNo === inquiryComposeListingNo) ?? null
    : null;

  const unseenReplyCount = inquiries.filter((item) => item.reply && !seenInquiryIds.includes(item.id)).length;

  // 실시간 문의 신호 — 상대가 보낸 trade:updated만 문의 탭 밖에서 배지를 켠다(탭 진입 시 해제).
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

  const inquiryBadgeCount = unseenReplyCount + unseenTradeCount;

  // 문의 탭을 보고 있는 동안 도착한 답변까지 즉시 확인 처리 — 탭을 나갔다 들어올 필요 없이 뱃지가 사라진다.
  useEffect(() => {
    if (activeTab !== "inquiry") return;

    setSeenInquiryIds((current) => {
      const repliedIds = inquiries.filter((item) => item.reply).map((item) => item.id);
      const merged = Array.from(new Set([...current, ...repliedIds]));
      return merged.length === current.length ? current : merged;
    });
  }, [activeTab, inquiries]);

  // 상세는 이제 라우트(/listing/[id]) — 공유 가능한 URL로 이동한다(1단계 라우트 분리).
  const openListing = (listing: Listing) => {
    setViewedListingNos((current) => [listing.listingNo, ...current.filter((no) => no !== listing.listingNo)].slice(0, 4));
    router.push(`/listing/${encodeURIComponent(listing.listingNo)}`);
  };

  // 문의는 서버 스레드로 전송된다 — 집주인(또는 데모 임대인) 계정이 실제로 받고, 채팅으로 이어진다.
  // 반환값: ok=접수, auth=로그인 필요, error=실패.
  const submitInquiry = async (
    payload: InquiryPayload,
    listingNo?: string
  ): Promise<"ok" | "auth" | "error"> => {
    const result = await submitTradeInquiry(payload, listingNo);
    if (result.status !== "ok") return result.status;
    // 로컬 요약 목록에도 즉시 반영 (문의센터 상단 노출 — lib/inquiry-flow 테스트로 고정된 규칙)
    setInquiries((current) => withNewInquiry(current, payload, Date.now()));
    // 서버가 방금 생성/이어붙인 스레드 id를 돌려주면, 문의센터 채팅으로 바로 진입한다(당근식).
    if (result.threadId) {
      setBuyerFocusThreadId(result.threadId);
      setInquiryComposeListingNo(null);
      activateTab("inquiry");
    }
    return "ok";
  };

  // 통합 문의 작성 진입점 — 최근 본 매물이 있으면 그 매물, 없으면 첫 추천 매물의 sheet를 연다.
  // 홈 카드 "문자문의"가 이 흐름을 쓴다 (QA 3·4·7). 문의 탭의 "새 문의" 버튼은 제거됐다.
  const openInquiryComposer = (listing?: Listing) => {
    if (listing) {
      setInquiryComposeListingNo(listing.listingNo);
      return;
    }

    const targetNo = pickInquiryTargetNo(
      viewedListingNos,
      visibleHomeListings.map((item) => item.listingNo)
    ) ?? allListings[0]?.listingNo;

    if (targetNo) setInquiryComposeListingNo(targetNo);
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

  const toggleSavedListing = (listingNo: string) => {
    setSavedListingNos((current) => toggleSavedListingNo(current, listingNo));
  };

  const applyMapAreaSelection = (area: string, context: MapSearchContext) => {
    setSelectedArea(area);
    setMapSearchContext(context);
  };

  const selectSearchArea = async (area: string) => {
    const keyword = area.trim();
    if (!keyword) return;

    const requestId = ++mapContextRequestIdRef.current;
    setMapQueryStatus("resolving");
    const resolvedContext = await resolveMapQuery(keyword);
    if (requestId !== mapContextRequestIdRef.current) return;

    const nextArea = resolvedContext?.label ?? keyword;
    applyMapAreaSelection(nextArea, resolvedContext ?? { ...DEFAULT_MAP_CONTEXT, label: keyword });
    setMapQueryStatus(resolvedContext ? "resolved" : "fallback");
    setRecentSearches((current) => [keyword, ...current.filter((item) => item !== keyword)].slice(0, 5));
    setIsSearchSheetOpen(false);
    setActiveMapResultTab("rooms");
    activateTab("map");
  };

  const applySavedCondition = async (condition: (typeof savedConditions)[number]) => {
    setActiveCategory(condition.category);
    setActiveQuickFilters(condition.filters);
    await selectSearchArea(condition.area);
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
      // 새로고침이 홈으로 튕기지 않게 — 이 탭에서 마지막으로 보던 탭/역할을 복원한다(딥링크와 같은 취급).
      // 탭 경로(/map 등)로 직접 들어온 경우엔 그 경로가 진실이므로 복원하지 않는다.
      const storedTab = normalizeAppTab(window.sessionStorage.getItem("woozuLastTab"));
      const storedRole = normalizeAppRole(window.sessionStorage.getItem("woozuLastRole"));
      if (storedRole && storedRole !== "seeker") {
        urlRoleAppliedRef.current = true;
        setIsDevRolePreview(true);
        setActiveRole(storedRole);
      }
      if (storedTab && storedTab !== "home") {
        setActiveTab(storedTab);
        window.history.replaceState(null, "", TAB_PATHS[storedTab]);
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
                문의
                {inquiryBadgeCount > 0 ? <span className="nav-badge">{inquiryBadgeCount}</span> : null}
              </button>
              <button className={activeTab === "living" ? "active" : ""} type="button" onClick={() => activateTab("living")}>세입자</button>
              <button type="button" onClick={() => { window.location.href = "/manager/home/00"; }}>관리</button>
              <button className={activeTab === "sell" ? "active" : ""} type="button" onClick={() => activateTab("sell")}>매물등록</button>
            </nav>
            <div className="web-topbar-actions">
              {/* 역할은 상단 메뉴(세입자·관리·매물등록)에서 직접 진입한다 — 별도 역할 셀렉트/칩 없음. */}
              {viewer ? (
                <div className="web-profile-menu" aria-label="로그인 사용자">
                  <span className="web-profile-avatar" aria-hidden="true">{viewer.name.slice(0, 1)}</span>
                  <span className="web-profile-name">{viewer.name}</span>
                  <button className="web-logout" type="button" onClick={logout}>로그아웃</button>
                </div>
              ) : (
                <>
                  <button className="web-login" type="button" onClick={() => openAuthScreen("login")}>로그인</button>
                  <button className="web-signup" type="button" onClick={() => { window.location.href = "/signup"; }}>회원가입</button>
                  <button className="web-cta" type="button" onClick={() => openAuthScreen("broker")}>중개사 가입</button>
                </>
              )}
            </div>
          </div>
        </header>
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

          <nav className="category-strip" aria-label="매물 유형">
            {categories.map((category) => {
              const CategoryIcon = category.Icon;

              return (
                <button
                  className={activeCategory === category.label ? "category-card active" : "category-card"}
                  type="button"
                  key={category.label}
                  onClick={() => setActiveCategory(category.label)}
                >
                  <i aria-hidden="true">
                    <CategoryIcon size={18} strokeWidth={2.4} />
                  </i>
                  <span>{category.label}</span>
                  <strong>{category.count}</strong>
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
                      <div className="listing-body">
                        <div className="listing-status-line">
                          <span>{listing.listingLabel}</span>
                          <span>{listing.updated}</span>
                        </div>
                        <div>
                          <strong>{listing.price}</strong>
                          <span>{listing.score}</span>
                        </div>
                        <h3>{listing.title}</h3>
                        <p>{listing.spec}</p>
                        <small>{listing.location}</small>
                        <small className="listing-broker">{listing.broker}</small>
                        <div className="listing-meta-row">
                          <span>{listing.verification}</span>
                          <span>{listing.response}</span>
                          <span>{listing.badges.includes("3D 투어") ? "3D 투어 가능" : "방문 예약"}</span>
                        </div>
                      </div>
                    </button>
                    <div className="listing-card-footer" aria-label={`${listing.title} 빠른 액션`}>
                      <button type="button" onClick={() => openListing(listing)}>상세 보기</button>
                      <button type="button" onClick={() => openInquiryComposer(listing)}>문자문의</button>
                      <button type="button" onClick={() => openListing(listing)}>3D 보기</button>
                    </div>
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
                <article className="home-web-summary-card" aria-label="방배동 생활권 요약">
                  <span>방배동 생활권 요약</span>
                  <h3>방문 전에 확인할 핵심 정보</h3>
                  <p>시세, 안전, 중개사 응답, 3D 가능 매물을 한 화면에서 같이 비교합니다.</p>
                  <div>
                    {homeWebSummaryItems.map((item) => (
                      <strong key={item.label}>
                        <small>{item.label}</small>
                        {item.value}
                      </strong>
                    ))}
                  </div>
                  <button type="button" onClick={() => activateTab("map")}>지도에서 비교하기</button>
                </article>
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

          <section className="condition-summary-card" aria-label="내 검색 조건 요약">
            <div className="condition-summary-head">
              <div>
                <span>내 조건 요약</span>
                <strong>{selectedAreaTitle}에서 바로 볼 만한 방</strong>
              </div>
              <button type="button" onClick={() => setIsFilterSheetOpen(true)}>수정</button>
            </div>
            <div className="condition-summary-list">
              {conditionSummaryItems.map((item) => (
                <article key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="ai-broker-card" aria-label="AI중개사 추천">
            <div className="ai-broker-head">
              <div>
                <span>AI중개사 추천</span>
                <h2>조건을 읽고 먼저 볼 방을 골랐어요</h2>
              </div>
              <button type="button" onClick={() => openListing(listings[0])}>1순위 보기</button>
            </div>
            <div className="ai-broker-list">
              {aiBrokerSuggestions.map((item) => (
                <article key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="saved-condition-panel" aria-label="저장한 검색 조건">
            <div>
              <strong>조건 저장</strong>
              <span>맞는 방이 올라오면 바로 확인</span>
            </div>
            <div className="saved-condition-list">
              {savedConditions.map((condition) => (
                <button type="button" key={condition.label} onClick={() => applySavedCondition(condition)}>
                  {condition.label}
                </button>
              ))}
            </div>
          </section>

          <section className="market-signal-grid" aria-label="지역 매물 지표">
            {marketSignals.map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.label === "전월세 평균" ? `${selectedAreaTitle} 원룸 기준` : item.caption}</p>
              </article>
            ))}
          </section>

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

          <section className="home-action-panel" aria-label="빠른 서비스 메뉴">
            {homeServiceActions.map((action) => (
              <button
                type="button"
                key={action.label}
                onClick={() => {
                  if (action.label === "최근 본 방") {
                    openListing(listings[0]);
                    return;
                  }

                  if (action.label === "문의 대기") {
                    activateTab("inquiry");
                    return;
                  }

                  // "방 내놓기" → 매물등록
                  activateTab("sell");
                }}
              >
                <span>{action.label}</span>
                <strong>{action.value}</strong>
                <small>{action.body}</small>
              </button>
            ))}
          </section>

          <section className="trust-grid" aria-label="신뢰 정보">
            {trustItems.map((item) => (
              <article key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </section>

          <section className="neighborhood-strip" aria-label="주변 정보">
            <div>
              <h2>주변 정보</h2>
              <p>생활 편의시설과 이동 시간을 같이 봅니다.</p>
            </div>
            <div>
              {neighborhoodItems.map((item) => (
                <span key={item.label}>
                  <b>{item.label}</b>
                  {item.value}
                </span>
              ))}
            </div>
          </section>

          <section className="resident-check-card" aria-label="실거주 체크">
            <div>
              <span>실거주 체크</span>
              <h2>사진만으로 놓치기 쉬운 정보를 먼저 확인해요</h2>
              <p>권리관계, 관리비, 소음, 채광처럼 방문 전에 걸러야 할 항목을 매물 카드와 함께 봅니다.</p>
            </div>
            <div className="resident-check-grid">
              {residentChecklist.map((item) => (
                <article key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="neighborhood-rank-card" aria-label="동네정보 랭킹">
            <div>
              <span>동네정보 랭킹</span>
              <h2>{selectedAreaTitle} 생활 점수</h2>
              <p>교통, 생활, 안전 정보를 방문 전에 빠르게 비교합니다.</p>
            </div>
            <div className="neighborhood-rank-list">
              {neighborhoodRankItems.map((item) => (
                <article key={item.label}>
                  <b>{item.rank}</b>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </section>
        </section>
        ) : null}

        {activeTab === "map" ? (
        <section className="screen map-screen" id="map-list" aria-labelledby="map-title">
          <div className="map-topbar">
            <label>
              <Search size={20} strokeWidth={2.4} aria-hidden="true" />
              <input value={selectedArea} readOnly aria-label="지도 검색어" onFocus={() => setIsSearchSheetOpen(true)} />
            </label>
            <button
              type="button"
              onClick={() => requestMapCurrentLocation(true)}
              aria-label="현재 위치 주변 매물 보기"
              title="내 위치 주변"
              disabled={mapLocationStatus === "requesting"}
            >
              <MapPinned size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setIsFilterSheetOpen(true)} aria-label="필터">
              <SlidersHorizontal size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>

          <div className="map-filter-row">
            {["시세", "원룸·투룸", "보증금", "안전", "3D 가능"].map((filter) => (
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
            <strong>{selectedAreaTitle} {activeMapFilter}</strong>
            <span>{mapLocationSummary}</span>
            <span>{mapFilterSummary}</span>
            <span>결과 {visibleMapListings.length}개</span>
          </div>

          <section className="map-insight-strip" aria-label="지도 생활권 요약">
            {mapInsightItems.map((item) => (
              <article key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.caption}</small>
              </article>
            ))}
          </section>

          <div className="map-canvas-stack">
            <NaverMapPreview
              className="map-stage"
              center={mapSearchContext.center}
              showCenterMarker={isLocationScopedMap}
              title={isLocationScopedMap ? "현재 위치" : selectedAreaTitle}
              markers={mapMarkers}
            />
            {selectedMapListing ? (
              <article className="map-selected-card" aria-label="지도 선택 매물">
                <button
                  type="button"
                  onClick={() => {
                    const card = findListingCardByNo(selectedMapListing.listingNo);
                    if (card) openListing(card);
                  }}
                >
                  <span>{selectedMapListing.clusterLabel} · {selectedMapListing.updated}</span>
                  <strong>{selectedMapListing.title}</strong>
                  <small>{selectedMapListing.price} · {mapListingDistanceLabel(selectedMapListing)}</small>
                </button>
                <div>
                  <em>{selectedMapListing.flags[0]}</em>
                  <button type="button" onClick={() => activateTab("inquiry")}>문의</button>
                </div>
              </article>
            ) : null}
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
                  {activeMapResultTab === "rooms" ? `${selectedAreaTitle} 매물 ${visibleMapListings.length}개` : null}
                  {activeMapResultTab === "complexes" ? `${selectedAreaTitle} 단지 18곳` : null}
                  {activeMapResultTab === "agents" ? "인근 중개사무소 9곳" : null}
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
              <article>
                <span>평균 응답</span>
                <strong>8분</strong>
              </article>
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
                          <span>확인매물</span>
                        </div>
                        <div className="map-listing-copy">
                          <div className="map-card-badge-row">
                            <span>실매물 확인</span>
                            <span>{listing.updated}</span>
                          </div>
                          <h3>{listing.title}</h3>
                          <strong>{listing.price}</strong>
                          <p>{listing.meta}</p>
                          <small>{mapListingDistanceLabel(listing)}</small>
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
                      <button type="button" onClick={() => activateTab("inquiry")}>문의하기</button>
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
          savedListingNos={savedListingNos}
          openListing={openListing}
          onToggleSaved={toggleSavedListing}
        />
        ) : null}
        {activeTab === "inquiry" ? (
          <InquiryHubSection onRequireLogin={() => openAuthScreen("login")} focusThreadId={buyerFocusThreadId} />
        ) : null}
        {activeTab === "sell" ? (
          <LandlordMyPage onGoHome={() => activateTab("home")} />
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
              {item.key === "inquiry" && inquiryBadgeCount > 0 ? <span className="tab-dot" aria-label={`읽지 않은 문의 ${inquiryBadgeCount}건`} /> : null}
            </a>
          ))}
          <a href="/manager/home/00" onClick={(event) => { event.preventDefault(); window.location.href = "/manager/home/00"; }}>
            <Building2 size={22} strokeWidth={2.3} aria-hidden="true" />
            관리
          </a>
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
          recentSearches={recentSearches}
          onClose={() => setIsSearchSheetOpen(false)}
          onClearRecentSearches={() => setRecentSearches([])}
          onSelectArea={selectSearchArea}
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
        {inquiryComposeListing ? (
          <InquirySheet
            listing={inquiryComposeListing}
            onClose={() => setInquiryComposeListingNo(null)}
            onSubmitInquiry={submitInquiry}
            onViewInquiryCenter={() => {
              setInquiryComposeListingNo(null);
              activateTab("inquiry");
            }}
            onRequireLogin={() => {
              setInquiryComposeListingNo(null);
              openAuthScreen("login");
            }}
          />
        ) : null}
      </div>
    </main>
  );
}
