import test from "node:test";
import assert from "node:assert/strict";

import { extractIkeaProductMetadata, extractSamsungProductMetadata, replaceElectronicsWithProductPhotos } from "./replace-electronics-with-product-photos.mjs";

test("extracts the Korean product name and representative image from an official product page", () => {
  const metadata = extractIkeaProductMetadata(`
    <meta property="og:image" content="https://www.ikea.com/images/product-photo.jpg">
    <h1>VAPPEBY 바페뷔 블루투스 스피커, 화이트/3세대</h1>
  `);

  assert.deepEqual(metadata, {
    displayNameKo: "VAPPEBY 바페뷔 블루투스 스피커, 화이트/3세대",
    thumbnailUrl: "https://www.ikea.com/images/product-photo.jpg",
  });
});

test("accepts IKEA product images that include the regional path", () => {
  const metadata = extractIkeaProductMetadata(`
    <meta property="og:image" content="https://www.ikea.com/kr/ko/images/products/product-photo.jpg">
    <h1>NATTBAD 나트바드 블루투스 스피커, 옐로</h1>
  `);

  assert.equal(metadata?.thumbnailUrl, "https://www.ikea.com/kr/ko/images/products/product-photo.jpg");
});

test("extracts an official Samsung product title and protocol-relative product image", () => {
  const metadata = extractSamsungProductMetadata(`
    <meta property="og:title" content="Bespoke AI 냉장고 4도어 키친핏 Max 640L | RM70F63R2A | Samsung 대한민국">
    <meta property="og:image" content="//images.samsung.com/kdp/goods/refrigerator.png">
  `);

  assert.deepEqual(metadata, {
    displayNameKo: "Bespoke AI 냉장고 4도어 키친핏 Max 640L",
    thumbnailUrl: "https://images.samsung.com/kdp/goods/refrigerator.png",
  });
});

test("replaces generic electronics cards with official product-photo cards only", () => {
  const catalog = {
    version: 1,
    items: [
      { relativePath: "sofa/kept.glb", catalogCategory: "seating", thumbnailUrl: "https://example.com/sofa.jpg" },
      { relativePath: "appliance/mastjie-air-conditioner.glb", catalogCategory: "electronics", thumbnailUrl: "/floor-plan-3d/furniture-assets/appliance/mastjie-previews/household-goods.png" },
      { relativePath: "appliance/kenney-television-modern.glb", catalogCategory: "electronics", thumbnailUrl: "/floor-plan-3d/furniture-assets/appliance/kenney-previews/televisionModern.png" },
    ],
  };
  const products = [
    {
      sourceUrl: "https://www.ikea.com/kr/ko/p/vappeby-bluetooth-speaker-white-gen-3-60517383/",
      displayNameKo: "VAPPEBY 바페뷔 블루투스 스피커, 화이트/3세대",
      thumbnailUrl: "https://www.ikea.com/images/example-product.jpg",
    },
    {
      sourceUrl: "https://www.ikea.com/kr/ko/p/tillreda-microwave-oven-white-00493417/",
      displayNameKo: "TILLREDA 틸레다 전자레인지, 화이트",
      thumbnailUrl: "https://www.ikea.com/images/example-microwave.jpg",
    },
  ];

  const result = replaceElectronicsWithProductPhotos(catalog, products, [
    { relativePath: "appliance/ikea-vappeby-bluetooth-speaker-peanut-shape-green-60517608.glb", sizeMm: { width: 113, height: 238, depth: 113 } },
    { relativePath: "appliance/kenney-kitchen-microwave.glb", sizeMm: { width: 500, height: 300, depth: 400 } },
  ]);

  assert.equal(result.replacedItemCount, 2);
  assert.equal(result.catalog.items.length, 3);
  assert.deepEqual(result.catalog.items.filter(item => item.catalogCategory === "electronics").map(item => item.displayNameKo), products.map(product => product.displayNameKo));
  assert.ok(result.catalog.items.filter(item => item.catalogCategory === "electronics").every(item => item.thumbnailUrl.startsWith("https://www.ikea.com/images/")));
  assert.ok(result.catalog.items.filter(item => item.catalogCategory === "electronics").every(item => item.sourceUrl.startsWith("https://www.ikea.com/kr/ko/p/")));
});

test("keeps a Samsung large-appliance product image in the replacement catalog", () => {
  const result = replaceElectronicsWithProductPhotos({ items: [] }, [{
    sourceUrl: "https://www.samsung.com/sec/refrigerators/french-door-rm70f63r2a-d2c/RM70F63R2A/",
    displayNameKo: "Bespoke AI 냉장고 4도어 키친핏 Max 640L",
    thumbnailUrl: "https://images.samsung.com/kdp/goods/refrigerator.png",
  }], [{ relativePath: "appliance/kenney-kitchen-fridge-large.glb", sizeMm: { width: 900, height: 1800, depth: 700 } }]);

  assert.equal(result.catalog.items[0].displayNameKo, "Bespoke AI 냉장고 4도어 키친핏 Max 640L");
  assert.equal(result.catalog.items[0].thumbnailUrl, "https://images.samsung.com/kdp/goods/refrigerator.png");
});

test("rejects a catalog that would reuse one GLB for multiple product cards", () => {
  assert.throws(() => replaceElectronicsWithProductPhotos({ items: [] }, [
    {
      sourceUrl: "https://www.samsung.com/sec/refrigerators/french-door-rm70f63r2a-d2c/RM70F63R2A/",
      displayNameKo: "대형 냉장고 A",
      thumbnailUrl: "https://images.samsung.com/kdp/goods/fridge-a.png",
    },
    {
      sourceUrl: "https://www.samsung.com/sec/refrigerators/french-door-rm70f64q1a-d2c/RM70F64Q1A/",
      displayNameKo: "대형 냉장고 B",
      thumbnailUrl: "https://images.samsung.com/kdp/goods/fridge-b.png",
    },
  ], [
    { relativePath: "appliance/fridge.glb", sizeMm: { width: 900, height: 1800, depth: 700 } },
    { relativePath: "appliance/fridge.glb", sizeMm: { width: 900, height: 1800, depth: 700 } },
  ]), /distinct GLB/i);
});
