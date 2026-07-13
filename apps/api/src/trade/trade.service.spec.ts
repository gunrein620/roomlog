import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomlogService, type Store } from "../roomlog/roomlog.service";
import { TradeContractBillingBridge } from "./trade-contract-billing-bridge.service";
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
  it("snapshots the listing exact unit on the contract and preserves it after restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-unit-snapshot-"));
    const filePath = join(dir, "trade-store.json");
    const service = new TradeService(filePath);

    const { accepted } = acceptContract(service);
    const restarted = new TradeService(filePath);
    const acceptedWithUnit = accepted as typeof accepted & { roomNo?: string };
    const restored = restarted.listAcceptedContracts().find((contract) => contract.id === accepted.id) as
      | (typeof accepted & { roomNo?: string })
      | undefined;

    assert.equal(acceptedWithUnit.roomNo, "402호");
    assert.equal(restored?.roomNo, "402호");
    assert.equal(restored?.location, "서울 서초구 방배동 402호");
  });

  it("rejects every non-boolean response without changing contract, listing, or messages", () => {
    const service = serviceWithTempStore();
    const listing = service.createListing(owner, input);
    const tenant = { id: "tenant-boundary", name: "경계 세입자" };
    const thread = service.createInquiry(tenant, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "계약 경계를 확인해요",
    });
    const proposed = service.proposeContract(owner, thread.id).contract;
    const before = {
      contracts: structuredClone(service.listContracts(tenant.id)),
      listings: structuredClone(service.listListings()),
      thread: structuredClone(service.getThread(tenant.id, thread.id)),
    };

    for (const value of [undefined, "false", 0, null]) {
      assert.throws(
        () => service.respondContract(tenant, proposed.id, value as any),
        /boolean|true.*false|수락 여부/,
      );
      assert.deepEqual(service.listContracts(tenant.id), before.contracts);
      assert.deepEqual(service.listListings(), before.listings);
      assert.deepEqual(service.getThread(tenant.id, thread.id), before.thread);
    }
  });

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

  it("rolls back every acceptance mutation when the atomic Trade file write fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-accept-failure-"));
    const filePath = join(dir, "trade-store.json");
    const roomlogFilePath = join(dir, "roomlog-store.json");
    const service = new TradeService(filePath);
    const roomlogService = new RoomlogService({ seedDemoData: false, storeFilePath: roomlogFilePath });
    const bridge = new TradeContractBillingBridge(service, roomlogService);
    const listing = service.createListing(owner, input);
    const tenant = { id: "tenant-persist-failure", name: "저장실패 세입자" };
    const thread = service.createInquiry(tenant, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "저장 실패를 검증해요",
    });
    const proposed = service.proposeContract(owner, thread.id).contract;
    const before = {
      contracts: structuredClone(service.listContracts(tenant.id)),
      listings: structuredClone(service.listListings()),
      thread: structuredClone(service.getThread(tenant.id, thread.id)),
      file: readFileSync(filePath, "utf8"),
      roomlog: structuredClone((roomlogService as unknown as { store: Store }).store),
    };
    mkdirSync(`${filePath}.tmp`);
    let preflights = 0;

    assert.throws(
      () => service.respondContract(tenant, proposed.id, true, (accepted) => {
        preflights += 1;
        bridge.preflight(accepted);
      }),
      /EISDIR|directory|rename|write/i,
    );

    assert.equal(preflights, 1);
    assert.deepEqual(service.listContracts(tenant.id), before.contracts);
    assert.deepEqual(service.listListings(), before.listings);
    assert.deepEqual(service.getThread(tenant.id, thread.id), before.thread);
    assert.equal(readFileSync(filePath, "utf8"), before.file);
    assert.deepEqual((roomlogService as unknown as { store: Store }).store, before.roomlog);
    assert.equal(existsSync(roomlogFilePath), false);
    const restarted = new TradeService(filePath);
    assert.equal(restarted.contractForThread(tenant.id, thread.id)?.status, "proposed");
  });
});
