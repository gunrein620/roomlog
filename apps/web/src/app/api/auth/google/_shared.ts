import { NextResponse } from "next/server";

export const GOOGLE_OAUTH_STATE_COOKIE = "roomlog_google_oauth_state";
export const GOOGLE_OAUTH_CONTEXT_COOKIE = "roomlog_google_oauth_context";

export type GoogleOauthRole = "SEEKER" | "TENANT" | "LANDLORD" | "VENDOR";
export type GoogleOauthFlow = "login" | "signup";

export const SOCIAL_SIGNUP_REQUIRED = "SOCIAL_SIGNUP_REQUIRED";

export type GoogleOauthContext = {
  role: GoogleOauthRole;
  flow: GoogleOauthFlow;
  redirectTo: string;
  errorRedirectTo?: string;
  inviteToken?: string;
};

export const googleOauthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 10
};

export async function runtimeEnv(key: string) {
  const current = process.env[key]?.trim();
  if (current) return current;
  if (process.env.NODE_ENV === "production") return undefined;

  const [{ existsSync, readFileSync }, { resolve }] = await Promise.all([
    import("node:fs"),
    import("node:path")
  ]);
  const rootEnvCandidatePaths = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", ".env"),
    resolve(process.cwd(), "..", "..", ".env")
  ];

  for (const envPath of rootEnvCandidatePaths) {
    if (!existsSync(envPath)) continue;

    const contents = readFileSync(envPath, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(rawLine.trim());
      if (!match || match[1] !== key) continue;

      let value = match[2].trim();
      const quote = value[0];
      if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
        value = value.slice(1, -1);
      }

      if (value) {
        process.env[key] = value;
        return value;
      }
    }
  }

  return undefined;
}

export function defaultRedirectForRole(role: GoogleOauthRole) {
  if (role === "LANDLORD") return "/sell";
  if (role === "VENDOR") return "/vendor/job/00";
  if (role === "TENANT") return "/living";
  return "/";
}

// 통합 로그인: 실패 시 되돌아갈 곳은 역할별 로그인 화면이 아니라 /login 하나다.
// role 파라미터는 identity 매칭이 아니라 intent(어느 표면으로 가려던 참이었나) 전달용.
export function loginPathForRole(role: GoogleOauthRole) {
  if (role === "LANDLORD") return "/login?intent=landlord";
  if (role === "VENDOR") return "/login?intent=vendor";
  if (role === "TENANT") return "/login?intent=tenant";
  return "/login";
}

export function normalizeGoogleOauthRole(value: string | null): GoogleOauthRole {
  if (value === "SEEKER" || value === "LANDLORD" || value === "VENDOR" || value === "TENANT") return value;
  return "SEEKER";
}

export function normalizeGoogleOauthFlow(value: string | null): GoogleOauthFlow {
  return value === "signup" ? "signup" : "login";
}

export function safeRedirectPath(value: string | null, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function socialSignupPath(role: GoogleOauthRole, redirectTo: string) {
  const url = new URL("http://roomlog.local/signup");
  url.searchParams.set("provider", "google");
  url.searchParams.set("role", role);
  url.searchParams.set("redirectTo", safeRedirectPath(redirectTo, "/"));
  return `${url.pathname}${url.search}`;
}

type OriginSource = string | Pick<Request, "url" | "headers">;

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function cleanOrigin(value: string | undefined) {
  const trimmed = value?.trim().replace(/\/+$/, "") ?? "";
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch {
    return "";
  }

  return "";
}

export function publicOrigin(source: OriginSource) {
  const configured = cleanOrigin(process.env.ROOMLOG_PUBLIC_ORIGIN);
  if (configured) return configured;

  const requestUrl = typeof source === "string" ? source : source.url;
  const headers = typeof source === "string" ? undefined : source.headers;
  const forwardedHost = firstHeaderValue(headers?.get("x-forwarded-host") ?? null);
  const host = forwardedHost || firstHeaderValue(headers?.get("host") ?? null);

  if (host && !/^localhost(?::\d+)?$/i.test(host)) {
    const proto =
      firstHeaderValue(headers?.get("x-forwarded-proto") ?? null) ||
      new URL(requestUrl).protocol.replace(":", "");
    return `${proto}://${host}`;
  }

  return new URL(requestUrl).origin;
}

export function googleCallbackUrl(source: OriginSource) {
  const configured = process.env.GOOGLE_LOGIN_CALLBACK_URL?.trim();
  if (configured) return configured;

  return `${publicOrigin(source)}/api/auth/google/callback`;
}

export function encodeGoogleOauthContext(context: GoogleOauthContext) {
  return Buffer.from(JSON.stringify(context), "utf8").toString("base64url");
}

export function decodeGoogleOauthContext(value: string | undefined): GoogleOauthContext | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<GoogleOauthContext>;
    const role = normalizeGoogleOauthRole(parsed.role ?? null);
    const flow = normalizeGoogleOauthFlow(parsed.flow ?? null);
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

export function publicUrl(source: OriginSource, path: string) {
  return new URL(safeRedirectPath(path, "/"), publicOrigin(source));
}

export function redirectToPathWithError(source: OriginSource, path: string, error: string) {
  const url = publicUrl(source, path);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export function redirectToLoginWithError(source: OriginSource, role: GoogleOauthRole, error: string) {
  return redirectToPathWithError(source, loginPathForRole(role), error);
}
