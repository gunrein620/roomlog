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
  assert.ok((await response.text()).length > 100_000);
});

test("rejects stale versions and path traversal", async () => {
  const stale = await GET(
    new Request("http://roomlog.test/floor-plan-3d/mitunet-assets/stale/vendor/three.module.js"),
    context(["stale", "vendor", "three.module.js"]),
  );
  const traversal = await GET(
    new Request(`http://roomlog.test/floor-plan-3d/mitunet-assets/${MITUNET_ASSET_VERSION}/../index.html`),
    context([MITUNET_ASSET_VERSION, "..", "index.html"]),
  );

  assert.equal(stale.status, 404);
  assert.equal(traversal.status, 404);
});
