import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { FurnitureCatalogService } from "./furniture-catalog.service";

describe("FurnitureCatalogService", () => {
  it("normalizes DummyJSON furniture into 3D catalog dimensions", () => {
    const item = FurnitureCatalogService.normalizeDummyJsonProduct({
      id: 11,
      title: "Annibale Colombo Bed",
      description: "A bed frame",
      category: "furniture",
      price: 1899.99,
      brand: "Annibale Colombo",
      dimensions: {
        width: 28.16,
        height: 25.36,
        depth: 17.28
      },
      images: ["https://cdn.dummyjson.com/product-images/furniture/annibale-colombo-bed/1.webp"],
      thumbnail: "https://cdn.dummyjson.com/product-images/furniture/annibale-colombo-bed/thumbnail.webp"
    });

    assert.equal(item.id, "dummyjson-furniture-11");
    assert.equal(item.source, "dummyjson");
    assert.equal(item.sourceProductId, "11");
    assert.equal(item.sourceUrl, "https://dummyjson.com/products/11");
    assert.equal(item.name, "Annibale Colombo Bed");
    assert.equal(item.brand, "Annibale Colombo");
    assert.equal(item.category, "furniture");
    assert.equal(item.widthMm, 2816);
    assert.equal(item.heightMm, 2536);
    assert.equal(item.depthMm, 1728);
    assert.equal(item.priceKrw, 2564987);
    assert.equal(item.currency, "KRW");
    assert.equal(item.thumbnailUrl?.endsWith("/thumbnail.webp"), true);
    assert.deepEqual(item.imageUrls, [
      "https://cdn.dummyjson.com/product-images/furniture/annibale-colombo-bed/1.webp"
    ]);
  });

  it("fetches only furniture products from DummyJSON", async () => {
    const requestedUrls: string[] = [];
    const items = await FurnitureCatalogService.fetchDummyJsonFurniture({
      fetchImpl: async (url) => {
        requestedUrls.push(String(url));
        return {
          ok: true,
          json: async () => ({
            products: [
              {
                id: 12,
                title: "Annibale Colombo Sofa",
                category: "furniture",
                price: 2499.99,
                dimensions: { width: 12.75, height: 20.55, depth: 19.06 },
                images: [],
                thumbnail: null
              }
            ]
          })
        } as Response;
      },
      limit: 1
    });

    assert.equal(requestedUrls[0], "https://dummyjson.com/products/category/furniture?limit=1");
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "dummyjson-furniture-12");
    assert.equal(items[0].name, "Annibale Colombo Sofa");
  });

  it("normalizes manually collected Today House CSV rows into catalog items", () => {
    const items = FurnitureCatalogService.parseManualCsv(`name,brand,priceKrw,widthMm,heightMm,depthMm,sourceUrl,thumbnailUrl,imageUrls
"모듈 소파, 패브릭","오늘가구","329,000",1800,760,850,https://ohou.se/productions/123456/selling,https://cdn.example.test/sofa.webp,"https://cdn.example.test/sofa-1.webp|https://cdn.example.test/sofa-2.webp"`);

    assert.equal(items.length, 1);
    assert.equal(items[0].id, "manual-ohou-123456");
    assert.equal(items[0].source, "manual-ohou");
    assert.equal(items[0].sourceProductId, "123456");
    assert.equal(items[0].sourceUrl, "https://ohou.se/productions/123456/selling");
    assert.equal(items[0].name, "모듈 소파, 패브릭");
    assert.equal(items[0].brand, "오늘가구");
    assert.equal(items[0].priceKrw, 329000);
    assert.equal(items[0].widthMm, 1800);
    assert.equal(items[0].heightMm, 760);
    assert.equal(items[0].depthMm, 850);
    assert.equal(items[0].thumbnailUrl, "https://cdn.example.test/sofa.webp");
    assert.deepEqual(items[0].imageUrls, [
      "https://cdn.example.test/sofa-1.webp",
      "https://cdn.example.test/sofa-2.webp"
    ]);
  });

  it("blocks product crawling when robots.txt disallows the target path", async () => {
    const result = await FurnitureCatalogService.crawlProductPage({
      fetchImpl: async (url) =>
        ({
          ok: true,
          text: async () => (String(url).endsWith("/robots.txt") ? "User-agent: *\nDisallow: /\n" : "<html></html>")
        }) as Response,
      pageUrl: "https://ohou.se/productions/123456/selling"
    });

    assert.deepEqual(result, {
      reason: "robots.txt disallows crawling https://ohou.se/productions/123456/selling for User-agent *",
      status: "blocked"
    });
  });

  it("crawls allowed JSON-LD product pages into catalog items", async () => {
    const result = await FurnitureCatalogService.crawlProductPage({
      fetchImpl: async (url) =>
        ({
          ok: true,
          text: async () =>
            String(url).endsWith("/robots.txt")
              ? "User-agent: *\nAllow: /\n"
              : `<script type="application/ld+json">
                  {
                    "@type": "Product",
                    "name": "Allowed Sofa",
                    "brand": { "name": "Allowed Brand" },
                    "image": ["https://example.test/sofa.webp"],
                    "offers": { "price": "123000", "priceCurrency": "KRW" }
                  }
                </script>`
        }) as Response,
      pageUrl: "https://allowed.example/products/sofa-1"
    });

    assert.equal(result.status, "importable");
    assert.equal(result.item.name, "Allowed Sofa");
    assert.equal(result.item.brand, "Allowed Brand");
    assert.equal(result.item.priceKrw, 123000);
    assert.equal(result.item.source, "crawl-jsonld");
    assert.equal(result.item.sourceUrl, "https://allowed.example/products/sofa-1");
    assert.deepEqual(result.item.imageUrls, ["https://example.test/sofa.webp"]);
  });

  it("normalizes Naver shopping furniture results into catalog items", () => {
    const item = FurnitureCatalogService.normalizeNaverShoppingItem({
      brand: "두닷",
      category1: "가구/인테리어",
      category2: "거실가구",
      category3: "소파",
      category4: "",
      hprice: "0",
      image: "https://shopping-phinf.pstatic.net/main_123.jpg",
      link: "https://search.shopping.naver.com/catalog/123456789",
      lprice: "329000",
      maker: "두닷",
      mallName: "네이버",
      productId: "123456789",
      productType: "1",
      title: "<b>패브릭</b> 3인 소파"
    });

    assert.equal(item.id, "naver-shopping-123456789");
    assert.equal(item.source, "naver-shopping");
    assert.equal(item.sourceProductId, "123456789");
    assert.equal(item.sourceUrl, "https://search.shopping.naver.com/catalog/123456789");
    assert.equal(item.name, "패브릭 3인 소파");
    assert.equal(item.brand, "두닷");
    assert.equal(item.category, "가구/인테리어 > 거실가구 > 소파");
    assert.equal(item.priceKrw, 329000);
    assert.equal(item.widthMm, 900);
    assert.equal(item.heightMm, 700);
    assert.equal(item.depthMm, 600);
    assert.equal(item.thumbnailUrl, "https://shopping-phinf.pstatic.net/main_123.jpg");
    assert.deepEqual(item.imageUrls, ["https://shopping-phinf.pstatic.net/main_123.jpg"]);
  });

  it("fetches Naver shopping furniture with API credentials", async () => {
    const requested: { headers?: HeadersInit; url: string }[] = [];
    const items = await FurnitureCatalogService.fetchNaverShoppingFurniture({
      clientId: "client-id",
      clientSecret: "client-secret",
      display: 1,
      fetchImpl: async (url, init) => {
        requested.push({ headers: init?.headers, url: String(url) });

        return {
          ok: true,
          json: async () => ({
            items: [
              {
                brand: "두닷",
                category1: "가구/인테리어",
                category2: "침실가구",
                category3: "침대",
                image: "https://shopping-phinf.pstatic.net/main_456.jpg",
                link: "https://search.shopping.naver.com/catalog/456",
                lprice: "459000",
                maker: "두닷",
                mallName: "네이버",
                productId: "456",
                productType: "1",
                title: "<b>수납</b> 침대"
              }
            ]
          })
        } as Response;
      },
      query: "가구"
    });

    assert.equal(requested[0].url, "https://openapi.naver.com/v1/search/shop.json?query=%EA%B0%80%EA%B5%AC&display=1&start=1&sort=sim&exclude=used%3Arental");
    assert.deepEqual(requested[0].headers, {
      "X-Naver-Client-Id": "client-id",
      "X-Naver-Client-Secret": "client-secret"
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "naver-shopping-456");
    assert.equal(items[0].name, "수납 침대");
  });
});
