import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  defaultRedirectForRole,
  encodeKakaoOauthContext,
  KAKAO_OAUTH_CONTEXT_COOKIE,
  KAKAO_OAUTH_STATE_COOKIE,
  kakaoCallbackUrl,
  kakaoOauthCookieOptions,
  loginPathForRole,
  normalizeKakaoOauthFlow,
  normalizeKakaoOauthRole,
  redirectToPathWithError,
  runtimeEnv,
  safeRedirectPath
} from "../_shared";

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";

export async function GET(request: NextRequest) {
  const clientId =
    (await runtimeEnv("KAKAO_LOGIN_REST_API_KEY")) ?? (await runtimeEnv("KAKAO_LOGIN_CLIENT_ID"));
  const role = normalizeKakaoOauthRole(request.nextUrl.searchParams.get("role"));
  const flow = normalizeKakaoOauthFlow(request.nextUrl.searchParams.get("flow"));
  const errorRedirectTo = safeRedirectPath(
    request.nextUrl.searchParams.get("errorRedirectTo"),
    loginPathForRole(role)
  );

  if (!clientId) {
    return redirectToPathWithError(request, errorRedirectTo, "kakao_config");
  }

  const redirectTo = safeRedirectPath(
    request.nextUrl.searchParams.get("redirectTo"),
    defaultRedirectForRole(role)
  );
  const inviteToken = request.nextUrl.searchParams.get("inviteToken")?.trim() || undefined;
  const state = crypto.randomUUID();
  const redirectUri = kakaoCallbackUrl(request);
  const cookieStore = await cookies();

  cookieStore.set(KAKAO_OAUTH_STATE_COOKIE, state, kakaoOauthCookieOptions);
  cookieStore.set(
    KAKAO_OAUTH_CONTEXT_COOKIE,
    encodeKakaoOauthContext({ role, flow, redirectTo, errorRedirectTo, inviteToken }),
    kakaoOauthCookieOptions
  );

  const authorizeUrl = new URL(KAKAO_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "account_email,profile_nickname");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authorizeUrl);
}
