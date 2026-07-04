import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { googleCallbackUrl, publicOrigin } from "./_shared";

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
