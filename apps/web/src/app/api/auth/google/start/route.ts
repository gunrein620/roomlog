import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  defaultRedirectForRole,
  encodeGoogleOauthContext,
  GOOGLE_OAUTH_CONTEXT_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  googleCallbackUrl,
  googleOauthCookieOptions,
  loginPathForRole,
  normalizeGoogleOauthFlow,
  normalizeGoogleOauthRole,
  redirectToPathWithError,
  runtimeEnv,
  safeRedirectPath
} from "../_shared";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET(request: NextRequest) {
  const clientId = await runtimeEnv("GOOGLE_LOGIN_CLIENT_ID");
  const role = normalizeGoogleOauthRole(request.nextUrl.searchParams.get("role"));
  const flow = normalizeGoogleOauthFlow(request.nextUrl.searchParams.get("flow"));
  const errorRedirectTo = safeRedirectPath(
    request.nextUrl.searchParams.get("errorRedirectTo"),
    loginPathForRole(role)
  );

  if (!clientId) {
    return redirectToPathWithError(request, errorRedirectTo, "google_config");
  }

  const redirectTo = safeRedirectPath(
    request.nextUrl.searchParams.get("redirectTo"),
    defaultRedirectForRole(role)
  );
  const inviteToken = request.nextUrl.searchParams.get("inviteToken")?.trim() || undefined;
  const state = crypto.randomUUID();
  const redirectUri = googleCallbackUrl(request);
  const cookieStore = await cookies();

  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, state, googleOauthCookieOptions);
  cookieStore.set(
    GOOGLE_OAUTH_CONTEXT_COOKIE,
    encodeGoogleOauthContext({ role, flow, redirectTo, errorRedirectTo, inviteToken }),
    googleOauthCookieOptions
  );

  const authorizeUrl = new URL(GOOGLE_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authorizeUrl);
}
