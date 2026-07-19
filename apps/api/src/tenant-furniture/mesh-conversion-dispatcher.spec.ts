import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  createMeshConversionDispatcher,
  HttpMeshConversionDispatcher,
  meshConversionCallbackBase,
  UnconfiguredMeshConversionDispatcher
} from "./mesh-conversion-dispatcher";

describe("meshConversionCallbackBase", () => {
  it("appends /api when the base does not already end with it", () => {
    assert.equal(meshConversionCallbackBase("https://api.woo-zu.com"), "https://api.woo-zu.com/api");
  });

  it("does not double up /api and trims trailing slashes", () => {
    assert.equal(meshConversionCallbackBase("https://api.woo-zu.com/api/"), "https://api.woo-zu.com/api");
  });
});

describe("createMeshConversionDispatcher", () => {
  it("returns a dispatcher that fails closed when required env vars are missing", async () => {
    const dispatcher = createMeshConversionDispatcher({});
    assert.ok(dispatcher instanceof UnconfiguredMeshConversionDispatcher);

    await assert.rejects(
      () =>
        dispatcher.dispatch({
          furnitureId: "tf-1",
          usdzUrl: "https://cdn.example/scan.usdz",
          glbUploadUrl: "https://s3.example/put",
          glbUploadHeaders: {},
          glbPublicUrl: "https://cdn.example/out.glb"
        }),
      /MESH_WORKER_URL.*PUBLIC_API_BASE_URL.*GPU_WORKER_SECRET/s
    );
  });

  it("returns a working HTTP dispatcher once every required env var is set", () => {
    const dispatcher = createMeshConversionDispatcher({
      MESH_WORKER_URL: "http://mesh-worker:5001",
      PUBLIC_API_BASE_URL: "https://api.woo-zu.com",
      GPU_WORKER_SECRET: "secret"
    });
    assert.ok(dispatcher instanceof HttpMeshConversionDispatcher);
  });
});

describe("HttpMeshConversionDispatcher", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs the job plus callback base/worker secret to <workerUrl>/convert", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 202 });
    }) as typeof fetch;

    const dispatcher = new HttpMeshConversionDispatcher(
      "http://mesh-worker:5001/",
      "https://api.woo-zu.com/api",
      "worker-secret"
    );

    await dispatcher.dispatch({
      furnitureId: "tf-1",
      usdzUrl: "https://cdn.example/scan.usdz",
      glbUploadUrl: "https://s3.example/put",
      glbUploadHeaders: { "Content-Type": "model/gltf-binary" },
      glbPublicUrl: "https://cdn.example/out.glb"
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://mesh-worker:5001/convert");
    assert.equal((calls[0].init.headers as Record<string, string>)["x-worker-secret"], "worker-secret");
    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body, {
      furnitureId: "tf-1",
      usdzUrl: "https://cdn.example/scan.usdz",
      glbUploadUrl: "https://s3.example/put",
      glbUploadHeaders: { "Content-Type": "model/gltf-binary" },
      glbPublicUrl: "https://cdn.example/out.glb",
      callbackBase: "https://api.woo-zu.com/api",
      workerSecret: "worker-secret"
    });
  });

  it("throws when the worker responds with a non-2xx status", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    const dispatcher = new HttpMeshConversionDispatcher("http://mesh-worker:5001", "https://api.example/api", "s");

    await assert.rejects(
      () =>
        dispatcher.dispatch({
          furnitureId: "tf-1",
          usdzUrl: "https://cdn.example/scan.usdz",
          glbUploadUrl: "https://s3.example/put",
          glbUploadHeaders: {},
          glbPublicUrl: "https://cdn.example/out.glb"
        }),
      /500/
    );
  });

  it("throws when the worker is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const dispatcher = new HttpMeshConversionDispatcher("http://mesh-worker:5001", "https://api.example/api", "s");

    await assert.rejects(
      () =>
        dispatcher.dispatch({
          furnitureId: "tf-1",
          usdzUrl: "https://cdn.example/scan.usdz",
          glbUploadUrl: "https://s3.example/put",
          glbUploadHeaders: {},
          glbPublicUrl: "https://cdn.example/out.glb"
        }),
      /ECONNREFUSED/
    );
  });
});
