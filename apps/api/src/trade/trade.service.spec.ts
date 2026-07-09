import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradeService } from "./trade.service";

function serviceWithTempStore() {
  const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-"));
  return new TradeService(join(dir, "trade-store.json"));
}

const owner = { id: "owner-1", name: "집주인" };

const input = {
  title: "테스트 직접등록 매물",
  roomType: "원룸",
  tradeType: "월세" as const,
  depositManwon: 1000,
  monthlyRentManwon: 50,
  location: "서울 서초구 방배동",
  description: "등록 매물",
  images: ["https://example.test/listing.jpg"]
};

describe("TradeService public listings", () => {
  it("exposes newly created direct listings in the public feed immediately", () => {
    const service = serviceWithTempStore();

    const created = service.createListing(owner, input);

    assert.equal(created.status, "노출중");
    assert.equal(service.listListings().length, 1);
    assert.deepEqual(
      service.listPublicListings().map((listing) => listing.title),
      [input.title]
    );
  });

  it("excludes contracted listings from the public feed", () => {
    const service = serviceWithTempStore();
    const live = service.createListing(owner, { ...input, title: "노출 매물" });
    const contracted = service.createListing(owner, { ...input, title: "계약 매물" });

    service.markListingContracted(contracted.id);

    assert.deepEqual(
      service.listPublicListings().map((listing) => listing.title),
      ["노출 매물"]
    );
    assert.equal(service.listListings().some((listing) => listing.id === live.id), true);
  });
});
