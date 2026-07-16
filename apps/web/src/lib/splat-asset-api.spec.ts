import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { listSplatAssets, resolveAssetFileUrl } from "./splat-asset-api";

const env = process.env as Record<string, string | undefined>;
const originalNextPublicApiUrl = env.NEXT_PUBLIC_API_URL;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalNextPublicApiUrl === undefined) {
    delete env.NEXT_PUBLIC_API_URL;
    return;
  }

  env.NEXT_PUBLIC_API_URL = originalNextPublicApiUrl;
});

test("splat API calls use the same-origin BFF by default", async () => {
  delete env.NEXT_PUBLIC_API_URL;
  let requestedUrl = "";
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  assert.deepEqual(await listSplatAssets("room 1"), []);
  assert.equal(requestedUrl, "/api/splat-assets?roomId=room%201");
});

test("resolveAssetFileUrl keeps absolute file URLs", () => {
  env.NEXT_PUBLIC_API_URL = "http://localhost:4000";

  assert.equal(
    resolveAssetFileUrl("https://cdn.example.com/assets/room.spz"),
    "https://cdn.example.com/assets/room.spz"
  );
});

test("resolveAssetFileUrl absolutizes root-relative file URLs when API base is absolute", () => {
  env.NEXT_PUBLIC_API_URL = "http://localhost:4000/api";

  assert.equal(resolveAssetFileUrl("/api/files/room.spz"), "http://localhost:4000/api/files/room.spz");
});

test("resolveAssetFileUrl keeps root-relative file URLs when API base is relative", () => {
  env.NEXT_PUBLIC_API_URL = "/api";

  assert.equal(resolveAssetFileUrl("/api/files/room.spz"), "/api/files/room.spz");
});

test("resolveAssetFileUrl uses localhost API origin when API base is not configured", () => {
  delete env.NEXT_PUBLIC_API_URL;

  assert.equal(resolveAssetFileUrl("/api/files/room.spz"), "http://localhost:4000/api/files/room.spz");
});
