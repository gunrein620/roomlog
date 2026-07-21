import assert from "node:assert/strict";
import test from "node:test";

import {
  MITUNET_HTML_CACHE_CONTROL,
  mitunetAssetCacheControl,
} from "./mitunet-cache";
import { versionMitunetViewerAssetUrls } from "./mitunet-proxy";

test("long-caches only versioned immutable MitUNet assets", () => {
  assert.equal(
    mitunetAssetCacheControl("floor-finishes.mjs", true),
    "public, max-age=31536000, immutable",
  );
  assert.equal(
    mitunetAssetCacheControl("assets/cosmic-night-landscape.png", true),
    "public, max-age=31536000, immutable",
  );
});

test("revalidates unversioned and runtime-transformed MitUNet assets", () => {
  assert.equal(
    mitunetAssetCacheControl("floor-finishes.mjs", false),
    "public, max-age=300, must-revalidate",
  );
  assert.equal(
    mitunetAssetCacheControl("review-editor.mjs", true),
    "public, max-age=300, must-revalidate",
  );
});

test("allows the viewer HTML to revalidate instead of disabling storage", () => {
  assert.equal(MITUNET_HTML_CACHE_CONTROL, "no-cache");
});

test("versions every absolute viewer asset URL in HTML and module sources", () => {
  const source = [
    'import x from "/viewer-assets/module.mjs";',
    "fetch('/viewer-assets/data.json')",
  ].join("\n");

  assert.equal(
    versionMitunetViewerAssetUrls(source, "deploy-abc123"),
    [
      'import x from "/floor-plan-3d/mitunet-assets/deploy-abc123/module.mjs";',
      "fetch('/floor-plan-3d/mitunet-assets/deploy-abc123/data.json')",
    ].join("\n"),
  );
});
