// 매물 카탈로그 공용 모듈 — 홈 SPA(page.tsx)와 매물 상세 라우트(/listing/[id])가 같은
// 데모 매물·타입·투영 함수를 쓴다. 상세 라우트 분리(1단계)로 page.tsx에서 추출했다.
import type { ListingFloorPlan3D } from "../app/_components/ListingTourRoom3D";

export const demoListings = [
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
export type Listing = (typeof demoListings)[number] & {
  lat?: number;
  lng?: number;
  has3DTour?: boolean;
  floorPlan3D?: ListingFloorPlan3D;
};

// 서버(집주인 직접등록) 매물 — /api/trade/listings 응답 형태
export type TradeListing = {
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

export const TRADE_LISTING_NO_PREFIX = "TRADE-";

export function tradePriceLabel(listing: TradeListing): string {
  if (listing.tradeType === "월세") return `월세 ${listing.depositManwon}/${listing.monthlyRentManwon}`;
  if (listing.tradeType === "전세") return `전세 ${listing.depositManwon.toLocaleString("ko-KR")}만`;
  return `매매 ${listing.depositManwon.toLocaleString("ko-KR")}만`;
}

// 직접등록 매물을 홈 카드/상세가 쓰는 쇼케이스 매물 형태로 투영한다.
// 미확인 값은 "확인 중"으로 두고, 문의는 listingNo의 TRADE- 접두어로 서버 매물임을 식별한다.
export function tradeListingToCard(listing: TradeListing): Listing {
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

export const getListingPriceRows = (listing: Listing) => {
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

export const getListingBuildingRows = (listing: Listing) => [
  ["건물유형", listing.roomType],
  ["면적", listing.sizeLabel],
  ["해당층/전체층", listing.floorLabel],
  ["주차", listing.tags.includes("주차") ? "가능" : "문의"],
  ["난방", "개별난방"],
  ["엘리베이터", listing.floorLabel.includes("/") ? "있음" : "문의"]
];

// 업로드 사진은 절대 URL(API 정적서빙/S3) — next/image 최적화기는 사설 IP(dev의 localhost/api)를
// 차단하므로 절대 URL 사진은 unoptimized로 브라우저가 직접 로드하게 한다(번들 목업은 그대로 최적화).
export const isRemotePhoto = (src: string) => /^https?:\/\//.test(src);

// 상세 화면 고정 데모 데이터 — 안심 리포트/옵션/주변 정보(실데이터 연동 전 껍데기)
export const safetyReportItems = [
  { label: "등기 변동", value: "최근 변동 없음", status: "안전" },
  { label: "보증금 비율", value: "권장 범위", status: "양호" },
  { label: "대출·특약", value: "방문 시 확인", status: "확인" },
  { label: "주변 치안", value: "야간 동선 양호", status: "양호" }
];

export const optionItems = ["에어컨", "세탁기", "냉장고", "인덕션", "붙박이장", "CCTV"];

export const neighborhoodItems = [
  { label: "편의점", value: "4곳" },
  { label: "지하철", value: "도보 5분" },
  { label: "치안센터", value: "1곳" },
  { label: "공원", value: "650m" }
];

// 지도 탭 데모 매물 마커/패널 아이템 — NaverMapPreview의 폴백 마커로도 쓰인다.
export const mapListings = [
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

// 지도 탭 패널·마커 공용 아이템 — 데모는 listingNo로 정규화하고, 직접등록 매물은 렌더 시 합류한다.
export type MapPanelItem = Omit<(typeof mapListings)[number], "listingIndex"> & { listingNo: string };

export const demoMapItems: MapPanelItem[] = mapListings.map(({ listingIndex, ...item }) => ({
  ...item,
  listingNo: demoListings[listingIndex].listingNo
}));

/** listingNo로 데모 매물을 찾는다 — 상세 라우트가 서버 매물이 아닐 때 사용. */
export function findDemoListing(listingNo: string): Listing | undefined {
  return demoListings.find((item) => item.listingNo === listingNo);
}
