import assert from "node:assert/strict";
import test from "node:test";

import {
  isLargeFurnitureAsset,
  loadPolyhavenCatalog,
  polyhavenCatalogFromManifest,
  resetPolyhavenCatalogCache,
  resolvePolyhavenCatalogUrl,
} from "./polyhaven-catalog";

const validRecord = {
  assetId: "ArmChair_01",
  bytes: 52_428_800,
  catalogCategoryLabel: "소파·의자",
  displayName: "Arm Chair 01",
  license: "CC0-1.0",
  placementCapability: "floor",
  relativePath: "polyhaven-cc0/ArmChair_01.glb",
  sizeMm: { width: 1000, height: 800, depth: 700 },
  sourceUrl: "https://polyhaven.com/a/ArmChair_01",
  tags: ["gothic", "chair"],
  thumbnailPath: "polyhaven-cc0/thumbnails/ArmChair_01.png",
};

test("resolves the Poly catalog below the configured furniture base", () => {
  assert.equal(
    resolvePolyhavenCatalogUrl("https://cdn.example.com/furniture"),
    "https://cdn.example.com/furniture/polyhaven-cc0/catalog.json",
  );
});

test("normalizes valid Poly records and filters invalid dimensions", () => {
  const items = polyhavenCatalogFromManifest(
    { items: [validRecord, { ...validRecord, assetId: "bad", sizeMm: { width: 0, height: 1, depth: 1 } }] },
    "https://cdn.example.com/furniture/",
  );

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    assetBytes: 52_428_800,
    brand: "Poly Haven",
    category: "소파·의자",
    color: "var(--surface-container-high)",
    furniture_id: "polyhaven-ArmChair_01",
    imageUrls: ["https://cdn.example.com/furniture/polyhaven-cc0/thumbnails/ArmChair_01.png"],
    length: [1000, 800, 700],
    modelUrl: "https://cdn.example.com/furniture/polyhaven-cc0/ArmChair_01.glb",
    name: "Arm Chair 01",
    placementCapability: "floor",
    price: 0,
    source: "polyhaven-cc0",
    sourceUrl: "https://polyhaven.com/a/ArmChair_01",
    tags: ["gothic", "chair"],
    thumbnailUrl: "https://cdn.example.com/furniture/polyhaven-cc0/thumbnails/ArmChair_01.png",
  });
  assert.equal(isLargeFurnitureAsset(items[0]), true);
});

test("shares one in-flight request and resets the cache for retry", async () => {
  resetPolyhavenCatalogCache();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response(JSON.stringify({ items: [validRecord] }), { status: 200 });
  };

  const [first, second] = await Promise.all([loadPolyhavenCatalog(fetcher), loadPolyhavenCatalog(fetcher)]);
  assert.equal(calls, 1);
  assert.equal(first, second);

  resetPolyhavenCatalogCache();
  await loadPolyhavenCatalog(fetcher);
  assert.equal(calls, 2);
});
