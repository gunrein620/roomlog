import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./mitunet-assets/[...asset]/route";
import { MITUNET_ASSET_VERSION } from "./mitunet-proxy";

function context(asset: string[]) {
  return { params: Promise.resolve({ asset }) };
}

test("serves a local versioned MitUNet runtime asset", async () => {
  const response = await GET(
    new Request(`http://roomlog.test/floor-plan-3d/mitunet-assets/${MITUNET_ASSET_VERSION}/vendor/three.module.js`),
    context([MITUNET_ASSET_VERSION, "vendor", "three.module.js"]),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/javascript/);
  const moduleSource = await response.text();
  assert.ok(moduleSource.length > 100_000);

  const relativeImports = [...moduleSource.matchAll(/from\s+["']\.\/([^"']+)["']/g)];
  assert.ok(relativeImports.length > 0, "expected Three.js to expose its relative module graph");
  for (const [, dependency] of relativeImports) {
    const dependencyResponse = await GET(
      new Request(`http://roomlog.test/floor-plan-3d/mitunet-assets/${MITUNET_ASSET_VERSION}/vendor/${dependency}`),
      context([MITUNET_ASSET_VERSION, "vendor", dependency]),
    );
    assert.equal(dependencyResponse.status, 200, `missing Three.js dependency: ${dependency}`);
  }
});

test("serves stale versions without caching during deploy overlap and rejects traversal", async () => {
  const stale = await GET(
    new Request("http://roomlog.test/floor-plan-3d/mitunet-assets/stale/vendor/three.module.js"),
    context(["stale", "vendor", "three.module.js"]),
  );
  const traversal = await GET(
    new Request(`http://roomlog.test/floor-plan-3d/mitunet-assets/${MITUNET_ASSET_VERSION}/../index.html`),
    context([MITUNET_ASSET_VERSION, "..", "index.html"]),
  );

  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get("cache-control"), "no-store");
  assert.equal(traversal.status, 404);
});
