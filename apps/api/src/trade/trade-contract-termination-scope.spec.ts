// 계약 해지 후 재계약 시 전 세입자 기록이 새 세입자·관리인 화면으로 새지 않는지.
// 해지 흐름(trade) 자체가 아니라, 그 뒤 roomlog 조회들의 스코프가 검증 대상이다.
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomlogService } from "../roomlog/roomlog.service";
import { TradeContractBillingBridge } from "./trade-contract-billing-bridge.service";
import { TradeService, type TradeContract } from "./trade.service";

const landlord = { id: "landlord-demo", name: "박관리" };
const tenantA = { id: "tenant-a", name: "세입자A" };
const tenantB = { id: "tenant-b", name: "세입자B" };

type TerminationStore = {
  contracts: Array<{
    id: string;
    roomId: string;
    tenantId?: string;
    lifecycle: string;
    createdAt: string;
    updatedAt: string;
  }>;
  tenantRooms: Record<string, string>;
  bills: Array<Record<string, unknown>>;
  rooms: Array<{ id: string; roomNo: string; address: string; landlordId?: string }>;
};

function storeOf(service: RoomlogService): TerminationStore {
  return (service as unknown as { store: TerminationStore }).store;
}

function tradeServiceWithTempStore() {
  const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-termination-"));
  return new TradeService(join(dir, "trade-store.json"));
}

function createListing(service: TradeService, title: string) {
  return service.createListing(landlord, {
    title,
    roomType: "원룸",
    tradeType: "월세",
    depositManwon: 1000,
    monthlyRentManwon: 65,
    location: `서울 서초구 ${title}길 1`,
    detailAddress: "101호"
  });
}

async function acceptFor(
  trade: TradeService,
  bridge: TradeContractBillingBridge,
  listingId: string,
  listingTitle: string,
  tenant: { id: string; name: string }
): Promise<TradeContract> {
  const thread = trade.createInquiry(tenant, {
    listingId,
    listingTitle,
    message: "계약하고 싶어요"
  });
  const proposed = trade.proposeContract(landlord, thread.id).contract;
  const accepted = trade.respondContract(tenant, proposed.id, true).contract;
  await bridge.ensure(accepted);
  return accepted;
}

async function terminate(
  trade: TradeService,
  bridge: TradeContractBillingBridge,
  listingId: string
) {
  const { contract } = trade.terminateContract(landlord, listingId);
  await bridge.release(contract);
  return contract;
}

/** A 계약 → 해지 → B 재계약까지 진행된 공통 상태. */
async function reContractedState() {
  const trade = tradeServiceWithTempStore();
  const roomlog = new RoomlogService({ seedDemoData: false });
  const bridge = new TradeContractBillingBridge(trade, roomlog);
  const listing = createListing(trade, "재계약검증빌라");

  const acceptedA = await acceptFor(trade, bridge, listing.id, listing.title, tenantA);
  await terminate(trade, bridge, listing.id);
  const acceptedB = await acceptFor(trade, bridge, listing.id, listing.title, tenantB);

  return { trade, roomlog, bridge, listing, acceptedA, acceptedB };
}

describe("계약 해지 후 재계약 — 이전 세입자 기록 격리", () => {
  it("새 세입자의 계약 목록에 전 세입자 계약이 섞이지 않는다", async () => {
    const { roomlog, acceptedA, acceptedB } = await reContractedState();

    const contractsB = roomlog.listTenantContracts(tenantB.id);

    assert.deepEqual(
      contractsB.map((contract) => contract.id),
      [`ct_trade_${acceptedB.id}`]
    );
    assert.ok(!contractsB.some((contract) => contract.id === `ct_trade_${acceptedA.id}`));
  });

  it("새 세입자가 전 세입자 계약의 상세·추출값을 열람할 수 없다", async () => {
    const { roomlog, acceptedA } = await reContractedState();
    const previousContractId = `ct_trade_${acceptedA.id}`;

    assert.throws(
      () => roomlog.getTenantContract(tenantB.id, previousContractId),
      /조회 가능한 계약서를 찾을 수 없습니다/
    );
    assert.throws(
      () => roomlog.getTenantContractExtraction(tenantB.id, previousContractId),
      /조회 가능한 계약서를 찾을 수 없습니다/
    );
  });

  it("전 세입자는 자기 계약 이력을 계속 볼 수 있다 (이력 보존)", async () => {
    const { roomlog, acceptedA } = await reContractedState();

    const contractsA = roomlog.listTenantContracts(tenantA.id);
    const own = contractsA.find((contract) => contract.id === `ct_trade_${acceptedA.id}`);

    assert.ok(own, "해지된 계약 레코드는 삭제되지 않는다");
    assert.equal(own.lifecycle, "expired");
  });

  it("관리인 대시보드는 해지된 계약을 행·할 일 카운트에서 제외한다", async () => {
    const { roomlog, acceptedA, acceptedB } = await reContractedState();

    const dashboard = roomlog.getManagerContractDashboard(landlord.id);
    const ids = dashboard.rows.map((row) => row.contract.id);

    assert.deepEqual(ids, [`ct_trade_${acceptedB.id}`]);
    assert.ok(!ids.includes(`ct_trade_${acceptedA.id}`));
    assert.equal(dashboard.counts.pending, 1);
  });

  it("해지된 집은 세입자의 집 목록과 현재 계약에서 사라진다", async () => {
    const { roomlog } = await reContractedState();

    assert.deepEqual(roomlog.listTenantRooms(tenantA.id), []);
    assert.equal(roomlog.getTenantCurrentContract(tenantA.id), null);
    assert.equal(roomlog.listTenantRooms(tenantB.id).length, 1);
  });

  it("거주 중 기간 만료(expired지만 연결 유지)는 현재 계약으로 계속 보인다", async () => {
    const trade = tradeServiceWithTempStore();
    const roomlog = new RoomlogService({ seedDemoData: false });
    const bridge = new TradeContractBillingBridge(trade, roomlog);
    const listing = createListing(trade, "기간만료빌라");
    const accepted = await acceptFor(trade, bridge, listing.id, listing.title, tenantA);

    // 해지가 아니라 기간 만료 — tenantRooms 연결은 그대로 남는다.
    const store = storeOf(roomlog);
    store.contracts.find((contract) => contract.id === `ct_trade_${accepted.id}`)!.lifecycle =
      "expired";

    assert.equal(roomlog.listTenantRooms(tenantA.id).length, 1);
    assert.equal(roomlog.getTenantCurrentContract(tenantA.id)?.id, `ct_trade_${accepted.id}`);
  });

  it("해지해도 원래 살던 다른 집의 연결은 유지된다", async () => {
    const trade = tradeServiceWithTempStore();
    const roomlog = new RoomlogService({ seedDemoData: false });
    const bridge = new TradeContractBillingBridge(trade, roomlog);

    // 원래 살던 집(관리인이 등록한 활성 계약)
    const homeRoom = roomlog.assignTenantRoomFromContract(tenantA.id, landlord.id, {
      title: "원래살던빌라",
      location: "서울 서초구 원래살던길 1"
    });
    const home = roomlog.ensureTradeContractDraft({
      tradeContractId: "existing-home",
      roomId: homeRoom.id,
      tenantId: tenantA.id,
      landlordId: landlord.id,
      landlordName: landlord.name,
      depositKrw: 5_000_000,
      monthlyRent: 500_000
    });
    storeOf(roomlog).contracts.find((contract) => contract.id === home.id)!.lifecycle = "active";

    // 다른 매물로 거래 계약 → 해지
    const listing = createListing(trade, "잠깐계약빌라");
    await acceptFor(trade, bridge, listing.id, listing.title, tenantA);
    await terminate(trade, bridge, listing.id);

    assert.equal(
      storeOf(roomlog).tenantRooms[tenantA.id],
      homeRoom.id,
      "해지 후 원래 집으로 연결이 돌아와야 한다"
    );
    assert.deepEqual(
      roomlog.listTenantRooms(tenantA.id).map((room) => room.roomId),
      [homeRoom.id]
    );
  });

  it("전 세입자 재직 중 발행된 청구는 새 세입자에게 보이지 않는다", async () => {
    const { roomlog, acceptedB } = await reContractedState();
    const store = storeOf(roomlog);
    const roomId = store.tenantRooms[tenantB.id];
    const bStart = Date.parse(
      store.contracts.find((contract) => contract.id === `ct_trade_${acceptedB.id}`)!.createdAt
    );
    const shift = (ms: number) => new Date(bStart + ms).toISOString();

    const billFor = (id: string, createdAt: string) => ({
      id,
      roomId,
      unitId: "101",
      billingMonth: "2026-06",
      status: "ISSUED",
      items: [],
      totalAmount: 650_000,
      paidAmount: 0,
      dueDate: "2026-06-25",
      bankName: "우리",
      accountNumber: "000",
      accountHolder: "박관리",
      createdAt,
      updatedAt: createdAt
    });
    // A 재직 중(= B 입주 하루 전) 발행된 미납 청구 + B 입주 후 발행된 청구
    store.bills.push(billFor("bill-prev-tenant", shift(-24 * 60 * 60 * 1000)));
    store.bills.push(billFor("bill-current-tenant", shift(60 * 1000)));

    const billsB = (
      roomlog as unknown as { tenantBills: (tenantId: string) => Array<{ id: string }> }
    ).tenantBills.call(roomlog, tenantB.id);

    assert.deepEqual(
      billsB.map((bill) => bill.id),
      ["bill-current-tenant"]
    );
  });
});
