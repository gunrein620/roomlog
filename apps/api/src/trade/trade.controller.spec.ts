import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
        options: [],
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

  it("returns all listings by default but scopes to the owner with ?mine=1", () => {
    const calls: string[] = [];
    const ownerListings = [{ id: "mine-1" }] as unknown as TradeListing[];
    const allListings = [{ id: "mine-1" }, { id: "other-1" }] as unknown as TradeListing[];
    const controller = new TradeController(
      {
        listListings: () => {
          calls.push("all");
          return allListings;
        },
        listListingsByOwner: (ownerId: string) => {
          calls.push(`owner:${ownerId}`);
          return ownerListings;
        }
      } as any,
      { getUserFromToken: () => ({ id: "owner-1", name: "집주인" }) } as any,
      { notifyUsers: () => undefined } as any,
      { ensure: () => undefined } as any
    );

    // 기본(브라우징) — 전체 반환, 인증 불필요
    assert.equal(controller.listListings(undefined, undefined), allListings);
    // ?mine=1 — 소유자 스코프
    assert.equal(controller.listListings("Bearer owner", "1"), ownerListings);
    assert.deepEqual(calls, ["all", "owner:owner-1"]);
  });
});

describe("TradeController contract acceptance", () => {
  it("rejects missing, string, numeric, and null accept values before any collaborator is called", async () => {
    const calls = { trade: 0, preflight: 0, apply: 0, notify: 0 };
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
        preflight: () => {
          calls.preflight += 1;
        },
        ensure: () => {
          calls.apply += 1;
        },
      } as any,
    );

    for (const accept of [undefined, "false", 0, null]) {
      await assert.rejects(
        async () => controller.respondContract("Bearer token", "contract-1", { accept } as any),
        BadRequestException,
      );
    }
    assert.deepEqual(calls, { trade: 0, preflight: 0, apply: 0, notify: 0 });
  });

  it("rejects an unresolved interactive unit without accepting trade or mutating Roomlog", async () => {
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

    await assert.rejects(
      async () => controller.respondContract("Bearer token", proposed.id, { accept: true }),
      /호실.*확인|정확한 호실/,
    );

    assert.deepEqual(tradeService.contractForThread(tenant.id, thread.id), tradeBefore.contract);
    assert.deepEqual(tradeService.listListings(), tradeBefore.listing);
    assert.deepEqual(tradeService.getThread(tenant.id, thread.id), tradeBefore.thread);
    assert.deepEqual((roomlogService as unknown as { store: Store }).store, roomlogBefore);
    assert.equal(notifications, 0);
  });

  it("preflights before Trade persistence and applies Roomlog only afterward", async () => {
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
    const events: string[] = [];
    const controller = new TradeController(
      {
        respondContract: (
          _user: unknown,
          _contractId: string,
          _accept: boolean,
          beforeAccept?: (contract: TradeContract) => void,
        ) => {
          beforeAccept?.(accepted);
          events.push("trade-persisted");
          return { contract: accepted, thread };
        },
        ensureAcceptedListingDurability: async (contract: TradeContract) => {
          assert.equal(contract, accepted);
          events.push("trade-listing-durable");
        },
      } as any,
      { getUserFromToken: () => ({ id: accepted.tenantId, name: accepted.tenantName }) } as any,
      { notifyUsers: () => undefined } as any,
      {
        preflight: (contract: TradeContract) => {
          assert.equal(contract, accepted);
          events.push("roomlog-preflight");
        },
        ensure: async (contract: TradeContract) => {
          assert.equal(contract, accepted);
          events.push("roomlog-applied");
        },
      } as any
    );

    const result = await controller.respondContract("Bearer token", accepted.id, { accept: true });

    assert.equal(result, accepted);
    assert.deepEqual(events, [
      "roomlog-preflight",
      "trade-persisted",
      "trade-listing-durable",
      "roomlog-applied",
    ]);
  });

  it("keeps Trade durably accepted when Roomlog apply fails and repairs it on retry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-saga-apply-failure-"));
    const tradeFilePath = join(dir, "trade.json");
    const roomlogFilePath = join(dir, "roomlog.json");
    const tradeService = new TradeService(tradeFilePath);
    const roomlogService = new RoomlogService({ seedDemoData: false, storeFilePath: roomlogFilePath });
    const landlord = { id: "landlord-saga", name: "사가 임대인" };
    const tenant = { id: "tenant-saga", name: "사가 임차인" };
    const listing = tradeService.createListing(landlord, {
      title: "사가복구빌라",
      roomType: "원룸",
      tradeType: "월세",
      depositManwon: 1000,
      monthlyRentManwon: 65,
      location: "서울 서초구 사가로 1",
      detailAddress: "501호",
    });
    const thread = tradeService.createInquiry(tenant, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "사가 복구를 검증해요",
    });
    const proposed = tradeService.proposeContract(landlord, thread.id).contract;
    const roomlogBefore = structuredClone((roomlogService as unknown as { store: Store }).store);
    mkdirSync(`${roomlogFilePath}.tmp`);
    let notifications = 0;
    const controller = new TradeController(
      tradeService,
      { getUserFromToken: () => tenant } as any,
      { notifyUsers: () => { notifications += 1; } } as any,
      new TradeContractBillingBridge(tradeService, roomlogService),
    );

    await assert.rejects(
      async () => controller.respondContract("Bearer token", proposed.id, { accept: true }),
      /EISDIR|directory|rename|write/i,
    );

    const acceptedAfterFailure = tradeService.contractForThread(tenant.id, thread.id)!;
    const messageCountAfterFailure = tradeService.getThread(tenant.id, thread.id).messages.length;
    const diskAfterFailure = JSON.parse(readFileSync(tradeFilePath, "utf8")) as {
      contracts: TradeContract[];
    };
    assert.equal(acceptedAfterFailure.status, "accepted");
    assert.equal(typeof acceptedAfterFailure.respondedAt, "string");
    assert.equal(diskAfterFailure.contracts[0]?.status, "accepted");
    assert.equal(diskAfterFailure.contracts[0]?.respondedAt, acceptedAfterFailure.respondedAt);
    assert.deepEqual((roomlogService as unknown as { store: Store }).store, roomlogBefore);
    assert.equal(existsSync(roomlogFilePath), false);
    assert.equal(notifications, 0);

    rmSync(`${roomlogFilePath}.tmp`, { recursive: true });
    const retried = await controller.respondContract("Bearer token", proposed.id, { accept: true });
    const roomlogStore = (roomlogService as unknown as { store: Store }).store;

    assert.equal(retried.status, "accepted");
    assert.equal(retried.respondedAt, acceptedAfterFailure.respondedAt);
    assert.equal(tradeService.getThread(tenant.id, thread.id).messages.length, messageCountAfterFailure);
    assert.equal(roomlogStore.tenantRooms[tenant.id] !== undefined, true);
    assert.equal(roomlogStore.contracts.some((contract) => contract.id === `ct_trade_${proposed.id}`), true);
    assert.equal(notifications, 1);
  });

  it("reports a Roomlog projector failure and reprojects the same accepted event on retry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-saga-projector-"));
    const tradeService = new TradeService(join(dir, "trade.json"));
    let projectionAttempts = 0;
    const successfulSnapshots: Store[] = [];
    const roomlogService = new RoomlogService({
      seedDemoData: false,
      storeProjector: {
        persist: async (store) => {
          projectionAttempts += 1;
          if (projectionAttempts === 1) throw new Error("projector unavailable");
          successfulSnapshots.push(structuredClone(store));
        },
      },
    });
    const landlord = { id: "landlord-projector", name: "프로젝터 임대인" };
    const tenant = { id: "tenant-projector", name: "프로젝터 임차인" };
    const listing = tradeService.createListing(landlord, {
      title: "프로젝터복구빌라",
      roomType: "원룸",
      tradeType: "월세",
      depositManwon: 1000,
      monthlyRentManwon: 65,
      location: "서울 서초구 프로젝터로 1",
      detailAddress: "601호",
    });
    const thread = tradeService.createInquiry(tenant, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "프로젝터 복구를 검증해요",
    });
    const proposed = tradeService.proposeContract(landlord, thread.id).contract;
    const controller = new TradeController(
      tradeService,
      { getUserFromToken: () => tenant } as any,
      { notifyUsers: () => undefined } as any,
      new TradeContractBillingBridge(tradeService, roomlogService),
    );

    await assert.rejects(
      async () => controller.respondContract("Bearer token", proposed.id, { accept: true }),
      /projector unavailable/,
    );
    const accepted = tradeService.contractForThread(tenant.id, thread.id)!;
    const messageCount = tradeService.getThread(tenant.id, thread.id).messages.length;

    const repaired = await controller.respondContract("Bearer token", proposed.id, { accept: true });

    assert.equal(repaired.respondedAt, accepted.respondedAt);
    assert.equal(tradeService.getThread(tenant.id, thread.id).messages.length, messageCount);
    assert.equal(projectionAttempts, 2);
    assert.equal(successfulSnapshots.length, 1);
    assert.equal(successfulSnapshots[0].tenantRooms[tenant.id] !== undefined, true);
    assert.equal(
      successfulSnapshots[0].contracts.some((contract) => contract.id === `ct_trade_${proposed.id}`),
      true,
    );
  });

  it("awaits accepted listing projection before Roomlog and repairs the same acceptance on retry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-listing-projector-"));
    const tradeFilePath = join(dir, "trade.json");
    let failAcceptedProjection = true;
    let acceptedProjectionAttempts = 0;
    const projectedListings: TradeListing[][] = [];
    const tradeService = new TradeService(tradeFilePath, {
      storeProjector: {
        load: async () => [],
        persist: async (listings) => {
          if (listings.some((listing) => listing.status === "계약완료")) {
            acceptedProjectionAttempts += 1;
            if (failAcceptedProjection) {
              failAcceptedProjection = false;
              throw new Error("trade listing projector unavailable");
            }
          }
          projectedListings.push(structuredClone(listings));
        },
      } as any,
    });
    const roomlogService = new RoomlogService({ seedDemoData: false });
    const landlord = { id: "landlord-listing-projector", name: "매물프로젝터 임대인" };
    const tenant = { id: "tenant-listing-projector", name: "매물프로젝터 임차인" };
    const listing = tradeService.createListing(landlord, {
      title: "매물프로젝터복구빌라",
      roomType: "원룸",
      tradeType: "월세",
      depositManwon: 1000,
      monthlyRentManwon: 65,
      location: "서울 서초구 매물복구로 1",
      detailAddress: "801호",
    });
    const thread = tradeService.createInquiry(tenant, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "매물 프로젝션 복구를 검증해요",
    });
    const proposed = tradeService.proposeContract(landlord, thread.id).contract;
    const roomlogBefore = structuredClone((roomlogService as unknown as { store: Store }).store);
    let notifications = 0;
    const controller = new TradeController(
      tradeService,
      { getUserFromToken: () => tenant } as any,
      { notifyUsers: () => { notifications += 1; } } as any,
      new TradeContractBillingBridge(tradeService, roomlogService),
    );

    await assert.rejects(
      () => controller.respondContract("Bearer token", proposed.id, { accept: true }),
      /trade listing projector unavailable/,
    );

    const acceptedAfterFailure = tradeService.contractForThread(tenant.id, thread.id)!;
    const acceptanceMessages = tradeService.getThread(tenant.id, thread.id).messages
      .filter((message) => message.body.includes("계약 제안을 수락"));
    assert.equal(acceptedAfterFailure.status, "accepted");
    assert.equal(tradeService.listListings()[0].status, "계약완료");
    assert.deepEqual((roomlogService as unknown as { store: Store }).store, roomlogBefore);
    assert.equal(acceptanceMessages.length, 1);
    assert.equal(notifications, 0);

    const repaired = await controller.respondContract("Bearer token", proposed.id, { accept: true });
    const roomlogStore = (roomlogService as unknown as { store: Store }).store;

    assert.equal(repaired.respondedAt, acceptedAfterFailure.respondedAt);
    assert.equal(
      tradeService.getThread(tenant.id, thread.id).messages
        .filter((message) => message.body.includes("계약 제안을 수락")).length,
      1,
    );
    assert.equal(acceptedProjectionAttempts, 2);
    assert.equal(projectedListings.at(-1)?.find((item) => item.id === listing.id)?.status, "계약완료");
    assert.equal(roomlogStore.tenantRooms[tenant.id] !== undefined, true);
    assert.equal(roomlogStore.contracts.some((contract) => contract.id === `ct_trade_${proposed.id}`), true);
    assert.equal(notifications, 1);
  });
});
