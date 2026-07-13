import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { RoomlogService, type Store } from "../roomlog/roomlog.service";
import { TradeContractBillingBridge } from "./trade-contract-billing-bridge.service";
import { TradeController } from "./trade.controller";
import { TradeService, type TradeContract, type TradeListing, type TradeThread } from "./trade.service";

describe("TradeController realtime notifications", () => {
  it("includes the sender id so clients do not badge their own sent messages", () => {
    const thread: TradeThread = {
      id: "thread-1",
      listingId: "listing-1",
      listingTitle: "테스트 매물",
      buyerId: "buyer-1",
      buyerName: "구매자",
      ownerId: "owner-1",
      ownerName: "집주인",
      createdAt: "2026-07-07T00:00:00.000Z",
      updatedAt: "2026-07-07T00:00:00.000Z",
      messages: []
    };
    const sentPayloads: unknown[] = [];
    const controller = new TradeController(
      {
        sendMessage: () => thread
      } as any,
      {
        getUserFromToken: () => ({ id: "buyer-1", name: "구매자" })
      } as any,
      {
        notifyUsers: (_userIds: string[], _event: string, payload: unknown) => {
          sentPayloads.push(payload);
        }
      } as any,
      { ensure: () => undefined } as any
    );

    controller.sendMessage("Bearer token", "thread-1", { body: "안녕하세요" });

    assert.deepEqual(sentPayloads, [{ threadId: "thread-1", senderId: "buyer-1" }]);
  });
});

describe("TradeController public listings", () => {
  it("delegates public listing reads to the public feed", () => {
    const publicListings: TradeListing[] = [
      {
        id: "listing-1",
        ownerId: "owner-1",
        ownerName: "집주인",
        title: "공개 매물",
        roomType: "원룸",
        tradeType: "월세",
        depositManwon: 1000,
        monthlyRentManwon: 50,
        location: "서울 서초구 방배동",
        description: "",
        images: [],
        status: "노출중",
        createdAt: "2026-07-09T00:00:00.000Z"
      }
    ];
    const controller = new TradeController(
      {
        listPublicListings: () => publicListings
      } as any,
      {} as any,
      { notifyUsers: () => undefined } as any,
      { ensure: () => undefined } as any
    );

    assert.equal(controller.listPublicListings(), publicListings);
  });
});

describe("TradeController contract acceptance", () => {
  it("rejects missing, string, numeric, and null accept values before any collaborator is called", () => {
    const calls = { trade: 0, bridge: 0, notify: 0 };
    const controller = new TradeController(
      {
        respondContract: () => {
          calls.trade += 1;
          throw new Error("must not be called");
        },
      } as any,
      {
        getUserFromToken: () => ({ id: "tenant-demo", name: "김민수" }),
      } as any,
      {
        notifyUsers: () => {
          calls.notify += 1;
        },
      } as any,
      {
        ensure: () => {
          calls.bridge += 1;
        },
      } as any,
    );

    for (const accept of [undefined, "false", 0, null]) {
      assert.throws(
        () => controller.respondContract("Bearer token", "contract-1", { accept } as any),
        BadRequestException,
      );
    }
    assert.deepEqual(calls, { trade: 0, bridge: 0, notify: 0 });
  });

  it("rejects an unresolved interactive unit without accepting trade or mutating Roomlog", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-controller-atomic-"));
    const tradeService = new TradeService(join(dir, "trade.json"));
    const roomlogService = new RoomlogService({ seedDemoData: false, storeFilePath: join(dir, "roomlog.json") });
    const landlord = { id: "landlord-no-unit", name: "호실없는 임대인" };
    const tenant = { id: "tenant-no-unit", name: "호실없는 임차인" };
    const listing = tradeService.createListing(landlord, {
      title: "호실 미확인 매물",
      roomType: "원룸",
      tradeType: "월세",
      depositManwon: 1000,
      monthlyRentManwon: 65,
      location: "서울 서초구 방배로 99",
    });
    const thread = tradeService.createInquiry(tenant, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "계약하고 싶어요",
    });
    const proposed = tradeService.proposeContract(landlord, thread.id).contract;
    const tradeBefore = {
      contract: structuredClone(tradeService.contractForThread(tenant.id, thread.id)),
      listing: structuredClone(tradeService.listListings()),
      thread: structuredClone(tradeService.getThread(tenant.id, thread.id)),
    };
    const roomlogBefore = structuredClone((roomlogService as unknown as { store: Store }).store);
    let notifications = 0;
    const controller = new TradeController(
      tradeService,
      { getUserFromToken: () => tenant } as any,
      { notifyUsers: () => { notifications += 1; } } as any,
      new TradeContractBillingBridge(tradeService, roomlogService),
    );

    assert.throws(
      () => controller.respondContract("Bearer token", proposed.id, { accept: true }),
      /호실.*확인|정확한 호실/,
    );

    assert.deepEqual(tradeService.contractForThread(tenant.id, thread.id), tradeBefore.contract);
    assert.deepEqual(tradeService.listListings(), tradeBefore.listing);
    assert.deepEqual(tradeService.getThread(tenant.id, thread.id), tradeBefore.thread);
    assert.deepEqual((roomlogService as unknown as { store: Store }).store, roomlogBefore);
    assert.equal(notifications, 0);
  });

  it("ensures billing once when the trade service returns an accepted contract", () => {
    const accepted: TradeContract = {
      id: "contract-1",
      listingId: "listing-1",
      listingTitle: "계약 매물",
      threadId: "thread-1",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      tenantId: "tenant-demo",
      tenantName: "김민수",
      status: "accepted",
      tradeType: "월세",
      depositManwon: 1000,
      monthlyRentManwon: 65,
      location: "서울 서초구 방배동 101호",
      proposedAt: "2026-07-13T00:00:00.000Z",
      respondedAt: "2026-07-13T00:01:00.000Z"
    };
    const thread: TradeThread = {
      id: "thread-1",
      listingId: "listing-1",
      listingTitle: accepted.listingTitle,
      buyerId: accepted.tenantId,
      buyerName: accepted.tenantName,
      ownerId: accepted.landlordId,
      ownerName: accepted.landlordName,
      createdAt: accepted.proposedAt,
      updatedAt: accepted.respondedAt!,
      messages: []
    };
    const ensured: TradeContract[] = [];
    const controller = new TradeController(
      {
        respondContract: (
          _user: unknown,
          _contractId: string,
          _accept: boolean,
          beforeAccept?: (contract: TradeContract) => void,
        ) => {
          beforeAccept?.(accepted);
          return { contract: accepted, thread };
        },
      } as any,
      { getUserFromToken: () => ({ id: accepted.tenantId, name: accepted.tenantName }) } as any,
      { notifyUsers: () => undefined } as any,
      { ensure: (contract: TradeContract) => ensured.push(contract) } as any
    );

    const result = controller.respondContract("Bearer token", accepted.id, { accept: true });

    assert.equal(result, accepted);
    assert.deepEqual(ensured, [accepted]);
  });
});
