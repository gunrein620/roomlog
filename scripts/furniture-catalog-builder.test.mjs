import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  classifyCatalogItem,
  enrichManifest,
  extractKoreanProductName,
  toKoreanProductUrl,
} from "./furniture-catalog-builder.mjs";

test("classifies a wireless charger as electronics and attaches its Korean product metadata", () => {
  const productUrl = "https://www.ikea.com/kr/en/p/nordmaerke-wireless-charger-white-cork-60478070/";
  const thumbnailUrl = "https://www.ikea.com/kr/en/images/products/nordmaerke-wireless-charger-white-cork__0663527_pe712415_s5.jpg";
  const { manifest, summary } = enrichManifest(
    {
      items: [
        {
          category: "appliance",
          fileName: "ikea-nordmaerke-wireless-charger-white-cork-60478070.glb",
          relativePath: "appliance/ikea-nordmaerke-wireless-charger-white-cork-60478070.glb",
          sizeMm: { width: 86, height: 20, depth: 105 },
        },
      ],
    },
    { [productUrl]: { thumbnailUrl, imageUrls: [thumbnailUrl, "https://example.com/unrelated.jpg"] } },
    {
      [toKoreanProductUrl(productUrl)]: "NORDMÄRKE 노르드메르케 무선충전기, 화이트/코르크",
    },
  );

  assert.equal(summary.matchedThumbnailCount, 1);
  assert.equal(summary.namedKoreanCount, 1);
  assert.deepEqual(manifest.items[0], {
    category: "appliance",
    fileName: "ikea-nordmaerke-wireless-charger-white-cork-60478070.glb",
    relativePath: "appliance/ikea-nordmaerke-wireless-charger-white-cork-60478070.glb",
    sizeMm: { width: 86, height: 20, depth: 105 },
    catalogCategory: "electronics",
    catalogCategoryLabel: "가전·전자",
    displayNameKo: "NORDMÄRKE 노르드메르케 무선충전기, 화이트/코르크",
    sourceUrl: "https://www.ikea.com/kr/ko/p/nordmaerke-wireless-charger-white-cork-60478070/",
    thumbnailUrl,
    imageUrls: [thumbnailUrl],
    excludedFromCatalog: false,
  });
});

test("places sofa beds in seating and keeps product-part assets out of the placement catalog", () => {
  assert.deepEqual(
    classifyCatalogItem("bed/ikea-nyhamn-3-seat-sofa-bed-with-foam-mattress-knisa-grey-beige-s19306369.glb"),
    { key: "seating", label: "소파·의자", included: true },
  );
  assert.deepEqual(
    classifyCatalogItem("storage/ikea-utrusta-shelf-white-00271138.glb"),
    { key: "excluded", label: "제외", included: false },
  );
});

test("extracts the exact Korean display name from an IKEA product heading", () => {
  const html = '<h1 class="pip-header-section__title">NORDMÄRKE 노르드메르케 <span>무선충전기, 화이트/코르크</span></h1>';
  assert.equal(extractKoreanProductName(html), "NORDMÄRKE 노르드메르케 무선충전기, 화이트/코르크");
  assert.equal(extractKoreanProductName("<h1>제품</h1>"), undefined);
});

test("build CLI writes a compact image-backed enriched manifest", async () => {
  const fixtureDir = await mkdtemp(path.join(tmpdir(), "furniture-catalog-"));
  const manifestPath = path.join(fixtureDir, "manifest.json");
  const thumbnailCachePath = path.join(fixtureDir, "thumbnail-cache.json");
  const nameCachePath = path.join(fixtureDir, "name-cache.json");
  const outputPath = path.join(fixtureDir, "catalog-manifest.json");
  const productUrl = "https://www.ikea.com/kr/en/p/nordmaerke-wireless-charger-white-cork-60478070/";
  const thumbnailUrl = "https://cdn.example.com/nordmaerke.jpg";

  try {
    await writeFile(manifestPath, JSON.stringify({ items: [{ fileName: "ikea-nordmaerke-wireless-charger-white-cork-60478070.glb", relativePath: "appliance/ikea-nordmaerke-wireless-charger-white-cork-60478070.glb" }] }));
    await writeFile(thumbnailCachePath, JSON.stringify({ [productUrl]: { thumbnailUrl, imageUrls: [thumbnailUrl, "https://cdn.example.com/page-wide.jpg"] } }));
    await writeFile(nameCachePath, JSON.stringify({ [toKoreanProductUrl(productUrl)]: "NORDMÄRKE 노르드메르케 무선충전기, 화이트/코르크" }));

    const result = spawnSync(process.execPath, [
      "scripts/furniture-catalog-builder.mjs",
      "--manifest", manifestPath,
      "--thumbnail-cache", thumbnailCachePath,
      "--name-cache", nameCachePath,
      "--output", outputPath,
    ], { cwd: process.cwd(), encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    const builtManifest = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(builtManifest.items[0].thumbnailUrl, thumbnailUrl);
    assert.deepEqual(builtManifest.items[0].imageUrls, [thumbnailUrl]);
    assert.equal(builtManifest.items[0].displayNameKo, "NORDMÄRKE 노르드메르케 무선충전기, 화이트/코르크");
  } finally {
    await rm(fixtureDir, { force: true, recursive: true });
  }
});
