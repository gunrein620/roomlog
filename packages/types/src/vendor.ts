export type VendorVerificationStatus = "VERIFIED" | "PENDING" | "REJECTED";
export type VendorAccountRole = "OWNER";
export type VendorAccountLinkStatus = "ACTIVE" | "DISABLED";
export type VendorActivationStatus =
  | "ISSUED"
  | "CLAIMED"
  | "EXPIRED"
  | "REVOKED";
export type VendorAccountStatus = "LINKED" | "UNLINKED" | "DISABLED";

export interface VendorCatalogRecord {
  id: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  businessNumber?: string;
  trades: string[];
  serviceAreas: string[];
  verificationStatus: VendorVerificationStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorAccountLinkRecord {
  id: string;
  vendorId: string;
  userId: string;
  role: VendorAccountRole;
  status: VendorAccountLinkStatus;
  linkedAt: string;
}

export interface VendorAccountView {
  vendor: VendorCatalogRecord;
  accountStatus: VendorAccountStatus;
  role?: VendorAccountRole;
}

export interface VendorActivationPreview {
  activationSessionExpiresAt: string;
  vendor: {
    vendorId: string;
    businessName: string;
    trades: string[];
    serviceAreas: string[];
    verificationStatus: VendorVerificationStatus;
    maskedPhone: string;
  };
}

/** API → server BFF only. The BFF stores activationSession in an HttpOnly cookie. */
export interface VendorActivationPreviewEnvelope {
  preview: VendorActivationPreview;
  activationSession: string;
}

export interface VendorActivationClaimResult {
  vendor: VendorAccountView;
  idempotent: boolean;
  nextPath: "/vendor/job/00";
}

export type VendorActivationErrorCode =
  | "INVALID_KEY"
  | "EXPIRED_KEY"
  | "UNAVAILABLE_VENDOR"
  | "ALREADY_CLAIMED"
  | "DEDICATED_ACCOUNT_REQUIRED"
  | "ACCOUNT_ALREADY_LINKED"
  | "ACTIVATION_UNAVAILABLE";

export interface VendorActivationErrorResponse {
  code: VendorActivationErrorCode;
  message: string;
}

const VENDOR_CATEGORY_TO_TRADE: Readonly<Record<string, string>> = {
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
  "창호": "general",
};

const VENDOR_TRADE_ALIASES: Readonly<Record<string, string>> = {
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
  "기타": "general",
};

function normalizeVendorTrade(value: string): string {
  return value.trim().toLocaleLowerCase("ko").replace(/\s+/g, "");
}

/** Product-owned deterministic category mapping shared by API and manager UI. */
export function requiredVendorTrade(category: string): string {
  const normalized = normalizeVendorTrade(category);
  return VENDOR_CATEGORY_TO_TRADE[normalized] ?? "general";
}

export function vendorSupportsRequiredTrade(
  vendorTrades: readonly string[],
  requiredTrade: string,
): boolean {
  const normalizedRequired = normalizeVendorTrade(requiredTrade);
  const canonicalRequired = VENDOR_TRADE_ALIASES[normalizedRequired] ?? normalizedRequired;
  return vendorTrades.some((trade) => {
    const normalizedTrade = normalizeVendorTrade(trade);
    return (VENDOR_TRADE_ALIASES[normalizedTrade] ?? normalizedTrade) === canonicalRequired;
  });
}
