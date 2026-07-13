import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { TradeController } from "./trade.controller";
import type { TradeContract, TradeListing, TradeThread } from "./trade.service";

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
      { respondContract: () => ({ contract: accepted, thread }) } as any,
      { getUserFromToken: () => ({ id: accepted.tenantId, name: accepted.tenantName }) } as any,
      { notifyUsers: () => undefined } as any,
      { ensure: (contract: TradeContract) => ensured.push(contract) } as any
    );

    const result = controller.respondContract("Bearer token", accepted.id, { accept: true });

    assert.equal(result, accepted);
    assert.deepEqual(ensured, [accepted]);
  });
});
