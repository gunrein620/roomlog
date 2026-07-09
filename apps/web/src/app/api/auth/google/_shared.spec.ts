import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  decodeGoogleOauthContext,
  encodeGoogleOauthContext,
  googleCallbackUrl,
  loginPathForRole,
  publicOrigin
} from "./_shared";

const originalEnv = {
  GOOGLE_LOGIN_CALLBACK_URL: process.env.GOOGLE_LOGIN_CALLBACK_URL,
  ROOMLOG_PUBLIC_ORIGIN: process.env.ROOMLOG_PUBLIC_ORIGIN
};

afterEach(() => {
  restoreEnv("GOOGLE_LOGIN_CALLBACK_URL", originalEnv.GOOGLE_LOGIN_CALLBACK_URL);
  restoreEnv("ROOMLOG_PUBLIC_ORIGIN", originalEnv.ROOMLOG_PUBLIC_ORIGIN);
});

function restoreEnv(key: keyof typeof originalEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

test("publicOrigin prefers the configured production origin over a localhost request URL", () => {
  delete process.env.GOOGLE_LOGIN_CALLBACK_URL;
  process.env.ROOMLOG_PUBLIC_ORIGIN = "https://www.woo-zu.com";

  const request = new Request("https://localhost:3000/api/auth/google/start");

  assert.equal(publicOrigin(request), "https://www.woo-zu.com");
  assert.equal(
    googleCallbackUrl(request),
    "https://www.woo-zu.com/api/auth/google/callback"
  );
});

test("publicOrigin can recover the browser origin from forwarded headers", () => {
  delete process.env.GOOGLE_LOGIN_CALLBACK_URL;
  delete process.env.ROOMLOG_PUBLIC_ORIGIN;

  const request = new Request("https://localhost:3000/api/auth/google/start", {
    headers: {
      "x-forwarded-host": "www.woo-zu.com",
      "x-forwarded-proto": "https"
    }
  });

  assert.equal(publicOrigin(request), "https://www.woo-zu.com");
});

// google_state 회귀 방지(QA 1): state 쿠키가 깨졌거나(캐시·재사용) 없을 때도
// 콜백이 크래시 없이 통합 /login 오류 복귀 경로로 안전하게 떨어져야 한다.
test("google_state regression: a corrupted or missing oauth context decodes to undefined", () => {
  assert.equal(decodeGoogleOauthContext(undefined), undefined);
  assert.equal(decodeGoogleOauthContext("not-base64url-json"), undefined);
  assert.equal(decodeGoogleOauthContext(Buffer.from("[]", "utf8").toString("base64url"))?.role, "SEEKER");
});

test("google_state regression: the oauth context round-trips with safe redirect paths", () => {
  const encoded = encodeGoogleOauthContext({
    role: "LANDLORD",
    flow: "login",
    redirectTo: "/sell",
    errorRedirectTo: "/login?intent=landlord",
    inviteToken: undefined
  });
  const decoded = decodeGoogleOauthContext(encoded);

  assert.equal(decoded?.role, "LANDLORD");
  assert.equal(decoded?.redirectTo, "/sell");
  assert.equal(decoded?.errorRedirectTo, "/login?intent=landlord");
});

test("google_state regression: unsafe redirect targets fall back to the unified login", () => {
  const encoded = encodeGoogleOauthContext({
    role: "TENANT",
    flow: "login",
    redirectTo: "https://evil.test/phish",
    errorRedirectTo: "//evil.test"
  });
  const decoded = decodeGoogleOauthContext(encoded);

  // 외부 URL은 차단되고 intent 기본 경로/통합 로그인으로 폴백한다.
  assert.equal(decoded?.redirectTo, "/living");
  assert.equal(decoded?.errorRedirectTo, "/login?intent=tenant");
});

test("oauth error recovery paths all converge on the unified /login", () => {
  assert.equal(loginPathForRole("SEEKER"), "/login");
  assert.equal(loginPathForRole("TENANT"), "/login?intent=tenant");
  assert.equal(loginPathForRole("LANDLORD"), "/login?intent=landlord");
  assert.equal(loginPathForRole("VENDOR"), "/login?intent=vendor");
});
