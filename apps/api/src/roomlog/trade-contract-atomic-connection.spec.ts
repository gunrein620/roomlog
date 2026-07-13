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
