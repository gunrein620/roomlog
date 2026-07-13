import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Contract } from "./roomlog.types";
import { RoomlogService, type Store } from "./roomlog.service";

type AtomicTradeConnectionInput = {
  tradeContractId: string;
  listingTitle: string;
  location: string;
  roomNo?: string;
  tenantId: string;
  landlordId: string;
  landlordName: string;
  depositKrw: number;
  monthlyRent: number;
  acceptedAt: string;
};

function connect(service: RoomlogService, input: AtomicTradeConnectionInput): Contract {
  return (service as unknown as {
    connectAcceptedTradeContract(input: AtomicTradeConnectionInput): Contract;
  }).connectAcceptedTradeContract(input);
}

function storeOf(service: RoomlogService): Store {
  return (service as unknown as { store: Store }).store;
}

function storeSnapshot(service: RoomlogService): Store {
  return structuredClone(storeOf(service));
}

function emptyStore(): Store {
  return storeSnapshot(new RoomlogService({ seedDemoData: false }));
}

function input(
  tradeContractId: string,
  roomNo: string | undefined,
  tenantId: string,
  acceptedAt: string,
): AtomicTradeConnectionInput {
  return {
    tradeContractId,
    listingTitle: "정확호실빌라",
    location: roomNo ? `서울 서초구 방배로 88 ${roomNo}` : "서울 서초구 방배로 88",
    roomNo,
    tenantId,
    landlordId: "landlord-exact",
    landlordName: "정확 임대인",
    depositKrw: 10_000_000,
    monthlyRent: 650_000,
    acceptedAt,
  };
}

describe("atomic accepted trade contract connection", () => {
  it("maps two units at the same landlord and physical address to their explicit room ids", () => {
    const initialStore = emptyStore();
    initialStore.rooms.push(
      {
        id: "room-exact-101",
        buildingName: "기존 건물명",
        roomNo: "101",
        address: "서울 서초구 방배로 88",
        landlordId: "landlord-exact",
      },
      {
        id: "room-exact-102",
        buildingName: "다른 표시명",
        roomNo: "102호",
        address: "서울 서초구 방배로 88 102호",
        landlordId: "landlord-exact",
      },
    );
    const service = new RoomlogService({ seedDemoData: false, initialStore });

    const first = connect(service, input("trade-unit-101", "101호", "tenant-101", "2026-07-13T01:00:00.000Z"));
    const second = connect(service, input("trade-unit-102", "102호", "tenant-102", "2026-07-13T02:00:00.000Z"));

    assert.equal(first.roomId, "room-exact-101");
    assert.equal(second.roomId, "room-exact-102");
    assert.notEqual(first.roomId, second.roomId);
    assert.deepEqual(
      storeOf(service).rooms.map(({ id, roomNo, address }) => ({ id, roomNo, address })),
      [
        { id: "room-exact-101", roomNo: "101", address: "서울 서초구 방배로 88" },
        { id: "room-exact-102", roomNo: "102호", address: "서울 서초구 방배로 88 102호" },
      ],
    );
    assert.deepEqual(storeOf(service).tenantRooms, {
      "tenant-101": "room-exact-101",
      "tenant-102": "room-exact-102",
    });
  });

  it("resolves one unambiguous trailing unit for a backward-compatible accepted record", () => {
    const service = new RoomlogService({ seedDemoData: false });
    const legacy = input("trade-legacy-unit", undefined, "tenant-legacy", "2026-07-13T00:30:00.000Z");
    legacy.location = "서울 서초구 방배로 88 404호";

    const connected = connect(service, legacy);
    const room = storeOf(service).rooms.find((candidate) => candidate.id === connected.roomId);

    assert.equal(connected.unitId, "404");
    assert.equal(room?.roomNo, "404");
    assert.equal(room?.address, "서울 서초구 방배로 88");
    assert.equal(storeOf(service).tenantRooms["tenant-legacy"], connected.roomId);
  });

  it("rejects missing and ambiguous units without mutating any Roomlog state or file", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-atomic-unit-"));
    const storeFilePath = join(dir, "roomlog.json");
    const service = new RoomlogService({ seedDemoData: false, storeFilePath });
    const before = storeSnapshot(service);

    assert.throws(
      () => connect(service, input("trade-missing", undefined, "tenant-missing", "2026-07-13T01:00:00.000Z")),
      /호실.*확인|정확한 호실/,
    );
    assert.throws(
      () => connect(service, input("trade-ambiguous", "101호 또는 102호", "tenant-ambiguous", "2026-07-13T01:01:00.000Z")),
      /호실.*하나|정확한 호실/,
    );

    assert.deepEqual(storeSnapshot(service), before);
    assert.equal(existsSync(storeFilePath), false);
  });

  it("rejects blank deterministic ids, blank landlords, and invalid accepted-event times without mutation", () => {
    const service = new RoomlogService({ seedDemoData: false });
    const before = storeSnapshot(service);
    const valid = input("trade-validation", "101호", "tenant-validation", "2026-07-13T01:00:00.000Z");

    assert.throws(
      () => connect(service, { ...valid, tradeContractId: "   " }),
      /거래 계약 ID/,
    );
    assert.throws(
      () => connect(service, { ...valid, landlordId: "   " }),
      /임대인/,
    );
    assert.throws(
      () => connect(service, { ...valid, acceptedAt: "not-a-date" }),
      /수락 시각/,
    );
    assert.deepEqual(storeSnapshot(service), before);
  });

  it("leaves every collection, tenant relation, and persisted file unchanged on an active other-tenant conflict", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-atomic-conflict-"));
    const storeFilePath = join(dir, "roomlog.json");
    const service = new RoomlogService({ seedDemoData: false, storeFilePath });
    const active = connect(service, input("trade-active", "101호", "tenant-active", "2026-07-13T01:00:00.000Z"));
    service.updateManagerContractManualValues("landlord-exact", active.id, {
      maintenanceFee: 0,
      paymentDay: 10,
      startDate: "2026-07-13",
      endDate: "2099-07-12",
    });
    service.confirmManagerContractReview("landlord-exact", active.id, { confirmNeedsCheck: true });
    const before = storeSnapshot(service);
    const persistedBefore = readFileSync(storeFilePath, "utf8");

    assert.throws(
      () => connect(service, input("trade-conflict", "101호", "tenant-conflict", "2026-07-13T02:00:00.000Z")),
      /다른 임차인의 활성 계약/,
    );

    const after = storeSnapshot(service);
    assert.deepEqual(after.tenantRooms, before.tenantRooms);
    assert.deepEqual(after.rooms, before.rooms);
    assert.deepEqual(after.contracts, before.contracts);
    assert.deepEqual(after.contractExtractions, before.contractExtractions);
    assert.deepEqual(after.contractPrivacies, before.contractPrivacies);
    assert.deepEqual(after.contractDocuments, before.contractDocuments);
    assert.equal(readFileSync(storeFilePath, "utf8"), persistedBefore);
  });

  it("does not let an older accepted event replace a newer tenant relation and keeps current replay idempotent", async () => {
    const persisted: Store[] = [];
    const service = new RoomlogService({
      seedDemoData: false,
      storeProjector: {
        persist: (store) => {
          persisted.push(structuredClone(store));
        },
      },
    });
    const newerInput = input("trade-newer", "202호", "tenant-moving", "2026-07-13T02:00:00.000Z");
    const newer = connect(service, newerInput);
    await service.flushPersistence();
    const afterNewer = storeSnapshot(service);

    const staleResult = connect(
      service,
      input("trade-older", "101호", "tenant-moving", "2026-07-13T01:00:00.000Z"),
    );
    const replayed = connect(service, newerInput);
    await service.flushPersistence();

    assert.equal(staleResult.id, "ct_trade_trade-newer");
    assert.equal(replayed.id, newer.id);
    assert.equal(storeOf(service).tenantRooms["tenant-moving"], newer.roomId);
    assert.deepEqual(storeSnapshot(service), afterNewer);
    assert.equal(persisted.length, 1);
  });

  it("persists a newer accepted marker on a reused active contract and blocks an older room after replay", async () => {
    const initialStore = emptyStore();
    initialStore.rooms.push(
      {
        id: "room-reuse-a",
        buildingName: "재사용빌라",
        roomNo: "101",
        address: "서울 서초구 방배로 88",
        landlordId: "landlord-exact",
      },
      {
        id: "room-reuse-b",
        buildingName: "재사용빌라",
        roomNo: "202",
        address: "서울 서초구 방배로 88",
        landlordId: "landlord-exact",
      },
    );
    initialStore.contracts.push({
      id: "ct_legacy_active_b",
      roomId: "room-reuse-b",
      tenantId: "tenant-reuse",
      managerId: "landlord-exact",
      unitId: "202",
      landlordName: "정확 임대인",
      lifecycle: "active",
      review: "confirmed",
      deletion: "none",
      valueSource: "confirmed",
      monthlyRent: 650_000,
      maintenanceFee: 0,
      paymentDay: 10,
      optionInventory: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    initialStore.tenantRooms["tenant-reuse"] = "room-reuse-a";
    const projected: Store[] = [];
    const service = new RoomlogService({
      seedDemoData: false,
      initialStore,
      storeProjector: {
        persist: (store) => {
          projected.push(structuredClone(store));
        },
      },
    });
    const newerInput = input("trade-reuse-newer", "202호", "tenant-reuse", "2026-07-13T02:00:00.000Z");

    const reused = connect(service, newerInput);
    await service.flushPersistence();
    const afterNewer = storeSnapshot(service);
    const stale = connect(
      service,
      input("trade-reuse-older", "101호", "tenant-reuse", "2026-07-13T01:00:00.000Z"),
    );
    const replayed = connect(service, newerInput);
    await service.flushPersistence();

    const active = storeOf(service).contracts.find((contract) => contract.id === "ct_legacy_active_b");
    assert.equal(reused.id, "ct_legacy_active_b");
    assert.equal(stale.id, "ct_legacy_active_b");
    assert.equal(replayed.id, "ct_legacy_active_b");
    assert.equal(active?.tradeAcceptedAt, "2026-07-13T02:00:00.000Z");
    assert.equal(active?.updatedAt, "2026-07-13T02:00:00.000Z");
    assert.equal(storeOf(service).tenantRooms["tenant-reuse"], "room-reuse-b");
    assert.deepEqual(storeSnapshot(service), afterNewer);
    assert.equal(projected.length, 1);
  });

  it("uses persisted timestamps after an RDS-style round trip strips optional accepted markers", async () => {
    const initialStore = emptyStore();
    initialStore.rooms.push(
      {
        id: "room-rds-a",
        buildingName: "RDS재사용빌라",
        roomNo: "101",
        address: "서울 서초구 방배로 88",
        landlordId: "landlord-exact",
      },
      {
        id: "room-rds-b",
        buildingName: "RDS재사용빌라",
        roomNo: "202",
        address: "서울 서초구 방배로 88",
        landlordId: "landlord-exact",
      },
    );
    initialStore.contracts.push({
      id: "ct_legacy_rds_active",
      roomId: "room-rds-b",
      tenantId: "tenant-rds-reuse",
      managerId: "landlord-exact",
      unitId: "202",
      landlordName: "정확 임대인",
      lifecycle: "active",
      review: "confirmed",
      deletion: "none",
      valueSource: "confirmed",
      monthlyRent: 650_000,
      maintenanceFee: 0,
      paymentDay: 10,
      optionInventory: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    initialStore.tenantRooms["tenant-rds-reuse"] = "room-rds-a";
    const first = new RoomlogService({ seedDemoData: false, initialStore });
    const newerInput = input("trade-rds-reuse-newer", "202호", "tenant-rds-reuse", "2026-07-13T02:00:00.000Z");
    connect(first, newerInput);
    const rdsStore = storeSnapshot(first);
    rdsStore.contracts.forEach((contract) => delete contract.tradeAcceptedAt);
    const projected: Store[] = [];
    const restored = new RoomlogService({
      seedDemoData: false,
      initialStore: rdsStore,
      storeProjector: {
        persist: (store) => {
          projected.push(structuredClone(store));
        },
      },
    });
    const beforeReplay = storeSnapshot(restored);

    const replayed = connect(restored, newerInput);
    const stale = connect(
      restored,
      input("trade-rds-reuse-older", "101호", "tenant-rds-reuse", "2026-07-13T01:00:00.000Z"),
    );
    await restored.flushPersistence();

    assert.equal(replayed.id, "ct_legacy_rds_active");
    assert.equal(stale.id, "ct_legacy_rds_active");
    assert.equal(storeOf(restored).tenantRooms["tenant-rds-reuse"], "room-rds-b");
    assert.deepEqual(storeSnapshot(restored), beforeReplay);
    assert.equal(projected.length, 0);
  });

  it("derives a restored deterministic trade event from createdAt without repeated persistence", async () => {
    const acceptedAt = "2026-07-13T03:00:00.000Z";
    const acceptedInput = input("trade-rds-deterministic", "303호", "tenant-rds-deterministic", acceptedAt);
    const first = new RoomlogService({ seedDemoData: false });
    connect(first, acceptedInput);
    const rdsStore = storeSnapshot(first);
    rdsStore.contracts.forEach((contract) => delete contract.tradeAcceptedAt);
    const projected: Store[] = [];
    const restored = new RoomlogService({
      seedDemoData: false,
      initialStore: rdsStore,
      storeProjector: {
        persist: (store) => {
          projected.push(structuredClone(store));
        },
      },
    });
    const beforeReplay = storeSnapshot(restored);

    const replayed = connect(restored, acceptedInput);
    assert.throws(
      () => connect(restored, { ...acceptedInput, acceptedAt: "2026-07-13T03:01:00.000Z" }),
      /수락 이벤트 시각.*일치하지 않습니다/,
    );
    await restored.flushPersistence();

    assert.equal(replayed.id, "ct_trade_trade-rds-deterministic");
    assert.deepEqual(storeSnapshot(restored), beforeReplay);
    assert.equal(projected.length, 0);
  });

  it("ignores transit line words when resolving one exact unit and still rejects real ambiguity", () => {
    const service = new RoomlogService({ seedDemoData: false });
    const transit = input("trade-transit-unit", "101호", "tenant-transit", "2026-07-13T04:00:00.000Z");
    transit.location = "서울 지하철 3호선 방배역 인근 방배로 88 101호";

    const connected = connect(service, transit);
    const room = storeOf(service).rooms.find((candidate) => candidate.id === connected.roomId);

    assert.equal(connected.unitId, "101");
    assert.equal(room?.address, "서울 지하철 3호선 방배역 인근 방배로 88");
    const punctuated = input(
      "trade-punctuated-unit",
      undefined,
      "tenant-punctuated",
      "2026-07-13T04:00:30.000Z",
    );
    punctuated.location = "서울 서초구 방배로 88 303호.";
    const punctuatedConnection = connect(service, punctuated);
    const punctuatedRoom = storeOf(service).rooms
      .find((candidate) => candidate.id === punctuatedConnection.roomId);
    assert.equal(punctuatedConnection.unitId, "303");
    assert.equal(punctuatedRoom?.address, "서울 서초구 방배로 88");
    assert.throws(
      () => connect(service, {
        ...input("trade-transit-ambiguous", undefined, "tenant-transit-ambiguous", "2026-07-13T04:01:00.000Z"),
        location: "서울 지하철 3호선 방배역 인근 방배로 88 101호, 102호",
      }),
      /정확한 호실 하나/,
    );
  });

  it("preserves the exact room, trade draft, accepted time, and tenant relation across a file-backed restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "roomlog-atomic-restart-"));
    const storeFilePath = join(dir, "roomlog.json");
    const firstService = new RoomlogService({ seedDemoData: false, storeFilePath });
    const connected = connect(
      firstService,
      input("trade-restart", "701호", "tenant-restart", "2026-07-13T03:00:00.000Z"),
    );

    const restarted = new RoomlogService({ seedDemoData: false, storeFilePath });
    const restartedStore = storeOf(restarted);
    const room = restartedStore.rooms.find((candidate) => candidate.id === connected.roomId);
    const contract = restartedStore.contracts.find((candidate) => candidate.id === connected.id) as
      | (Contract & { tradeAcceptedAt?: string })
      | undefined;

    assert.deepEqual(room, {
      id: connected.roomId,
      buildingName: "정확호실빌라",
      roomNo: "701",
      address: "서울 서초구 방배로 88",
      landlordId: "landlord-exact",
    });
    assert.equal(contract?.roomId, connected.roomId);
    assert.equal(contract?.tenantId, "tenant-restart");
    assert.equal(contract?.tradeAcceptedAt, "2026-07-13T03:00:00.000Z");
    assert.equal(restartedStore.tenantRooms["tenant-restart"], connected.roomId);
    assert.equal(restartedStore.contractExtractions.filter((item) => item.contractId === connected.id).length, 1);
    assert.equal(restartedStore.contractPrivacies.filter((item) => item.contractId === connected.id).length, 1);
    assert.equal(restartedStore.contractDocuments.filter((item) => item.contractId === connected.id).length, 0);
  });

  it("describes a real trade draft without invented upload, OCR, or original-file history", () => {
    const service = new RoomlogService({ seedDemoData: false });
    const connected = connect(
      service,
      input("trade-truth", "301호", "tenant-truth", "2026-07-13T04:00:00.000Z"),
    );

    const detail = service.getManagerContractDetail("landlord-exact", connected.id);
    const serialized = JSON.stringify({
      extraction: detail.extraction,
      privacy: detail.privacy,
      timeline: detail.timeline,
      auditLogs: detail.auditLogs,
      conflictCandidates: detail.conflictCandidates,
    });

    assert.doesNotMatch(serialized, /업로드|OCR|원본/);
    assert.match(serialized, /거래 계약 수락/);
  });
});
