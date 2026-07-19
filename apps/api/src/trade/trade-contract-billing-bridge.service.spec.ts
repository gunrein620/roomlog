import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomlogService } from "../roomlog/roomlog.service";
import { TradeContractBillingBridge } from "./trade-contract-billing-bridge.service";
import { TradeService, type TradeContract } from "./trade.service";

const landlord = { id: "landlord-demo", name: "박관리" };
const tenant = { id: "tenant-demo", name: "김민수" };

function tradeServiceWithTempStore() {
  const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-bridge-"));
  return new TradeService(join(dir, "trade-store.json"));
}

function acceptContract(
  service: TradeService,
  title: string,
  detailAddress = "101호",
  maintenanceFeeManwon?: number,
): TradeContract {
  const listing = service.createListing(landlord, {
    title,
    roomType: "원룸",
    tradeType: "월세",
    depositManwon: 1000,
    monthlyRentManwon: 65,
    ...(maintenanceFeeManwon !== undefined ? { maintenanceFeeManwon } : {}),
    location: `서울 서초구 ${title}길 1`,
    detailAddress
  });
  const thread = service.createInquiry(tenant, {
    listingId: listing.id,
    listingTitle: listing.title,
    message: "계약하고 싶어요"
  });
  const proposed = service.proposeContract(landlord, thread.id).contract;
  return service.respondContract(tenant, proposed.id, true).contract;
}

describe("TradeContractBillingBridge", () => {
  it("carries the listing maintenance fee into the accepted contract draft", async () => {
    const tradeService = tradeServiceWithTempStore();
    const roomlogService = new RoomlogService({ seedDemoData: false });
    const accepted = acceptContract(tradeService, "관리비연동빌라", "501호", 5);
    const bridge = new TradeContractBillingBridge(tradeService, roomlogService);

    await bridge.ensure(accepted);

    const detail = roomlogService.getManagerContractDetail(
      landlord.id,
      `ct_trade_${accepted.id}`,
    );
    assert.equal(detail.row.contract.maintenanceFee, 50_000);
    assert.equal(detail.manualValues.maintenanceFee, "50,000원");
  });

  it("backfills a missing fee on an unverified legacy trade contract", async () => {
    const tradeService = tradeServiceWithTempStore();
    const roomlogService = new RoomlogService({ seedDemoData: false });
    const accepted = acceptContract(tradeService, "기존관리비빌라", "502호", 5);
    const bridge = new TradeContractBillingBridge(tradeService, roomlogService);

    roomlogService.connectAcceptedTradeContract({
      tradeContractId: accepted.id,
      listingTitle: accepted.listingTitle,
      location: accepted.location,
      roomNo: accepted.roomNo,
      tenantId: accepted.tenantId,
      landlordId: accepted.landlordId,
      landlordName: accepted.landlordName,
      depositKrw: accepted.depositManwon * 10_000,
      monthlyRent: accepted.monthlyRentManwon * 10_000,
      acceptedAt: accepted.respondedAt!,
    });

    await bridge.ensure(accepted);

    const detail = roomlogService.getManagerContractDetail(
      landlord.id,
      `ct_trade_${accepted.id}`,
    );
    assert.equal(detail.row.contract.maintenanceFee, 50_000);
    assert.equal(detail.manualValues.maintenanceFee, "50,000원");
  });

  it("does not overwrite a manually entered maintenance fee during legacy backfill", async () => {
    const tradeService = tradeServiceWithTempStore();
    const roomlogService = new RoomlogService({ seedDemoData: false });
    const accepted = acceptContract(tradeService, "수동관리비빌라", "503호", 5);
    const bridge = new TradeContractBillingBridge(tradeService, roomlogService);
    const legacy = roomlogService.connectAcceptedTradeContract({
      tradeContractId: accepted.id,
      listingTitle: accepted.listingTitle,
      location: accepted.location,
      roomNo: accepted.roomNo,
      tenantId: accepted.tenantId,
      landlordId: accepted.landlordId,
      landlordName: accepted.landlordName,
      depositKrw: accepted.depositManwon * 10_000,
      monthlyRent: accepted.monthlyRentManwon * 10_000,
      acceptedAt: accepted.respondedAt!,
    });
    roomlogService.updateManagerContractManualValues(landlord.id, legacy.id, {
      maintenanceFee: 70_000,
    });

    await bridge.ensure(accepted);

    const detail = roomlogService.getManagerContractDetail(landlord.id, legacy.id);
    assert.equal(detail.row.contract.maintenanceFee, 70_000);
    assert.equal(detail.manualValues.maintenanceFee, "70,000원");
  });

  it("backfills one billing draft for an accepted contract idempotently", async () => {
    const tradeService = tradeServiceWithTempStore();
    const roomlogService = new RoomlogService({ seedDemoData: true });
    const accepted = acceptContract(tradeService, "기동보정빌라");
    const bridge = new TradeContractBillingBridge(tradeService, roomlogService);

    await bridge.onModuleInit();
    await bridge.onModuleInit();

    const rows = roomlogService.getManagerContractDashboard("landlord-demo").rows
      .filter((row) => row.contract.id === `ct_trade_${accepted.id}`);
    const store = (roomlogService as unknown as {
      store: {
        rooms: Array<{ id: string; roomNo: string; address: string }>;
        tenantRooms: Record<string, string>;
      };
    }).store;
    const assignedRoomId = store.tenantRooms[accepted.tenantId];
    const assignedRoom = store.rooms.find((room) => room.id === assignedRoomId);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].contract.tenantId, "tenant-demo");
    assert.equal(rows[0].contract.roomId, assignedRoomId);
    assert.equal(assignedRoom?.roomNo, "101");
    assert.equal(assignedRoom?.address, "서울 서초구 기동보정빌라길 1");
    assert.equal(rows[0].origin, "trade_acceptance");
  });

  it("continues backfilling accepted contracts after an individual conflict", async () => {
    const tradeService = tradeServiceWithTempStore();
    const roomlogService = new RoomlogService({ seedDemoData: true });
    const healthy = acceptContract(tradeService, "정상보정빌라");
    const conflicting = acceptContract(tradeService, "충돌보정빌라");
    const conflictingRoom = roomlogService.assignTenantRoomFromContract(
      "other-tenant",
      conflicting.landlordId,
      { title: conflicting.listingTitle, location: conflicting.location }
    );
    const active = roomlogService.ensureTradeContractDraft({
      tradeContractId: "existing-other-tenant",
      roomId: conflictingRoom.id,
      tenantId: "other-tenant",
      landlordId: conflicting.landlordId,
      landlordName: conflicting.landlordName,
      depositKrw: 5_000_000,
      monthlyRent: 500_000
    });
    const store = (roomlogService as unknown as {
      store: { contracts: Array<{ id: string; lifecycle: string }> };
    }).store;
    store.contracts.find((contract) => contract.id === active.id)!.lifecycle = "active";
    const bridge = new TradeContractBillingBridge(tradeService, roomlogService);

    await bridge.onModuleInit();

    const healthyRows = roomlogService.getManagerContractDashboard("landlord-demo").rows
      .filter((row) => row.contract.id === `ct_trade_${healthy.id}`);
    const conflictingRows = roomlogService.getManagerContractDashboard("landlord-demo").rows
      .filter((row) => row.contract.id === `ct_trade_${conflicting.id}`);

    assert.equal(healthyRows.length, 1);
    assert.equal(healthyRows[0].origin, "trade_acceptance");
    assert.equal(conflictingRows.length, 0);
  });

  it("logs and skips an accepted startup record whose exact unit cannot be resolved", async () => {
    const tradeService = tradeServiceWithTempStore();
    const listing = tradeService.createListing(landlord, {
      title: "호실누락보정빌라",
      roomType: "원룸",
      tradeType: "월세",
      depositManwon: 1000,
      monthlyRentManwon: 65,
      location: "서울 서초구 호실누락길 1",
    });
    const thread = tradeService.createInquiry(tenant, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "계약하고 싶어요",
    });
    const proposed = tradeService.proposeContract(landlord, thread.id).contract;
    tradeService.respondContract(tenant, proposed.id, true);
    const roomlogService = new RoomlogService({ seedDemoData: false });
    const before = structuredClone((roomlogService as unknown as { store: unknown }).store);
    const bridge = new TradeContractBillingBridge(tradeService, roomlogService);

    await bridge.onModuleInit();

    assert.deepEqual((roomlogService as unknown as { store: unknown }).store, before);
  });

  it("rejects an unsafe manwon-to-KRW conversion before any Roomlog mutation", async () => {
    const tradeService = tradeServiceWithTempStore();
    const roomlogService = new RoomlogService({ seedDemoData: false });
    const before = structuredClone((roomlogService as unknown as { store: unknown }).store);
    const bridge = new TradeContractBillingBridge(tradeService, roomlogService);
    const accepted = {
      id: "unsafe-money",
      listingId: "listing-unsafe",
      listingTitle: "안전정수빌라",
      threadId: "thread-unsafe",
      landlordId: landlord.id,
      landlordName: landlord.name,
      tenantId: tenant.id,
      tenantName: tenant.name,
      status: "accepted" as const,
      tradeType: "월세" as const,
      depositManwon: Number.MAX_SAFE_INTEGER,
      monthlyRentManwon: 65,
      location: "서울 서초구 안전정수길 1 101호",
      roomNo: "101호",
      proposedAt: "2026-07-13T01:00:00.000Z",
      respondedAt: "2026-07-13T01:01:00.000Z",
    } as TradeContract & { roomNo: string };

    await assert.rejects(
      async () => bridge.ensure(accepted),
      /안전한.*원 단위|safe integer|원 단위 정수/,
    );
    assert.deepEqual((roomlogService as unknown as { store: unknown }).store, before);
  });

  it("awaits startup projection and retries the latest accepted snapshot after recovery", async () => {
    const tradeService = tradeServiceWithTempStore();
    const accepted = acceptContract(tradeService, "기동프로젝터복구빌라", "707호");
    let attempts = 0;
    const successfulStores: Array<{
      tenantRooms: Record<string, string>;
      contracts: Array<{ id: string }>;
    }> = [];
    const roomlogService = new RoomlogService({
      seedDemoData: false,
      storeProjector: {
        persist: async (store) => {
          attempts += 1;
          if (attempts === 1) throw new Error("startup projector unavailable");
          successfulStores.push(structuredClone(store));
        },
      },
    });
    const bridge = new TradeContractBillingBridge(tradeService, roomlogService);

    await bridge.onModuleInit();
    assert.equal(attempts, 1);

    await bridge.onModuleInit();

    assert.equal(attempts, 2);
    assert.equal(successfulStores.length, 1);
    assert.equal(successfulStores[0].tenantRooms[accepted.tenantId] !== undefined, true);
    assert.equal(
      successfulStores[0].contracts.some((contract) => contract.id === `ct_trade_${accepted.id}`),
      true,
    );
  });

  it("continues with a newer startup generation without a redundant retry after an older failure", async () => {
    const tradeService = tradeServiceWithTempStore();
    acceptContract(tradeService, "다중기동첫빌라", "801호");
    const second = acceptContract(tradeService, "다중기동둘빌라", "802호");
    let attempts = 0;
    const successfulStores: Array<{
      contracts: Array<{ id: string }>;
    }> = [];
    const roomlogService = new RoomlogService({
      seedDemoData: false,
      storeProjector: {
        persist: async (store) => {
          attempts += 1;
          if (attempts === 1) throw new Error("older startup generation failed");
          successfulStores.push(structuredClone(store));
        },
      },
    });
    const bridge = new TradeContractBillingBridge(tradeService, roomlogService);

    await bridge.onModuleInit();

    assert.equal(attempts, 2);
    assert.equal(successfulStores.length, 1);
    assert.equal(
      successfulStores[0].contracts.some((contract) => contract.id === `ct_trade_${second.id}`),
      true,
    );
  });
});
