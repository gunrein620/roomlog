import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { RoomlogService } from "./roomlog.service";

function createTradeRoom(service: RoomlogService, title = "거래연결빌라") {
  return service.assignTenantRoomFromContract("tenant-demo", "landlord-demo", {
    title,
    location: "서울 서초구 방배동 101호",
  });
}

describe("trade contract billing bridge", () => {
  it("creates one unverified billing contract draft on the exact assigned room", () => {
    const service = new RoomlogService();
    const room = createTradeRoom(service);
    const input = {
      tradeContractId: "trade-contract-1",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    };

    const first = service.ensureTradeContractDraft(input);
    const second = service.ensureTradeContractDraft(input);
    const rows = service.getManagerContractDashboard("landlord-demo").rows
      .filter((row) => row.contract.id === "ct_trade_trade-contract-1");

    assert.equal(first.id, "ct_trade_trade-contract-1");
    assert.equal(first.roomId, room.id);
    assert.equal(first.tenantId, "tenant-demo");
    assert.equal(first.lifecycle, "analyzing");
    assert.equal(first.review, "pending");
    assert.equal(first.valueSource, "unverified");
    assert.equal(first.monthlyRent, 650_000);
    assert.equal(first.maintenanceFee, undefined);
    assert.equal(first.paymentDay, undefined);
    assert.equal(first.startDate, undefined);
    assert.equal(first.endDate, undefined);
    assert.equal(second.id, first.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].origin, "trade_acceptance");

    const detail = service.getManagerContractDetail("landlord-demo", first.id);
    assert.equal(detail.manualValues.deposit, "10,000,000원");
    assert.equal(detail.extraction.items.find((item) => item.label === "보증금")?.needsCheck, true);
    const store = (service as unknown as {
      store: { contractDocuments: Array<{ contractId: string }> };
    }).store;
    assert.equal(store.contractDocuments.some((document) => document.contractId === first.id), false);
  });

  it("does not expose another landlord's trade draft and rejects an active different tenant", () => {
    const service = new RoomlogService();
    const room = createTradeRoom(service, "권한검증빌라");
    const draft = service.ensureTradeContractDraft({
      tradeContractId: "scope-1",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    });

    assert.equal(service.getManagerContractDashboard("tenant-demo").rows.some(
      (row) => row.contract.id === draft.id,
    ), false);

    const store = (service as unknown as { store: { contracts: Array<Record<string, unknown>> } }).store;
    const storedDraft = store.contracts.find((contract) => contract.id === draft.id)!;
    storedDraft.lifecycle = "active";
    storedDraft.review = "confirmed";
    storedDraft.valueSource = "confirmed";

    const sameParty = service.ensureTradeContractDraft({
      tradeContractId: "scope-same-party",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    });
    assert.equal(sameParty.id, draft.id);

    assert.throws(() => service.ensureTradeContractDraft({
      tradeContractId: "scope-2",
      roomId: room.id,
      tenantId: "other-tenant",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 5_000_000,
      monthlyRent: 500_000,
    }), /다른 임차인의 활성 계약/);
  });
});
