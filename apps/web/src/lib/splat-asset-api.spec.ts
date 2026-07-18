import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { SplatAsset } from "./splat-asset-api";
import { intakeSplatAssetSmart, listSplatAssets, resolveAssetFileUrl } from "./splat-asset-api";

const env = process.env as Record<string, string | undefined>;
const originalNextPublicApiUrl = env.NEXT_PUBLIC_API_URL;
const originalFetch = globalThis.fetch;
const originalXMLHttpRequest = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalXMLHttpRequest === undefined) {
    delete (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  } else {
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = originalXMLHttpRequest;
  }
  if (originalNextPublicApiUrl === undefined) {
    delete env.NEXT_PUBLIC_API_URL;
    return;
  }

  env.NEXT_PUBLIC_API_URL = originalNextPublicApiUrl;
});

/**
 * XHR 기반 업로드(intakeSplatAssetWithProgress/uploadToPresignedUrl)는 Node 테스트 환경에
 * XMLHttpRequest가 없어 직접 실행할 수 없다 — send() 시점에 등록된 핸들러를 즉시 호출하는
 * 최소 fake로 대체한다. handler가 method/url을 보고 진행률·응답을 결정한다.
 */
type FakeXhrHandler = (xhr: FakeXhrRequest) => void;

class FakeXhrRequest {
  method = "";
  url = "";
  status = 0;
  statusText = "";
  response: unknown = null;
  responseType = "";
  readonly requestHeaders: Record<string, string> = {};
  readonly upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  sentBody: unknown = null;

  // 파라미터 프로퍼티 대신 명시 필드 — Node 네이티브 TS 스트리핑으로 단독 실행해도 깨지지 않게.
  private readonly handler: FakeXhrHandler;

  constructor(handler: FakeXhrHandler) {
    this.handler = handler;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.requestHeaders[name] = value;
  }

  send(body?: unknown) {
    this.sentBody = body;
    this.handler(this);
  }
}

function installFakeXhr(handler: FakeXhrHandler) {
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = class {
    constructor() {
      return new FakeXhrRequest(handler);
    }
  };
}

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

const fakeAsset: SplatAsset = {
  id: "asset-1",
  roomId: "room-1",
  listingId: "listing-1",
  floorPlanId: null,
  fileUrl: "",
  fileKind: "video",
  sizeBytes: 1024,
  videoUrl: "https://cdn.example.com/splat-intake/listing-1/splat-video.mp4",
  status: "PROCESSING",
  transform: null,
  registrationPairs: null,
  capturedAt: null,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z"
};

test("intakeSplatAssetSmart falls back to multipart intake when presign reports mode=multipart", async () => {
  delete env.NEXT_PUBLIC_API_URL;
  const fetchCalls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    fetchCalls.push(url);
    assert.equal(url, "/api/splat-assets/intake/presign");
    return new Response(JSON.stringify({ mode: "multipart" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const xhrCalls: string[] = [];
  installFakeXhr((xhr) => {
    xhrCalls.push(`${xhr.method} ${xhr.url}`);
    assert.equal(xhr.method, "POST");
    assert.equal(xhr.url, "/api/splat-assets/intake");
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.status = 200;
    xhr.response = fakeAsset;
    xhr.onload?.();
  });

  const progress: number[] = [];
  const file = new File(["source bytes"], "tour.mp4", { type: "video/mp4" });
  const result = await intakeSplatAssetSmart({ listingId: "listing-1", file }, (percent) => progress.push(percent));

  assert.deepEqual(result, fakeAsset);
  assert.deepEqual(fetchCalls, ["/api/splat-assets/intake/presign"]);
  assert.deepEqual(xhrCalls, ["POST /api/splat-assets/intake"]);
  assert.ok(progress.includes(50), "멀티파트 폴백 경로의 XHR 진행률이 그대로 전달돼야 한다");
  assert.equal(progress.at(-1), 100);
});

test("intakeSplatAssetSmart uploads directly to S3 and completes intake when presign reports mode=direct", async () => {
  delete env.NEXT_PUBLIC_API_URL;
  const fetchCalls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(init.body as string) : null;
    fetchCalls.push({ url, body });

    if (url === "/api/splat-assets/intake/presign") {
      return new Response(
        JSON.stringify({
          mode: "direct",
          uploadUrl: "https://bucket.s3.amazonaws.com/splat-intake/listing-1/splat-video.mp4",
          key: "splat-intake/listing-1/splat-video.mp4",
          headers: { "Content-Type": "video/mp4" },
          expiresAt: "2026-07-17T01:00:00.000Z"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url === "/api/splat-assets/intake/complete") {
      return new Response(JSON.stringify(fakeAsset), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    throw new Error(`예상치 못한 fetch 호출: ${url}`);
  }) as typeof fetch;

  let putHeaders: Record<string, string> = {};
  installFakeXhr((xhr) => {
    assert.equal(xhr.method, "PUT");
    assert.equal(xhr.url, "https://bucket.s3.amazonaws.com/splat-intake/listing-1/splat-video.mp4");
    putHeaders = xhr.requestHeaders;
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    xhr.status = 200;
    xhr.onload?.();
  });

  const progress: number[] = [];
  const file = new File(["source bytes"], "tour.mp4", { type: "video/mp4" });
  const result = await intakeSplatAssetSmart({ listingId: "listing-1", file }, (percent) => progress.push(percent));

  assert.deepEqual(result, fakeAsset);
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0]?.url, "/api/splat-assets/intake/presign");
  assert.equal(fetchCalls[1]?.url, "/api/splat-assets/intake/complete");
  assert.deepEqual(fetchCalls[1]?.body, { listingId: "listing-1", key: "splat-intake/listing-1/splat-video.mp4" });
  assert.deepEqual(putHeaders, { "Content-Type": "video/mp4" }); // presign 응답 헤더가 그대로 PUT에 실려야 서명이 유효하다
  assert.ok(progress.includes(97), "direct 업로드 진행률은 0~97로 매핑돼야 한다");
  assert.equal(progress.at(-1), 100);
});

test("intakeSplatAssetSmart falls back to multipart when the presign endpoint is missing (404)", async () => {
  delete env.NEXT_PUBLIC_API_URL;
  globalThis.fetch = (async (input) => {
    assert.equal(String(input), "/api/splat-assets/intake/presign");
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;

  const xhrCalls: string[] = [];
  installFakeXhr((xhr) => {
    xhrCalls.push(`${xhr.method} ${xhr.url}`);
    xhr.status = 200;
    xhr.response = fakeAsset;
    xhr.onload?.();
  });

  const file = new File(["source bytes"], "tour.mp4", { type: "video/mp4" });
  const result = await intakeSplatAssetSmart({ listingId: "listing-1", file });

  assert.deepEqual(result, fakeAsset);
  assert.deepEqual(xhrCalls, ["POST /api/splat-assets/intake"]);
});

test("intakeSplatAssetSmart rethrows presign validation failures instead of re-uploading via multipart", async () => {
  // 400(용량 초과·확장자 불허)까지 폴백하면 어차피 거부될 파일 전체가 서버 힙을 통과한다 —
  // 이 기능이 막으려던 문제의 재현이므로 반드시 즉시 throw해야 한다.
  delete env.NEXT_PUBLIC_API_URL;
  globalThis.fetch = (async () =>
    new Response("영상, 캡처 zip 또는 스플랫 파일은 800MB 이하만 접수할 수 있습니다.", {
      status: 400
    })) as typeof fetch;

  installFakeXhr(() => {
    assert.fail("presign 400에서 멀티파트 업로드를 시작하면 안 된다");
  });

  const file = new File(["source bytes"], "tour.mp4", { type: "video/mp4" });
  await assert.rejects(
    () => intakeSplatAssetSmart({ listingId: "listing-1", file }),
    (error: unknown) => error instanceof Error && /400/.test(error.message)
  );
});
