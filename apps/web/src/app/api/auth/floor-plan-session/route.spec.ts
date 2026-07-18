import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const routePath = join(process.cwd(), "src/app/api/auth/floor-plan-session/route.ts");
const source = existsSync(routePath) ? readFileSync(routePath, "utf8") : "";

test("adopts only a validated landlord floor-plan token into the httpOnly session", () => {
  assert.equal(existsSync(routePath), true, "floor-plan session bridge route must exist");
  assert.match(source, /request\.headers\.get\("authorization"\)/);
  assert.match(source, /apiUrl\("\/auth\/me",\s*\{\s*requestUrl:\s*request\.url\s*\}\)/);
  assert.match(source, /Authorization:\s*authorization/);
  assert.match(source, /LANDLORD/);
  assert.match(source, /AUTH_COOKIE/);
  assert.match(source, /authCookieOptions/);
  assert.doesNotMatch(source, /accessToken/);
});

test("keeps an existing RoomLog cookie session ahead of cached browser storage", () => {
  assert.equal(existsSync(routePath), true, "floor-plan session bridge route must exist");
  const existingCookie = source.indexOf("cookieStore.get(AUTH_COOKIE)");
  const incomingBearer = source.indexOf('request.headers.get("authorization")');
  assert.ok(existingCookie >= 0, "existing cookie must be checked");
  assert.ok(incomingBearer >= 0, "incoming bearer must be read");
  assert.ok(existingCookie < incomingBearer, "existing cookie must be handled before the cached bearer");
});

test("rejects cross-origin and missing-bearer session adoption requests", () => {
  assert.equal(existsSync(routePath), true, "floor-plan session bridge route must exist");
  assert.match(source, /new URL\(origin\)\.host !== host/);
  assert.match(source, /status:\s*403/);
  assert.match(source, /status:\s*401/);
});
