import type {
  VendorActivationClaimResult,
  VendorActivationErrorCode,
  VendorActivationErrorResponse,
  VendorActivationPreview,
  VendorActivationPreviewEnvelope
} from "@roomlog/types";
import { AUTH_COOKIE } from "./auth-cookie";

export const VENDOR_ACTIVATION_COOKIE = "roomlog_vendor_activation";
export const VENDOR_ACTIVATION_PREVIEW_STORAGE = "roomlog_vendor_activation_preview";
export const VENDOR_ACTIVATION_DEFAULT_PATH = "/vendor/activate";

export function vendorActivationCookieOptions(
  production = process.env.NODE_ENV === "production"
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: production,
    path: "/",
    maxAge: 300
  };
}

/**
 * Activation auth may return only to a plain path inside the vendor surface.
 * Query/hash fragments are deliberately rejected so a registration key can
 * never be smuggled through a browser-visible return URL.
 */
export function safeVendorReturnPath(
  value: string | null | undefined,
  fallback = VENDOR_ACTIVATION_DEFAULT_PATH
) {
  if (!value || !/^\/vendor(?:\/[A-Za-z0-9_-]+)*\/?$/.test(value)) return fallback;
  return value;
}

/** Keep user-entered groups readable while leaving final validation to the API. */
export function formatVendorActivationKeyInput(value: string) {
  return value.trim().toUpperCase().replace(/[\t\n\r ]+/g, "-").replace(/-+/g, "-");
}

export function hasHousingCapability(user: { role: string; roles?: string[] }) {
  const roles = Array.isArray(user.roles) ? user.roles : [user.role];
  return roles.includes("TENANT") || roles.includes("LANDLORD");
}

type CookieOptions = ReturnType<typeof vendorActivationCookieOptions>;

export interface VendorActivationCookieStore {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: CookieOptions): unknown;
  delete(name: string): unknown;
}

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type PreviewDependencies = {
  cookieStore: VendorActivationCookieStore;
  endpoint: string;
  fetcher?: Fetcher;
  flowIdFactory?: () => string;
  production?: boolean;
};

type ClaimDependencies = {
  cookieStore: VendorActivationCookieStore;
  endpoint: string;
  fetcher?: Fetcher;
};

const activationErrorCopy: Record<VendorActivationErrorCode, string> = {
  INVALID_KEY: "등록 키를 확인하고 다시 입력해 주세요.",
  EXPIRED_KEY: "등록 키 사용 시간이 지났습니다. 새 키를 받아 다시 입력해 주세요.",
  UNAVAILABLE_VENDOR: "현재 활성화할 수 없는 업체입니다. 운영 담당자에게 확인해 주세요.",
  ALREADY_CLAIMED: "이미 사용된 등록 키입니다. 기존 업체 계정으로 로그인하거나 운영 담당자에게 문의해 주세요.",
  DEDICATED_ACCOUNT_REQUIRED:
    "세입자·관리자 계정은 연결할 수 없습니다. 로그아웃한 뒤 다른 계정으로 로그인해 주세요. 업체 전용 계정이어야 합니다.",
  ACCOUNT_ALREADY_LINKED:
    "이 계정은 이미 다른 업체에 연결되어 있습니다. 다른 업체 전용 계정으로 로그인해 주세요.",
  ACTIVATION_UNAVAILABLE: "업체 계정 연결을 잠시 이용할 수 없습니다. 잠시 후 다시 시도해 주세요."
};

export interface VendorActivationBrowserPreview extends VendorActivationPreview {
  flowId: string;
}

type VendorActivationCookieEnvelope = {
  version: 1;
  flowId: string;
  activationSession: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isVerificationStatus(value: unknown) {
  return value === "VERIFIED" || value === "PENDING" || value === "REJECTED";
}

function isVendorActivationPreview(value: unknown): value is VendorActivationPreview {
  if (!isRecord(value) || !isRecord(value.vendor)) return false;

  return (
    isNonEmptyString(value.activationSessionExpiresAt) &&
    Number.isFinite(Date.parse(value.activationSessionExpiresAt)) &&
    isNonEmptyString(value.vendor.vendorId) &&
    isNonEmptyString(value.vendor.businessName) &&
    isStringArray(value.vendor.trades) &&
    isStringArray(value.vendor.serviceAreas) &&
    isVerificationStatus(value.vendor.verificationStatus) &&
    isNonEmptyString(value.vendor.maskedPhone)
  );
}

function isPreviewEnvelope(value: unknown): value is VendorActivationPreviewEnvelope {
  return (
    isRecord(value) &&
    isVendorActivationPreview(value.preview) &&
    isNonEmptyString(value.activationSession)
  );
}

function isClaimResult(value: unknown): value is VendorActivationClaimResult {
  return (
    isRecord(value) &&
    value.nextPath === "/vendor/job/00" &&
    typeof value.idempotent === "boolean" &&
    isRecord(value.vendor) &&
    value.vendor.accountStatus === "LINKED" &&
    isRecord(value.vendor.vendor) &&
    isNonEmptyString(value.vendor.vendor.id)
  );
}

function activationErrorCode(value: unknown) {
  return isRecord(value) ? value.code : undefined;
}

function isFlowId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

function encodeActivationCookie(envelope: VendorActivationCookieEnvelope) {
  return encodeURIComponent(JSON.stringify(envelope));
}

function decodeActivationCookie(value: string | undefined): VendorActivationCookieEnvelope | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !isFlowId(parsed.flowId) ||
      !isNonEmptyString(parsed.activationSession)
    ) {
      return undefined;
    }

    return {
      version: 1,
      flowId: parsed.flowId,
      activationSession: parsed.activationSession
    };
  } catch {
    return undefined;
  }
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
  const body: Pick<VendorActivationErrorResponse, "message"> = {
    message: vendorActivationErrorMessage(code, status)
  };
  return Response.json(body, { status });
}

export async function handleVendorActivationPreviewRequest(
  request: Request,
  dependencies: PreviewDependencies
) {
  const requestBody = (await request.json().catch(() => undefined)) as
    | { key?: unknown }
    | undefined;
  const key = typeof requestBody?.key === "string" ? requestBody.key : "";
  if (!key.trim()) return errorResponse(400, "INVALID_KEY");

  const fetcher = dependencies.fetcher ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetcher(dependencies.endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ key })
    });
  } catch {
    return errorResponse(503, "ACTIVATION_UNAVAILABLE");
  }

  const body = (await safeJson(upstream)) as
    | VendorActivationPreviewEnvelope
    | VendorActivationErrorResponse
    | undefined;
  if (!upstream.ok) {
    return errorResponse(upstream.status, activationErrorCode(body));
  }

  if (!isPreviewEnvelope(body)) {
    return errorResponse(502);
  }

  const flowId = (dependencies.flowIdFactory ?? (() => crypto.randomUUID()))();
  if (!isFlowId(flowId)) return errorResponse(502);

  dependencies.cookieStore.set(
    VENDOR_ACTIVATION_COOKIE,
    encodeActivationCookie({
      version: 1,
      flowId,
      activationSession: body.activationSession
    }),
    vendorActivationCookieOptions(dependencies.production)
  );
  return Response.json({ ...body.preview, flowId } satisfies VendorActivationBrowserPreview);
}

export async function handleVendorActivationClaimRequest(
  request: Request,
  dependencies: ClaimDependencies
) {
  const authSession = dependencies.cookieStore.get(AUTH_COOKIE)?.value;
  if (!authSession) return errorResponse(401);

  const requestBody = (await request.json().catch(() => undefined)) as
    | { flowId?: unknown }
    | undefined;
  const flowId = requestBody?.flowId;
  if (!isFlowId(flowId)) {
    return Response.json(
      { message: "업체 확인 정보가 없습니다. 등록 키부터 다시 확인해 주세요." },
      { status: 409 }
    );
  }

  const activation = decodeActivationCookie(
    dependencies.cookieStore.get(VENDOR_ACTIVATION_COOKIE)?.value
  );
  if (!activation) return errorResponse(410, "EXPIRED_KEY");
  if (activation.flowId !== flowId) {
    return Response.json(
      { message: "업체 확인 정보가 바뀌었습니다. 등록 키부터 다시 확인해 주세요." },
      { status: 409 }
    );
  }

  const fetcher = dependencies.fetcher ?? fetch;
  let upstream: Response;
  try {
    upstream = await fetcher(dependencies.endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${authSession}`
      },
      body: JSON.stringify({ activationSession: activation.activationSession })
    });
  } catch {
    return errorResponse(503, "ACTIVATION_UNAVAILABLE");
  }

  const body = (await safeJson(upstream)) as
    | VendorActivationClaimResult
    | VendorActivationErrorResponse
    | undefined;
  if (!upstream.ok) {
    return errorResponse(upstream.status, activationErrorCode(body));
  }

  if (!isClaimResult(body)) {
    return errorResponse(502);
  }

  dependencies.cookieStore.delete(VENDOR_ACTIVATION_COOKIE);
  return Response.json({ nextPath: body.nextPath });
}
