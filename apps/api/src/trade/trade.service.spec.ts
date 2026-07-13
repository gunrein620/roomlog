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
  detailAddress: "402호",
  description: "등록 매물",
  images: ["https://example.test/listing.jpg"]
};

function acceptContract(service: TradeService) {
  const listing = service.createListing(owner, input);
  const tenant = { id: "tenant-1", name: "세입자" };
  const thread = service.createInquiry(tenant, {
    listingId: listing.id,
    listingTitle: listing.title,
    message: "계약하고 싶어요"
  });
  const proposed = service.proposeContract(owner, thread.id).contract;
  const accepted = service.respondContract(tenant, proposed.id, true).contract;

  return { tenant, thread, accepted };
}

describe("TradeService public listings", () => {
  it("exposes newly created direct listings in the public feed immediately", () => {
    const service = serviceWithTempStore();

    const created = service.createListing(owner, input);

    assert.equal(created.status, "노출중");
    assert.equal(created.detailAddress, "402호");
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

  it("keeps detail address optional for existing direct listings", () => {
    const service = serviceWithTempStore();

    const created = service.createListing(owner, { ...input, detailAddress: "   " });

    assert.equal(created.detailAddress, undefined);
  });
});

describe("TradeService contract acceptance", () => {
  it("returns an already accepted contract without duplicating its acceptance message", () => {
    const service = serviceWithTempStore();
    const { tenant, thread, accepted: first } = acceptContract(service);

    const messageCount = service.getThread(tenant.id, thread.id).messages.length;
    const second = service.respondContract(tenant, first.id, true).contract;

    assert.equal(first.status, "accepted");
    assert.equal(second.id, first.id);
    assert.equal(service.getThread(tenant.id, thread.id).messages.length, messageCount);
    assert.deepEqual(service.listAcceptedContracts().map((contract) => contract.id), [first.id]);
  });
});
