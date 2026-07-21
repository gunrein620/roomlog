import assert from "node:assert/strict";
import test from "node:test";

import {
  MITUNET_HTML_CACHE_CONTROL,
  mitunetAssetCacheControl,
} from "./mitunet-cache";

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
