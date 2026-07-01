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
});
