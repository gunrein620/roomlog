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

function acceptContract(service: TradeService, title: string): TradeContract {
  const listing = service.createListing(landlord, {
    title,
    roomType: "원룸",
    tradeType: "월세",
    depositManwon: 1000,
    monthlyRentManwon: 65,
    location: "서울 서초구 방배동",
    detailAddress: "101호"
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
    const assignedRoom = roomlogService.assignTenantRoomFromContract(
      accepted.tenantId,
      accepted.landlordId,
      { title: accepted.listingTitle, location: accepted.location }
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].contract.tenantId, "tenant-demo");
    assert.equal(rows[0].contract.roomId, assignedRoom.id);
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
});
