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
  description: "검수 전 매물",
  images: ["https://example.test/listing.jpg"]
};

describe("TradeService public listings", () => {
  it("keeps newly created direct listings out of the public recommended feed until approved", () => {
    const service = serviceWithTempStore();

    const created = service.createListing(owner, input);

    assert.equal(created.status, "노출중");
    assert.equal(created.reviewStatus, "pending");
    assert.equal(service.listListings().length, 1);
    assert.deepEqual(service.listPublicListings(), []);
  });

  it("returns only approved, non-contracted listings from the public feed", () => {
    const service = serviceWithTempStore();
    const pending = service.createListing(owner, { ...input, title: "대기 매물" });
    const approved = service.createListing(owner, { ...input, title: "승인 매물" });
    const contracted = service.createListing(owner, { ...input, title: "계약 매물" });

    service.setListingReviewStatus(approved.id, "approved");
    service.setListingReviewStatus(contracted.id, "approved");
    service.markListingContracted(contracted.id);

    assert.deepEqual(
      service.listPublicListings().map((listing) => listing.title),
      ["승인 매물"]
    );
    assert.equal(service.listListings().some((listing) => listing.id === pending.id), true);
  });
});
