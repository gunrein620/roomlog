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

  it("does not leave partial draft state when deposit validation fails", () => {
    const service = new RoomlogService();
    const room = createTradeRoom(service, "검증원자성빌라");
    const input = {
      tradeContractId: "invalid-deposit",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000.5,
      monthlyRent: 650_000,
    };

    assert.throws(() => service.ensureTradeContractDraft(input), /보증금는 0 이상의 원 단위 정수/);

    const contractId = "ct_trade_invalid-deposit";
    const store = (service as unknown as {
      store: {
        contracts: Array<{ id: string }>;
        contractExtractions: Array<{ contractId: string }>;
        contractPrivacies: Array<{ contractId: string }>;
        contractDocuments: Array<{ contractId: string }>;
      };
    }).store;
    assert.equal(store.contracts.some((contract) => contract.id === contractId), false);
    assert.equal(store.contractExtractions.some((extraction) => extraction.contractId === contractId), false);
    assert.equal(store.contractPrivacies.some((privacy) => privacy.contractId === contractId), false);
    assert.equal(store.contractDocuments.some((document) => document.contractId === contractId), false);

    const retried = service.ensureTradeContractDraft({ ...input, depositKrw: 10_000_000 });
    assert.equal(retried.id, contractId);
  });

  it("displays zero rent as a currency-shaped draft value", () => {
    const service = new RoomlogService();
    const room = createTradeRoom(service, "월세제로빌라");
    const draft = service.ensureTradeContractDraft({
      tradeContractId: "zero-rent",
      roomId: room.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 0,
    });

    const detail = service.getManagerContractDetail("landlord-demo", draft.id);
    assert.equal(draft.monthlyRent, 0);
    assert.equal(detail.manualValues.rent, "0원");
    assert.equal(detail.extraction.items.find((item) => item.label === "월세")?.value, "0원");
  });

  it("rejects a deterministic relationship conflict before same-party active reuse", () => {
    const service = new RoomlogService();
    const existingRoom = createTradeRoom(service, "결정적ID기존빌라");
    service.ensureTradeContractDraft({
      tradeContractId: "relationship-conflict",
      roomId: existingRoom.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    });

    const requestedRoom = createTradeRoom(service, "결정적ID요청빌라");
    const active = service.ensureTradeContractDraft({
      tradeContractId: "requested-active",
      roomId: requestedRoom.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    });
    const store = (service as unknown as { store: { contracts: Array<Record<string, unknown>> } }).store;
    const storedActive = store.contracts.find((contract) => contract.id === active.id)!;
    storedActive.lifecycle = "active";

    assert.throws(() => service.ensureTradeContractDraft({
      tradeContractId: "relationship-conflict",
      roomId: requestedRoom.id,
      tenantId: "tenant-demo",
      landlordId: "landlord-demo",
      landlordName: "박관리",
      depositKrw: 10_000_000,
      monthlyRent: 650_000,
    }), /동일한 거래 계약 ID가 다른 계약 관계/);
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

    const otherLandlord = service.signup({
      email: "trade-scope-landlord@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "외부 임대인",
      phone: "010-7788-1001",
      role: "LANDLORD",
      buildingName: "외부관리빌라",
      roomNo: "201호",
      address: "서울 서초구 외부로 2",
    });

    assert.equal(service.getManagerContractDashboard("tenant-demo").rows.some(
      (row) => row.contract.id === draft.id,
    ), false);
    assert.equal(service.getManagerContractDashboard(otherLandlord.userId).rows.some(
      (row) => row.contract.id === draft.id,
    ), false);
    assert.throws(
      () => service.getManagerContractDetail(otherLandlord.userId, draft.id),
      /관리 가능한 계약서를 찾을 수 없습니다/,
    );

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
