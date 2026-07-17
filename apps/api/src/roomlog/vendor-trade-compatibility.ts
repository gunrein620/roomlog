// API runtime은 @roomlog/types의 TS 소스 export를 직접 require하지 않는다.
// 아래 제품 매핑은 웹 공유 계약과 동일하며, API 기동 환경에서도 순수 JS로 emit된다.
const CATEGORY_TO_TRADE: Readonly<Record<string, string>> = {
  "냉난방": "hvac",
  "에어컨": "hvac",
  "보일러": "hvac",
  "배관/수전": "plumbing",
  "배관": "plumbing",
  "수전": "plumbing",
  "누수": "plumbing",
  "전기": "electrical",
  "출입/보안": "locksmith",
  "도어락": "locksmith",
  "출입문": "locksmith",
  "방수": "waterproofing",
  "청소": "cleaning",
  "곰팡이": "cleaning",
  "가전": "appliance",
  "창호": "general"
};

const TRADE_ALIASES: Readonly<Record<string, string>> = {
  hvac: "hvac",
  "냉난방": "hvac",
  "에어컨": "hvac",
  "보일러": "hvac",
  "난방": "hvac",
  plumbing: "plumbing",
  "배관": "plumbing",
  "수전": "plumbing",
  "누수": "plumbing",
  electrical: "electrical",
  "전기": "electrical",
  locksmith: "locksmith",
  "출입/보안": "locksmith",
  "도어락": "locksmith",
  "출입문": "locksmith",
  waterproofing: "waterproofing",
  "방수": "waterproofing",
  cleaning: "cleaning",
  "청소": "cleaning",
  "곰팡이": "cleaning",
  appliance: "appliance",
  "가전": "appliance",
  general: "general",
  "창호": "general",
  "종합": "general",
  "기타": "general"
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ko").replace(/\s+/g, "");
}

export function requiredVendorTrade(category: string) {
  return suggestedVendorTrade(category) ?? "general";
}

export function suggestedVendorTrade(category: string) {
  return CATEGORY_TO_TRADE[normalize(category)];
}

export function vendorSupportsRequiredTrade(
  vendorTrades: readonly string[],
  requiredTrade: string
) {
  const normalizedRequired = normalize(requiredTrade);
  const canonicalRequired = TRADE_ALIASES[normalizedRequired] ?? normalizedRequired;
  return vendorTrades.some((trade) => {
    const normalizedTrade = normalize(trade);
    return (TRADE_ALIASES[normalizedTrade] ?? normalizedTrade) === canonicalRequired;
  });
}
