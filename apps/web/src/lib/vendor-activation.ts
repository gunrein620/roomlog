import type {
  VendorActivationClaimResult,
  VendorActivationErrorCode,
  VendorActivationErrorResponse,
  VendorActivationPreview,
} from "@roomlog/types";
import { AUTH_COOKIE } from "./auth-cookie";

export const VENDOR_ACTIVATION_DEFAULT_PATH = "/vendor/activate";

export function safeVendorReturnPath(
  value: string | null | undefined,
  fallback = VENDOR_ACTIVATION_DEFAULT_PATH,
) {
  return value && /^\/vendor(?:\/[A-Za-z0-9_-]+)*\/?$/.test(value) ? value : fallback;
}

export function formatVendorActivationKeyInput(value: string) {
  return value.trim().toUpperCase().replace(/[\t\n\r ]+/g, "-").replace(/-+/g, "-");
}

export function hasHousingCapability(user: { role: string; roles?: string[] }) {
  const roles = Array.isArray(user.roles) ? user.roles : [user.role];
  return roles.includes("TENANT") || roles.includes("LANDLORD");
}

export interface VendorActivationCookieStore {
  get(name: string): { value: string } | undefined;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Dependencies = { endpoint: string; fetcher?: Fetcher };
type ClaimDependencies = Dependencies & { cookieStore: VendorActivationCookieStore };

const activationErrorCopy: Record<VendorActivationErrorCode, string> = {
  INVALID_KEY: "등록 키를 확인하고 다시 입력해 주세요.",
  EXPIRED_KEY: "등록 키 유효기간이 지났습니다. 새 키를 받아 다시 입력해 주세요.",
  UNAVAILABLE_VENDOR: "현재 활성화할 수 없는 업체입니다. 운영 담당자에게 확인해 주세요.",
  ALREADY_CLAIMED: "이미 사용된 등록 키입니다. 기존 업체 계정으로 로그인하거나 운영 담당자에게 문의해 주세요.",
  DEDICATED_ACCOUNT_REQUIRED: "세입자·관리자 계정은 연결할 수 없습니다. 업체 전용 계정으로 다시 로그인해 주세요.",
  ACCOUNT_ALREADY_LINKED: "이 계정은 이미 다른 업체에 연결되어 있습니다. 다른 업체 전용 계정으로 로그인해 주세요.",
  ACTIVATION_UNAVAILABLE: "업체 계정 연결을 잠시 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPreview(value: unknown): value is VendorActivationPreview {
  if (!isRecord(value) || !isRecord(value.vendor)) return false;
  const vendor = value.vendor;
  return (
    isNonEmptyString(vendor.businessName) &&
    Array.isArray(vendor.trades) && vendor.trades.every(isNonEmptyString) &&
    Array.isArray(vendor.serviceAreas) && vendor.serviceAreas.every(isNonEmptyString) &&
    ["VERIFIED", "PENDING", "REJECTED"].includes(String(vendor.verificationStatus)) &&
    isNonEmptyString(vendor.maskedPhone)
  );
}

function isClaimResult(value: unknown): value is VendorActivationClaimResult {
  return (
    isRecord(value) &&
    value.nextPath === "/vendor/job/00" &&
    isRecord(value.vendor) &&
    value.vendor.accountStatus === "LINKED" &&
    isRecord(value.vendor.vendor) &&
    isNonEmptyString(value.vendor.vendor.id)
  );
}

function activationErrorCode(value: unknown) {
  return isRecord(value) ? value.code : undefined;
}

function isActivationErrorCode(value: unknown): value is VendorActivationErrorCode {
  return typeof value === "string" && value in activationErrorCopy;
}

export function vendorActivationErrorMessage(code: unknown, status?: number) {
  if (isActivationErrorCode(code)) return activationErrorCopy[code];
  if (status === 401) return "업체 전용 계정으로 로그인한 뒤 다시 진행해 주세요.";
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

async function safeJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

function errorResponse(status: number, code?: unknown) {
  return Response.json(
    { message: vendorActivationErrorMessage(code, status) } satisfies Pick<VendorActivationErrorResponse, "message">,
    { status },
  );
}

async function activationKey(request: Request) {
  const body = await request.json().catch(() => undefined);
  return isRecord(body) && typeof body.key === "string" ? body.key : "";
}

export async function handleVendorActivationPreviewRequest(
  request: Request,
  dependencies: Dependencies,
) {
  const key = await activationKey(request);
  if (!key.trim()) return errorResponse(400, "INVALID_KEY");
  let upstream: Response;
  try {
    upstream = await (dependencies.fetcher ?? fetch)(dependencies.endpoint, {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
  } catch {
    return errorResponse(503, "ACTIVATION_UNAVAILABLE");
  }
  const body = await safeJson(upstream);
  if (!upstream.ok) return errorResponse(upstream.status, activationErrorCode(body));
  return isPreview(body) ? Response.json(body) : errorResponse(502);
}

export async function handleVendorActivationClaimRequest(
  request: Request,
  dependencies: ClaimDependencies,
) {
  const authSession = dependencies.cookieStore.get(AUTH_COOKIE)?.value;
  if (!authSession) return errorResponse(401);
  const key = await activationKey(request);
  if (!key.trim()) return errorResponse(400, "INVALID_KEY");
  let upstream: Response;
  try {
    upstream = await (dependencies.fetcher ?? fetch)(dependencies.endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${authSession}`,
      },
      body: JSON.stringify({ key }),
    });
  } catch {
    return errorResponse(503, "ACTIVATION_UNAVAILABLE");
  }
  const body = await safeJson(upstream);
  if (!upstream.ok) return errorResponse(upstream.status, activationErrorCode(body));
  return isClaimResult(body) ? Response.json({ nextPath: body.nextPath }) : errorResponse(502);
}
