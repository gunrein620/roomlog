import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/api-url";
import { AUTH_COOKIE, authCookieOptions } from "@/lib/auth-cookie";
import {
  decodeGoogleOauthContext,
  defaultRedirectForRole,
  GOOGLE_OAUTH_CONTEXT_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  SOCIAL_SIGNUP_REQUIRED,
  googleCallbackUrl,
  loginPathForRole,
  publicUrl,
  redirectToPathWithError,
  socialSignupPath
} from "../_shared";

type SocialAuthResponse = {
  accessToken?: string;
  message?: string | string[];
};

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const savedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const context = decodeGoogleOauthContext(cookieStore.get(GOOGLE_OAUTH_CONTEXT_COOKIE)?.value);
  const role = context?.role ?? "SEEKER";
  const errorRedirectTo = context?.errorRedirectTo ?? loginPathForRole(role);

  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE);
  cookieStore.delete(GOOGLE_OAUTH_CONTEXT_COOKIE);

  if (error) {
    return redirectToPathWithError(request, errorRedirectTo, `google_${error}`);
  }

  if (!code || !state || !savedState || state !== savedState || !context) {
    return redirectToPathWithError(request, errorRedirectTo, "google_state");
  }

  const upstream = await fetch(apiUrl("/auth/social/google/callback", { requestUrl: request.url }), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      code,
      redirectUri: googleCallbackUrl(request),
      role: context.role,
      inviteToken: context.inviteToken,
      flow: context.flow
    })
  });
  const data = (await upstream.json().catch(() => ({}))) as SocialAuthResponse;

  if (!upstream.ok || !data.accessToken) {
    const message = Array.isArray(data.message) ? data.message.join(", ") : data.message;
    if (message === SOCIAL_SIGNUP_REQUIRED) {
      return NextResponse.redirect(publicUrl(request, socialSignupPath(context.role, context.redirectTo)));
    }

    const url = publicUrl(request, errorRedirectTo);
    url.searchParams.set("error", message || "google_login");
    return NextResponse.redirect(url);
  }

  cookieStore.set(AUTH_COOKIE, data.accessToken, authCookieOptions);
  return NextResponse.redirect(publicUrl(request, context.redirectTo || defaultRedirectForRole(role)));
}
