// 통합 WOOZU 로그인 경로/리다이렉트 순수 로직.
// 원칙: 로그인은 계정 identity 확인만 하고, 룸로그 표면 접근은 계정에 연결된
// 주거 관계(capability)로 판단한다. intent는 "어느 표면으로 가려던 참이었나"일 뿐
// 로그인 자체를 역할별로 가르지 않는다.

export type UserRole = "SEEKER" | "TENANT" | "LANDLORD" | "VENDOR";
export type LoginIntent = "tenant" | "landlord" | "vendor";

export type SessionRoles = {
  role: string;
  roles?: string[];
};

export const LOGIN_PATH = "/login";

const intentByRole: Partial<Record<UserRole, LoginIntent>> = {
  TENANT: "tenant",
  LANDLORD: "landlord",
  VENDOR: "vendor"
};

const roleByIntent: Record<LoginIntent, UserRole> = {
  tenant: "TENANT",
  landlord: "LANDLORD",
  vendor: "VENDOR"
};

export function intentForRole(role?: UserRole): LoginIntent | undefined {
  return role ? intentByRole[role] : undefined;
}

export function roleForIntent(intent: LoginIntent): UserRole {
  return roleByIntent[intent];
}

export function normalizeLoginIntent(value: string | null | undefined): LoginIntent | undefined {
  if (value === "tenant" || value === "landlord" || value === "vendor") return value;
  return undefined;
}

export function safeRedirectPath(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

/** intent별 기본 도착지 — 기존 역할별 로그인 페이지의 성공 리다이렉트와 동일하게 유지. */
export function defaultRedirectForIntent(intent?: LoginIntent) {
  if (intent === "tenant") return "/living";
  if (intent === "landlord") return "/sell";
  if (intent === "vendor") return "/vendor/job/00";
  return "/";
}

export function unifiedLoginPath(intent?: LoginIntent, redirectTo?: string) {
  const params = new URLSearchParams();
  if (intent) params.set("intent", intent);
  if (redirectTo) params.set("redirectTo", redirectTo);
  const query = params.toString();
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
}

/** roles 배열(파생 capability)이 있으면 그걸 믿고, 없으면 legacy 단일 role로 폴백. */
export function hasCapability(user: SessionRoles, role: UserRole) {
  if (Array.isArray(user.roles)) return user.roles.includes(role);
  return user.role === role;
}

/** capability가 없을 때 해당 관계를 만드는 비보호 진입점 — 매물등록 폼 자체가
 *  LANDLORD 관계를 만드는 진입점이므로 landlord는 바로 /sell로 간다. */
const linkEntryPathByIntent: Record<LoginIntent, string> = {
  tenant: "/",
  landlord: "/sell",
  vendor: "/vendor/activate"
};

/**
 * 로그인(또는 이미 로그인된 세션 확인) 후 어디로 보낼 경로를 결정한다.
 * capability가 없어도 중간 안내 화면 없이 관계를 만드는 진입점으로 바로 보낸다.
 * 이때 redirectTo는 무시한다 — 보호 경로면 가드가 다시 /login으로 되돌려 루프가 된다.
 */
export function resolvePostLoginDestination(
  user: SessionRoles,
  intent?: LoginIntent,
  redirectTo?: string | null
): string {
  if (intent && !hasCapability(user, roleForIntent(intent))) {
    return linkEntryPathByIntent[intent];
  }

  return safeRedirectPath(redirectTo, defaultRedirectForIntent(intent));
}

type LegacySearchParams = Record<string, string | string[] | undefined>;

function firstParam(params: LegacySearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** 구 역할별 로그인 경로(/tenant/login 등) → 통합 /login 호환 redirect 대상. */
export function legacyLoginRedirectTarget(intent: LoginIntent, searchParams: LegacySearchParams) {
  const params = new URLSearchParams();
  params.set("intent", intent);

  const redirectTo = safeRedirectPath(firstParam(searchParams, "redirectTo"), "");
  if (redirectTo) params.set("redirectTo", redirectTo);

  const error = firstParam(searchParams, "error");
  if (error) params.set("error", error);

  return `${LOGIN_PATH}?${params.toString()}`;
}
