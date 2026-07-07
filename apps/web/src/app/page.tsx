"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import dynamic from "next/dynamic";
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
  UserRound
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
import type { ListingFloorPlan3D } from "./_components/ListingTourRoom3D";

// 상세 "3D 보기" 전용 — three.js 번들이 무거우므로 시트를 열 때만 지연 로드한다.
const ListingTourRoom3D = dynamic(() => import("./_components/ListingTourRoom3D"), {
  ssr: false,
  loading: () => <div className="tour-room-loading">3D 도면을 불러오는 중…</div>
});
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

type AppTab = "home" | "map" | "saved" | "inquiry" | "mypage";
type MapResultTab = "rooms" | "complexes" | "agents";

type NaverLatLng = unknown;
type NaverMap = unknown;
// setMap(null) = 마커 제거 — 지도 탭에서 매물 목록이 바뀔 때 마커를 다시 그리는 데 쓴다.
type NaverMarker = { setMap: (map: NaverMap | null) => void };
type NaverPoint = unknown;
type NaverInfoWindow = {
  open: (map: NaverMap, marker: NaverMarker) => void;
};
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
type NaverMapsApi = {
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  Map: new (
    element: HTMLElement,
    options: {
      center: NaverLatLng;
      zoom: number;
      zoomControl: boolean;
    }
  ) => NaverMap;
  Marker: new (options: {
    map: NaverMap;
    position: NaverLatLng;
    icon?: {
      content: string;
      anchor?: NaverPoint;
    };
  }) => NaverMarker;
  InfoWindow: new (options: { content: string }) => NaverInfoWindow;
  Point: new (x: number, y: number) => NaverPoint;
  Service?: {
    geocode: (
      options: { query: string },
      callback: (status: string, response: NaverGeocodeResponse) => void
    ) => void;
    Status: { OK: string; ERROR: string };
  };
};

type NaverGeocodeResponse = {
  v2?: { addresses?: Array<{ x: string; y: string; roadAddress?: string; jibunAddress?: string }> };
};

type MapLoadState = "missing-key" | "loading" | "ready" | "error";

declare global {
  interface Window {
    naver?: {
      maps: NaverMapsApi;
    };
  }
}

const naverMapClientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? "";
// 지도 InfoWindow는 HTML 문자열을 받으므로 사용자 입력(매물명)은 이스케이프한다.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}
// 업로드 사진은 절대 URL(API 정적서빙/S3) — next/image 최적화기는 사설 IP(dev의 localhost/api)를
// 차단하므로 절대 URL 사진은 unoptimized로 브라우저가 직접 로드하게 한다(번들 목업은 그대로 최적화).
const isRemotePhoto = (src: string) => /^https?:\/\//.test(src);
// geocoder 서브모듈 포함 — 주소→좌표 변환(naver.maps.Service.geocode)을 쓰기 위함.
const naverMapScriptUrl = naverMapClientId
  ? `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${naverMapClientId}&submodules=geocoder`
  : "";

// 지도/지오코딩 스크립트를 필요할 때 1회만 로드한다(등록 폼은 NaverMapPreview가 없는 화면이라 자체 로드 필요).
let naverMapsLoadPromise: Promise<boolean> | null = null;
function loadNaverMaps(): Promise<boolean> {
  if (typeof window === "undefined" || !naverMapScriptUrl) return Promise.resolve(false);
  if (window.naver?.maps?.Service) return Promise.resolve(true);
  if (naverMapsLoadPromise) return naverMapsLoadPromise;
  naverMapsLoadPromise = new Promise((resolvePromise) => {
    const existing = document.getElementById("naver-map-loader") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolvePromise(Boolean(window.naver?.maps)), { once: true });
      existing.addEventListener("error", () => resolvePromise(false), { once: true });
      if (window.naver?.maps) resolvePromise(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "naver-map-loader";
    script.src = naverMapScriptUrl;
    script.async = true;
    script.onload = () => resolvePromise(Boolean(window.naver?.maps));
    script.onerror = () => {
      naverMapsLoadPromise = null;
      resolvePromise(false);
    };
    document.head.appendChild(script);
  });
  return naverMapsLoadPromise;
}

// 주소 문자열을 좌표로 변환한다. 실패(미활성/무결과)면 null — 호출측은 좌표 없이 진행한다.
async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const ready = await loadNaverMaps();
  const service = window.naver?.maps?.Service;
  if (!ready || !service) return null;
  return new Promise((resolvePromise) => {
    try {
      service.geocode({ query: trimmed }, (status, response) => {
        if (status !== service.Status.OK) {
          resolvePromise(null);
          return;
        }
        const first = response?.v2?.addresses?.[0];
        const lat = Number(first?.y);
        const lng = Number(first?.x);
        if (!first || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          resolvePromise(null);
          return;
        }
        resolvePromise({ lat, lng });
      });
    } catch {
      resolvePromise(null);
    }
  });
}

// 내 주거 프로세스: 한 계정이 상황에 따라 갖는 집과의 관계(흐름) 단위.
// "역할 전환"이 아니라 같은 계정에서 여러 흐름을 오간다는 관점으로 표현한다.
type MyFlow = "seeking" | "listing" | "living" | "managing";

const myFlowItems: Array<{ id: MyFlow; label: string }> = [
  { id: "seeking", label: "방 찾는 중" },
  { id: "listing", label: "내놓은 집" },
  { id: "living", label: "사는 집" },
  { id: "managing", label: "관리 중인 집" }
];

const protectedRoleConfig = {
  tenant: {
    sessionRole: "TENANT",
    intent: "tenant",
    redirectTo: "/?role=tenant&tab=mypage"
  },
  landlord: {
    sessionRole: "LANDLORD",
    intent: "landlord",
    redirectTo: "/?role=landlord&tab=mypage"
  }
} as const;

const normalizeAppRole = (value: string | null): AppRole | null => {
  if (value === "seeker" || value === "tenant" || value === "landlord") return value;
  return null;
};

const normalizeAppTab = (value: string | null): AppTab | null => {
  if (value === "home" || value === "map" || value === "saved" || value === "inquiry" || value === "mypage") {
    return value;
  }
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

const savedConditions = [
  { label: "방배동 월세 1000/130 이하", area: "서초구 방배동", category: "원룸", filters: ["월세", "풀옵션"] },
  { label: "내방역 도보 10분", area: "내방역 7호선", category: "오피스텔", filters: ["월세", "주차"] },
  { label: "풀옵션 · 주차 가능", area: "강남역 오피스텔", category: "오피스텔", filters: ["월세", "주차", "풀옵션"] }
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
  },
  {
    label: "검수",
    title: "집주인 등록 매물 실매물 확인 필요",
    body: "사진과 3D방 자료 연결 후 검수 요청을 보낼 수 있습니다.",
    time: "오늘"
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

const neighborhoodItems = [
  { label: "편의점", value: "4곳" },
  { label: "지하철", value: "도보 5분" },
  { label: "치안센터", value: "1곳" },
  { label: "공원", value: "650m" }
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

const ownerExposureItems = [
  { label: "전달 범위", value: "반경 5km", caption: "인근 중개사 12곳" },
  { label: "예상 검수", value: "2시간", caption: "사진 등록 후 요청" },
  { label: "노출 배지", value: "3D 투어", caption: "3D방 연결 시 표시" }
];

const ownerReviewItems = [
  { label: "기본정보", caption: "주소와 가격 확인" },
  { label: "사진자료", caption: "대표 사진 3장 권장" },
  { label: "3D방", caption: "투어 자료 연결" },
  { label: "중개전달", caption: "반경 5km 우선" }
];

const ownerCostTypeLabels: Record<string, string> = {
  repair: "수리비",
  maintenance: "관리비",
  common: "공용비",
  other: "기타"
};

const ownerCostStatusLabels: Record<string, string> = {
  draft: "검토 대기",
  confirmed: "확정",
  amended: "정정",
  void: "무효"
};

const ownerCostReviewLabels: Record<string, string> = {
  ocr_low_confidence: "OCR 저신뢰",
  classification_unclear: "분류 확인",
  unit_unmatched: "호실 확인"
};

const ownerVendorTradeLabels: Record<string, string> = {
  plumbing: "배관·누수",
  electrical: "전기",
  hvac: "냉난방",
  appliance: "가전",
  locksmith: "도어락",
  waterproofing: "방수",
  cleaning: "청소",
  general: "종합",
  other: "기타"
};

const ownerVendorStatusLabels: Record<string, string> = {
  active: "활성",
  inactive: "비활성",
  closed: "폐업"
};

const formatWon = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

const savedComparisonItems = [
  { label: "저장 조건", value: "월세 130 이하", caption: "방배동 · 내방역" },
  { label: "가격 변동", value: "변동 없음", caption: "최근 7일 기준" },
  { label: "방문 후보", value: "오늘 3시", caption: "2개 매물 가능" }
];

const inquiryTimelineItems = [
  { time: "방금", title: "문자문의 작성 가능", body: "매물 상세에서 바로 문의를 보낼 수 있습니다." },
  { time: "5분 전", title: "중개사 평균 응답 8분", body: "답변이 오면 문의센터에서 상태를 확인합니다." }
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

const safetyReportItems = [
  { label: "등기 변동", value: "최근 변동 없음", status: "안전" },
  { label: "보증금 비율", value: "권장 범위", status: "양호" },
  { label: "대출·특약", value: "방문 시 확인", status: "확인" },
  { label: "주변 치안", value: "야간 동선 양호", status: "양호" }
];

const inquiryChannelItems = [
  { label: "문자문의", value: "로그인 없이 가능", caption: "평균 8분 응답" },
  { label: "전화문의", value: "중개사 연결", caption: "영업시간 09:00-20:00" },
  { label: "방문예약", value: "오늘 3시 가능", caption: "3D 투어 먼저 확인" }
];

const formatAreaTitle = (area: string) => area.replace(/^서울특별시\s*/, "").replace(/^서초구\s*/, "");

// role="button" article를 키보드로도 조작할 수 있도록 Enter/Space를 실제 버튼처럼 처리
const handleActivateKey = (event: React.KeyboardEvent, action: () => void) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
};

const optionItems = ["에어컨", "세탁기", "냉장고", "인덕션", "붙박이장", "CCTV"];

const bottomTabs: Array<{ key: AppTab; label: string; Icon: LucideIcon; href: string }> = [
  { key: "home", label: "홈", Icon: HomeIcon, href: "#home-title" },
  { key: "map", label: "지도", Icon: MapPinned, href: "#map-list" },
  { key: "saved", label: "찜", Icon: Heart, href: "#saved-list" },
  { key: "inquiry", label: "문의", Icon: MessageCircle, href: "#inquiry" },
  { key: "mypage", label: "마이페이지", Icon: UserRound, href: "#my-page" }
];

const roleDisplayLabels: Record<AppRole, string> = {
  seeker: "방 찾기",
  tenant: "세입자",
  landlord: "집주인"
};

const mapResultTabs: Array<{ key: MapResultTab; label: string }> = [
  { key: "rooms", label: "전체 방" },
  { key: "complexes", label: "단지" },
  { key: "agents", label: "중개사무소" }
];

const listings = [
  {
    listingNo: "57804322",
    detailHeader: "매물 57804322",
    listingLabel: "매물번호 57804322",
    title: "방배 루미에르 402호",
    location: "방배동 · 내방역 도보 5분",
    price: "월세 1000/130",
    headline: "전입OK 신축원룸 정말 깔끔해요 수납 굿",
    spec: "24.5m² · 4층 · 즉시입주",
    roomType: "오피스텔",
    sizeLabel: "6평",
    floorLabel: "고층/16층",
    maintenanceFee: "10만원",
    viewCount: "조회 21회",
    unitCount: "14평",
    complexPrice: "매1.4억",
    image: "/listing-studio.jpg",
    gallery: ["/listing-studio.jpg", "/listing-bedroom.jpg", "/listing-loft.jpg", "/room-sunlit.png"],
    badges: ["확인매물", "3D 투어"],
    tags: ["신축", "주차", "풀옵션", "보안/안전", "큰길가"],
    score: "안심 92",
    updated: "1일전",
    broker: "내방역 푸른공인중개사",
    verification: "오늘 현장확인",
    response: "평균 응답 8분"
  },
  {
    listingNo: "57804323",
    detailHeader: "매물 57804323",
    listingLabel: "매물번호 57804323",
    title: "성수 어반 스튜디오",
    location: "성수동 · 서울숲 9분",
    price: "월세 800 / 80",
    headline: "서울숲 가까운 복층 스튜디오 반려동물 가능",
    spec: "32.2m² · 복층 · 반려동물",
    roomType: "원룸",
    sizeLabel: "9평",
    floorLabel: "5층/9층",
    maintenanceFee: "12만원",
    viewCount: "조회 34회",
    unitCount: "22평",
    complexPrice: "매2.1억",
    image: "/listing-loft.jpg",
    gallery: ["/listing-loft.jpg", "/listing-studio.jpg", "/listing-bedroom.jpg", "/building-premium.png"],
    badges: ["현장촬영", "신축급"],
    tags: ["복층", "반려동물", "역세권", "채광", "현장촬영"],
    score: "안심 88",
    updated: "방금확인",
    broker: "성수온도공인중개사",
    verification: "중개사 검수",
    response: "즉시 문의 가능"
  },
  {
    listingNo: "57804324",
    detailHeader: "매물 57804324",
    listingLabel: "매물번호 57804324",
    title: "역삼 스카이 테라스",
    location: "역삼동 · 강남역 7분",
    price: "전세 4억 6,000",
    headline: "강남역 생활권 고층 오피스텔 전망 좋은 방",
    spec: "30.0m² · 14층 · 관리비 15만",
    roomType: "오피스텔",
    sizeLabel: "8평",
    floorLabel: "14층/20층",
    maintenanceFee: "15만원",
    viewCount: "조회 48회",
    unitCount: "18평",
    complexPrice: "매4.6억",
    image: "/listing-bedroom.jpg",
    gallery: ["/listing-bedroom.jpg", "/listing-building.jpg", "/listing-studio.jpg", "/listing-loft.jpg"],
    badges: ["확인매물", "헛걸음 보상"],
    tags: ["고층", "보안/안전", "큰길가", "엘리베이터", "주차"],
    score: "안심 96",
    updated: "오늘확인",
    broker: "강남역 스카이부동산",
    verification: "서류 확인",
    response: "보상 정책 참여"
  }
];

// 데모 매물엔 좌표가 없고, 직접등록 매물은 지오코딩된 lat/lng를 실어 상세 지도에 쓴다(옵셔널).
type Listing = (typeof listings)[number] & {
  lat?: number;
  lng?: number;
  has3DTour?: boolean;
  floorPlan3D?: ListingFloorPlan3D;
};

// 서버(집주인 직접등록) 매물 — /api/trade/listings 응답 형태
type TradeListing = {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  roomType: string;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  description: string;
  status: string;
  createdAt: string;
  images?: string[];
  lat?: number;
  lng?: number;
  floorPlan?: ListingFloorPlan3D | null;
};

const TRADE_LISTING_NO_PREFIX = "TRADE-";
// 도면 에디터가 남긴 3D 스냅샷 키 — RoomlogFloorPlanEditor의 LISTING_FLOOR_PLAN_STORAGE_KEY와 동일해야 한다.
const LISTING_FLOOR_PLAN_STORAGE_KEY = "roomlogListingFloorPlan3D";

/** 에디터가 저장한 3D 도면 스냅샷을 읽는다(없거나 벽 0개면 null). */
function readListingFloorPlanSnapshot(): ListingFloorPlan3D | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LISTING_FLOOR_PLAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListingFloorPlan3D;
    if (!parsed || !Array.isArray(parsed.walls3D) || parsed.walls3D.length === 0) return null;
    return { walls3D: parsed.walls3D, furnitures: Array.isArray(parsed.furnitures) ? parsed.furnitures : [], name: parsed.name };
  } catch {
    return null;
  }
}

function tradePriceLabel(listing: TradeListing): string {
  if (listing.tradeType === "월세") return `월세 ${listing.depositManwon}/${listing.monthlyRentManwon}`;
  if (listing.tradeType === "전세") return `전세 ${listing.depositManwon.toLocaleString("ko-KR")}만`;
  return `매매 ${listing.depositManwon.toLocaleString("ko-KR")}만`;
}

// 직접등록 매물을 홈 카드/상세가 쓰는 쇼케이스 매물 형태로 투영한다.
// 미확인 값은 "확인 중"으로 두고, 문의는 listingNo의 TRADE- 접두어로 서버 매물임을 식별한다.
function tradeListingToCard(listing: TradeListing): Listing {
  // 업로드된 실제 사진이 있으면 그걸 쓰고, 없으면 기존 목업으로 폴백한다(데모 매물 보호).
  const uploaded = Array.isArray(listing.images) ? listing.images.filter((url) => typeof url === "string" && url) : [];
  const image = uploaded[0] ?? "/listing-studio.jpg";
  const gallery = uploaded.length > 0 ? uploaded : ["/listing-studio.jpg", "/listing-bedroom.jpg"];
  const floorPlan3D =
    listing.floorPlan && Array.isArray(listing.floorPlan.walls3D) && listing.floorPlan.walls3D.length > 0
      ? listing.floorPlan
      : undefined;
  return {
    listingNo: `${TRADE_LISTING_NO_PREFIX}${listing.id}`,
    detailHeader: `직접등록 매물 · ${listing.title}`,
    listingLabel: "집주인 직접등록",
    title: listing.title,
    location: listing.location,
    price: tradePriceLabel(listing),
    headline: listing.description || "집주인이 직접 등록한 매물입니다.",
    spec: `${listing.roomType} · 집주인 직접`,
    roomType: listing.roomType,
    sizeLabel: "확인 중",
    floorLabel: "확인 중",
    maintenanceFee: "확인 중",
    viewCount: "새 매물",
    unitCount: "확인 중",
    complexPrice: "확인 중",
    image,
    gallery,
    badges: floorPlan3D ? ["집주인 직접", "3D 투어"] : ["집주인 직접"],
    tags: floorPlan3D ? [listing.tradeType, listing.roomType, "3D 투어"] : [listing.tradeType, listing.roomType],
    score: "안심 확인중",
    updated: "방금 등록",
    broker: `${listing.ownerName} (집주인)`,
    verification: "집주인 직접 등록",
    response: "채팅 문의 가능",
    lat: listing.lat,
    lng: listing.lng,
    has3DTour: Boolean(floorPlan3D),
    floorPlan3D
  };
}

const getListingPriceRows = (listing: Listing) => {
  const monthlyMatch = listing.price.match(/월세\s*([\d,]+)\s*\/\s*([\d,]+)/);
  const jeonseMatch = listing.price.match(/전세\s*(.+)/);

  if (monthlyMatch) {
    return [
      ["거래유형", "월세"],
      ["보증금", `${monthlyMatch[1]}만원`],
      ["월세", `${monthlyMatch[2]}만원`],
      ["관리비", listing.maintenanceFee],
      ["입주가능일", listing.floorLabel.includes("고층") ? "즉시입주" : "협의 가능"],
      ["계약기간", "12개월 이상"]
    ];
  }

  return [
    ["거래유형", "전세"],
    ["전세금", jeonseMatch?.[1] ?? listing.price.replace("전세", "").trim()],
    ["관리비", listing.maintenanceFee],
    ["입주가능일", "협의 가능"],
    ["보증보험", "상담 필요"],
    ["계약기간", "24개월 기준"]
  ];
};

const getListingBuildingRows = (listing: Listing) => [
  ["건물유형", listing.roomType],
  ["면적", listing.sizeLabel],
  ["해당층/전체층", listing.floorLabel],
  ["주차", listing.tags.includes("주차") ? "가능" : "문의"],
  ["난방", "개별난방"],
  ["엘리베이터", listing.floorLabel.includes("/") ? "있음" : "문의"]
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

const mapListings = [
  {
    listingIndex: 0,
    title: "방배 루미에르 402호",
    price: "월세 1000/130",
    meta: "원룸 · 24.5m² · 4층",
    distance: "내방역 도보 5분 · 큰길가",
    updated: "1일전",
    flags: ["안심 92", "3D 투어", "풀옵션"],
    image: "/listing-studio.jpg",
    lat: 37.4875,
    lng: 126.9931,
    mapLabel: "1000/130",
    clusterLabel: "14개",
    verifyStatus: "오늘 현장확인",
    responseStatus: "평균 응답 8분",
    tourStatus: "3D 투어 가능",
    accuracyRank: 1,
    recencyRank: 2,
    monthlyRent: 130,
    has3DTour: true
  },
  {
    listingIndex: 2,
    title: "역삼 스카이 테라스",
    price: "전세 4억 6,000",
    meta: "오피스텔 · 30.0m² · 14층",
    distance: "강남역 도보 7분 · 보안 우수",
    updated: "오늘확인",
    flags: ["헛걸음 보상", "고층", "주차"],
    image: "/listing-building.jpg",
    lat: 37.4902,
    lng: 126.9908,
    mapLabel: "전세 4.6억",
    clusterLabel: "오늘",
    verifyStatus: "오늘 서류확인",
    responseStatus: "보상 정책 참여",
    tourStatus: "방문 예약 우선",
    accuracyRank: 2,
    recencyRank: 1,
    monthlyRent: 999,
    has3DTour: false
  },
  {
    listingIndex: 1,
    title: "성수 어반 스튜디오",
    price: "월세 800/80",
    meta: "복층 · 반려동물 가능",
    distance: "서울숲 9분",
    updated: "방금확인",
    flags: ["반려동물", "복층", "3D 투어"],
    image: "/listing-loft.jpg",
    lat: 37.4859,
    lng: 126.9964,
    mapLabel: "800/80",
    clusterLabel: "3D",
    verifyStatus: "방금 갱신",
    responseStatus: "즉시 문의 가능",
    tourStatus: "3D 투어 가능",
    accuracyRank: 3,
    recencyRank: 0,
    monthlyRent: 80,
    has3DTour: true
  }
];

const mapDealMarkers = mapListings;

// 지도 탭 패널·마커 공용 아이템 — 데모는 listingNo로 정규화하고, 직접등록 매물은 렌더 시 합류한다.
// (QA: 지도에 새 매물이 안 찍히고 매물창이 갱신되지 않던 문제의 뿌리 = 하드코딩 mapListings 단독 사용)
type MapPanelItem = Omit<(typeof mapListings)[number], "listingIndex"> & { listingNo: string };

const demoMapItems: MapPanelItem[] = mapListings.map(({ listingIndex, ...item }) => ({
  ...item,
  listingNo: listings[listingIndex].listingNo
}));

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

const tenantIssuePresets = ["보일러 온수 불량", "콘센트 교체", "방충망 보수", "곰팡이 점검"];

function MyFlowBar({
  activeFlow,
  onSelectFlow,
  menuSlot
}: {
  activeFlow: MyFlow;
  onSelectFlow: (flow: MyFlow) => void;
  /** 바 왼쪽에 끼워 넣는 화면별 부가 버튼(예: 집주인 대시보드 메뉴 토글) */
  menuSlot?: ReactNode;
}) {
  // 흐름 전환은 숨기지 않는다 — 바의 빈 공간을 큼직한 탭 4개로 채워 한 번에 눌러 이동한다.
  return (
    <div className="mypage-role-bar my-flow-bar">
      {menuSlot}
      <span>
        내 주거 프로세스 — 한 계정으로 <b>여러 집과 관계</b>를 이어갑니다
      </span>
      <div className="my-flow-chips my-flow-tabs" aria-label="연결된 흐름" role="tablist">
        {myFlowItems.map((flow) => (
          <button
            key={flow.id}
            type="button"
            role="tab"
            aria-selected={flow.id === activeFlow}
            className={flow.id === activeFlow ? "active" : ""}
            onClick={() => onSelectFlow(flow.id)}
          >
            {flow.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LandlordMyPage({ onSelectFlow, onGoHome }: { onSelectFlow: (flow: MyFlow) => void; onGoHome: () => void }) {
  // 입력 칸은 빈 값으로 시작(예시는 placeholder가 담당). 새로고침 유실은 localStorage draft로 방지.
  const [ownerForm, setOwnerForm] = useState(emptyOwnerForm);
  const [photoCount, setPhotoCount] = useState(0);
  // 선택한 실제 파일(등록 시 업로드) — 초안 저장 대상은 아니다(파일은 직렬화 불가).
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  // 선택 즉시 보이는 미리보기 URL — photoFiles가 바뀌면 이전 objectURL은 회수한다.
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  useEffect(() => {
    const urls = photoFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photoFiles]);
  const removePhotoAt = (index: number) => {
    const next = photoFiles.filter((_, i) => i !== index);
    setPhotoFiles(next);
    setPhotoCount(next.length);
  };
  // 주소 지오코딩 결과 — 등록 페이로드의 lat/lng로 실린다(실패/미활성 시 null).
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [has3DRoom, setHas3DRoom] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState("작성 중");
  const [myListings, setMyListings] = useState(initialOwnerListings);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [ownerToast, setOwnerToast] = useState("");
  const [isSubmittingListing, setIsSubmittingListing] = useState(false);
  const isSubmittingListingRef = useRef(false);
  const [activeOwnerPanel, setActiveOwnerPanel] = useState("dashboard");
  const [isOwnerSidebarOpen, setIsOwnerSidebarOpen] = useState(true);
  const [isCostReviewCleared, setIsCostReviewCleared] = useState(false);
  const [isDisclosureAcknowledged, setIsDisclosureAcknowledged] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState(DEMO_VENDORS[0]?.id ?? "");
  const [isDuplicateResolved, setIsDuplicateResolved] = useState(false);
  const updateOwnerForm = (key: keyof typeof ownerForm, value: string) => {
    setOwnerForm((current) => ({ ...current, [key]: value }));
    setRegistrationStatus("작성 중");
  };

  // 내가 서버에 등록한 실제 매물 — 수정/내리기의 대상. null = 아직 조회 전.
  const [serverListings, setServerListings] = useState<TradeListing[] | null>(null);
  // 수정 모드: 등록 폼을 재사용해 이 id의 매물을 PATCH 한다.
  const [editingListingId, setEditingListingId] = useState<string | null>(null);

  const loadMyServerListings = async () => {
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      // 비로그인 → null(데모 폴백 유지). 로그인 → 실제 배열(0개면 빈 상태). 이 구분이 삭제/수정 진실을 결정한다.
      if (!meRes.ok) {
        setServerListings(null);
        return;
      }
      const me = (await meRes.json()) as { userId?: string };
      if (!me.userId) {
        setServerListings(null);
        return;
      }
      const res = await fetch("/api/trade/listings", { cache: "no-store" });
      if (!res.ok) return;
      const all = (await res.json()) as TradeListing[];
      setServerListings(all.filter((listing) => listing.ownerId === me.userId));
    } catch {
      // 네트워크 일시 오류 — 다음 갱신에서 복구
    }
  };

  useEffect(() => {
    void loadMyServerListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회 조회
  }, []);

  /** 수정 시작 — 매물 값을 등록 폼에 채우고 폼으로 스크롤한다. */
  const startEditListing = (listing: TradeListing) => {
    setEditingListingId(listing.id);
    setOwnerForm((current) => ({
      ...current,
      title: listing.title,
      address: listing.location === "위치 미입력" ? "" : listing.location,
      tradeType: listing.tradeType,
      deposit: listing.tradeType === "전세" ? current.deposit : String(listing.depositManwon || ""),
      jeonse: listing.tradeType === "전세" ? String(listing.depositManwon || "") : current.jeonse,
      monthly: String(listing.monthlyRentManwon || "")
    }));
    setOwnerToast(`'${listing.title}' 수정 중 — 아래 폼을 고친 뒤 저장을 누르세요.`);
    continueOwnerRegistration();
  };

  const cancelEditListing = () => {
    setEditingListingId(null);
    setOwnerToast("수정을 취소했습니다.");
  };

  /** 매물 내리기 — 홈 피드에서 즉시 사라진다(문의 대화 기록은 유지). */
  const deleteServerListing = async (listing: TradeListing) => {
    if (!window.confirm(`'${listing.title}' 매물을 내릴까요? 홈 피드에서 바로 사라집니다.`)) return;
    try {
      const res = await fetch(`/api/trade/listings/${listing.id}`, { method: "DELETE" });
      if (!res.ok) {
        setOwnerToast("매물 내리기에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (editingListingId === listing.id) setEditingListingId(null);
      setOwnerToast(`'${listing.title}' 매물을 내렸습니다.`);
      void loadMyServerListings();
    } catch {
      setOwnerToast("매물 내리기에 실패했습니다. 네트워크를 확인해 주세요.");
    }
  };

  // 주소 입력을 디바운스로 지오코딩 — 상세 지도에 실제 매물 좌표를 찍기 위함.
  useEffect(() => {
    const address = ownerForm.address?.trim();
    if (!address) {
      setGeoCoords(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void geocodeAddress(address).then((coords) => {
        if (!cancelled) setGeoCoords(coords);
      });
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ownerForm.address]);

  // 복원: 반드시 마운트 후에만 localStorage 접근 — SSR 초기 렌더와의 hydration 불일치 방지 (QA 8).
  useEffect(() => {
    const draft = parseOwnerDraft(window.localStorage.getItem(OWNER_DRAFT_STORAGE_KEY));

    if (draft) {
      setOwnerForm(draft.ownerForm);
      setPhotoCount(draft.photoCount);
      setHas3DRoom(draft.has3DRoom);
      setRegistrationStatus(draft.registrationStatus);
      setMyListings(draft.myListings);
      setDraftSavedAt(draft.savedAt);
    }

    // 도면 에디터에서 실제로 3D를 만들고 돌아왔는지는 스냅샷 존재로 판단한다(클릭만으론 연결로 치지 않음).
    if (readListingFloorPlanSnapshot()) setHas3DRoom(true);

    setIsDraftLoaded(true);
  }, []);

  // 에디터 탭에서 3D를 만들고 이 탭으로 돌아오면 "3D방 연결" 상태를 즉시 반영한다.
  useEffect(() => {
    const syncFloorPlanConnection = () => {
      if (document.visibilityState === "visible" && readListingFloorPlanSnapshot()) setHas3DRoom(true);
    };
    window.addEventListener("visibilitychange", syncFloorPlanConnection);
    window.addEventListener("focus", syncFloorPlanConnection);
    return () => {
      window.removeEventListener("visibilitychange", syncFloorPlanConnection);
      window.removeEventListener("focus", syncFloorPlanConnection);
    };
  }, []);

  // 저장: 복원이 끝난 뒤부터 변경마다 versioned draft로 기록. 등록 제출로 생긴 myListings도 함께 유지된다.
  useEffect(() => {
    if (!isDraftLoaded) return;

    const savedAt = new Date().toISOString();
    window.localStorage.setItem(
      OWNER_DRAFT_STORAGE_KEY,
      serializeOwnerDraft({ ownerForm, photoCount, has3DRoom, registrationStatus, myListings }, savedAt)
    );
    setDraftSavedAt(savedAt);
  }, [isDraftLoaded, ownerForm, photoCount, has3DRoom, registrationStatus, myListings]);
  const submitOwnerListing = () => {
    // state는 리렌더 이후에야 반영되므로, 연타가 재렌더보다 빠르면 state 체크만으론 막지 못한다 — ref로 즉시 잠근다.
    if (isSubmittingListingRef.current) {
      return;
    }

    if (!ownerForm.title.trim()) {
      setOwnerToast("매물명을 입력해야 등록할 수 있습니다.");
      return;
    }

    isSubmittingListingRef.current = true;
    setIsSubmittingListing(true);
    // 등록은 서버(/api/trade/listings)로 보낸다 — 다른 계정의 홈 피드에 실제로 노출되고,
    // 문의가 오면 "받은 문의" 채팅으로 이어진다.
    void (async () => {
      try {
        // 1) 사진이 있으면 먼저 업로드해 공개 URL을 확보한다(멀티파트 프록시).
        let images: string[] = [];
        if (photoFiles.length > 0) {
          const form = new FormData();
          photoFiles.forEach((file) => form.append("files", file));
          const uploadRes = await fetch("/api/trade/uploads", { method: "POST", body: form });
          if (uploadRes.status === 401) {
            setOwnerToast("매물을 등록하려면 WOOZU 계정 로그인이 필요합니다.");
            return;
          }
          if (uploadRes.ok) {
            const uploaded = (await uploadRes.json()) as { images?: string[] };
            images = Array.isArray(uploaded.images) ? uploaded.images : [];
          } else {
            setOwnerToast("사진 업로드에 실패했습니다. 사진 없이 등록하거나 잠시 후 다시 시도해 주세요.");
            return;
          }
        }

        // 2) 등록 또는 수정 — 사진 URL과 지오코딩 좌표를 함께 저장한다.
        //    수정(PATCH)일 때 새 사진이 없으면 images를 보내지 않아 기존 사진을 유지한다.
        const isEditing = Boolean(editingListingId);
        const payload: Record<string, unknown> = {
          title: ownerForm.title,
          roomType: "원룸",
          tradeType: ownerForm.tradeType,
          depositManwon: Number(ownerForm.tradeType === "전세" ? ownerForm.jeonse : ownerForm.deposit) || 0,
          monthlyRentManwon: Number(ownerForm.monthly) || 0,
          location: ownerForm.address || "위치 미입력",
          description: [
            ownerForm.area ? `전용 ${ownerForm.area}m²` : "",
            ownerForm.floor ? `${ownerForm.floor}층` : "",
            ownerForm.moveIn ? `입주 ${ownerForm.moveIn}` : ""
          ].filter(Boolean).join(" · "),
          lat: geoCoords?.lat,
          lng: geoCoords?.lng
        };
        if (!isEditing || images.length > 0) payload.images = images;
        // 3D방 연결 상태이고 에디터 스냅샷이 있으면 매물에 도면을 실어 보낸다 → 상세 "3D 보기"에서 실제 렌더.
        const floorPlanSnapshot = has3DRoom ? readListingFloorPlanSnapshot() : null;
        if (floorPlanSnapshot) payload.floorPlan = floorPlanSnapshot;

        const response = await fetch(
          isEditing ? `/api/trade/listings/${editingListingId}` : "/api/trade/listings",
          {
            method: isEditing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }
        );

        if (response.status === 401) {
          setOwnerToast("매물을 등록하려면 WOOZU 계정 로그인이 필요합니다.");
          return;
        }
        if (!response.ok) {
          setOwnerToast(isEditing ? "매물 수정에 실패했습니다. 잠시 후 다시 시도해 주세요." : "매물 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }

        // 서버가 돌려준 매물을 즉시 목록에 반영 — 뒤의 재조회가 늦거나 캐시돼도 "내 매물"에 바로 보인다.
        const savedListing = (await response.json().catch(() => null)) as TradeListing | null;
        if (savedListing?.id) {
          setServerListings((current) => {
            const base = current ?? [];
            return isEditing
              ? base.map((item) => (item.id === savedListing.id ? savedListing : item))
              : [savedListing, ...base.filter((item) => item.id !== savedListing.id)];
          });
        }

        // 등록/수정 성공 → 작성 칸·첨부·3D 상태를 초기화해 다음 매물에 이전 내용이 남지 않게 한다.
        //   (로컬 그림자 목록은 만들지 않는다 — 내 매물은 항상 서버 진실(serverListings)만 보여준다.)
        setOwnerForm(emptyOwnerForm);
        setPhotoFiles([]);
        setPhotoCount(0);
        setHas3DRoom(false);
        setGeoCoords(null);
        if (typeof window !== "undefined") window.localStorage.removeItem(LISTING_FLOOR_PLAN_STORAGE_KEY);
        setRegistrationStatus("노출중");
        if (isEditing) {
          setEditingListingId(null);
          setOwnerToast("매물이 수정됐습니다. 내 매물과 홈 피드에 바로 반영됩니다.");
        } else {
          setOwnerToast("매물이 등록됐습니다. 지금부터 홈 피드에 노출되고, 문의가 오면 여기 채팅으로 이어집니다.");
        }
        await loadMyServerListings();
      } catch {
        setOwnerToast("매물 등록에 실패했습니다. 네트워크를 확인해 주세요.");
      } finally {
        isSubmittingListingRef.current = false;
        setIsSubmittingListing(false);
      }
    })();
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };
  const continueOwnerRegistration = () => {
    const scrollToOwnerForm = () => {
      const form = document.getElementById("owner-registration-form");

      if (!form) {
        return;
      }

      window.scrollTo({
        top: form.getBoundingClientRect().top + window.scrollY - 12,
        left: 0,
        behavior: "auto"
      });
    };

    scrollToOwnerForm();
    requestAnimationFrame(scrollToOwnerForm);
    window.setTimeout(scrollToOwnerForm, 160);
    window.setTimeout(scrollToOwnerForm, 360);
  };
  const ownerPriceLabel = ownerForm.tradeType === "전세"
    ? `전세 ${ownerForm.jeonse || "0"}만원`
    : `${ownerForm.tradeType} ${ownerForm.deposit || "0"}/${ownerForm.monthly || "0"}`;
  const ownerCompletionRate = photoCount >= 3 && has3DRoom ? 92 : 68;
  const confirmedOwnerCosts = DEMO_COSTS.filter((cost) => cost.status === "confirmed" || cost.status === "amended");
  const ownerCostReviewItems = DEMO_COSTS.filter((cost) => cost.status === "draft" && cost.reviewReason);
  const ownerPendingCostReviews = isCostReviewCleared ? 0 : DEMO_COST_QUEUE_SUMMARY.total;
  const ownerPrivateDisclosureCount = isDisclosureAcknowledged ? 0 : DEMO_DISCLOSURE_SETTING.hiddenCount;
  const ownerReceiptEvidenceCount = DEMO_RECEIPTS.filter((receipt) => receipt.hasEvidence).length;
  const selectedVendor = DEMO_VENDORS.find((vendor) => vendor.id === selectedVendorId) ?? DEMO_VENDORS[0];
  const selectedVendorPerf = selectedVendor
    ? DEMO_VENDOR_PERF.find((perf) => perf.vendorId === selectedVendor.id)
    : undefined;
  const selectedVendorJobs = selectedVendor
    ? DEMO_VENDOR_JOBS.filter((job) => job.vendorId === selectedVendor.id)
    : [];
  const ownerOpenDuplicateCount = isDuplicateResolved ? 0 : DEMO_VENDOR_DUPLICATE_CANDIDATES.length;
  const ownerVendorRatingLabel = selectedVendorPerf?.ratingVisible && selectedVendorPerf.satisfactionAvg
    ? `${selectedVendorPerf.satisfactionAvg.toFixed(1)}점`
    : `거래 ${selectedVendorPerf?.completedCount ?? selectedVendor?.dealCount ?? 0}건`;
  const ownerDashboardTabs = [
    { id: "dashboard", label: "대시보드", note: "현재 페이지" },
    { id: "contract-dashboard", label: "검토 대시보드", note: "계약" },
    { id: "contract-ocr", label: "OCR 검토", note: "계약" },
    { id: "contract-register", label: "계약서 등록", note: "계약" },
    { id: "contract-timeline", label: "호실·타임라인", note: "계약" },
    { id: "contract-invite", label: "임차인 초대", note: "계약" },
    { id: "contract-storage", label: "보관·삭제", note: "계약" },
    { id: "cost-ledger", label: "원장/큐", note: "비용" },
    { id: "cost-receipt", label: "영수증 첨부", note: "비용" },
    { id: "cost-ocr", label: "OCR 검토", note: "비용" },
    { id: "cost-detail", label: "비용 상세", note: "비용" },
    { id: "cost-disclosure", label: "공개 관리", note: "비용" },
    { id: "vendor-address", label: "주소록", note: "업체" },
    { id: "vendor-detail", label: "상세", note: "업체" },
    { id: "vendor-performance", label: "성과", note: "업체" },
    { id: "vendor-edit", label: "등록/편집", note: "업체" }
  ];
  const activeOwnerTab = ownerDashboardTabs.find((tab) => tab.id === activeOwnerPanel) ?? ownerDashboardTabs[0];
  const activeOwnerDomain = activeOwnerPanel.split("-")[0];
  const ownerContractStats = [
    { label: "검토 대기", value: "2건", note: "임차인·관리자 업로드 유입" },
    { label: "확인 필요", value: "3개", note: "OCR 원문 대조 필요" },
    { label: "SLA 초과", value: "1건", note: "장기 미확정 출구 표시" }
  ];
  const ownerContractRows = [
    { status: "검토 전 참고문", title: "연남 스테이 302호 · Alex Kim", caption: "계약일 2026년 3월 1일 · 확인필요 3" },
    { status: "미등록 호실", title: "성수 하우스 405호 · Linh Tran", caption: "관리자 수동값 · 확인필요 0" }
  ];

  return (
    <section className="screen owner-screen" id="my-page" aria-labelledby="owner-title">
      <MyFlowBar
        activeFlow="listing"
        onSelectFlow={onSelectFlow}
        menuSlot={
          <button
            className="owner-sidebar-toggle"
            type="button"
            aria-expanded={isOwnerSidebarOpen}
            title={isOwnerSidebarOpen ? "기능 메뉴 접기" : "기능 메뉴 펼치기"}
            onClick={() => setIsOwnerSidebarOpen((open) => !open)}
          >
            {isOwnerSidebarOpen
              ? <PanelLeftClose size={16} strokeWidth={2.4} aria-hidden="true" />
              : <PanelLeftOpen size={16} strokeWidth={2.4} aria-hidden="true" />}
            <strong>메뉴</strong>
          </button>
        }
      />

      <div className={`owner-dashboard-layout${isOwnerSidebarOpen ? "" : " sidebar-collapsed"}`}>
        {isOwnerSidebarOpen ? (
          <nav className="owner-dashboard-sidebar" aria-label="집주인 대시보드 기능 탭">
            {ownerDashboardTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-current={tab.id === activeOwnerPanel ? "page" : undefined}
                onClick={() => setActiveOwnerPanel(tab.id)}
              >
                <span>{tab.note}</span>
                <strong>{tab.label}</strong>
              </button>
            ))}
          </nav>
        ) : null}

        <div className="owner-dashboard-content">
          {activeOwnerPanel === "dashboard" ? (
            <>
      <div className="owner-hero" id="owner-dashboard-top">
        <div>
          <p className="brand-kicker">매물 관리</p>
          <h2 id="owner-title">집주인 마이페이지</h2>
          <p>사진, 가격, 3D 방 자료를 한 번에 정리해 매물 등록을 진행합니다.</p>
        </div>
        <button className="mypage-main-button" type="button" onClick={onGoHome}>
          메인으로
        </button>
      </div>

      {ownerToast ? <p className="mypage-toast" role="status">{ownerToast}</p> : null}

      <section className="owner-status-board" aria-label="등록 매물 현황">
        <article>
          <span>등록 상태</span>
          <strong>{registrationStatus}</strong>
          <p>사진 {photoCount}장 · 3D방 {has3DRoom ? "연결됨" : "미등록"}</p>
        </article>
        <article>
          <span>검수 상태</span>
          <strong>
            {registrationStatus === "검수 대기"
              ? "실매물 확인 요청"
              : registrationStatus === "노출중"
                ? "확인 완료 · 노출중"
                : "실매물 확인 전"}
          </strong>
          <p>{ownerForm.address} · {ownerPriceLabel}</p>
        </article>
      </section>

      <section className="owner-my-listings" aria-label="내 등록 매물">
        <div className="owner-my-listings-head">
          <strong>내 매물 {serverListings ? serverListings.length : myListings.length}개</strong>
          <span>수정·내리기는 즉시 반영</span>
        </div>
        {serverListings !== null ? (
          // 로그인 상태 — 서버 진실만 보여준다. 삭제하면 여기서 즉시·영구히 사라진다(데모 폴백으로 되살아나지 않음).
          serverListings.length > 0 ? (
            serverListings.map((listing) => (
              <article key={listing.id}>
                <div>
                  <strong>{listing.title}{editingListingId === listing.id ? " · 수정 중" : ""}</strong>
                  <small>{tradePriceLabel(listing)} · {listing.location}</small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                  <em className="live">{listing.status}</em>
                  <button
                    type="button"
                    onClick={() => (editingListingId === listing.id ? cancelEditListing() : startEditListing(listing))}
                    style={{ minHeight: 30, padding: "0 10px", borderRadius: 999, border: "1px solid var(--line)", background: "#ffffff", color: "var(--ink)", fontSize: "0.72rem", fontWeight: 900 }}
                  >
                    {editingListingId === listing.id ? "수정 취소" : "수정"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteServerListing(listing)}
                    style={{ minHeight: 30, padding: "0 10px", borderRadius: 999, border: "1px solid #f1c8c8", background: "#fff6f6", color: "#c03535", fontSize: "0.72rem", fontWeight: 900 }}
                  >
                    내리기
                  </button>
                </div>
              </article>
            ))
          ) : (
            <article className="owner-my-listings-empty">
              <div>
                <strong>아직 등록한 매물이 없어요</strong>
                <small>위에서 매물을 등록하면 여기서 수정·내리기를 할 수 있어요.</small>
              </div>
            </article>
          )
        ) : (
          // 비로그인/첫 방문 — 데모 쇼케이스 목록(관리 불가)
          myListings.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <small>{item.price} · {item.caption}</small>
              </div>
              <em className={item.status === "노출중" ? "live" : ""}>{item.status}</em>
            </article>
          ))
        )}
      </section>

      {/* 내 매물로 들어온 구매 문의 — 문의센터(구매자 쪽)와 같은 스레드를 집주인 시점에서 본다 */}
      <section aria-label="받은 문의 채팅" style={{ marginTop: 16 }}>
        <div className="section-title no-margin" style={{ marginBottom: 10 }}>
          <div>
            <h2 style={{ fontSize: "1.08rem" }}>받은 문의</h2>
            <p>내 매물에 온 문의가 채팅으로 쌓입니다. 답장하면 상대 문의센터에 바로 보입니다.</p>
          </div>
        </div>
        <TradeChatCenter
          roleFilter="owner"
          emptyText="아직 받은 문의가 없습니다. 매물이 노출되면 여기로 문의가 들어옵니다."
        />
      </section>

      <section className="owner-preview-card" aria-label="등록 매물 미리보기">
        <div>
          <span>등록 미리보기</span>
          <h3>{ownerForm.title}</h3>
          <p>{ownerForm.address}</p>
        </div>
        <div className="owner-preview-actions">
          <strong>{ownerPriceLabel}</strong>
          <button type="button" onClick={continueOwnerRegistration}>입력 계속하기</button>
        </div>
      </section>

      <section className="domain-test-card landlord-domain-test-card" aria-labelledby="landlord-roomlog-title">
        <div className="domain-test-heading">
          <span>내 룸로그</span>
          <h3 id="landlord-roomlog-title">이 집을 룸로그로 관리하기</h3>
          <p>세입자가 연결되면 같은 계정에서 계약·비용·메시지·하자를 관리 콘솔로 이어서 처리합니다.</p>
        </div>
        <div className="domain-test-link-grid">
          <Link className="domain-test-link primary" href="/manager/home/00">
            관리 콘솔 홈
          </Link>
          <Link className="domain-test-link" href="/manager/contract/00">
            계약 관리
          </Link>
          <Link className="domain-test-link" href="/manager/ticket/dash/00">
            하자·티켓
          </Link>
          <Link className="domain-test-link" href="/manager/cost/00">
            비용 정산
          </Link>
          <Link className="domain-test-link" href="/manager/messaging/00">
            메시지
          </Link>
          <Link className="domain-test-link" href="/manager/moveout/00">
            퇴실 관리
          </Link>
        </div>
        <small className="domain-test-note">이 계정에 관리 중인 집이 연결되면 이어집니다.</small>
      </section>

      <section className="owner-exposure-card" aria-label="집 내놓기 전달 범위">
        <div className="owner-exposure-head">
          <div>
            <span>집 내놓기 전달 범위</span>
            <h3>검수 후 주변 중개사에게 매물 정보를 보냅니다</h3>
          </div>
          <strong>{ownerCompletionRate}% 완성</strong>
        </div>
        <div className="owner-exposure-grid">
          {ownerExposureItems.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.caption}</small>
            </article>
          ))}
        </div>
        <p className="owner-exposure-note">
          사진 3장 이상과 3D방 자료를 연결하면 확인매물·3D 투어 배지가 함께 노출됩니다.
        </p>
      </section>

      <section className="owner-readiness-card" aria-label="검수 준비 체크리스트">
        <div className="owner-readiness-head">
          <div>
            <span>검수 준비 체크리스트</span>
            <h3>등록 완료 전에 빠진 항목을 확인하세요</h3>
          </div>
          <strong>{ownerCompletionRate}%</strong>
        </div>
        <div className="owner-readiness-list">
          {ownerReviewItems.map((item, index) => {
            const done = index === 0 || (index === 1 && photoCount >= 3) || (index === 2 && has3DRoom);

            return (
              <article className={done ? "done" : ""} key={item.label}>
                <span>{item.label}</span>
                <strong>{done ? "완료" : "필요"}</strong>
                <p>{item.caption}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="owner-progress-card" aria-label="매물 등록 단계">
        <div>
          <span className="progress-dot done" />
          <strong>기본 정보</strong>
          <em>완료</em>
        </div>
        <div>
          <span className="progress-dot done" />
          <strong>사진 업로드</strong>
          <em>검수중</em>
        </div>
        <div>
          <span className="progress-dot" />
          <strong>3D방 연결</strong>
          <em>{has3DRoom ? "연결 완료" : "등록 전"}</em>
        </div>
      </section>

            </>
          ) : null}

          {activeOwnerPanel !== "dashboard" ? (
            <>
              <div className="owner-panel-heading">
                <span>{activeOwnerTab.note}</span>
                <h2>{activeOwnerTab.label}</h2>
                <p>집주인 대시보드 안에서 관리 기능을 확인합니다.</p>
              </div>
      <section className="owner-ops-grid" aria-label="집주인 운영 기능">
        {activeOwnerDomain === "contract" ? (
        <article id="kan-133-contract" className="owner-ops-card owner-contract-card">
          <div className="owner-ops-head">
            <div>
              <span>계약 관리</span>
              <h3>계약서 검토와 임차인 초대</h3>
            </div>
            <strong>관리 대기</strong>
          </div>

          <div className="owner-ops-metrics" aria-label="계약 관리 요약">
            {ownerContractStats.map((stat) => (
              <article key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <small>{stat.note}</small>
              </article>
            ))}
          </div>

          <div className="owner-contract-list" aria-label="계약 검토 목록">
            {ownerContractRows.map((row) => (
              <div key={row.title}>
                <span>{row.status}</span>
                <strong>{row.title}</strong>
                <small>{row.caption}</small>
              </div>
            ))}
          </div>

          <div className="owner-disclosure-strip" aria-label="계약 관리 원칙">
            <div>
              <span>원칙 게이트</span>
              <strong>OCR 원문 대조 후 확정</strong>
              <small>계약 확정·삭제·초대는 기록을 남기고 현재 대시보드에서 상태를 관리합니다.</small>
            </div>
            <button
              type="button"
              onClick={() => setOwnerToast("계약 검토 항목을 확인했습니다. 실제 확정은 계약 원칙 게이트를 통과해야 합니다.")}
            >
              검토 확인
            </button>
          </div>
        </article>
        ) : null}

        {activeOwnerDomain === "cost" ? (
        <article id="kan-135-cost" className="owner-ops-card owner-cost-card">
          <div className="owner-ops-head">
            <div>
              <span>비용 정산</span>
              <h3>비용 원장과 영수증 검토</h3>
            </div>
            <strong>{DEMO_MONTHLY_SUMMARY.month}</strong>
          </div>

          <div className="owner-ops-metrics" aria-label="비용 정산 요약">
            <article>
              <span>이번 달 지출</span>
              <strong>{formatWon(DEMO_MONTHLY_SUMMARY.totalAmount)}</strong>
            </article>
            <article>
              <span>확정 비용</span>
              <strong>{DEMO_MONTHLY_SUMMARY.confirmedCount}건</strong>
            </article>
            <article>
              <span>검토 대기</span>
              <strong>{ownerPendingCostReviews}건</strong>
            </article>
            <article>
              <span>영수증 증빙</span>
              <strong>{ownerReceiptEvidenceCount}건</strong>
            </article>
          </div>

          <div className="owner-cost-breakdown" aria-label="비용 유형별 집계">
            {Object.entries(DEMO_MONTHLY_SUMMARY.byType).map(([type, amount]) => (
              <div key={type}>
                <span>{ownerCostTypeLabels[type]}</span>
                <strong>{formatWon(amount)}</strong>
              </div>
            ))}
          </div>

          <div className="owner-review-panel">
            <div className="owner-panel-head">
              <div>
                <span>영수증 검토 큐</span>
                <strong>{ownerPendingCostReviews > 0 ? "확인 필요" : "정리됨"}</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCostReviewCleared(true);
                  setOwnerToast("비용 검토 큐를 정리했습니다. 미검증 확정 항목은 원장에 꼬리표로 남습니다.");
                }}
              >
                검토 완료 처리
              </button>
            </div>
            <div className="owner-review-list">
              {(ownerPendingCostReviews > 0 ? ownerCostReviewItems : []).map((cost) => (
                <div key={cost.id}>
                  <span>{ownerCostReviewLabels[cost.reviewReason ?? ""] ?? "검토"}</span>
                  <strong>{cost.item}</strong>
                  <small>{formatWon(cost.amount)} · {cost.scope === "unit" ? `${cost.unitId ?? "호실 미정"}호` : "건물"}</small>
                </div>
              ))}
              {ownerPendingCostReviews === 0 ? (
                <div className="owner-empty-row">
                  <strong>대기 중인 영수증 검토가 없습니다.</strong>
                  <small>새 영수증이나 OCR 저신뢰 항목이 생기면 여기에 표시됩니다.</small>
                </div>
              ) : null}
            </div>
          </div>

          <div className="owner-ledger-list" aria-label="비용 원장 최근 항목">
            {confirmedOwnerCosts.slice(0, 4).map((cost) => (
              <div key={cost.id}>
                <div>
                  <strong>{cost.item}</strong>
                  <small>{ownerCostTypeLabels[cost.type]} · {cost.scope === "unit" ? `${cost.unitId ?? "호실 미정"}호` : "건물 기록"}</small>
                </div>
                <span>{formatWon(cost.amount)}</span>
                <em>{ownerCostStatusLabels[cost.status]}</em>
              </div>
            ))}
          </div>

          <div className="owner-disclosure-strip" aria-label="관리비 공개 설정">
            <div>
              <span>관리비 공개 설정</span>
              <strong>{ownerPrivateDisclosureCount > 0 ? `숨김 ${ownerPrivateDisclosureCount}건` : "공개 상태 확인"}</strong>
              <small>비공개 항목은 임차인 화면에 숨김 건수로 표시됩니다.</small>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsDisclosureAcknowledged(true);
                setOwnerToast("관리비 공개 상태를 확인했습니다.");
              }}
            >
              공개 상태 확인
            </button>
          </div>
        </article>
        ) : null}

        {activeOwnerDomain === "vendor" ? (
        <article id="kan-136-vendor" className="owner-ops-card owner-vendor-card">
          <div className="owner-ops-head">
            <div>
              <span>업체 관리</span>
              <h3>업체 주소록과 성과 게이트</h3>
            </div>
            <strong>{ownerOpenDuplicateCount > 0 ? `중복 ${ownerOpenDuplicateCount}` : "중복 없음"}</strong>
          </div>

          <div className="owner-ops-metrics" aria-label="업체 관리 요약">
            <article>
              <span>등록 업체</span>
              <strong>{DEMO_VENDORS.length}곳</strong>
            </article>
            <article>
              <span>신규 배지</span>
              <strong>{DEMO_VENDORS.filter((vendor) => vendor.isNew).length}곳</strong>
            </article>
            <article>
              <span>최근 완료</span>
              <strong>{DEMO_VENDOR_JOBS.length}건</strong>
            </article>
            <article>
              <span>성과 표시</span>
              <strong>{ownerVendorRatingLabel}</strong>
            </article>
          </div>

          <div className="owner-vendor-list" aria-label="업체 주소록">
            {DEMO_VENDORS.slice(0, 4).map((vendor) => (
              <button
                className={selectedVendor?.id === vendor.id ? "active" : ""}
                key={vendor.id}
                type="button"
                onClick={() => setSelectedVendorId(vendor.id)}
              >
                <span>
                  <strong>{vendor.name}</strong>
                  {vendor.isNew ? <em>신규</em> : null}
                </span>
                <small>{vendor.trades.map((trade) => ownerVendorTradeLabels[trade]).join(" · ")}</small>
              </button>
            ))}
          </div>

          {selectedVendor ? (
            <div className="owner-vendor-detail" aria-label="선택 업체 상세">
              <div className="owner-vendor-title-row">
                <div>
                  <span>{ownerVendorStatusLabels[selectedVendor.status]}</span>
                  <strong>{selectedVendor.name}</strong>
                  <small>{selectedVendor.contactPerson ?? "담당자 미등록"} · {selectedVendor.phone ?? "연락처 확인 필요"}</small>
                </div>
                <em>{selectedVendor.source === "auto" ? "자동 누적" : "직접 추가"}</em>
              </div>

              <div className="owner-perf-gate">
                <div>
                  <span>성과 게이트</span>
                  <strong>
                    {selectedVendorPerf?.ratingVisible
                      ? `표본 ${selectedVendorPerf.sampleN}/${selectedVendorPerf.minN} 통과`
                      : `표본 ${selectedVendorPerf?.sampleN ?? 0}/${selectedVendorPerf?.minN ?? 5} 미달`}
                  </strong>
                  <small>
                    {selectedVendorPerf?.aiCommentEnabled
                      ? selectedVendorPerf.aiComment?.summary
                      : "소표본 업체는 별점 수치와 AI 코멘트를 숨깁니다."}
                  </small>
                </div>
                <div>
                  <span>응답 중앙값</span>
                  <strong>{selectedVendorPerf?.responseMedianHours ? `${selectedVendorPerf.responseMedianHours}시간` : "참고 불가"}</strong>
                  <small>커버리지 {Math.round((selectedVendorPerf?.coverageRatio ?? 0) * 100)}%</small>
                </div>
              </div>

              <div className="owner-vendor-jobs" aria-label="최근 완료 수리">
                {selectedVendorJobs.slice(0, 3).map((job) => (
                  <div key={job.id}>
                    <span>{job.unitMasked ? "***호" : `${job.unitId ?? "호실 미정"}호`}</span>
                    <strong>{job.quoteAmount ? formatWon(job.quoteAmount) : "견적 없음"}</strong>
                    <small>{new Date(job.completedAt).toLocaleDateString("ko-KR")} 완료</small>
                  </div>
                ))}
                {selectedVendorJobs.length === 0 ? (
                  <div className="owner-empty-row">
                    <strong>완료 수리 이력이 아직 없습니다.</strong>
                    <small>배정과 완료가 쌓이면 성과가 자동 계산됩니다.</small>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="owner-duplicate-strip" aria-label="업체 중복 후보">
            <div>
              <span>신규·중복 업체 게이트</span>
              <strong>{ownerOpenDuplicateCount > 0 ? `${ownerOpenDuplicateCount}건 확인 필요` : "처리 완료"}</strong>
              <small>신규 업체는 격리하지 않고 배지만 표시합니다.</small>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsDuplicateResolved(true);
                setOwnerToast("업체 중복 후보를 확인했습니다.");
              }}
            >
              중복 후보 확인
            </button>
          </div>
        </article>
        ) : null}
      </section>

            </>
          ) : null}

          {activeOwnerPanel === "dashboard" ? (
            <>
      <form className="owner-form" id="owner-registration-form">
        <section className="owner-card">
          <div className="form-heading">
            <div>
              <span>STEP 01</span>
              <h3>내 집 등록</h3>
            </div>
            <strong>임대인 전용</strong>
          </div>

          {draftSavedAt ? (
            <small className="owner-draft-status" role="status">
              임시저장됨 · {formatDraftSavedAt(draftSavedAt)} — 새로고침해도 작성 내용이 유지됩니다.
            </small>
          ) : null}

          <label>
            매물명
            <input value={ownerForm.title} onChange={(event) => updateOwnerForm("title", event.target.value)} placeholder="예: 방배 루미에르 402호" />
          </label>

          <label>
            주소
            <input value={ownerForm.address} onChange={(event) => updateOwnerForm("address", event.target.value)} placeholder="도로명 또는 지번 주소" />
          </label>

          <div className="form-grid">
            <label>
              거래유형
              <select value={ownerForm.tradeType} onChange={(event) => updateOwnerForm("tradeType", event.target.value)}>
                <option>월세</option>
                <option>전세</option>
                <option>반전세</option>
              </select>
            </label>
            <label>
              입주가능일
              {/* QA: 자유 텍스트 대신 달력에서 선택 — 기존 초안의 비날짜 값("즉시" 등)은 빈 값으로 보이지만 지우지 않는다 */}
              <input
                type="date"
                value={ownerForm.moveIn}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => updateOwnerForm("moveIn", event.target.value)}
                aria-label="입주가능일 달력 선택"
              />
            </label>
          </div>

          <div className="form-grid">
            <label>
              보증금
              <input inputMode="numeric" value={ownerForm.deposit} onChange={(event) => updateOwnerForm("deposit", event.target.value)} placeholder="만원 단위" />
            </label>
            <label>
              월세
              <input inputMode="numeric" value={ownerForm.monthly} onChange={(event) => updateOwnerForm("monthly", event.target.value)} placeholder="만원 단위" />
            </label>
          </div>

          <div className="form-grid">
            <label>
              전세금
              <input inputMode="numeric" value={ownerForm.jeonse} onChange={(event) => updateOwnerForm("jeonse", event.target.value)} placeholder="전세일 때 입력" />
            </label>
            <label>
              관리비
              <input inputMode="numeric" value={ownerForm.maintenance} onChange={(event) => updateOwnerForm("maintenance", event.target.value)} placeholder="만원 단위" />
            </label>
          </div>

          <div className="form-grid">
            <label>
              전용면적
              <input inputMode="decimal" value={ownerForm.area} onChange={(event) => updateOwnerForm("area", event.target.value)} placeholder="m²" />
            </label>
            <label>
              층수
              <input value={ownerForm.floor} onChange={(event) => updateOwnerForm("floor", event.target.value)} placeholder="예: 4층 / 16층" />
            </label>
          </div>
        </section>

        <section className="owner-card">
          <div className="form-heading">
            <div>
              <span>STEP 02</span>
              <h3>사진과 3D방 자료</h3>
            </div>
          </div>

          <label className="upload-zone">
            <strong>사진 업로드</strong>
            <span>대표 사진, 거실, 주방, 욕실 이미지를 순서대로 등록합니다. 현재 {photoCount}장 선택</span>
            <input
              type="file"
              multiple
              accept="image/*"
              aria-label="사진 업로드"
              onChange={(event) => {
                const files = event.target.files ? Array.from(event.target.files) : [];
                setPhotoFiles(files);
                setPhotoCount(files.length);
                setRegistrationStatus("작성 중");
              }}
            />
          </label>

          {photoPreviewUrls.length > 0 ? (
            <div className="upload-preview-grid" aria-label="선택한 사진 미리보기">
              {photoPreviewUrls.map((url, index) => (
                <figure key={url}>
                  {/* objectURL 미리보기 — next/image 최적화 대상이 아니라 일반 img를 쓴다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`선택한 사진 ${index + 1}`} />
                  {index === 0 ? <figcaption>대표 사진</figcaption> : null}
                  <button type="button" aria-label={`사진 ${index + 1} 빼기`} onClick={() => removePhotoAt(index)}>
                    ×
                  </button>
                </figure>
              ))}
            </div>
          ) : null}

          <a
            className={has3DRoom ? "upload-3d-button floor-plan-link active" : "upload-3d-button floor-plan-link"}
            href="/floor-plan-3d"
            onClick={() => setRegistrationStatus("작성 중")}
          >
            <strong>3D 도면 만들기</strong>
            <span>
              {has3DRoom
                ? "3D 도면이 연결됐어요. 등록하면 상세 페이지에서 3D로 보여집니다."
                : "도면을 만들고 저장하면 자동으로 연결돼요. 실측 도면 기반 3D 편집 페이지로 이동"}
            </span>
          </a>
        </section>

        <section className="owner-submit-summary" aria-label="검수 요청 요약">
          <div>
            <span>검수 요청 요약</span>
            <h3>{ownerForm.title || "매물명을 입력해주세요"}</h3>
            <p>
              {ownerPriceLabel} · 관리비 {ownerForm.maintenance || "0"}만원 · {ownerForm.area || "-"}m² ·{" "}
              {ownerForm.floor || "층수 미입력"}
            </p>
          </div>
          <div className="owner-submit-grid">
            <span>
              <b>{photoCount}장</b>
              사진
            </span>
            <span>
              <b>{has3DRoom ? "연결" : "대기"}</b>
              3D방
            </span>
            <span>
              <b>2시간</b>
              예상 검수
            </span>
          </div>
          <p>검수 요청 후 주변 중개사 12곳에 매물 정보가 전달되고, 확인매물 여부가 표시됩니다.</p>
        </section>

        <button className="submit-listing" type="button" onClick={submitOwnerListing} disabled={isSubmittingListing} aria-busy={isSubmittingListing}>
          {isSubmittingListing ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              {editingListingId ? "수정 저장 중…" : "등록 처리 중…"}
            </>
          ) : editingListingId ? (
            "수정 내용 저장"
          ) : (
            "매물 등록하기"
          )}
        </button>
      </form>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type MapMarkerInput = {
  lat: number;
  lng: number;
  title: string;
  price: string;
  mapLabel: string;
  clusterLabel: string;
};

function NaverMapPreview({
  className = "",
  center,
  title,
  markers
}: {
  className?: string;
  /** 특정 매물 좌표 — 있으면 그 위치를 중심으로 단일 마커를 찍는다(없으면 데모 마커). */
  center?: { lat: number; lng: number } | null;
  title?: string;
  /** 지도 탭용 동적 마커 목록 — 값이 바뀌면 마커를 다시 그린다(직접등록 매물 포함). */
  markers?: MapMarkerInput[];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const isMapInitializedRef = useRef(false);
  const mapInstanceRef = useRef<NaverMap | null>(null);
  const dynamicMarkersRef = useRef<NaverMarker[]>([]);
  const [isScriptReady, setIsScriptReady] = useState(false);
  const [loadState, setLoadState] = useState<MapLoadState>(naverMapClientId ? "loading" : "missing-key");
  const scriptUrl = naverMapScriptUrl;
  // 좌표 배열이 실제로 달라졌을 때만 마커를 다시 그린다 (렌더마다 새 배열이 와도 무시).
  const markersKey = markers
    ? JSON.stringify(markers.map((deal) => [deal.lat, deal.lng, deal.mapLabel]))
    : "";

  useEffect(() => {
    if (window.naver?.maps) {
      setIsScriptReady(true);
    }
  }, []);

  useEffect(() => {
    if (loadState !== "loading" || !isScriptReady || !naverMapClientId || !mapRef.current) {
      return;
    }

    if (!window.naver?.maps) {
      setLoadState("error");
      return;
    }

    if (isMapInitializedRef.current) {
      return;
    }

    isMapInitializedRef.current = true;
    const maps = window.naver.maps;
    // 매물 좌표가 주어지면 그 위치를, 아니면 기존 데모 중심(방배)을 쓴다.
    const hasCenter = center && Number.isFinite(center.lat) && Number.isFinite(center.lng);
    const centerLatLng = hasCenter
      ? new maps.LatLng(center.lat, center.lng)
      : new maps.LatLng(37.4875, 126.9931);
    const map = new maps.Map(mapRef.current, {
      center: centerLatLng,
      zoom: 16,
      zoomControl: true
    });
    mapInstanceRef.current = map;

    // markers 프롭이 있으면(지도 탭) 마커는 아래 동기화 이펙트가 그린다 — 여기서는 지도만 만든다.
    if (!hasCenter && !markers) {
      mapDealMarkers.forEach((deal, index) => {
        const position = new maps.LatLng(deal.lat, deal.lng);
        new maps.Marker({
          map,
          position,
          icon: {
            content: `<button class="naver-price-marker ${index === 0 ? "active" : ""}" type="button" aria-label="${deal.title} ${deal.price}"><b>${deal.clusterLabel}</b><strong>${deal.mapLabel}</strong></button>`,
            anchor: new maps.Point(42, 56)
          }
        });
      });
    }

    if (hasCenter || !markers) {
      const marker = new maps.Marker({
        map,
        position: centerLatLng
      });
      const infoWindow = new maps.InfoWindow({
        content: hasCenter
          ? `<div class="naver-info-window"><b>${title ? escapeHtml(title) : "이 매물"}</b><strong>현재 위치</strong></div>`
          : '<div class="naver-info-window"><b>선택 매물</b><strong>매1.4억</strong></div>'
      });
      infoWindow.open(map, marker);
    }
    setLoadState("ready");

    window.setTimeout(() => {
      const mapBackground = [
        mapRef.current?.style.background,
        mapRef.current ? window.getComputedStyle(mapRef.current).backgroundImage : ""
      ].join(" ");

      if (mapBackground.includes("auth_fail")) {
        setLoadState("error");
      }
    }, 600);
  }, [isScriptReady, loadState]);

  // 동적 마커 동기화 — 매물 목록(직접등록 포함)이 바뀌면 기존 마커를 지우고 다시 그린다.
  useEffect(() => {
    if (!markersKey || loadState !== "ready") return;
    const maps = window.naver?.maps;
    const map = mapInstanceRef.current;
    if (!maps || !map) return;

    dynamicMarkersRef.current.forEach((marker) => marker.setMap(null));
    const parsed = JSON.parse(markersKey) as Array<[number, number, string]>;
    dynamicMarkersRef.current = parsed.map(([lat, lng, mapLabel], index) => {
      const clusterLabel = escapeHtml(String((markers ?? [])[index]?.clusterLabel ?? ""));
      const markerTitle = escapeHtml(String((markers ?? [])[index]?.title ?? ""));
      const price = escapeHtml(String((markers ?? [])[index]?.price ?? ""));
      return new maps.Marker({
        map,
        position: new maps.LatLng(lat, lng),
        icon: {
          content: `<button class="naver-price-marker ${index === 0 ? "active" : ""}" type="button" aria-label="${markerTitle} ${price}"><b>${clusterLabel}</b><strong>${escapeHtml(String(mapLabel))}</strong></button>`,
          anchor: new maps.Point(42, 56)
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markersKey가 markers의 좌표·라벨을 대변한다
  }, [markersKey, loadState]);

  const handleScriptReady = () => {
    requestAnimationFrame(() => {
      if (window.naver?.maps) {
        setIsScriptReady(true);
        return;
      }

      setLoadState("error");
    });
  };

  return (
    <div className={`naver-map-shell ${className}`} aria-label="네이버 지도 서비스로 보기" data-state={loadState}>
      {scriptUrl ? (
        <Script
          id="naver-map-script"
          src={scriptUrl}
          strategy="afterInteractive"
          onError={() => setLoadState("error")}
          onLoad={handleScriptReady}
          onReady={handleScriptReady}
        />
      ) : null}
      <div ref={mapRef} className="naver-real-map" aria-label="네이버 지도 영역" data-state={loadState} />

      {loadState === "missing-key" ? (
        <div className="map-api-state" role="status">
          <span>지도 서비스</span>
          <strong>지도 설정 확인 중</strong>
          <p>
            지도 연동 정보가 확인되면 주변 매물과 시세 마커가 표시됩니다.
          </p>
        </div>
      ) : null}

      {loadState === "loading" ? (
        <div className="map-api-state loading" role="status">
          <span>지도 서비스</span>
          <strong>네이버 지도 불러오는 중</strong>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="map-api-state error" role="alert">
          <span>네이버 지도</span>
          <strong>지도 인증 확인 필요</strong>
          <p>서비스 도메인 허용이 완료되면 실제 지도 타일과 매물 마커가 바로 표시됩니다.</p>
          <div className="map-api-checklist" aria-label="네이버 지도 인증 점검 항목">
            <small>Dynamic Map</small>
            <small>Web URL 승인</small>
            <small>실시간 마커 대기</small>
          </div>
        </div>
      ) : null}

      {loadState === "ready" ? (
        <div className="map-live-controls" aria-label="지도 도구">
          <button className="float-action shot" type="button">현장촬영</button>
          <button className="float-action draw" type="button">그리기</button>
        </div>
      ) : null}
    </div>
  );
}

function ListingDetailView({
  listing,
  isSaved,
  onBack,
  onToggleSaved,
  onSubmitInquiry,
  onViewInquiryCenter,
  onRequireLogin
}: {
  listing: Listing;
  isSaved: boolean;
  onBack: () => void;
  onToggleSaved: (listingNo: string) => void;
  onSubmitInquiry: (payload: InquiryPayload, listingNo?: string) => Promise<"ok" | "auth" | "error">;
  onViewInquiryCenter: () => void;
  onRequireLogin?: () => void;
}) {
  const [isTourSheetOpen, setIsTourSheetOpen] = useState(false);
  const [isInquirySheetOpen, setIsInquirySheetOpen] = useState(false);
  const [isComplexSheetOpen, setIsComplexSheetOpen] = useState(false);
  const [isAgentSheetOpen, setIsAgentSheetOpen] = useState(false);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [detailToast, setDetailToast] = useState("");
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [marketSummary, setMarketSummary] = useState<MarketSummary | null>(null);
  const activePhoto = listing.gallery[activePhotoIndex] ?? listing.gallery[0];
  const listingPriceRows = getListingPriceRows(listing);
  const listingBuildingRows = getListingBuildingRows(listing);
  const safetyScore = listing.score.replace("안심 ", "");
  // 직접등록 매물은 점수가 "확인중" 같은 텍스트라 "점"을 붙이면 어색해진다("확인중점").
  const safetyScoreLabel = /^\d+$/.test(safetyScore) ? `${safetyScore}점` : safetyScore;
  const isDirectListing = listing.listingLabel === "집주인 직접등록";

  // 국토교통부 실거래가(시세)를 불러와 단지 시세 영역을 실데이터로 채운다.
  // 키 미설정/네트워크 오류 시 summary가 비므로 아래 폴백(하드코딩)이 그대로 유지된다.
  useEffect(() => {
    const controller = new AbortController();
    const region = regionForLocation(listing.location);
    getMarketSummary(
      { lawdCd: region.lawdCd, propertyType: propertyTypeForRoom(listing.roomType), months: 3 },
      controller.signal
    ).then((summary) => {
      if (summary && summary.count > 0) {
        setMarketSummary(summary);
      }
    });
    return () => controller.abort();
  }, [listing.location, listing.roomType]);

  const marketRecent = marketSummary?.recent[0];
  const complexRecentLabel = marketRecent
    ? marketRecent.tradeType === "월세"
      ? `${formatManwon(marketRecent.depositManwon)}/${marketRecent.monthlyRentManwon}만`
      : formatManwon(marketRecent.depositManwon)
    : listing.complexPrice;
  const complexAvgLabel =
    marketSummary && marketSummary.count > 0
      ? formatManwon(marketSummary.avgJeonseDepositManwon || marketSummary.avgDepositManwon)
      : listing.unitCount;
  const complexMonthlyAvgLabel =
    marketSummary && marketSummary.monthlyCount > 0 ? `${marketSummary.avgMonthlyRentManwon}만` : "76만";

  const copyListingNo = async () => {
    const text = listing.listingLabel;

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }

    setDetailToast("매물번호를 복사했어요");
    window.setTimeout(() => setDetailToast(""), 1600);
  };
  const scrollToSafetyReport = () => {
    document.querySelector(".detail-report-card")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <section className="listing-detail-screen" aria-labelledby="clicked-detail-title">
      <header className="detail-top-title">
        <button className="detail-back-button" type="button" onClick={onBack} aria-label="목록으로 돌아가기">
          <ArrowLeft size={24} strokeWidth={2.5} />
        </button>
        <h1 id="clicked-detail-title">{listing.detailHeader}</h1>
        <div className="detail-header-actions">
          <button type="button" aria-label="공유하기" onClick={() => setIsShareSheetOpen(true)}>
            <Share2 size={22} strokeWidth={2.5} />
          </button>
          <button className={isSaved ? "active" : ""} type="button" aria-label="찜하기" onClick={() => onToggleSaved(listing.listingNo)}>
            <Heart size={24} fill={isSaved ? "currentColor" : "none"} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      <div className="detail-gallery" aria-label={`${listing.title} 사진 모음`}>
        <div className="gallery-main">
          <Image src={activePhoto} alt={`${listing.title} 대표 사진 ${activePhotoIndex + 1}`} width={760} height={880} priority unoptimized={isRemotePhoto(activePhoto)} />
          <span className="gallery-photo-count">{activePhotoIndex + 1} / {listing.gallery.length}</span>
        </div>
        <div className="gallery-stack">
          {listing.gallery.map((image, index) => (
            <button
              className={activePhotoIndex === index ? "gallery-tile active" : "gallery-tile"}
              type="button"
              key={image}
              aria-label={`${listing.title} 사진 ${index + 1} 보기`}
              onClick={() => setActivePhotoIndex(index)}
            >
              <span className="gallery-image" style={{ backgroundImage: `url(${image})` }} />
            </button>
          ))}
        </div>
      </div>

      <div className="listing-number-bar">
        <button type="button" aria-label="매물번호 복사" onClick={copyListingNo}>
          <span>{listing.listingLabel}</span>
          <Copy size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <span className="listing-updated">{listing.updated} 갱신 · {listing.viewCount}</span>
      </div>

      {detailToast ? <div className="detail-toast" role="status">{detailToast}</div> : null}

      <div className="detail-price-block">
        <h2>{listing.price}</h2>
        <p>{listing.headline}</p>
        <div className="detail-address-line">
          <MapPinned size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>{listing.location}</span>
        </div>
        <div className="detail-quick-actions" aria-label="상세 빠른 액션">
          <button type="button" onClick={() => setIsTourSheetOpen(true)}>
            <span>3D</span>
            <strong>투어 보기</strong>
          </button>
          <button type="button" onClick={scrollToSafetyReport}>
            <span>{safetyScoreLabel}</span>
            <strong>안심 리포트</strong>
          </button>
          <button type="button" onClick={() => setIsComplexSheetOpen(true)}>
            <span>단지</span>
            <strong>정보 보기</strong>
          </button>
          <button type="button" onClick={() => setIsInquirySheetOpen(true)}>
            <span>8분 응답</span>
            <strong>문의하기</strong>
          </button>
        </div>
      </div>

      <div className="listing-detail-facts" aria-label="매물 기본 정보">
        <div>
          <span aria-hidden="true"><Building2 size={20} strokeWidth={2.2} /></span>
          <strong>{listing.roomType}</strong>
        </div>
        <div>
          <span aria-hidden="true"><Ruler size={20} strokeWidth={2.2} /></span>
          <strong>{listing.sizeLabel}</strong>
        </div>
        <div>
          <span aria-hidden="true"><Layers3 size={20} strokeWidth={2.2} /></span>
          <strong>{listing.floorLabel}</strong>
        </div>
        <div>
          <span aria-hidden="true"><Banknote size={20} strokeWidth={2.2} /></span>
          <strong>{listing.maintenanceFee}</strong>
        </div>
      </div>

      <div className="detail-tags" aria-label="매물 태그">
        {listing.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <section className="detail-trust-list" aria-label="안심 거래 정보">
        <div className="detail-section-heading">
          <h2>안심 거래 정보</h2>
          <span>{listing.verification}</span>
        </div>
        <ul>
          <li>
            <span>거래상태</span>
            <strong>문의 가능</strong>
          </li>
          <li>
            <span>실매물 확인</span>
            <strong>{listing.verification}</strong>
          </li>
          <li>
            <span>문의 응답</span>
            <strong>{listing.response}</strong>
          </li>
          <li>
            <span>등록 사진</span>
            <strong>{listing.gallery.length}장 · 현장 촬영</strong>
          </li>
          <li>
            <span>헛걸음 보상</span>
            <strong>정보 불일치 시 보상</strong>
          </li>
        </ul>
      </section>

      <button className="complex-button" type="button" onClick={() => setIsComplexSheetOpen(true)}>
        <Building2 size={20} strokeWidth={2.4} aria-hidden="true" />
        단지 정보 보러가기
      </button>

      <section className="detail-info-section" aria-label="가격 정보">
        <div className="detail-section-heading">
          <h2>가격 정보</h2>
          <span>방문 전 필수 확인</span>
        </div>
        <dl className="detail-info-table">
          {listingPriceRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="safety-analysis-card" aria-label="AI 안전분석">
        <div>
          <span>AI 안전분석</span>
          <h2>권리관계 특이사항 낮음</h2>
          <p>등기 변동, 보증금 비율, 관리비 수준을 함께 본 결과입니다.</p>
        </div>
        <strong>{safetyScoreLabel}</strong>
      </section>

      <section className="detail-report-card" aria-label="지킴 진단 리포트">
        <div className="detail-report-head">
          <div>
            <span>지킴 진단 리포트</span>
            <h2>계약 전 확인할 항목을 정리했어요</h2>
          </div>
          <strong>{safetyScore}</strong>
        </div>
        <div className="detail-report-grid">
          {safetyReportItems.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.status}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="agent-summary-card" aria-label="중개사 정보">
        <div>
          <span>{isDirectListing ? "집주인 직접 거래" : "중개사 평점 4.8"}</span>
          <h2>{listing.broker}</h2>
          <p>
            {isDirectListing
              ? `${listing.response} · ${listing.verification} · 헛걸음 보상 참여`
              : `${listing.response} · 확인매물 126개 · 헛걸음 보상 참여`}
          </p>
        </div>
        <button type="button" onClick={() => setIsAgentSheetOpen(true)}>프로필</button>
      </section>

      <section className="messenger-card" aria-label="매물확인 메신저">
        <div>
          <span>매물확인 메신저</span>
          <h2>방문 전 거래 가능 여부 확인</h2>
          <p>중개사가 계약 가능, 계약 불가능, 대체 매물을 문자로 답변합니다.</p>
        </div>
        <button type="button" onClick={() => setIsInquirySheetOpen(true)}>간편문의</button>
      </section>

      <div className="detail-info-pair">
        <section className="detail-info-section" aria-label="옵션 정보">
          <div className="detail-section-heading">
            <h2>옵션 정보</h2>
            <span>현장 확인 필요</span>
          </div>
          <div className="option-chip-grid">
            {optionItems.map((option) => (
              <span key={option}>{option}</span>
            ))}
          </div>
        </section>

        <section className="detail-info-section" aria-label="건물 정보">
          <div className="detail-section-heading">
            <h2>건물 정보</h2>
            <span>등기·현장 기준</span>
          </div>
          <dl className="detail-info-table">
            {listingBuildingRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="detail-neighborhood-card" aria-label="상세 주변 정보">
        <h2>주변 정보</h2>
        <div>
          {neighborhoodItems.map((item) => (
            <span key={item.label}>
              <b>{item.label}</b>
              {item.value}
            </span>
          ))}
        </div>
      </section>

      <button className="tour-banner detail-tour-banner" type="button" onClick={() => setIsTourSheetOpen(true)} aria-label="3D 가상 투어 시작하기">
        <span>
          <small>3D 공간 투어</small>
          <strong>3D 보기 / 투어 예약</strong>
          <em>실측 도면 기반으로 공간을 먼저 확인하세요</em>
        </span>
        <b aria-hidden="true">3D</b>
      </button>

      <section className="detail-map-section" aria-label="상세 위치">
        <div>
          <h2>위치</h2>
          <p>정확한 위치와 주변 생활권을 지도에서 확인하세요.</p>
        </div>
        <NaverMapPreview
          className="detail-naver-map"
          center={
            typeof listing.lat === "number" && typeof listing.lng === "number"
              ? { lat: listing.lat, lng: listing.lng }
              : null
          }
          title={listing.title}
        />
      </section>

      <div className="detail-contact-bar" id="detail-contact">
        <span className="contact-tooltip">로그인 없이 문의 가능 · 평균 응답 8분</span>
        <button className="detail-contact-small" type="button" aria-label="전화문의" onClick={() => setIsInquirySheetOpen(true)}>
          <span aria-hidden="true"><Phone size={20} strokeWidth={2.5} /></span>
          <strong>전화</strong>
        </button>
        <button className="detail-contact-tour" type="button" onClick={() => setIsTourSheetOpen(true)}>
          <span>3D</span>
          <strong>둘러보기</strong>
        </button>
        <button className="detail-contact-primary" type="button" onClick={() => setIsInquirySheetOpen(true)}>
          <strong>문자로 문의하기</strong>
          <span>방문 가능 여부 바로 확인</span>
        </button>
      </div>

      {isTourSheetOpen ? (
        <div className="tour-sheet-backdrop" role="presentation" onClick={() => setIsTourSheetOpen(false)}>
          <section className="tour-sheet" role="dialog" aria-modal="true" aria-labelledby="tour-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>3D 공간 미리보기</span>
                <h2 id="tour-sheet-title">방문 전 3D로 먼저 보기</h2>
                <p>방문 전에 구조와 옵션 위치를 확인하고, 원하는 시간에 투어 상담을 예약할 수 있습니다.</p>
              </div>
              <button type="button" onClick={() => setIsTourSheetOpen(false)} aria-label="3D 투어 닫기">×</button>
            </header>

            <div className="tour-preview-stage" aria-label="3D 투어 미리보기">
              {listing.floorPlan3D ? (
                <div className="tour-room-3d">
                  <ListingTourRoom3D floorPlan={listing.floorPlan3D} />
                </div>
              ) : (
                <div className="tour-room-box tour-room-box-empty">
                  <span className="tour-wall wall-left" />
                  <span className="tour-wall wall-right" />
                  <span className="tour-bed" />
                  <span className="tour-desk" />
                  <span className="tour-window" />
                  <strong>3D 도면 미연결 매물</strong>
                  <em>집주인이 아직 3D 도면을 등록하지 않았어요</em>
                </div>
              )}
            </div>

            <div className="tour-step-list">
              {listing.floorPlan3D ? (
                <>
                  <span>실측 도면 기반 3D</span>
                  <span>드래그로 둘러보기</span>
                  <span>투어 예약 연결</span>
                </>
              ) : (
                <>
                  <span>도면 기반 공간 스캔</span>
                  <span>옵션 배치 확인</span>
                  <span>투어 예약 연결</span>
                </>
              )}
            </div>

            <div className="tour-sheet-actions">
              <button type="button" onClick={() => setIsTourSheetOpen(false)}>닫기</button>
              <a href="#detail-contact" onClick={() => setIsTourSheetOpen(false)}>투어 예약</a>
            </div>
          </section>
        </div>
      ) : null}

      {isShareSheetOpen ? (
        <div className="share-sheet-backdrop" role="presentation" onClick={() => setIsShareSheetOpen(false)}>
          <section className="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>매물 공유</span>
                <h2 id="share-sheet-title">매물 공유하기</h2>
                <p>{listing.title} 정보를 같이 볼 사람에게 전달하세요.</p>
              </div>
              <button type="button" onClick={() => setIsShareSheetOpen(false)} aria-label="공유 닫기">×</button>
            </header>

            <div className="share-listing-preview">
              <span>{listing.price}</span>
              <strong>{listing.title}</strong>
              <p>{listing.location} · {listing.spec}</p>
            </div>

            <div className="share-action-grid" aria-label="공유 방법">
              {["링크 복사", "문자 공유", "카카오 공유", "관심목록 저장"].map((label) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => {
                    if (label === "관심목록 저장" && !isSaved) {
                      onToggleSaved(listing.listingNo);
                    }

                    setDetailToast(label === "관심목록 저장" ? "관심목록에 저장했어요" : `${label}를 선택했어요`);
                    setIsShareSheetOpen(false);
                    window.setTimeout(() => setDetailToast(""), 1600);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {isComplexSheetOpen ? (
        <div className="complex-sheet-backdrop" role="presentation" onClick={() => setIsComplexSheetOpen(false)}>
          <section className="complex-sheet" role="dialog" aria-modal="true" aria-labelledby="complex-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>단지 리포트</span>
                <h2 id="complex-sheet-title">단지 정보</h2>
                <p>{listing.location} 기준 건물, 시세, 주변 생활권을 요약했습니다.</p>
              </div>
              <button type="button" onClick={() => setIsComplexSheetOpen(false)} aria-label="단지 정보 닫기">×</button>
            </header>

            <div className="complex-price-summary">
              <article>
                <span>최근 실거래</span>
                <strong>{complexRecentLabel}</strong>
              </article>
              <article>
                <span>동일 면적 평균</span>
                <strong>{complexAvgLabel}</strong>
              </article>
              <article>
                <span>월세 평균</span>
                <strong>{complexMonthlyAvgLabel}</strong>
              </article>
            </div>

            {marketSummary && marketSummary.count > 0 ? (
              <p className="complex-source-note">
                국토교통부 실거래가 {marketSummary.count}건 기준 · 최근 3개월
              </p>
            ) : null}

            <section className="complex-building-card" aria-label="단지 건물 요약">
              <div>
                <strong>방배 루미에르</strong>
                <span>준공 2021년 · 총 16층 · 84세대</span>
              </div>
              <p>엘리베이터, CCTV, 무인택배함, 주차 가능 여부를 현장 확인 기준으로 정리했습니다.</p>
            </section>

            <div className="complex-score-grid" aria-label="단지 생활 점수">
              {[
                ["교통", "도보 5분"],
                ["보안", "CCTV 7곳"],
                ["관리", "관리비 보통"],
                ["소음", "큰길가"]
              ].map(([label, value]) => (
                <span key={label}>
                  <b>{label}</b>
                  {value}
                </span>
              ))}
            </div>

            <div className="complex-sheet-actions">
              <button type="button" onClick={() => setIsComplexSheetOpen(false)}>닫기</button>
              <button
                type="button"
                onClick={() => {
                  setIsComplexSheetOpen(false);
                  setIsInquirySheetOpen(true);
                }}
              >
                단지 문의하기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isAgentSheetOpen ? (
        <div className="agent-sheet-backdrop" role="presentation" onClick={() => setIsAgentSheetOpen(false)}>
          <section className="agent-sheet" role="dialog" aria-modal="true" aria-labelledby="agent-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>중개사 정보</span>
                <h2 id="agent-sheet-title">내방역 푸른공인중개사</h2>
                <p>확인매물 중심으로 운영하는 집우집주 파트너 중개사무소입니다.</p>
              </div>
              <button type="button" onClick={() => setIsAgentSheetOpen(false)} aria-label="중개사 프로필 닫기">×</button>
            </header>

            <div className="agent-profile-summary">
              <div className="agent-avatar" aria-hidden="true">푸</div>
              <div>
                <strong>대표 공인중개사 김하늘</strong>
                <span>서울 서초구 방배동 · 등록번호 9254-18-00421</span>
              </div>
            </div>

            <section className="agent-metric-grid" aria-label="중개사 신뢰 지표">
              {[
                ["응답률", "98%"],
                ["평균 응답", "8분"],
                ["확인매물", "126개"],
                ["후기 평점", "4.8"]
              ].map(([label, value]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </section>

            <section className="agent-review-card" aria-label="최근 중개 후기">
              <strong>최근 후기</strong>
              <p>“방문 전 사진과 실제 상태가 거의 같았고, 관리비 포함 내역을 바로 알려줬어요.”</p>
              <span>입주 상담 완료 · 2일 전</span>
            </section>

            <div className="agent-listing-row" aria-label="중개사 보유 매물">
              <span>보유 매물</span>
              <strong>방배동 원룸 42개 · 오피스텔 18개 · 3D 가능 12개</strong>
            </div>

            <div className="agent-sheet-actions">
              <button type="button" onClick={() => setIsAgentSheetOpen(false)}>닫기</button>
              <button
                type="button"
                onClick={() => {
                  setIsAgentSheetOpen(false);
                  setIsInquirySheetOpen(true);
                }}
              >
                중개사 문의하기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isInquirySheetOpen ? (
        <InquirySheet
          listing={listing}
          onClose={() => setIsInquirySheetOpen(false)}
          onSubmitInquiry={onSubmitInquiry}
          onViewInquiryCenter={onViewInquiryCenter}
          onRequireLogin={onRequireLogin}
        />
      ) : null}
    </section>
  );
}

// 통합 문의 작성 sheet — 매물 상세 "문의하기", 홈 카드 "문자문의",
// 문의 탭 "새 문의"가 전부 이 하나의 sheet를 연다. (QA 3·4·6·7)
function InquirySheet({
  listing,
  onClose,
  onSubmitInquiry,
  onViewInquiryCenter,
  onRequireLogin
}: {
  listing: Listing;
  onClose: () => void;
  onSubmitInquiry: (payload: InquiryPayload, listingNo?: string) => Promise<"ok" | "auth" | "error">;
  onViewInquiryCenter: () => void;
  onRequireLogin?: () => void;
}) {
  const [selectedInquiryMessage, setSelectedInquiryMessage] = useState("아직 거래 가능한가요?");
  const [selectedVisitTime, setSelectedVisitTime] = useState("오늘 3시");
  const [inquiryMemo, setInquiryMemo] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "sent" | "auth" | "error">("idle");
  const inquirySent = submitState === "sent";
  const setInquirySent = (sent: boolean) => setSubmitState(sent ? "sent" : "idle");

  return (
    <div className="inquiry-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="inquiry-sheet" role="dialog" aria-modal="true" aria-labelledby="inquiry-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>문의하기</span>
            <h2 id="inquiry-sheet-title">간편문의</h2>
            <p>문의를 보내면 집주인과 채팅으로 바로 이어집니다. (로그인 필요)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="문의 닫기">×</button>
        </header>

        <div className="inquiry-listing-summary">
          <strong>{listing.price}</strong>
          <span>{listing.title}</span>
          <small>{listing.broker} · {listing.response}</small>
        </div>

        <div className="inquiry-message-group">
          <strong>문의 내용 선택</strong>
          <div className="inquiry-message-grid">
            {[
              "아직 거래 가능한가요?",
              "오늘 방문 가능한가요?",
              "관리비 포함 내역 알려주세요",
              "3D 투어 먼저 보고 싶어요"
            ].map((message) => (
              <button
                className={selectedInquiryMessage === message ? "active" : ""}
                type="button"
                key={message}
                onClick={() => {
                  setSelectedInquiryMessage(message);
                  setInquirySent(false);
                }}
              >
                {message}
              </button>
            ))}
          </div>
        </div>

        <div className="visit-time-group">
          <strong>방문 희망 시간</strong>
          <div>
            {["오늘 3시", "내일 오전", "주말 가능"].map((time) => (
              <button
                className={selectedVisitTime === time ? "active" : ""}
                type="button"
                key={time}
                onClick={() => {
                  setSelectedVisitTime(time);
                  setInquirySent(false);
                }}
              >
                {time}
              </button>
            ))}
          </div>
        </div>

        <label className="inquiry-textarea">
          <span>추가 메모</span>
          <textarea
            value={inquiryMemo}
            placeholder="예: 실매물 여부와 방문 가능한 시간을 확인하고 싶습니다."
            onChange={(event) => {
              setInquiryMemo(event.target.value);
              setInquirySent(false);
            }}
          />
        </label>

        <div className="inquiry-selected-summary" role="status">
          <strong>선택한 문의</strong>
          <p>{selectedInquiryMessage} · {selectedVisitTime}</p>
        </div>

        <div className="inquiry-agent-row">
          <span aria-hidden="true">✓</span>
          <p>48시간 안에 계약 가능, 계약 불가, 대체 매물 추천 중 하나로 답변됩니다.</p>
        </div>

        <div className="inquiry-policy-row" aria-label="허위매물 차단 정책">
          <strong>허위매물 차단</strong>
          <p>계약불가 또는 미답변 매물은 검수 대기 상태로 전환됩니다.</p>
        </div>

        <div className="inquiry-sheet-actions">
          <button type="button" onClick={onClose}>닫기</button>
          <button
            type="button"
            disabled={submitState === "sending"}
            onClick={async () => {
              if (inquirySent || submitState === "sending") return;
              setSubmitState("sending");
              const message = inquiryMemo.trim()
                ? `${selectedInquiryMessage} — ${inquiryMemo.trim()}`
                : selectedInquiryMessage;
              const result = await onSubmitInquiry(
                {
                  listingTitle: listing.title,
                  broker: listing.broker,
                  message,
                  visitTime: selectedVisitTime
                },
                listing.listingNo
              );
              setSubmitState(result === "ok" ? "sent" : result);
            }}
          >
            {submitState === "sending" ? "보내는 중…" : "문의 보내기"}
          </button>
        </div>

        {inquirySent ? (
          <div className="inquiry-submit-feedback" role="status">
            <p>문의가 접수됐습니다. 집주인이 답하면 문의센터 채팅으로 이어집니다.</p>
            <button type="button" onClick={onViewInquiryCenter}>문의센터 보기</button>
          </div>
        ) : null}
        {submitState === "auth" ? (
          <div className="inquiry-submit-feedback" role="status">
            <p>문의를 보내려면 WOOZU 계정 로그인이 필요합니다.</p>
            {onRequireLogin ? <button type="button" onClick={onRequireLogin}>로그인하기</button> : null}
          </div>
        ) : null}
        {submitState === "error" ? (
          <div className="inquiry-submit-feedback" role="status">
            <p>문의 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

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
  onNewInquiry,
  onRequireLogin,
  focusThreadId
}: {
  onNewInquiry: () => void;
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
        {/* 새 문의 = 최근 본 매물(없으면 첫 추천 매물)의 문의 sheet를 바로 연다 — 홈으로 튕기지 않는다 (QA 4·7) */}
        <button type="button" onClick={onNewInquiry}>
          새 문의
        </button>
      </div>

      {/* 서버 스레드 기반 문의 채팅 — 보낸 문의(구매자)와 받은 문의(집주인)를 한 곳에서 본다.
          QA: roleFilter="buyer" 고정 탓에 집주인이 문의 탭에서 받은 문의를 못 보던 문제 → 필터 해제.
          래퍼 클래스는 데스크톱 그리드 배치용 — 채팅이 문의센터의 주인공(좌측 넓은 칸)이 된다. */}
      <div className="inquiry-chat-panel">
        <TradeChatCenter
          emptyText="매물 카드의 '문자문의'나 위의 '새 문의'로 첫 문의를 보내보세요. 받은 문의도 여기로 들어옵니다."
          onRequireLogin={onRequireLogin}
          focusThreadId={focusThreadId}
        />
      </div>


      <section className="inquiry-channel-card" aria-label="문의 채널 상태">
        <div className="inquiry-channel-head">
          <span>문의 채널</span>
          <strong>원하는 방식으로 바로 확인</strong>
        </div>
        <div className="inquiry-channel-grid">
          {inquiryChannelItems.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.caption}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="inquiry-timeline-card" aria-label="문의 타임라인">
        <div className="inquiry-timeline-head">
          <span>문의 타임라인</span>
          <strong>최근 문의 흐름</strong>
        </div>
        {inquiryTimelineItems.map((item) => (
          <article key={item.title}>
            <span>{item.time}</span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </div>
          </article>
        ))}
      </section>

      <div className="inquiry-mini-grid">
        <article>
          <span>최근 응답</span>
          <strong>8분</strong>
        </article>
        <article>
          <span>예약 가능</span>
          <strong>오늘 3시</strong>
        </article>
        <article>
          <span>확인매물</span>
          <strong>126개</strong>
        </article>
      </div>
    </section>
  );
}

function UserMyPage({
  roleLabel,
  savedCount,
  viewedListings,
  inquiries,
  onGoSaved,
  onGoInquiry,
  onOpenListing,
  onOpenFilter,
  onOpenNotifications,
  onApplyCondition,
  onSelectFlow,
  onGoHome
}: {
  roleLabel: string;
  savedCount: number;
  viewedListings: Listing[];
  inquiries: InquiryItem[];
  onGoSaved: () => void;
  onGoInquiry: () => void;
  onOpenListing: (listing: Listing) => void;
  onOpenFilter: () => void;
  onOpenNotifications: () => void;
  onApplyCondition: (condition: (typeof savedConditions)[number]) => void;
  onSelectFlow: (flow: MyFlow) => void;
  onGoHome: () => void;
}) {
  const latestInquiry = inquiries[0];
  const latestViewed = viewedListings[0];

  return (
    <section className="screen profile-screen" id="my-page" aria-labelledby="profile-title">
      <MyFlowBar activeFlow="seeking" onSelectFlow={onSelectFlow} />

      <header className="profile-account-card">
        <div className="profile-avatar" aria-hidden="true">
          <UserRound size={26} strokeWidth={2.4} />
        </div>
        <div>
          <p className="brand-kicker">내 정보</p>
          <h2 id="profile-title">마이페이지</h2>
          <p>{roleLabel} 활동에 맞춘 검색 조건과 문의 내역을 정리합니다.</p>
        </div>
        <button className="mypage-main-button profile-main-button" type="button" onClick={onGoHome}>
          메인으로
        </button>
      </header>

      <section className="my-roomlog-section" aria-labelledby="my-roomlog-title">
        <div className="my-roomlog-heading">
          <span>내 룸로그</span>
          <h3 id="my-roomlog-title">내 주거 프로세스</h3>
          <p>방을 찾고, 집을 내놓고, 계약된 집은 같은 계정에서 룸로그로 이어서 관리합니다.</p>
        </div>
        <div className="my-roomlog-grid">
          <article className="my-roomlog-card is-active">
            <header>
              <em>계약 전 · 탐색</em>
              <strong>방 찾는 중</strong>
            </header>
            <p>찜 {savedCount}개 · 문의 {inquiries.length}건 · 최근 본 방 {viewedListings.length}개</p>
            <div className="my-roomlog-actions">
              <button type="button" onClick={onGoSaved}>찜한 매물</button>
              <button type="button" onClick={onGoInquiry}>문의한 매물</button>
              <button type="button" onClick={onGoHome}>방 더 보기</button>
            </div>
          </article>

          <article className="my-roomlog-card">
            <header>
              <em>임대인 관계 · 데모</em>
              <strong>내가 내놓은 집</strong>
            </header>
            <p>방배 루미에르 302호 · 노출중 · 조회 128 · 문의 6건</p>
            <div className="my-roomlog-actions">
              <button type="button" onClick={() => onSelectFlow("listing")}>등록·문의 현황</button>
              <button type="button" onClick={() => onSelectFlow("listing")}>새 집 내놓기</button>
            </div>
            <small>계약이 연결되면 집주인으로 관리가 시작됩니다.</small>
          </article>

          <article className="my-roomlog-card">
            <header>
              <em>세입자 관계 · 데모</em>
              <strong>내가 사는 집</strong>
            </header>
            <p>방배 루미에르 402호 · 계약 중 · D-124 재계약 예정</p>
            <div className="my-roomlog-actions">
              <button type="button" onClick={() => onSelectFlow("living")}>사는 집 현황</button>
              <Link href="/tenant/home/00">룸로그 홈</Link>
              <Link href="/tenant/defect/00">하자 접수</Link>
              <Link href="/tenant/payment/00">관리비</Link>
            </div>
            <small>이 계정에 사는 집이 연결되면 이어집니다.</small>
          </article>

          <article className="my-roomlog-card">
            <header>
              <em>관리자 관계 · 연결 예정</em>
              <strong>관리 중인 집</strong>
            </header>
            <p>연남 스테이 외 2개 동 · 진행 티켓 3건 · 검토 대기 2건</p>
            <div className="my-roomlog-actions">
              <Link href="/manager/home/00">관리 콘솔</Link>
              <Link href="/manager/ticket/dash/00">하자·티켓</Link>
              <Link href="/manager/cost/00">비용 정산</Link>
              <Link href="/manager/messaging/00">메시지</Link>
            </div>
            <small>이 계정에 관리 중인 집이 연결되면 이어집니다.</small>
          </article>
        </div>
      </section>

      <section className="profile-activity-grid" aria-label="내 활동 요약">
        <article role="button" tabIndex={0} onClick={onGoSaved} onKeyDown={(event) => handleActivateKey(event, onGoSaved)}>
          <Heart size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>찜한 매물</span>
          <strong>{savedCount}개</strong>
          <ChevronRight className="activity-card-chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
        </article>
        <article role="button" tabIndex={0} onClick={onGoInquiry} onKeyDown={(event) => handleActivateKey(event, onGoInquiry)}>
          <MessageCircle size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>문의 진행</span>
          <strong>{inquiries.length}건</strong>
          <ChevronRight className="activity-card-chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
        </article>
        <article
          role="button"
          tabIndex={0}
          onClick={() => (latestViewed ? onOpenListing(latestViewed) : onGoHome())}
          onKeyDown={(event) => handleActivateKey(event, () => (latestViewed ? onOpenListing(latestViewed) : onGoHome()))}
        >
          <MapPinned size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>최근 본 방</span>
          <strong>{viewedListings.length}개</strong>
          <ChevronRight className="activity-card-chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
        </article>
      </section>

      <div className="profile-summary-list">
        <article
          role="button"
          tabIndex={0}
          onClick={() => onApplyCondition(savedConditions[0])}
          onKeyDown={(event) => handleActivateKey(event, () => onApplyCondition(savedConditions[0]))}
        >
          <span>저장 조건</span>
          <strong>{savedConditions[0].label}</strong>
          <p>저장 지역 조건은 누르면 지도에서 바로 확인합니다.</p>
          <ChevronRight className="activity-card-chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
        </article>
        <article>
          <span>입주 체크</span>
          <strong>즉시입주 · 풀옵션 · 주차</strong>
          <p>필수 조건과 예산을 한 화면에서 관리합니다.</p>
        </article>
      </div>

      <section className="profile-inquiry-card" aria-label="최근 문의">
        <div>
          <span>최근 문의</span>
          <strong>{latestInquiry ? latestInquiry.listingTitle : "보낸 문의 없음"}</strong>
          <p>
            {latestInquiry
              ? `${latestInquiry.message} · ${latestInquiry.status}`
              : "매물 상세에서 문자문의를 보내면 여기에 표시됩니다."}
          </p>
        </div>
        <button type="button" onClick={onGoInquiry}>문의 확인</button>
      </section>

      {viewedListings.length > 0 ? (
        <section className="recent-viewed-card" aria-label="최근 본 방">
          <div className="recent-viewed-head">
            <strong>최근 본 방</strong>
            <span>{viewedListings.length}개</span>
          </div>
          {viewedListings.slice(0, 3).map((listing) => (
            <button type="button" key={listing.listingNo} onClick={() => onOpenListing(listing)}>
              <b>{listing.price}</b>
              <span>{listing.title}</span>
              <small>{listing.location}</small>
            </button>
          ))}
        </section>
      ) : null}

      <section className="profile-menu-card" aria-label="마이페이지 메뉴">
        {[
          { label: "알림 설정", value: "새 매물 · 답변 알림", Icon: Bell, action: onOpenNotifications },
          { label: "검색 조건 관리", value: "예산, 지역, 옵션", Icon: SlidersHorizontal, action: onOpenFilter },
          {
            label: "최근 본 방",
            value: latestViewed ? `${latestViewed.title} 다시 보기` : "방 둘러보러 가기",
            Icon: MapPinned,
            action: () => (latestViewed ? onOpenListing(latestViewed) : onGoHome())
          }
        ].map((item) => {
          const MenuIcon = item.Icon;

          return (
            <button type="button" key={item.label} onClick={item.action}>
              <span aria-hidden="true">
                <MenuIcon size={18} strokeWidth={2.4} />
              </span>
              <strong>{item.label}</strong>
              <small>{item.value}</small>
            </button>
          );
        })}
      </section>

      <PwaInstallCard />
    </section>
  );
}

function TenantMyPage({
  onSelectFlow,
  onGoInquiry,
  onGoHome
}: {
  onSelectFlow: (flow: MyFlow) => void;
  onGoInquiry: () => void;
  onGoHome: () => void;
}) {
  const [repairRequests, setRepairRequests] = useState([
    { id: 1, title: "창문 누수", status: "업체 배정" },
    { id: 2, title: "욕실 타일 보수", status: "접수됨" }
  ]);
  const [selectedIssue, setSelectedIssue] = useState(tenantIssuePresets[0]);
  const [maintenancePaid, setMaintenancePaid] = useState(false);
  const [visitConfirmed, setVisitConfirmed] = useState(false);
  const [isContractSheetOpen, setIsContractSheetOpen] = useState(false);
  const [tenantToast, setTenantToast] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [isSubmittingRepair, setIsSubmittingRepair] = useState(false);
  // state는 리렌더 이후에야 반영되므로, 연타가 재렌더보다 빠르면 state 체크만으론 막지 못한다 — ref로 즉시 잠근다.
  const isPayingRef = useRef(false);
  const isSubmittingRepairRef = useRef(false);

  const showToast = (message: string) => {
    setTenantToast(message);
    window.setTimeout(() => setTenantToast(""), 2400);
  };
  const addRepairRequest = () => {
    if (isSubmittingRepairRef.current) {
      return;
    }

    isSubmittingRepairRef.current = true;
    setIsSubmittingRepair(true);
    window.setTimeout(() => {
      setRepairRequests((current) => [{ id: Date.now(), title: selectedIssue, status: "접수됨" }, ...current]);
      showToast("수리요청이 접수됐습니다. 관리인이 확인 후 업체를 배정합니다.");
      isSubmittingRepairRef.current = false;
      setIsSubmittingRepair(false);
    }, 600);
  };

  const contractRows = [
    ["임대인", "김우주"],
    ["계약 기간", "2025-11-04 ~ 2027-11-03"],
    ["보증금", "1,000만원"],
    ["월세", "130만원"],
    ["관리비", "12만 4,000원"],
    ["특약", "재계약 시 월세 인상률 5% 이내"]
  ];

  return (
    <section className="screen tenant-screen" id="my-page" aria-labelledby="tenant-title">
      <MyFlowBar activeFlow="living" onSelectFlow={onSelectFlow} />

      <div className="owner-hero compact-profile tenant-hero">
        <div>
          <p className="brand-kicker">입주 생활</p>
          <h2 id="tenant-title">세입자 마이페이지</h2>
          <p>계약, 관리비, 수리요청, 방문 일정을 한 화면에서 확인합니다.</p>
        </div>
        <button className="mypage-main-button" type="button" onClick={onGoHome}>
          메인으로
        </button>
      </div>

      {tenantToast ? <p className="mypage-toast" role="status">{tenantToast}</p> : null}

      <section className="tenant-contract-card" aria-label="계약 상태">
        <div>
          <span>계약 상태</span>
          <strong>D-124 재계약 예정</strong>
          <p>방배 루미에르 402호 · 보증금 1,000만원 · 월세 130만원</p>
        </div>
        <button type="button" onClick={() => setIsContractSheetOpen(true)}>계약서 보기</button>
      </section>

      <div className="tenant-task-grid" aria-label="세입자 할 일">
        <article>
          <span>수리요청</span>
          <strong>{String(repairRequests.length).padStart(2, "0")}건</strong>
          <p>{repairRequests.slice(0, 2).map((item) => item.title).join(" · ")}</p>
        </article>
        <article>
          <span>관리비</span>
          <strong>{maintenancePaid ? "납부 완료" : "124,000원"}</strong>
          <p>{maintenancePaid ? "7월분 납부 확인" : "이번 달 납부 예정"}</p>
        </article>
        <article>
          <span>방문 일정</span>
          <strong>{visitConfirmed ? "확인 완료" : "오늘 2:30"}</strong>
          <p>에어컨 필터 점검</p>
        </article>
      </div>

      <section className="tenant-contract-card" aria-label="관리비 납부">
        <div>
          <span>이번 달 관리비</span>
          <strong>{maintenancePaid ? "납부 완료" : "124,000원"}</strong>
          <p>{maintenancePaid ? "7월 관리비 납부가 확인됐습니다." : "수도·인터넷 포함 · 7월 25일까지"}</p>
        </div>
        <button
          type="button"
          disabled={isPaying}
          aria-busy={isPaying}
          onClick={() => {
            if (maintenancePaid) {
              showToast("영수증이 문자로 발송됐습니다.");
              return;
            }

            if (isPayingRef.current) {
              return;
            }

            isPayingRef.current = true;
            setIsPaying(true);
            window.setTimeout(() => {
              setMaintenancePaid(true);
              isPayingRef.current = false;
              setIsPaying(false);
              showToast("관리비 124,000원 납부가 완료됐습니다.");
            }, 700);
          }}
        >
          {isPaying ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              처리 중…
            </>
          ) : maintenancePaid ? (
            "영수증 보기"
          ) : (
            "납부하기"
          )}
        </button>
      </section>

      <section className="tenant-repair-card" aria-label="수리요청">
        <div className="tenant-repair-head">
          <div>
            <span>수리요청</span>
            <strong>진행 중 {repairRequests.length}건</strong>
          </div>
          <button type="button" onClick={onGoInquiry}>관리인 문의</button>
        </div>
        <div className="tenant-repair-list">
          {repairRequests.map((item) => (
            <article key={item.id}>
              <strong>{item.title}</strong>
              <em className={item.status === "업체 배정" ? "assigned" : ""}>{item.status}</em>
            </article>
          ))}
        </div>
        <div className="tenant-repair-new">
          <strong>새 수리요청</strong>
          <div className="repair-issue-chips">
            {tenantIssuePresets.map((issue) => (
              <button
                className={selectedIssue === issue ? "active" : ""}
                type="button"
                key={issue}
                onClick={() => setSelectedIssue(issue)}
              >
                {issue}
              </button>
            ))}
          </div>
          <button className="repair-submit" type="button" onClick={addRepairRequest} disabled={isSubmittingRepair} aria-busy={isSubmittingRepair}>
            {isSubmittingRepair ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                접수 처리 중…
              </>
            ) : (
              `${selectedIssue} 접수하기`
            )}
          </button>
        </div>
      </section>

      <section className="domain-test-card tenant-domain-test-card" aria-labelledby="tenant-roomlog-title">
        <div className="domain-test-heading">
          <span>내 룸로그</span>
          <h3 id="tenant-roomlog-title">이 집의 관리 프로세스</h3>
          <p>계약된 집은 입주부터 퇴실까지 같은 계정의 룸로그에서 이어집니다.</p>
        </div>
        <div className="domain-test-link-grid">
          <Link className="domain-test-link primary" href="/tenant/home/00">
            룸로그 홈
          </Link>
          <Link className="domain-test-link" href="/tenant/movein/00">
            입주 점검
          </Link>
          <Link className="domain-test-link" href="/tenant/contract/00">
            계약
          </Link>
          <Link className="domain-test-link" href="/tenant/defect/00">
            하자 접수
          </Link>
          <Link className="domain-test-link" href="/tenant/payment/00">
            관리비·납부
          </Link>
          <Link className="domain-test-link" href="/tenant/messaging/00">
            메시지
          </Link>
          <Link className="domain-test-link" href="/tenant/moveout/00">
            퇴실 정산
          </Link>
        </div>
        <small className="domain-test-note">이 계정에 사는 집이 연결되면 이어집니다.</small>
      </section>

      <section className="maintenance-card" aria-label="긴급 점검 일정">
        <span>오늘 방문 일정</span>
        <h3>에어컨 필터 교체 방문</h3>
        <p>
          {visitConfirmed
            ? "방문 확인이 완료됐습니다. 기사에게 방문 예정 알림이 전달됐어요."
            : "관리 기사가 오늘 오후 2시 30분 방문합니다. 현관과 설비실 접근만 확인해주세요."}
        </p>
        <button
          type="button"
          onClick={() => {
            if (!visitConfirmed) {
              setVisitConfirmed(true);
              showToast("방문 일정을 확인했습니다.");
            }
          }}
        >
          {visitConfirmed ? "확인 완료" : "방문 확인"}
        </button>
      </section>

      {isContractSheetOpen ? (
        <div className="notification-sheet-backdrop" role="presentation" onClick={() => setIsContractSheetOpen(false)}>
          <section
            className="notification-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>전자 계약서</span>
                <h2 id="contract-sheet-title">방배 루미에르 402호</h2>
                <p>2025-11-04 체결 · 임대차 표준계약서</p>
              </div>
              <button type="button" onClick={() => setIsContractSheetOpen(false)} aria-label="계약서 닫기">×</button>
            </header>

            <dl className="detail-info-table contract-sheet-table">
              {contractRows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <button className="notification-action" type="button" onClick={() => setIsContractSheetOpen(false)}>
              확인
            </button>
          </section>
        </div>
      ) : null}
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
          <strong>입주·검수</strong>
          <div className="filter-priority-grid">
            {[
              ["즉시입주", "오늘 방문 가능"],
              ["확인매물", "실매물 검수"],
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
  recentSearches,
  onClose,
  onClearRecentSearches,
  onSelectArea
}: {
  isOpen: boolean;
  currentArea: string;
  recentSearches: string[];
  onClose: () => void;
  onClearRecentSearches: () => void;
  onSelectArea: (area: string) => void;
}) {
  const [searchValue, setSearchValue] = useState(currentArea);

  useEffect(() => {
    if (isOpen) {
      setSearchValue(currentArea);
    }
  }, [currentArea, isOpen]);

  const submitSearch = () => {
    const keyword = searchValue.trim();

    if (!keyword) {
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
          <button type="submit">검색</button>
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
          <button type="button" onClick={submitSearch}>지도에서 {normalizedSearchValue} 보기</button>
        </section>

        <section className="search-condition-strip" aria-label="추천 검색 조건">
          {savedConditions.slice(0, 3).map((condition) => (
            <button type="button" key={condition.label} onClick={() => onSelectArea(condition.area)}>
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
                <button type="button" key={keyword} onClick={() => onSelectArea(keyword)}>
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
              <button type="button" key={district} onClick={() => onSelectArea(district)}>
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
              <button type="button" key={station} onClick={() => onSelectArea(station)}>
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
            <p>새 매물, 문의, 검수 상태를 한 번에 확인합니다.</p>
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

function PwaInstallCard() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState("설치 가능 확인 중");
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallState("설치 가능");
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstallState("설치 완료");
    };
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) {
      setInstallState("브라우저 메뉴에서 홈 화면에 추가");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setInstallState(choice.outcome === "accepted" ? "설치 완료" : "나중에 설치");
  };

  return (
    <section className="pwa-install-card" aria-label="앱 설치">
      <div>
        <span>앱 설치</span>
        <h2>집우집주를 앱처럼 빠르게 열기</h2>
        <p>홈 화면에 추가하면 최근 본 방과 문의 흐름을 더 빠르게 다시 열 수 있습니다.</p>
      </div>
      <div className="pwa-status-grid" aria-label="앱 설치 상태">
        <span>
          <b>설치</b>
          {installState}
        </span>
        <span>
          <b>네트워크</b>
          {isOnline ? "온라인" : "오프라인"}
        </span>
        <span>
          <b>캐시</b>
          재방문 준비
        </span>
      </div>
      <button type="button" onClick={installApp}>
        앱 설치
      </button>
    </section>
  );
}

export default function Home() {
  const [activeRole, setActiveRole] = useState<AppRole>("seeker");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [selectedArea, setSelectedArea] = useState("서초구 방배동");
  const [recentSearches, setRecentSearches] = useState(searchSuggestions.recent);
  const [activeCategory, setActiveCategory] = useState(categories[0].label);
  const [activeQuickFilters, setActiveQuickFilters] = useState<string[]>([]);
  // 홈 검색창 키워드 — 매물명/위치/스펙/태그를 즉시 필터링한다 (QA: 검색창 직접 입력).
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeMapFilter, setActiveMapFilter] = useState("시세");
  const [activeSort, setActiveSort] = useState(sortOptions[0].label);
  const [activeMapResultTab, setActiveMapResultTab] = useState<MapResultTab>("rooms");
  const [selectedMapListingNo, setSelectedMapListingNo] = useState(demoMapItems[0]?.listingNo ?? "");
  const [savedListingNos, setSavedListingNos] = useState<string[]>([listings[0].listingNo, listings[2].listingNo]);
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
  // 집주인이 직접 등록한 서버 매물 — 모든 계정의 홈 피드 맨 앞에 합류한다.
  const [tradeListings, setTradeListings] = useState<TradeListing[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/trade/listings", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: TradeListing[]) => {
          if (!cancelled && Array.isArray(data)) setTradeListings(data);
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  const allListings = [...tradeListings.map(tradeListingToCard), ...listings];
  const activeRoleLabel = roleDisplayLabels[activeRole];
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
  const visibleMapListings = areaScopedMapItems
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

      return a.accuracyRank - b.accuracyRank;
    });
  const selectedMapListing = visibleMapListings.find((listing) => listing.listingNo === selectedMapListingNo) ?? visibleMapListings[0];
  // 지도 마커 = 좌표가 유효한 매물만 (직접등록 매물 포함 — QA: 지도에 매물 안 찍힘)
  const mapMarkers = visibleMapListings.filter((listing) => Number.isFinite(listing.lat) && Number.isFinite(listing.lng));
  const findListingCardByNo = (listingNo: string) => allListings.find((listing) => listing.listingNo === listingNo);

  const viewedListings = viewedListingNos
    .map((listingNo) => allListings.find((listing) => listing.listingNo === listingNo))
    .filter((listing): listing is Listing => Boolean(listing));

  const inquiryComposeListing = inquiryComposeListingNo
    ? allListings.find((listing) => listing.listingNo === inquiryComposeListingNo) ?? null
    : null;

  const unseenReplyCount = inquiries.filter((item) => item.reply && !seenInquiryIds.includes(item.id)).length;

  // 실시간 문의 신호 — 웹소켓 trade:updated가 오면 문의 탭 밖에서는 배지를 켠다(탭 진입 시 해제).
  const [unseenTradeCount, setUnseenTradeCount] = useState(0);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    if (!viewer) return; // 소켓 인증 티켓은 로그인 세션 기반 — 비로그인 재연결 루프 방지

    const socket = getRealtimeSocket();
    const onTradeUpdated = () => {
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

  const openListing = (listing: Listing) => {
    setSelectedListing(listing);
    setViewedListingNos((current) => [listing.listingNo, ...current.filter((no) => no !== listing.listingNo)].slice(0, 4));
    resetWindowScrollSoon();
  };

  // 문의는 서버 스레드로 전송된다 — 집주인(또는 데모 임대인) 계정이 실제로 받고, 채팅으로 이어진다.
  // 반환값: ok=접수, auth=로그인 필요, error=실패.
  const submitInquiry = async (
    payload: InquiryPayload,
    listingNo?: string
  ): Promise<"ok" | "auth" | "error"> => {
    try {
      const response = await fetch("/api/trade/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listingNo?.startsWith(TRADE_LISTING_NO_PREFIX)
            ? listingNo.slice(TRADE_LISTING_NO_PREFIX.length)
            : null,
          listingTitle: payload.listingTitle,
          message: payload.message,
          visitTime: payload.visitTime
        })
      });
      if (response.status === 401) return "auth";
      if (!response.ok) return "error";
      // 로컬 요약 목록에도 즉시 반영 (문의센터 상단 노출 — lib/inquiry-flow 테스트로 고정된 규칙)
      setInquiries((current) => withNewInquiry(current, payload, Date.now()));
      // 서버가 방금 생성/이어붙인 스레드 id를 돌려주면, 문의센터 채팅으로 바로 진입한다(당근식).
      const created = (await response.json().catch(() => ({}))) as { id?: string };
      if (created.id) {
        setBuyerFocusThreadId(created.id);
        setSelectedListing(null);
        setInquiryComposeListingNo(null);
        activateTab("inquiry");
      }
      return "ok";
    } catch {
      return "error";
    }
  };

  // 통합 문의 작성 진입점 — 최근 본 매물이 있으면 그 매물, 없으면 첫 추천 매물의 sheet를 연다.
  // 홈 카드 "문자문의"와 문의 탭 "새 문의"가 모두 이 흐름을 쓴다 (QA 3·4·7).
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
    resetWindowScrollSoon();
  };

  const openAuthScreen = (mode: AuthMode) => {
    setAuthMode(mode);
    setSelectedListing(null);
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

  const startRoleSession = (role: AppRole) => {
    setAuthMode(null);
    setIsDevRolePreview(true);
    setActiveRole(role);
    setActiveTab(role === "seeker" ? "home" : "mypage");
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
    setActiveTab(nextRole === "seeker" ? "home" : "mypage");
    setSelectedListing(null);
    resetWindowScrollSoon();
  };

  const toggleQuickFilter = (filter: string) => {
    setActiveQuickFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]
    );
  };

  const toggleSavedListing = (listingNo: string) => {
    setSavedListingNos((current) =>
      current.includes(listingNo) ? current.filter((item) => item !== listingNo) : [...current, listingNo]
    );
  };

  const selectSearchArea = (area: string) => {
    setSelectedArea(area);
    setRecentSearches((current) => [area, ...current.filter((item) => item !== area)].slice(0, 5));
    setIsSearchSheetOpen(false);
    setActiveMapResultTab("rooms");
    activateTab("map");
  };

  const applySavedCondition = (condition: (typeof savedConditions)[number]) => {
    setSelectedArea(condition.area);
    setActiveCategory(condition.category);
    setActiveQuickFilters(condition.filters);
    setActiveMapResultTab("rooms");
    activateTab("map");
  };

  useLayoutEffect(() => {
    if (selectedListing) {
      resetWindowScrollSoon();
    }
  }, [selectedListing]);

  useEffect(() => {
    if (activeRole && !selectedListing && !authMode) {
      resetWindowScrollSoon();
    }
  }, [activeRole, activeTab, selectedListing, authMode]);

  useEffect(() => {
    if (selectedListing) {
      resetWindowScrollSoon();
    }
  }, [selectedListing]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = normalizeAuthMode(params.get("auth"));
    const role = normalizeAppRole(params.get("role"));
    const tab = normalizeAppTab(params.get("tab"));
    const flow = params.get("flow");

    if (auth) {
      setAuthMode(auth);
      setSelectedListing(null);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      resetWindowScrollSoon();
    } else if (flow === "listing") {
      // 집 내놓기 시작 — capability 가드를 타지 않는 등록 진입점.
      // /login의 "관리 중인 집 연결 필요" CTA가 여기로 온다 (로그인 루프 방지, QA 2).
      urlRoleAppliedRef.current = true;
      setActiveRole("landlord");
      setActiveTab("mypage");
      setIsListingStartMode(true);
      setSelectedListing(null);
      setAuthMode(null);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      resetWindowScrollSoon();
    } else if (role) {
      urlRoleAppliedRef.current = true;
      setActiveRole(role);
      setActiveTab(tab ?? (role === "seeker" ? "home" : "mypage"));
      setSelectedListing(null);
      setAuthMode(null);
      setIsDevRolePreview(false);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      resetWindowScrollSoon();
    } else if (tab) {
      setActiveTab(tab);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      resetWindowScrollSoon();
    } else {
      // 새로고침이 홈으로 튕기지 않게 — 이 탭에서 마지막으로 보던 탭/역할을 복원한다(딥링크와 같은 취급).
      const storedTab = normalizeAppTab(window.sessionStorage.getItem("woozuLastTab"));
      const storedRole = normalizeAppRole(window.sessionStorage.getItem("woozuLastRole"));
      if (storedRole && storedRole !== "seeker") {
        urlRoleAppliedRef.current = true;
        setIsDevRolePreview(true);
        setActiveRole(storedRole);
      }
      if (storedTab && storedTab !== "home") {
        setActiveTab(storedTab);
      }
    }
    setIsRouteReady(true);
  }, []);

  // 현재 탭/역할을 세션에 남겨 새로고침 복원에 쓴다 (브라우저 탭 단위 — 새 탭은 홈부터 시작).
  useEffect(() => {
    if (!isRouteReady || typeof window === "undefined") return;
    window.sessionStorage.setItem("woozuLastTab", activeTab);
    window.sessionStorage.setItem("woozuLastRole", activeRole);
  }, [activeTab, activeRole, isRouteReady]);

  // 로그인 화면이 열려 있는 동안 브라우저 뒤로가기를 누르면 홈으로 돌아가도록 처리.
  useEffect(() => {
    function handlePopState() {
      isAuthHistoryPushedRef.current = false;
      setAuthMode((current) => (current ? null : current));
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

  // "내 흐름" 셀렉트 제거 이후: 역할은 로그인 계정의 capability에서 자동 결정된다.
  // (URL 딥링크가 역할을 명시했으면 그 선택을 존중, 이후 전환은 마이페이지 흐름 칩이 담당)
  useEffect(() => {
    if (!viewer || urlRoleAppliedRef.current) return;
    setActiveRole(
      hasCapability(viewer, "LANDLORD") ? "landlord" : hasCapability(viewer, "TENANT") ? "tenant" : "seeker"
    );
  }, [viewer]);

  // 집 내놓기 시작 모드는 보호 대상에서 제외 — 등록 시작은 capability가 아니라
  // 매물 등록 자체가 LANDLORD 관계를 만드는 진입점이다. 관리 콘솔(/manager/*)은 계속 서버 가드.
  const protectedConfig =
    activeTab === "mypage" && (activeRole === "tenant" || activeRole === "landlord")
      ? activeRole === "landlord" && isListingStartMode
        ? null
        : protectedRoleConfig[activeRole]
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
    setSelectedListing(null);
    setAuthMode(null);
    setIsDevRolePreview(false);
  };

  // 내 룸로그 흐름 전환: 한 계정에서 탐색·임대인·세입자 마이페이지를 오가고,
  // 관리자 흐름은 기존 관리 콘솔 화면으로 이어준다. (데모 미리보기 — 로그인 강제 없음)
  const openMyFlow = (flow: MyFlow) => {
    if (flow === "managing") {
      window.location.href = "/manager/home/00";
      return;
    }

    setIsDevRolePreview(true);
    setActiveRole(flow === "listing" ? "landlord" : flow === "living" ? "tenant" : "seeker");
    setActiveTab("mypage");
    resetWindowScrollSoon();
  };

  if (authMode) {
    return (
      <WoozuLoginScreen
        mode={authMode}
        setActiveRole={startRoleSession}
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

  if (selectedListing) {
    return (
      <main className="app-canvas">
        <div className="service-frame detail-service-frame" aria-label="집우집주 매물 상세">
          <ListingDetailView
            listing={selectedListing}
            isSaved={savedListingNos.includes(selectedListing.listingNo)}
            onBack={() => setSelectedListing(null)}
            onToggleSaved={toggleSavedListing}
            onSubmitInquiry={submitInquiry}
            onViewInquiryCenter={() => {
              setSelectedListing(null);
              activateTab("inquiry");
            }}
            onRequireLogin={() => {
              setSelectedListing(null);
              openAuthScreen("login");
            }}
          />
        </div>
      </main>
    );
  }

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
              <button className={activeTab === "mypage" ? "active" : ""} type="button" onClick={() => activateTab("mypage")}>마이페이지</button>
            </nav>
            <div className="web-topbar-actions">
              {/* "내 흐름" 테스트 역할 셀렉트 제거 — 역할은 로그인 계정 capability에서 자동 결정되고,
                  마이페이지 안의 흐름 칩(MyFlowBar)이 다중 역할 전환을 담당한다. */}
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
              <span className="role-chip">{activeRoleLabel}</span>
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
                  <article className="listing-card" key={listing.title}>
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

                  activateTab("mypage");
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
            <NaverMapPreview className="map-stage" markers={mapMarkers} />
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
                  <small>{selectedMapListing.price} · {selectedMapListing.distance}</small>
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
                  {activeSort} · {mapFilterSummary} 조건으로 우선 매물 {visibleMapListings.length}개를 먼저 보여줍니다.
                </p>

                <div className="map-list">
                  {visibleMapListings.map((listing) => (
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
                          <small>{listing.distance}</small>
                          <div className="map-card-tags">
                            {listing.flags.map((flag) => (
                              <em key={flag}>{flag}</em>
                            ))}
                          </div>
                          <div className="map-verification-row" aria-label={`${listing.title} 검수 상태`}>
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
          <InquiryHubSection onNewInquiry={() => openInquiryComposer()} onRequireLogin={() => openAuthScreen("login")} focusThreadId={buyerFocusThreadId} />
        ) : null}
        {activeTab === "mypage" && activeRole === "landlord" ? (
          <LandlordMyPage onSelectFlow={openMyFlow} onGoHome={() => activateTab("home")} />
        ) : null}
        {activeTab === "mypage" && activeRole === "tenant" ? (
          <TenantMyPage
            onSelectFlow={openMyFlow}
            onGoInquiry={() => activateTab("inquiry")}
            onGoHome={() => activateTab("home")}
          />
        ) : null}
        {activeTab === "mypage" && activeRole === "seeker" ? (
          <UserMyPage
            roleLabel={activeRoleLabel}
            savedCount={savedListingNos.length}
            viewedListings={viewedListings}
            inquiries={inquiries}
            onGoSaved={() => activateTab("saved")}
            onGoInquiry={() => activateTab("inquiry")}
            onOpenListing={openListing}
            onOpenFilter={() => setIsFilterSheetOpen(true)}
            onOpenNotifications={() => setIsNotificationSheetOpen(true)}
            onApplyCondition={applySavedCondition}
            onSelectFlow={openMyFlow}
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
