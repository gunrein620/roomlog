import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { apiUrl } from "./api-url";

const originalEnv = {
  API_INTERNAL_URL: process.env.API_INTERNAL_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NODE_ENV: process.env.NODE_ENV
};

afterEach(() => {
  restoreEnv("API_INTERNAL_URL", originalEnv.API_INTERNAL_URL);
  restoreEnv("NEXT_PUBLIC_API_URL", originalEnv.NEXT_PUBLIC_API_URL);
  restoreEnv("NODE_ENV", originalEnv.NODE_ENV);
});

function restoreEnv(key: keyof typeof originalEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

test("apiUrl uses localhost Nest API by default", () => {
  delete process.env.API_INTERNAL_URL;
  delete process.env.NEXT_PUBLIC_API_URL;
  process.env.NODE_ENV = "development";

  assert.equal(apiUrl("/auth/login"), "http://localhost:4000/api/auth/login");
});

test("apiUrl prefers API_INTERNAL_URL for server-side calls", () => {
  process.env.API_INTERNAL_URL = "http://api:4000";
  process.env.NEXT_PUBLIC_API_URL = "/api";
  process.env.NODE_ENV = "production";

  assert.equal(apiUrl("/auth/social/google/callback"), "http://api:4000/api/auth/social/google/callback");
  assert.equal(apiUrl("/auth/social/kakao/callback"), "http://api:4000/api/auth/social/kakao/callback");
});

test("apiUrl avoids relative /api during local development", () => {
  delete process.env.API_INTERNAL_URL;
  process.env.NEXT_PUBLIC_API_URL = "/api";
  process.env.NODE_ENV = "development";

  assert.equal(apiUrl("/auth/me"), "http://localhost:4000/api/auth/me");
});

test("apiUrl can resolve production relative API base from the request URL", () => {
  delete process.env.API_INTERNAL_URL;
  process.env.NEXT_PUBLIC_API_URL = "/api";
  process.env.NODE_ENV = "production";

  assert.equal(
    apiUrl("/auth/login", { requestUrl: "https://www.woo-zu.com/api/auth/login" }),
    "https://www.woo-zu.com/api/auth/login"
  );
});
