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

function acceptContract(service: TradeService, title: string, detailAddress = "101호"): TradeContract {
  const listing = service.createListing(landlord, {
    title,
    roomType: "원룸",
    tradeType: "월세",
    depositManwon: 1000,
    monthlyRentManwon: 65,
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
  it("backfills one billing draft for an accepted contract idempotently", () => {
    const tradeService = tradeServiceWithTempStore();
    const roomlogService = new RoomlogService({ seedDemoData: true });
    const accepted = acceptContract(tradeService, "기동보정빌라");
    const bridge = new TradeContractBillingBridge(tradeService, roomlogService);

    bridge.onModuleInit();
    bridge.onModuleInit();

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

  it("continues backfilling accepted contracts after an individual conflict", () => {
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

    bridge.onModuleInit();

    const healthyRows = roomlogService.getManagerContractDashboard("landlord-demo").rows
      .filter((row) => row.contract.id === `ct_trade_${healthy.id}`);
    const conflictingRows = roomlogService.getManagerContractDashboard("landlord-demo").rows
      .filter((row) => row.contract.id === `ct_trade_${conflicting.id}`);

    assert.equal(healthyRows.length, 1);
    assert.equal(healthyRows[0].origin, "trade_acceptance");
    assert.equal(conflictingRows.length, 0);
  });

  it("logs and skips an accepted startup record whose exact unit cannot be resolved", () => {
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

    bridge.onModuleInit();

    assert.deepEqual((roomlogService as unknown as { store: unknown }).store, before);
  });

  it("rejects an unsafe manwon-to-KRW conversion before any Roomlog mutation", () => {
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

    assert.throws(() => bridge.ensure(accepted), /안전한.*원 단위|safe integer|원 단위 정수/);
    assert.deepEqual((roomlogService as unknown as { store: unknown }).store, before);
  });
});
