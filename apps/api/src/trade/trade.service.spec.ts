import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
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
  it("shows newly created direct listings in the public recommended feed", () => {
    const service = serviceWithTempStore();

    const created = service.createListing(owner, input);

    assert.equal(created.status, "노출중");
    assert.equal(created.reviewStatus, "pending");
    assert.equal(service.listListings().length, 1);
    assert.deepEqual(
      service.listPublicListings().map((listing) => listing.title),
      ["테스트 직접등록 매물"]
    );
  });

  it("returns all non-contracted listings from the public feed", () => {
    const service = serviceWithTempStore();
    const pending = service.createListing(owner, { ...input, title: "대기 매물" });
    const approved = service.createListing(owner, { ...input, title: "승인 매물" });
    const contracted = service.createListing(owner, { ...input, title: "계약 매물" });

    service.setListingReviewStatus(approved.id, "approved");
    service.setListingReviewStatus(contracted.id, "approved");
    service.markListingContracted(contracted.id);

    assert.deepEqual(
      service.listPublicListings().map((listing) => listing.title),
      ["승인 매물", "대기 매물"]
    );
    assert.equal(service.listListings().some((listing) => listing.id === pending.id), true);
  });

  it("keeps legacy stored listings without review metadata visible", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-"));
    const filePath = join(dir, "trade-store.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        listings: [
          {
            id: "legacy-1",
            ownerId: "owner-1",
            ownerName: "집주인",
            title: "기존 저장 매물",
            roomType: "원룸",
            tradeType: "월세",
            depositManwon: 1000,
            monthlyRentManwon: 50,
            location: "서울 서초구 방배동",
            description: "reviewStatus 없는 기존 데이터",
            images: [],
            status: "노출중",
            createdAt: "2026-07-09T00:00:00.000Z"
          }
        ],
        threads: [],
        contracts: []
      }),
      "utf8"
    );

    const service = new TradeService(filePath);

    assert.deepEqual(
      service.listPublicListings().map((listing) => listing.title),
      ["기존 저장 매물"]
    );
  });
});
