export {
  defaultRedirectForRole,
  loginPathForRole,
  publicOrigin,
  publicUrl,
  redirectToPathWithError,
  redirectToLoginWithError,
  runtimeEnv,
  safeRedirectPath,
  SOCIAL_SIGNUP_REQUIRED
} from "../google/_shared";

import {
  defaultRedirectForRole,
  loginPathForRole,
  publicOrigin,
  safeRedirectPath
} from "../google/_shared";

export const KAKAO_OAUTH_STATE_COOKIE = "roomlog_kakao_oauth_state";
export const KAKAO_OAUTH_CONTEXT_COOKIE = "roomlog_kakao_oauth_context";

export type KakaoOauthRole = "SEEKER" | "TENANT" | "LANDLORD" | "VENDOR";
export type KakaoOauthFlow = "login" | "signup";

export type KakaoOauthContext = {
  role: KakaoOauthRole;
  flow: KakaoOauthFlow;
  redirectTo: string;
  errorRedirectTo?: string;
  inviteToken?: string;
};

export const kakaoOauthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 10
};

export function normalizeKakaoOauthRole(value: string | null): KakaoOauthRole {
  if (value === "SEEKER" || value === "LANDLORD" || value === "VENDOR" || value === "TENANT") return value;
  return "SEEKER";
}

export function normalizeKakaoOauthFlow(value: string | null): KakaoOauthFlow {
  return value === "signup" ? "signup" : "login";
}

export function kakaoSocialSignupPath(role: KakaoOauthRole, redirectTo: string) {
  const url = new URL("http://roomlog.local/signup");
  url.searchParams.set("provider", "kakao");
  url.searchParams.set("role", role);
  url.searchParams.set("redirectTo", safeRedirectPath(redirectTo, "/"));
  return `${url.pathname}${url.search}`;
}

type OriginSource = string | Pick<Request, "url" | "headers">;

export function kakaoCallbackUrl(source: OriginSource) {
  const configured = process.env.KAKAO_LOGIN_CALLBACK_URL?.trim();
  if (configured) return configured;

  return `${publicOrigin(source)}/api/auth/kakao/callback`;
}

export function encodeKakaoOauthContext(context: KakaoOauthContext) {
  return Buffer.from(JSON.stringify(context), "utf8").toString("base64url");
}

export function decodeKakaoOauthContext(value: string | undefined): KakaoOauthContext | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<KakaoOauthContext>;
    const role = normalizeKakaoOauthRole(parsed.role ?? null);
    const flow = normalizeKakaoOauthFlow(parsed.flow ?? null);
    const redirectTo = safeRedirectPath(parsed.redirectTo ?? null, defaultRedirectForRole(role));
    const errorRedirectTo = safeRedirectPath(parsed.errorRedirectTo ?? null, loginPathForRole(role));

    return {
      role,
      flow,
      redirectTo,
      errorRedirectTo,
      inviteToken: parsed.inviteToken?.trim() || undefined
    };
  } catch {
    return undefined;
  }
}
