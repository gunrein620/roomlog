"use client";

import Image from "next/image";
import Script from "next/script";
import {
  ArrowLeft,
  Banknote,
  Bed,
  Bell,
  BriefcaseBusiness,
  Building,
  Building2,
  CalendarClock,
  Copy,
  DoorOpen,
  Heart,
  HomeIcon,
  House,
  Layers3,
  MapPinned,
  MessageCircle,
  Phone,
  Ruler,
  Search,
  Share2,
  SlidersHorizontal,
  UserRound
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  formatManwon,
  getMarketSummary,
  propertyTypeForRoom,
  regionForLocation,
  type MarketSummary
} from "../lib/api";

type AppRole = "seeker" | "tenant" | "landlord";
type AppTab = "home" | "map" | "saved" | "inquiry" | "mypage";
type AuthMode = "login" | "signup" | "broker";
type MapResultTab = "rooms" | "complexes" | "agents";
type ViewerProfile = {
  userId: string;
  email: string;
  name: string;
  role: string;
};

type NaverLatLng = unknown;
type NaverMap = unknown;
type NaverMarker = unknown;
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

const googleLogoSvg = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335" />
  </svg>
);

const defaultAuthRedirectPath = "/";

const googleAuthHrefForMode = (mode: AuthMode) => {
  const flow = mode === "signup" ? "signup" : "login";
  const errorRedirectTo = mode === "signup" ? "/?auth=signup" : "/";
  return `/api/auth/google/start?role=SEEKER&flow=${flow}&redirectTo=${encodeURIComponent(defaultAuthRedirectPath)}&errorRedirectTo=${encodeURIComponent(errorRedirectTo)}`;
};

const socialProvidersForMode = (mode: AuthMode): Array<{ label: string; className: string; mark: ReactNode; href?: string }> => [
  { label: "네이버로 계속하기", className: "naver", mark: <span aria-hidden="true">N</span> },
  {
    label: "Google로 계속하기",
    className: "google",
    mark: <span className="google-logo-icon" aria-hidden="true">{googleLogoSvg}</span>,
    href: googleAuthHrefForMode(mode)
  }
];

const devRoles: Array<{
  id: AppRole;
  label: string;
  description: string;
}> = [
  {
    id: "seeker",
    label: "일반 집보는 사람",
    description: "지도와 매물 상세를 둘러보는 기본 탐색 모드"
  },
  {
    id: "tenant",
    label: "세입자",
    description: "관심 매물과 입주 예정 방을 확인하는 임차인 모드"
  },
  {
    id: "landlord",
    label: "집주인",
    description: "마이페이지에서 내 집을 등록하는 임대인 모드"
  }
];

const roleSwitchOptions: Array<{ id: AppRole; label: string; href: string }> = [
  { id: "seeker", label: "일반 이용자", href: "/" },
  { id: "tenant", label: "세입자", href: "/?role=tenant&tab=mypage" },
  { id: "landlord", label: "임대인", href: "/?role=landlord&tab=mypage" }
];

const protectedRoleConfig = {
  tenant: {
    sessionRole: "TENANT",
    loginPath: "/tenant/login",
    redirectTo: "/?role=tenant&tab=mypage"
  },
  landlord: {
    sessionRole: "LANDLORD",
    loginPath: "/manager/login",
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

type Listing = (typeof listings)[number];

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

type InquiryStatus = "답변 대기" | "답변 완료";

type InquiryItem = {
  id: number;
  listingTitle: string;
  broker: string;
  message: string;
  visitTime: string;
  status: InquiryStatus;
  reply?: string;
  time: string;
};

const initialInquiries: InquiryItem[] = [
  {
    id: 1,
    listingTitle: "방배 루미에르 402호",
    broker: "내방역 푸른공인중개사",
    message: "아직 거래 가능한가요?",
    visitTime: "오늘 3시",
    status: "답변 완료",
    reply: "네, 아직 거래 가능합니다. 오늘 3시 방문도 가능해요.",
    time: "10분 전"
  }
];

const tenantIssuePresets = ["보일러 온수 불량", "콘센트 교체", "방충망 보수", "곰팡이 점검"];

const loginFeaturePills = ["3D투어", "입주관리AI", "업체연결"] as const;

function LoginScreen({
  mode,
  setActiveRole,
  onAuthenticated
}: {
  mode: AuthMode;
  setActiveRole: (role: AppRole) => void;
  onAuthenticated: (viewer: ViewerProfile) => void;
}) {
  const [socialLoginNotice, setSocialLoginNotice] = useState("소셜 로그인으로 관심 매물과 문의 내역을 이어서 볼 수 있습니다.");
  const [serviceEmail, setServiceEmail] = useState("");
  const [servicePassword, setServicePassword] = useState("");
  const [serviceLoginError, setServiceLoginError] = useState("");
  const [isServiceLoginPending, setIsServiceLoginPending] = useState(false);
  const socialProviders = socialProvidersForMode(mode);

  async function submitServiceLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsServiceLoginPending(true);
    setServiceLoginError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: serviceEmail, password: servicePassword, expectedRole: "SEEKER" })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        setServiceLoginError(body?.message ?? "로그인에 실패했습니다.");
        return;
      }

      const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
      if (!meResponse.ok) {
        setServiceLoginError("로그인 상태를 확인하지 못했습니다.");
        return;
      }

      onAuthenticated((await meResponse.json()) as ViewerProfile);
    } catch {
      setServiceLoginError("네트워크 오류로 로그인하지 못했습니다.");
    } finally {
      setIsServiceLoginPending(false);
    }
  }

  return (
    <main className="app-canvas login-canvas">
      <section className="login-phone" aria-label="집우집주 로그인">
        <div className="login-brandmark">
          <div className="brand-mark-icon">
            <div className="brand-orbit">
              <div className="brand-orbit-spin">
                <span className="brand-star-fix">
                  <span className="brand-star">
                    <svg viewBox="0 0 24 24"><path d="M12 0c1.1 6.2 4.8 9.9 12 12-7.2 2.1-10.9 5.8-12 12-1.1-6.2-4.8-9.9-12-12 7.2-2.1 10.9-5.8 12-12Z" /></svg>
                  </span>
                </span>
              </div>
            </div>
            <svg className="brand-roof" viewBox="0 0 140 68" fill="none">
              <path d="M18 58 L70 18 L122 58" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="61" y="33" width="8" height="8" rx="2.4" fill="#ec6a86" />
              <rect x="71" y="33" width="8" height="8" rx="2.4" fill="#ec6a86" />
              <rect x="61" y="43" width="8" height="8" rx="2.4" fill="#ec6a86" />
              <rect x="71" y="43" width="8" height="8" rx="2.4" fill="#ec6a86" />
            </svg>
          </div>
          <div className="brand-word">우주</div>
          <p className="brand-tagline">우주 | 3D공간 시뮬레이션</p>
        </div>

        <div className="login-panel">
          <p className="brand-kicker">|집우집주|  입주부터 관리까지 우주에서</p>
          <h1>우주에서 방을 구해보세요!</h1>
          <p>
            조건에 맞는 방을 찾고, 3D 투어와 정보확인은 우주에서
          </p>

          <div className="login-feature-bar" aria-label="서비스 핵심 기능">
            {loginFeaturePills.map((label, index) => (
              <Fragment key={label}>
                {index > 0 ? <span className="login-feature-sep" aria-hidden="true" /> : null}
                <span className={`login-feature-pill login-feature-pill--${index}`}>{label}</span>
              </Fragment>
            ))}
          </div>

          <div className="social-stack" aria-label="소셜 로그인">
            {socialProviders.map((provider) => (
              <button
                className={`social-button ${provider.className}`}
                type="button"
                key={provider.label}
                onClick={() => {
                  if (provider.href) {
                    window.location.href = provider.href;
                    return;
                  }
                  setSocialLoginNotice(`${provider.label.replace("로 계속하기", "")} 로그인으로 관심 매물 저장과 문의 알림을 받을 수 있습니다.`);
                }}
              >
                {provider.mark}
                {provider.label}
              </button>
            ))}
          </div>

          <p className="social-login-notice" role="status">{socialLoginNotice}</p>

          <div className="service-login-panel" aria-label="서비스 로그인">
            <div>
              <strong>서비스 로그인</strong>
            </div>
            <form className="service-login-form" onSubmit={submitServiceLogin}>
              <label>
                이메일
                <input
                  type="email"
                  value={serviceEmail}
                  onChange={(event) => setServiceEmail(event.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                비밀번호
                <input
                  type="password"
                  value={servicePassword}
                  onChange={(event) => setServicePassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {serviceLoginError ? (
                <p className="service-auth-error" role="alert">{serviceLoginError}</p>
              ) : null}
              <button className="service-login-submit" type="submit" disabled={isServiceLoginPending}>
                {isServiceLoginPending ? "로그인 중" : "로그인"}
              </button>
            </form>
            <a className="service-signup-link" href="/signup">일반 회원가입</a>
          </div>

          <div className="dev-login-panel" aria-label="개발용 로그인">
            <div>
              <strong>개발용 로그인</strong>
              <span>역할을 골라 바로 입장</span>
            </div>
            {devRoles.map((role) => (
              <button className="dev-role-button" type="button" key={role.id} onClick={() => setActiveRole(role.id)}>
                <strong>{role.label}</strong>
                <span>{role.description}</span>
              </button>
            ))}
          </div>

          <small>일반 계정 로그인은 제공하지 않습니다.</small>
        </div>
      </section>
    </main>
  );
}

function MyPageRoleBar({ roleLabel, onSwitchRole }: { roleLabel: string; onSwitchRole: () => void }) {
  return (
    <div className="mypage-role-bar">
      <span>
        현재 <b>{roleLabel}</b> 모드로 보는 중
      </span>
      <button type="button" onClick={onSwitchRole}>역할 전환</button>
    </div>
  );
}

function LandlordMyPage({ onSwitchRole, onGoHome }: { onSwitchRole: () => void; onGoHome: () => void }) {
  const [ownerForm, setOwnerForm] = useState({
    title: "방배 루미에르 402호",
    address: "서울특별시 서초구 방배동",
    tradeType: "월세",
    moveIn: "즉시",
    deposit: "1000",
    monthly: "35",
    jeonse: "0",
    maintenance: "8",
    area: "24.5",
    floor: "4층 / 16층"
  });
  const [photoCount, setPhotoCount] = useState(0);
  const [has3DRoom, setHas3DRoom] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState("작성 중");
  const [myListings, setMyListings] = useState([
    { id: 1, title: "방배 루미에르 302호", price: "월세 1000/125", status: "노출중", caption: "조회 128 · 문의 6건" }
  ]);
  const [ownerToast, setOwnerToast] = useState("");
  const updateOwnerForm = (key: keyof typeof ownerForm, value: string) => {
    setOwnerForm((current) => ({ ...current, [key]: value }));
    setRegistrationStatus("작성 중");
  };
  const submitOwnerListing = () => {
    const id = Date.now();

    setRegistrationStatus("검수 대기");
    setMyListings((current) => [
      { id, title: ownerForm.title, price: ownerPriceLabel, status: "검수 대기", caption: "실매물 확인 후 노출됩니다" },
      ...current
    ]);
    setOwnerToast("검수 요청이 접수됐습니다. 확인이 끝나면 매물이 노출됩니다.");
    window.setTimeout(() => {
      setRegistrationStatus("노출중");
      setMyListings((current) =>
        current.map((item) => (item.id === id ? { ...item, status: "노출중", caption: "방금 노출 시작 · 문의 대기" } : item))
      );
      setOwnerToast("실매물 확인이 끝나 매물 노출이 시작됐습니다.");
    }, 6000);
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

  return (
    <section className="screen owner-screen" id="my-page" aria-labelledby="owner-title">
      <MyPageRoleBar roleLabel="집주인" onSwitchRole={onSwitchRole} />

      <div className="owner-hero">
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
          <strong>내 매물 {myListings.length}개</strong>
          <span>검수 통과 시 자동 노출</span>
        </div>
        {myListings.map((item) => (
          <article key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <small>{item.price} · {item.caption}</small>
            </div>
            <em className={item.status === "노출중" ? "live" : ""}>{item.status}</em>
          </article>
        ))}
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

      <form className="owner-form" id="owner-registration-form">
        <section className="owner-card">
          <div className="form-heading">
            <div>
              <span>STEP 01</span>
              <h3>내 집 등록</h3>
            </div>
            <strong>임대인 전용</strong>
          </div>

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
              <input value={ownerForm.moveIn} onChange={(event) => updateOwnerForm("moveIn", event.target.value)} placeholder="예: 즉시, 2026-08-01" />
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
                setPhotoCount(event.target.files?.length ?? 0);
                setRegistrationStatus("작성 중");
              }}
            />
          </label>

          <a
            className={has3DRoom ? "upload-3d-button floor-plan-link active" : "upload-3d-button floor-plan-link"}
            href="/floor-plan-3d"
            onClick={() => {
              setHas3DRoom(true);
              setRegistrationStatus("작성 중");
            }}
          >
            <strong>3D 도면 만들기</strong>
            <span>
              {has3DRoom ? "3D 방 자료가 연결된 상태입니다." : "3D 방 파일 또는 링크를 등록할 수 있습니다."} 실측 도면 기반
              3D 편집 페이지로 이동
            </span>
          </a>
        </section>

        <section className="owner-submit-summary" aria-label="검수 요청 요약">
          <div>
            <span>검수 요청 요약</span>
            <h3>{ownerForm.title}</h3>
            <p>{ownerPriceLabel} · 관리비 {ownerForm.maintenance}만원 · {ownerForm.area}m² · {ownerForm.floor}</p>
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

        <button className="submit-listing" type="button" onClick={submitOwnerListing}>
          매물 등록하기
        </button>
      </form>
    </section>
  );
}

function NaverMapPreview({ className = "" }: { className?: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const isMapInitializedRef = useRef(false);
  const [isScriptReady, setIsScriptReady] = useState(false);
  const [loadState, setLoadState] = useState<MapLoadState>(naverMapClientId ? "loading" : "missing-key");
  const scriptUrl = naverMapClientId
    ? `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${naverMapClientId}`
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
    const center = new maps.LatLng(37.4875, 126.9931);
    const map = new maps.Map(mapRef.current, {
      center,
      zoom: 16,
      zoomControl: true
    });
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

    const marker = new maps.Marker({
      map,
      position: center
    });
    const infoWindow = new maps.InfoWindow({
      content: '<div class="naver-info-window"><b>선택 매물</b><strong>매1.4억</strong></div>'
    });
    infoWindow.open(map, marker);
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
  onSubmitInquiry
}: {
  listing: Listing;
  isSaved: boolean;
  onBack: () => void;
  onToggleSaved: (listingNo: string) => void;
  onSubmitInquiry: (payload: { listingTitle: string; broker: string; message: string; visitTime: string }) => void;
}) {
  const [isTourSheetOpen, setIsTourSheetOpen] = useState(false);
  const [isInquirySheetOpen, setIsInquirySheetOpen] = useState(false);
  const [isComplexSheetOpen, setIsComplexSheetOpen] = useState(false);
  const [isAgentSheetOpen, setIsAgentSheetOpen] = useState(false);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [detailToast, setDetailToast] = useState("");
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [selectedInquiryMessage, setSelectedInquiryMessage] = useState("아직 거래 가능한가요?");
  const [selectedVisitTime, setSelectedVisitTime] = useState("오늘 3시");
  const [inquiryMemo, setInquiryMemo] = useState("실매물 여부와 방문 가능한 시간을 확인하고 싶습니다.");
  const [inquirySent, setInquirySent] = useState(false);
  const [marketSummary, setMarketSummary] = useState<MarketSummary | null>(null);
  const activePhoto = listing.gallery[activePhotoIndex] ?? listing.gallery[0];
  const listingPriceRows = getListingPriceRows(listing);
  const listingBuildingRows = getListingBuildingRows(listing);
  const safetyScore = listing.score.replace("안심 ", "");

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
          <Image src={activePhoto} alt={`${listing.title} 대표 사진 ${activePhotoIndex + 1}`} width={760} height={880} priority />
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
            <span>{safetyScore}점</span>
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
        <strong>{safetyScore}점</strong>
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
          <span>중개사 평점 4.8</span>
          <h2>{listing.broker}</h2>
          <p>{listing.response} · 확인매물 126개 · 헛걸음 보상 참여</p>
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
        <NaverMapPreview className="detail-naver-map" />
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
              <div className="tour-room-box">
                <span className="tour-wall wall-left" />
                <span className="tour-wall wall-right" />
                <span className="tour-bed" />
                <span className="tour-desk" />
                <span className="tour-window" />
                <strong>공간 미리보기</strong>
              </div>
            </div>

            <div className="tour-step-list">
              <span>도면 기반 공간 스캔</span>
              <span>옵션 배치 확인</span>
              <span>투어 예약 연결</span>
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
        <div className="inquiry-sheet-backdrop" role="presentation" onClick={() => setIsInquirySheetOpen(false)}>
          <section className="inquiry-sheet" role="dialog" aria-modal="true" aria-labelledby="inquiry-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>문의하기</span>
                <h2 id="inquiry-sheet-title">간편문의</h2>
                <p>로그인하지 않아도 중개사에게 문자 문의를 남길 수 있습니다.</p>
              </div>
              <button type="button" onClick={() => setIsInquirySheetOpen(false)} aria-label="문의 닫기">×</button>
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
              <textarea value={inquiryMemo} onChange={(event) => {
                setInquiryMemo(event.target.value);
                setInquirySent(false);
              }} />
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
              <button type="button" onClick={() => setIsInquirySheetOpen(false)}>닫기</button>
              <button
                type="button"
                onClick={() => {
                  if (!inquirySent) {
                    onSubmitInquiry({
                      listingTitle: listing.title,
                      broker: listing.broker,
                      message: selectedInquiryMessage,
                      visitTime: selectedVisitTime
                    });
                  }

                  setInquirySent(true);
                }}
              >
                문의 보내기
              </button>
            </div>

            {inquirySent ? (
              <p className="inquiry-submit-feedback" role="status">
                문의가 접수됐습니다. 답변이 오면 문의센터와 마이페이지에서 확인할 수 있어요.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
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
                <Image src={listing.image} alt={`${listing.title} 찜한 매물 사진`} width={240} height={180} />
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
  inquiries,
  onBrowseListings
}: {
  inquiries: InquiryItem[];
  onBrowseListings: () => void;
}) {
  const pendingCount = inquiries.filter((item) => item.status === "답변 대기").length;

  return (
    <section className="screen inquiry-screen" id="inquiry" aria-labelledby="inquiry-title">
      <div className="section-title no-margin">
        <div>
          <h2 id="inquiry-title">문의센터</h2>
          <p>보낸 문의 {inquiries.length}건 · 답변 대기 {pendingCount}건</p>
        </div>
        <button type="button" onClick={onBrowseListings}>새 문의</button>
      </div>

      <div className="inquiry-history-list" aria-label="보낸 문의 목록">
        {inquiries.map((item) => (
          <article className="inquiry-history-card" key={item.id}>
            <div className="inquiry-history-head">
              <strong>{item.listingTitle}</strong>
              <em className={item.status === "답변 완료" ? "done" : ""}>{item.status}</em>
            </div>
            <p>{item.message} · {item.visitTime} 방문 희망</p>
            <small>{item.broker} · {item.time}</small>
            {item.reply ? (
              <div className="inquiry-reply-bubble">
                <span>중개사 답변</span>
                <p>{item.reply}</p>
              </div>
            ) : (
              <div className="inquiry-reply-bubble waiting">
                <span>답변 대기</span>
                <p>중개사가 평균 8분 안에 문자로 답변합니다.</p>
              </div>
            )}
          </article>
        ))}
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
  onSwitchRole,
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
  onSwitchRole: () => void;
  onGoHome: () => void;
}) {
  const latestInquiry = inquiries[0];
  const latestViewed = viewedListings[0];

  return (
    <section className="screen profile-screen" id="my-page" aria-labelledby="profile-title">
      <MyPageRoleBar roleLabel={roleLabel} onSwitchRole={onSwitchRole} />

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

      <section className="profile-activity-grid" aria-label="내 활동 요약">
        <article role="button" tabIndex={0} onClick={onGoSaved} onKeyDown={(event) => event.key === "Enter" && onGoSaved()}>
          <Heart size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>찜한 매물</span>
          <strong>{savedCount}개</strong>
        </article>
        <article role="button" tabIndex={0} onClick={onGoInquiry} onKeyDown={(event) => event.key === "Enter" && onGoInquiry()}>
          <MessageCircle size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>문의 진행</span>
          <strong>{inquiries.length}건</strong>
        </article>
        <article
          role="button"
          tabIndex={0}
          onClick={() => (latestViewed ? onOpenListing(latestViewed) : onGoSaved())}
          onKeyDown={(event) => event.key === "Enter" && (latestViewed ? onOpenListing(latestViewed) : onGoSaved())}
        >
          <MapPinned size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>최근 본 방</span>
          <strong>{viewedListings.length}개</strong>
        </article>
      </section>

      <div className="profile-summary-list">
        <article role="button" tabIndex={0} onClick={() => onApplyCondition(savedConditions[0])} onKeyDown={(event) => event.key === "Enter" && onApplyCondition(savedConditions[0])}>
          <span>저장 조건</span>
          <strong>{savedConditions[0].label}</strong>
          <p>누르면 지도에서 이 조건으로 바로 확인합니다.</p>
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
            value: latestViewed ? `${latestViewed.title} 다시 보기` : "아직 본 방이 없어요",
            Icon: MapPinned,
            action: () => (latestViewed ? onOpenListing(latestViewed) : onGoSaved())
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
  onSwitchRole,
  onGoInquiry,
  onGoHome
}: {
  onSwitchRole: () => void;
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

  const showToast = (message: string) => {
    setTenantToast(message);
    window.setTimeout(() => setTenantToast(""), 2400);
  };
  const addRepairRequest = () => {
    setRepairRequests((current) => [{ id: Date.now(), title: selectedIssue, status: "접수됨" }, ...current]);
    showToast("수리요청이 접수됐습니다. 관리인이 확인 후 업체를 배정합니다.");
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
      <MyPageRoleBar roleLabel="세입자" onSwitchRole={onSwitchRole} />

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
          onClick={() => {
            if (maintenancePaid) {
              showToast("영수증이 문자로 발송됐습니다.");
              return;
            }

            setMaintenancePaid(true);
            showToast("관리비 124,000원 납부가 완료됐습니다.");
          }}
        >
          {maintenancePaid ? "영수증 보기" : "납부하기"}
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
          <button className="repair-submit" type="button" onClick={addRepairRequest}>
            {selectedIssue} 접수하기
          </button>
        </div>
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
  const [activeMapFilter, setActiveMapFilter] = useState("시세");
  const [activeSort, setActiveSort] = useState(sortOptions[0].label);
  const [activeMapResultTab, setActiveMapResultTab] = useState<MapResultTab>("rooms");
  const [selectedMapListingIndex, setSelectedMapListingIndex] = useState(mapListings[0].listingIndex);
  const [savedListingNos, setSavedListingNos] = useState<string[]>([listings[0].listingNo, listings[2].listingNo]);
  const [inquiries, setInquiries] = useState<InquiryItem[]>(initialInquiries);
  const [viewedListingNos, setViewedListingNos] = useState<string[]>([]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isSearchSheetOpen, setIsSearchSheetOpen] = useState(false);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [isNotificationSheetOpen, setIsNotificationSheetOpen] = useState(false);
  const [viewer, setViewer] = useState<ViewerProfile | null>(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [isRouteReady, setIsRouteReady] = useState(false);
  const [isDevRolePreview, setIsDevRolePreview] = useState(false);
  const activeRoleLabel = roleDisplayLabels[activeRole];
  const selectedAreaTitle = formatAreaTitle(selectedArea);
  const activeFilterSummary = [activeCategory, ...activeQuickFilters].join(" · ");
  const visibleHomeListings = listings.filter((listing) => {
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
    const quickFilterMatches = activeQuickFilters.every((filter) => {
      if (filter === "월세") {
        return listing.price.includes("월세");
      }

      if (filter === "전세") {
        return listing.price.includes("전세");
      }

      if (filter === "관리비 포함") {
        return listing.maintenanceFee !== "15만원";
      }

      if (filter === "반려동물") {
        return listing.tags.includes("반려동물");
      }

      return listing.tags.includes(filter);
    });

    return categoryMatches && quickFilterMatches;
  });
  const visibleHomeCount = visibleHomeListings.length;
  const mapFilterSummary = getMapFilterSummary(activeMapFilter);
  const visibleMapListings = [...mapListings]
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
  const selectedMapListing = visibleMapListings.find((listing) => listing.listingIndex === selectedMapListingIndex) ?? visibleMapListings[0];

  const viewedListings = viewedListingNos
    .map((listingNo) => listings.find((listing) => listing.listingNo === listingNo))
    .filter((listing): listing is Listing => Boolean(listing));

  const openListing = (listing: Listing) => {
    setSelectedListing(listing);
    setViewedListingNos((current) => [listing.listingNo, ...current.filter((no) => no !== listing.listingNo)].slice(0, 4));
    resetWindowScrollSoon();
  };

  const submitInquiry = (payload: { listingTitle: string; broker: string; message: string; visitTime: string }) => {
    const id = Date.now();

    setInquiries((current) => [{ id, ...payload, status: "답변 대기" as InquiryStatus, time: "방금" }, ...current]);
    window.setTimeout(() => {
      setInquiries((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, status: "답변 완료" as InquiryStatus, reply: `네, 거래 가능합니다. ${payload.visitTime} 방문 괜찮습니다.` }
            : item
        )
      );
    }, 6000);
  };

  const activateTab = (tab: AppTab) => {
    setAuthMode(null);
    setActiveTab(tab);
    resetWindowScrollSoon();
  };

  const openAuthScreen = (mode: AuthMode) => {
    setAuthMode(mode);
    setSelectedListing(null);
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

    if (auth) {
      setAuthMode(auth);
      setSelectedListing(null);
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      resetWindowScrollSoon();
    } else if (role) {
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
    }
    setIsRouteReady(true);
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

  const protectedConfig =
    activeTab === "mypage" && (activeRole === "tenant" || activeRole === "landlord")
      ? protectedRoleConfig[activeRole]
      : null;
  const isProtectedRolePage = Boolean(protectedConfig);
  const canAccessProtectedRolePage =
    !protectedConfig || isDevRolePreview || (viewer?.role === protectedConfig.sessionRole);

  useEffect(() => {
    if (!isRouteReady || !isAuthChecked || !protectedConfig || canAccessProtectedRolePage) return;

    window.location.href = `${protectedConfig.loginPath}?redirectTo=${encodeURIComponent(protectedConfig.redirectTo)}`;
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

  const navigateRoleHome = (role: AppRole) => {
    const target = roleSwitchOptions.find((item) => item.id === role);
    if (!target) return;

    setIsDevRolePreview(true);
    setActiveRole(role);
    setActiveTab(role === "seeker" ? "home" : "mypage");
    window.history.pushState(null, "", target.href);
    resetWindowScrollSoon();
  };

  if (authMode) {
    return <LoginScreen mode={authMode} setActiveRole={startRoleSession} onAuthenticated={completeServiceAuth} />;
  }

  if (isProtectedRolePage && (!isAuthChecked || !canAccessProtectedRolePage)) {
    return (
      <main className="app-canvas">
        <section className="auth-check-screen" aria-live="polite">
          <strong>로그인 확인 중</strong>
          <span>세입자/임대인 페이지는 로그인 후 접속할 수 있습니다.</span>
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
              <button type="button" onClick={() => activateTab("map")}>지도</button>
              <button type="button" onClick={() => activateTab("map")}>분양</button>
              <button type="button" onClick={() => activateTab("saved")}>관심목록</button>
              <button type="button" onClick={() => activateTab("mypage")}>우리집</button>
            </nav>
            <div className="web-topbar-actions">
              <label className="web-role-select">
                <span>역할군</span>
                <select value={activeRole} onChange={(event) => navigateRoleHome(event.target.value as AppRole)}>
                  {roleSwitchOptions.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
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
            <Search size={20} strokeWidth={2.4} aria-hidden="true" />
            <input defaultValue="" placeholder="지역, 지하철, 건물명 검색" onFocus={() => setIsSearchSheetOpen(true)} />
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
                        <Image src={listing.image} alt={`${listing.title} 사진`} width={1200} height={800} />
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
                      <button type="button" onClick={() => activateTab("inquiry")}>문자문의</button>
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
            <NaverMapPreview className="map-stage" />
            {selectedMapListing ? (
              <article className="map-selected-card" aria-label="지도 선택 매물">
                <button type="button" onClick={() => openListing(listings[selectedMapListing.listingIndex])}>
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
                <strong>39개</strong>
              </article>
              <article>
                <span>3D 가능</span>
                <strong>12개</strong>
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
                    <article className="map-listing" key={listing.title}>
                      <button
                        className={selectedMapListing?.listingIndex === listing.listingIndex ? "map-listing-action active" : "map-listing-action"}
                        type="button"
                        onFocus={() => setSelectedMapListingIndex(listing.listingIndex)}
                        onMouseEnter={() => setSelectedMapListingIndex(listing.listingIndex)}
                        onClick={() => {
                          setSelectedMapListingIndex(listing.listingIndex);
                          openListing(listings[listing.listingIndex]);
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
                        className={savedListingNos.includes(listings[listing.listingIndex].listingNo) ? "saved" : ""}
                        type="button"
                        aria-label={`${listing.title} 저장`}
                        onClick={() => toggleSavedListing(listings[listing.listingIndex].listingNo)}
                      >
                        <Heart size={20} fill={savedListingNos.includes(listings[listing.listingIndex].listingNo) ? "currentColor" : "none"} strokeWidth={2.4} aria-hidden="true" />
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
          <InquiryHubSection inquiries={inquiries} onBrowseListings={() => activateTab("home")} />
        ) : null}
        {activeTab === "mypage" && activeRole === "landlord" ? (
          <LandlordMyPage onSwitchRole={() => openAuthScreen("login")} onGoHome={() => activateTab("home")} />
        ) : null}
        {activeTab === "mypage" && activeRole === "tenant" ? (
          <TenantMyPage
            onSwitchRole={() => openAuthScreen("login")}
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
            onSwitchRole={() => openAuthScreen("login")}
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
      </div>
    </main>
  );
}
