import test from "node:test";
import assert from "node:assert/strict";

import { glbDatasetCatalogFromManifest, resolveFurnitureAssetBaseUrl } from "./glb-dataset-catalog";

test("uses an S3 or CloudFront base URL when it is configured", () => {
  assert.equal(
    resolveFurnitureAssetBaseUrl("https://roomlog-assets.s3.ap-northeast-2.amazonaws.com/furniture"),
    "https://roomlog-assets.s3.ap-northeast-2.amazonaws.com/furniture/"
  );
  assert.equal(resolveFurnitureAssetBaseUrl(""), "/floor-plan-3d/furniture-assets/");
});

test("uses Korean catalog metadata and omits assets excluded from placement", () => {
  const catalog = glbDatasetCatalogFromManifest({
    items: [
      {
        relativePath: "appliance/ikea-nordmaerke-wireless-charger-white-cork-60478070.glb",
        fileName: "ikea-nordmaerke-wireless-charger-white-cork-60478070.glb",
        sizeMm: { width: 86, height: 20, depth: 105 },
        catalogCategoryLabel: "가전·전자",
        displayNameKo: "NORDMÄRKE 노르드메르케 무선충전기, 화이트/코르크",
        sourceUrl: "https://www.ikea.com/kr/ko/p/nordmaerke-wireless-charger-white-cork-60478070/",
        thumbnailUrl: "https://cdn.example.com/nordmaerke.jpg",
        imageUrls: ["https://cdn.example.com/nordmaerke.jpg"],
        excludedFromCatalog: false,
      },
      {
        relativePath: "storage/ikea-utrusta-shelf-white-00271138.glb",
        fileName: "ikea-utrusta-shelf-white-00271138.glb",
        sizeMm: { width: 600, height: 20, depth: 400 },
        excludedFromCatalog: true,
      },
    ],
  });

  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].name, "NORDMÄRKE 노르드메르케 무선충전기, 화이트/코르크");
  assert.equal(catalog[0].category, "가전·전자");
  assert.equal(catalog[0].thumbnailUrl, "https://cdn.example.com/nordmaerke.jpg");
  assert.deepEqual(catalog[0].imageUrls, ["https://cdn.example.com/nordmaerke.jpg"]);
  assert.equal(catalog[0].sourceUrl, "https://www.ikea.com/kr/ko/p/nordmaerke-wireless-charger-white-cork-60478070/");
});
