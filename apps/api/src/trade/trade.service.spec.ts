import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomlogService, type Store } from "../roomlog/roomlog.service";
import { TradeContractBillingBridge } from "./trade-contract-billing-bridge.service";
import { TradeService } from "./trade.service";

function serviceWithTempStore() {
  const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-"));
  return new TradeService(join(dir, "trade-store.json"));
}

function serviceWithStorePath(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const filePath = join(dir, "trade-store.json");
  return { service: new TradeService(filePath), filePath };
}

function blockAtomicWrite(filePath: string) {
  mkdirSync(`${filePath}.tmp`);
}

function unblockAtomicWrite(filePath: string) {
  rmSync(`${filePath}.tmp`, { recursive: true, force: true });
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

describe("TradeService atomic file persistence", () => {
  it("rolls back a failed proposal and retries with one contract and one proposal message", () => {
    const { service, filePath } = serviceWithStorePath("roomlog-trade-proposal-rollback-");
    const listing = service.createListing(owner, input);
    const tenant = { id: "tenant-proposal-rollback", name: "제안롤백 세입자" };
    const thread = service.createInquiry(tenant, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "제안 롤백을 확인해요",
    });
    const beforeThread = structuredClone(service.getThread(owner.id, thread.id));
    const beforeFile = readFileSync(filePath, "utf8");
    blockAtomicWrite(filePath);

    assert.throws(
      () => service.proposeContract(owner, thread.id),
      /EISDIR|directory|rename|write/i,
    );
    assert.deepEqual(service.listContracts(owner.id), []);
    assert.deepEqual(service.getThread(owner.id, thread.id), beforeThread);
    assert.equal(readFileSync(filePath, "utf8"), beforeFile);

    unblockAtomicWrite(filePath);
    const retried = service.proposeContract(owner, thread.id);
    assert.equal(service.listContracts(owner.id).length, 1);
    assert.equal(
      retried.thread.messages.filter((message) => message.body.includes("계약을 제안")).length,
      1,
    );
  });

  it("keeps a proposed contract when cancellation persistence fails", () => {
    const { service, filePath } = serviceWithStorePath("roomlog-trade-cancel-rollback-");
    const listing = service.createListing(owner, input);
    const tenant = { id: "tenant-cancel-rollback", name: "취소롤백 세입자" };
    const thread = service.createInquiry(tenant, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "취소 롤백을 확인해요",
    });
    const proposed = service.proposeContract(owner, thread.id).contract;
    const beforeThread = structuredClone(service.getThread(owner.id, thread.id));
    const beforeFile = readFileSync(filePath, "utf8");
    blockAtomicWrite(filePath);

    assert.throws(
      () => service.cancelContract(owner, proposed.id),
      /EISDIR|directory|rename|write/i,
    );
    assert.equal(service.contractForThread(owner.id, thread.id)?.status, "proposed");
    assert.deepEqual(service.getThread(owner.id, thread.id), beforeThread);
    assert.equal(readFileSync(filePath, "utf8"), beforeFile);

    unblockAtomicWrite(filePath);
    assert.equal(service.cancelContract(owner, proposed.id).contract.status, "cancelled");
  });

  it("keeps a proposed contract when decline persistence fails", () => {
    const { service, filePath } = serviceWithStorePath("roomlog-trade-decline-rollback-");
    const listing = service.createListing(owner, input);
    const tenant = { id: "tenant-decline-rollback", name: "거절롤백 세입자" };
    const thread = service.createInquiry(tenant, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "거절 롤백을 확인해요",
    });
    const proposed = service.proposeContract(owner, thread.id).contract;
    const beforeThread = structuredClone(service.getThread(tenant.id, thread.id));
    const beforeFile = readFileSync(filePath, "utf8");
    blockAtomicWrite(filePath);

    assert.throws(
      () => service.respondContract(tenant, proposed.id, false),
      /EISDIR|directory|rename|write/i,
    );
    assert.equal(service.contractForThread(tenant.id, thread.id)?.status, "proposed");
    assert.deepEqual(service.getThread(tenant.id, thread.id), beforeThread);
    assert.equal(readFileSync(filePath, "utf8"), beforeFile);
  });

  it("rolls back failed listing create, update, delete, and contracted mutations", () => {
    {
      const { service, filePath } = serviceWithStorePath("roomlog-trade-create-rollback-");
      blockAtomicWrite(filePath);
      assert.throws(() => service.createListing(owner, input), /EISDIR|directory|rename|write/i);
      assert.deepEqual(service.listListings(), []);
      assert.equal(existsSync(filePath), false);
    }

    for (const mutation of ["update", "delete", "contract"] as const) {
      const { service, filePath } = serviceWithStorePath(`roomlog-trade-${mutation}-rollback-`);
      const listing = service.createListing(owner, input);
      const beforeListings = structuredClone(service.listListings());
      const beforeFile = readFileSync(filePath, "utf8");
      blockAtomicWrite(filePath);

      const action = mutation === "update"
        ? () => service.updateListing(owner, listing.id, { title: "저장되면 안 되는 제목" })
        : mutation === "delete"
          ? () => service.deleteListing(owner, listing.id)
          : () => service.markListingContracted(listing.id);
      assert.throws(action, /EISDIR|directory|rename|write/i);
      assert.deepEqual(service.listListings(), beforeListings);
      assert.equal(readFileSync(filePath, "utf8"), beforeFile);
    }
  });

  it("rolls back failed inquiry creation and message sending", () => {
    const inquiryCase = serviceWithStorePath("roomlog-trade-inquiry-rollback-");
    const inquiryListing = inquiryCase.service.createListing(owner, input);
    const tenant = { id: "tenant-inquiry-rollback", name: "문의롤백 세입자" };
    const beforeInquiryFile = readFileSync(inquiryCase.filePath, "utf8");
    blockAtomicWrite(inquiryCase.filePath);

    assert.throws(
      () => inquiryCase.service.createInquiry(tenant, {
        listingId: inquiryListing.id,
        listingTitle: inquiryListing.title,
        message: "저장되면 안 되는 문의",
      }),
      /EISDIR|directory|rename|write/i,
    );
    assert.deepEqual(inquiryCase.service.listThreads(tenant.id), []);
    assert.equal(readFileSync(inquiryCase.filePath, "utf8"), beforeInquiryFile);

    const messageCase = serviceWithStorePath("roomlog-trade-message-rollback-");
    const messageListing = messageCase.service.createListing(owner, input);
    const thread = messageCase.service.createInquiry(tenant, {
      listingId: messageListing.id,
      listingTitle: messageListing.title,
      message: "정상 문의",
    });
    const beforeThread = structuredClone(messageCase.service.getThread(tenant.id, thread.id));
    const beforeMessageFile = readFileSync(messageCase.filePath, "utf8");
    blockAtomicWrite(messageCase.filePath);

    assert.throws(
      () => messageCase.service.sendMessage(tenant, thread.id, "저장되면 안 되는 메시지"),
      /EISDIR|directory|rename|write/i,
    );
    assert.deepEqual(messageCase.service.getThread(tenant.id, thread.id), beforeThread);
    assert.equal(readFileSync(messageCase.filePath, "utf8"), beforeMessageFile);
  });
});
