// 가상 매물 시드 데이터 + 스키마.
// 실사용 서비스가 아니므로 등기·실소유 검증 필드는 생략하고, 화면상 "진짜 서비스"처럼
// 보이는 데 필요한 8개 그룹을 채운다. 좌표(lat/lng)·법정동코드(lawdCd)·tourId를 포함해
// 지도 핀 / MOLIT 시세 매칭 / 팀원 3D 투어 연결이 바로 되도록 한다.

export type TradeType = "월세" | "전세" | "매매";
export type PropertyKind = "원룸" | "투룸" | "쓰리룸" | "오피스텔" | "아파트" | "빌라";

export type Listing = {
  // 1. 기본/식별
  id: string; // 매물번호
  title: string;
  headline: string;
  registeredAt: string; // ISO date
  status: "거래중" | "거래완료";
  viewCount: number;

  // 2. 거래 조건
  tradeType: TradeType;
  depositManwon: number; // 보증금(만원)
  monthlyRentManwon: number; // 월세(만원) — 전세/매매면 0
  salePriceManwon: number; // 매매가(만원) — 매매가 아니면 0
  maintenanceManwon: number; // 관리비(만원)
  maintenanceIncludes: string[]; // 관리비 포함 내역
  loanManwon: number; // 융자금(만원)
  availableFrom: string; // 입주가능일 ("즉시" 또는 yyyy-mm-dd)
  contractMonths: number; // 계약기간(개월)

  // 3. 건물/공간
  kind: PropertyKind;
  areaExclusiveM2: number; // 전용면적
  areaSupplyM2: number; // 공급면적
  floor: number;
  totalFloors: number;
  rooms: number; // 방 수
  bathrooms: number; // 욕실 수
  direction: string; // 방향(향)
  buildYear: number;
  parking: boolean;
  elevator: boolean;
  heating: string; // 난방방식

  // 4. 위치
  address: string; // 도로명주소
  jibunAddress: string; // 지번주소
  dong: string;
  lawdCd: string; // 법정동 시군구 코드 → MOLIT 시세 매칭
  lat: number;
  lng: number;
  nearestStation: string; // 인근 역
  walkMinutes: number; // 도보 분

  // 5. 옵션/특징
  options: string[];
  petsAllowed: boolean;
  tags: string[];

  // 6. 미디어 / 3D
  coverImage: string;
  gallery: string[];
  tourId: string | null; // 팀원 3D 투어 연결점

  // 7. 등록자/중개
  registrantType: "집주인" | "중개사";
  brokerName: string;
  contactPhone: string;
  responseMinutes: number; // 평균 응답(분)

  // 8. 신뢰/검증
  verified: boolean; // 확인매물 여부
  reviewStatus: string; // 검수상태
  safetyScore: number; // 안심점수(0~100)
};

export const LISTINGS: Listing[] = [
  {
    id: "57804322",
    title: "방배 루미에르 402호",
    headline: "전입OK 신축원룸 정말 깔끔해요 수납 굿",
    registeredAt: "2026-06-30",
    status: "거래중",
    viewCount: 21,
    tradeType: "월세",
    depositManwon: 1000,
    monthlyRentManwon: 130,
    salePriceManwon: 0,
    maintenanceManwon: 10,
    maintenanceIncludes: ["수도", "인터넷", "청소"],
    loanManwon: 0,
    availableFrom: "즉시",
    contractMonths: 24,
    kind: "오피스텔",
    areaExclusiveM2: 24.5,
    areaSupplyM2: 41.3,
    floor: 4,
    totalFloors: 16,
    rooms: 1,
    bathrooms: 1,
    direction: "남향",
    buildYear: 2021,
    parking: true,
    elevator: true,
    heating: "개별난방",
    address: "서울특별시 서초구 방배로 103",
    jibunAddress: "서울특별시 서초구 방배동 103-8",
    dong: "방배동",
    lawdCd: "11650",
    lat: 37.4816,
    lng: 126.9971,
    nearestStation: "내방역",
    walkMinutes: 5,
    options: ["에어컨", "세탁기", "냉장고", "인덕션", "붙박이장"],
    petsAllowed: false,
    tags: ["신축", "주차", "풀옵션", "보안/안전", "큰길가"],
    coverImage: "/listing-studio.jpg",
    gallery: ["/listing-studio.jpg", "/listing-bedroom.jpg", "/listing-loft.jpg", "/room-sunlit.png"],
    tourId: "tour-57804322",
    registrantType: "중개사",
    brokerName: "내방역 푸른공인중개사",
    contactPhone: "02-533-1004",
    responseMinutes: 8,
    verified: true,
    reviewStatus: "오늘 현장확인",
    safetyScore: 92
  },
  {
    id: "57804323",
    title: "성수 어반 스튜디오",
    headline: "서울숲 가까운 복층 스튜디오 반려동물 가능",
    registeredAt: "2026-07-01",
    status: "거래중",
    viewCount: 34,
    tradeType: "월세",
    depositManwon: 800,
    monthlyRentManwon: 80,
    salePriceManwon: 0,
    maintenanceManwon: 12,
    maintenanceIncludes: ["수도", "인터넷", "청소", "공용전기"],
    loanManwon: 0,
    availableFrom: "2026-08-01",
    contractMonths: 12,
    kind: "원룸",
    areaExclusiveM2: 32.2,
    areaSupplyM2: 49.6,
    floor: 5,
    totalFloors: 9,
    rooms: 1,
    bathrooms: 1,
    direction: "남동향",
    buildYear: 2019,
    parking: false,
    elevator: true,
    heating: "개별난방",
    address: "서울특별시 성동구 서울숲2길 18",
    jibunAddress: "서울특별시 성동구 성수동1가 685",
    dong: "성수동",
    lawdCd: "11200",
    lat: 37.5445,
    lng: 127.0559,
    nearestStation: "서울숲역",
    walkMinutes: 9,
    options: ["에어컨", "세탁기", "냉장고", "인덕션"],
    petsAllowed: true,
    tags: ["복층", "반려동물", "역세권", "채광", "현장촬영"],
    coverImage: "/listing-loft.jpg",
    gallery: ["/listing-loft.jpg", "/listing-studio.jpg", "/listing-bedroom.jpg", "/building-premium.png"],
    tourId: "tour-57804323",
    registrantType: "중개사",
    brokerName: "성수온도공인중개사",
    contactPhone: "02-462-7788",
    responseMinutes: 5,
    verified: true,
    reviewStatus: "중개사 검수",
    safetyScore: 88
  },
  {
    id: "57804324",
    title: "역삼 스카이 테라스",
    headline: "강남역 생활권 고층 오피스텔 전망 좋은 방",
    registeredAt: "2026-07-02",
    status: "거래중",
    viewCount: 48,
    tradeType: "전세",
    depositManwon: 46000,
    monthlyRentManwon: 0,
    salePriceManwon: 0,
    maintenanceManwon: 15,
    maintenanceIncludes: ["수도", "인터넷", "청소", "경비"],
    loanManwon: 0,
    availableFrom: "협의",
    contractMonths: 24,
    kind: "오피스텔",
    areaExclusiveM2: 30.0,
    areaSupplyM2: 52.8,
    floor: 14,
    totalFloors: 20,
    rooms: 1,
    bathrooms: 1,
    direction: "남서향",
    buildYear: 2020,
    parking: true,
    elevator: true,
    heating: "지역난방",
    address: "서울특별시 강남구 테헤란로 152",
    jibunAddress: "서울특별시 강남구 역삼동 737",
    dong: "역삼동",
    lawdCd: "11680",
    lat: 37.5006,
    lng: 127.0366,
    nearestStation: "강남역",
    walkMinutes: 7,
    options: ["에어컨", "세탁기", "냉장고", "인덕션", "붙박이장", "CCTV"],
    petsAllowed: false,
    tags: ["고층", "보안/안전", "큰길가", "엘리베이터", "주차"],
    coverImage: "/listing-bedroom.jpg",
    gallery: ["/listing-bedroom.jpg", "/listing-building.jpg", "/listing-studio.jpg", "/listing-loft.jpg"],
    tourId: "tour-57804324",
    registrantType: "중개사",
    brokerName: "강남역 스카이부동산",
    contactPhone: "02-501-2200",
    responseMinutes: 12,
    verified: true,
    reviewStatus: "서류 확인",
    safetyScore: 96
  },
  {
    id: "57804325",
    title: "방배 그린힐 202호",
    headline: "조용한 주택가 투룸 신혼부부 추천 채광 좋음",
    registeredAt: "2026-06-28",
    status: "거래중",
    viewCount: 17,
    tradeType: "월세",
    depositManwon: 3000,
    monthlyRentManwon: 95,
    salePriceManwon: 0,
    maintenanceManwon: 7,
    maintenanceIncludes: ["수도", "청소"],
    loanManwon: 0,
    availableFrom: "즉시",
    contractMonths: 24,
    kind: "투룸",
    areaExclusiveM2: 44.0,
    areaSupplyM2: 59.5,
    floor: 2,
    totalFloors: 5,
    rooms: 2,
    bathrooms: 1,
    direction: "남향",
    buildYear: 2016,
    parking: true,
    elevator: false,
    heating: "개별난방",
    address: "서울특별시 서초구 방배중앙로 45",
    jibunAddress: "서울특별시 서초구 방배동 892-3",
    dong: "방배동",
    lawdCd: "11650",
    lat: 37.4842,
    lng: 126.9938,
    nearestStation: "방배역",
    walkMinutes: 8,
    options: ["에어컨", "냉장고", "인덕션", "붙박이장"],
    petsAllowed: true,
    tags: ["투룸", "채광", "주차", "조용한", "반려동물"],
    coverImage: "/listing-bedroom.jpg",
    gallery: ["/listing-bedroom.jpg", "/listing-studio.jpg", "/room-sunlit.png", "/listing-loft.jpg"],
    tourId: null,
    registrantType: "집주인",
    brokerName: "직접 등록",
    contactPhone: "010-2345-6789",
    responseMinutes: 20,
    verified: false,
    reviewStatus: "검수 대기",
    safetyScore: 80
  },
  {
    id: "57804326",
    title: "성수 팩토리 로프트",
    headline: "성수 카페거리 감성 복층 리모델링 완료",
    registeredAt: "2026-06-25",
    status: "거래중",
    viewCount: 61,
    tradeType: "월세",
    depositManwon: 2000,
    monthlyRentManwon: 150,
    salePriceManwon: 0,
    maintenanceManwon: 15,
    maintenanceIncludes: ["수도", "인터넷", "청소", "공용전기"],
    loanManwon: 0,
    availableFrom: "즉시",
    contractMonths: 12,
    kind: "오피스텔",
    areaExclusiveM2: 39.5,
    areaSupplyM2: 61.0,
    floor: 3,
    totalFloors: 7,
    rooms: 1,
    bathrooms: 1,
    direction: "동향",
    buildYear: 2022,
    parking: true,
    elevator: true,
    heating: "개별난방",
    address: "서울특별시 성동구 연무장길 33",
    jibunAddress: "서울특별시 성동구 성수동2가 302",
    dong: "성수동",
    lawdCd: "11200",
    lat: 37.5423,
    lng: 127.0567,
    nearestStation: "성수역",
    walkMinutes: 6,
    options: ["에어컨", "세탁기", "냉장고", "인덕션", "붙박이장"],
    petsAllowed: true,
    tags: ["신축급", "복층", "역세권", "리모델링", "반려동물"],
    coverImage: "/listing-loft.jpg",
    gallery: ["/listing-loft.jpg", "/building-premium.png", "/listing-studio.jpg", "/listing-bedroom.jpg"],
    tourId: "tour-57804326",
    registrantType: "중개사",
    brokerName: "성수온도공인중개사",
    contactPhone: "02-462-7788",
    responseMinutes: 6,
    verified: true,
    reviewStatus: "오늘 현장확인",
    safetyScore: 90
  },
  {
    id: "57804327",
    title: "역삼 센트럴 원룸",
    headline: "강남 직장인 원룸 풀옵션 즉시입주 가능",
    registeredAt: "2026-07-01",
    status: "거래중",
    viewCount: 39,
    tradeType: "월세",
    depositManwon: 1000,
    monthlyRentManwon: 70,
    salePriceManwon: 0,
    maintenanceManwon: 9,
    maintenanceIncludes: ["수도", "인터넷"],
    loanManwon: 0,
    availableFrom: "즉시",
    contractMonths: 12,
    kind: "원룸",
    areaExclusiveM2: 19.8,
    areaSupplyM2: 33.0,
    floor: 6,
    totalFloors: 12,
    rooms: 1,
    bathrooms: 1,
    direction: "서향",
    buildYear: 2017,
    parking: false,
    elevator: true,
    heating: "개별난방",
    address: "서울특별시 강남구 역삼로 205",
    jibunAddress: "서울특별시 강남구 역삼동 649",
    dong: "역삼동",
    lawdCd: "11680",
    lat: 37.4989,
    lng: 127.0342,
    nearestStation: "역삼역",
    walkMinutes: 4,
    options: ["에어컨", "세탁기", "냉장고", "인덕션", "붙박이장"],
    petsAllowed: false,
    tags: ["풀옵션", "역세권", "즉시입주", "보안/안전"],
    coverImage: "/listing-studio.jpg",
    gallery: ["/listing-studio.jpg", "/listing-bedroom.jpg", "/room-sunlit.png", "/listing-loft.jpg"],
    tourId: "tour-57804327",
    registrantType: "중개사",
    brokerName: "강남역 스카이부동산",
    contactPhone: "02-501-2200",
    responseMinutes: 10,
    verified: true,
    reviewStatus: "중개사 검수",
    safetyScore: 91
  }
];

export function findListing(id: string): Listing | undefined {
  return LISTINGS.find((listing) => listing.id === id);
}
