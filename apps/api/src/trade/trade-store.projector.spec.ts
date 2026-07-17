import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TradeService, type TradeContract, type TradeListing } from "./trade.service";
import type { TradeStoreProjector } from "./trade-store.projector";

/** DB 없이 프로젝션 배선을 검증하기 위한 가짜 프로젝터(호출 스냅샷만 기록). */
function makeFakeProjector(loadResult?: TradeListing[]) {
  const persisted: TradeListing[][] = [];
  const state = { disconnected: false };
  const fake = {
    async load() {
      return loadResult;
    },
    async persist(listings: TradeListing[]) {
      persisted.push(listings.map((listing) => ({ ...listing })));
    },
    async disconnect() {
      state.disconnected = true;
    }
  };
  return { projector: fake as unknown as TradeStoreProjector, persisted, state };
}

const owner = { id: "owner-1", name: "집주인" };
const input = {
  title: "DB 연동 매물",
  roomType: "원룸",
  tradeType: "월세" as const,
  depositManwon: 1000,
  monthlyRentManwon: 50,
  location: "서울 서초구 방배동",
  detailAddress: "402호",
  buildingName: "방배 루미에르",
  description: "등록 매물",
  images: ["https://example.test/listing.jpg"]
};

function tempStorePath() {
  const dir = mkdtempSync(join(tmpdir(), "roomlog-trade-db-"));
  return join(dir, "trade-store.json");
}

describe("TradeService ↔ TradeStoreProjector (DB write-through)", () => {
  it("projects a newly created listing to the DB projector", async () => {
    const { projector, persisted } = makeFakeProjector([]);
    const service = new TradeService(tempStorePath(), { storeProjector: projector });

    service.createListing(owner, input, "room-402");
    await service.onModuleDestroy(); // 순차 프로젝션 큐를 flush

    const lastSnapshot = persisted[persisted.length - 1];
    assert.ok(lastSnapshot, "프로젝터의 persist가 호출돼야 한다");
    assert.deepEqual(
      lastSnapshot.map((listing) => listing.title),
      [input.title]
    );
    assert.equal(lastSnapshot[0].detailAddress, "402호");
    assert.equal(lastSnapshot[0].buildingName, "방배 루미에르");
    assert.equal(lastSnapshot[0].roomId, "room-402");
  });

  it("hydrates listings from the DB on boot, overriding the JSON store", () => {
    const dbListing: TradeListing = {
      id: "db-1",
      ownerId: "owner-9",
      ownerName: "DB 집주인",
      title: "DB에서 온 매물",
      roomType: "투룸",
      tradeType: "전세",
      depositManwon: 40000,
      monthlyRentManwon: 0,
      location: "서울 성동구 성수동",
      description: "",
      options: [],
      images: [],
      status: "노출중",
      createdAt: "2026-07-01T00:00:00.000Z"
    };
    const { projector } = makeFakeProjector([dbListing]);
    const service = new TradeService(tempStorePath(), { storeProjector: projector, initialListings: [dbListing] });

    assert.deepEqual(
      service.listListings().map((listing) => listing.id),
      ["db-1"]
    );
  });

  it("backfills existing JSON listings to the DB when the DB is empty", async () => {
    // 기존 게시물 유실 방지: DB가 비어 있으면 JSON 스토어의 매물을 DB로 이관해야 한다.
    const storePath = tempStorePath();
    const jsonListing: TradeListing = {
      id: "json-legacy",
      ownerId: owner.id,
      ownerName: owner.name,
      title: "이관 대상 기존 매물",
      roomType: "원룸",
      tradeType: "월세",
      depositManwon: 500,
      monthlyRentManwon: 45,
      location: "서울 강남구 역삼동",
      description: "",
      options: [],
      images: [],
      status: "노출중",
      createdAt: "2026-06-01T00:00:00.000Z"
    };
    writeFileSync(storePath, JSON.stringify({ listings: [jsonListing], threads: [], contracts: [] }), "utf8");

    const { projector, persisted } = makeFakeProjector([]); // DB 비어 있음
    const service = new TradeService(storePath, { storeProjector: projector, initialListings: [] });
    await service.onModuleDestroy();

    assert.equal(service.listPublicListings().length, 1);
    const lastSnapshot = persisted[persisted.length - 1];
    assert.ok(lastSnapshot, "백필 프로젝션이 호출돼야 한다");
    assert.deepEqual(
      lastSnapshot.map((listing) => listing.id),
      ["json-legacy"]
    );
  });

  it("does not clobber the DB with JSON when the DB load failed (undefined)", async () => {
    // DB 미도달로 load가 undefined면, 기존 DB 매물을 JSON으로 덮어쓰지 않아야 한다.
    const storePath = tempStorePath();
    const jsonListing: TradeListing = {
      id: "json-only",
      ownerId: owner.id,
      ownerName: owner.name,
      title: "JSON에만 있는 매물",
      roomType: "원룸",
      tradeType: "월세",
      depositManwon: 500,
      monthlyRentManwon: 45,
      location: "서울 강남구 역삼동",
      description: "",
      options: [],
      images: [],
      status: "노출중",
      createdAt: "2026-06-01T00:00:00.000Z"
    };
    writeFileSync(storePath, JSON.stringify({ listings: [jsonListing], threads: [], contracts: [] }), "utf8");

    const { projector, persisted } = makeFakeProjector(undefined); // 로드 실패
    const service = new TradeService(storePath, { storeProjector: projector, initialListings: undefined });
    await service.onModuleDestroy();

    assert.equal(persisted.length, 0, "로드 실패 시 백필(프로젝션)을 하지 않아야 한다");
    // JSON 상태로는 계속 동작
    assert.equal(service.listPublicListings().length, 1);
  });

  it("keeps working as a pure JSON store when no projector is provided", () => {
    const service = new TradeService(tempStorePath());
    const created = service.createListing(owner, input);
    assert.equal(created.status, "노출중");
    assert.equal(service.listPublicListings().length, 1);
  });

  it("repairs an accepted JSON contract after DB hydration restores its listing to public", async () => {
    const storePath = tempStorePath();
    const listing: TradeListing = {
      id: "restart-listing",
      ownerId: owner.id,
      ownerName: owner.name,
      title: "재기동 복구 매물",
      roomType: "원룸",
      tradeType: "월세",
      depositManwon: 1000,
      monthlyRentManwon: 50,
      location: "서울 서초구 재기동로 1",
      detailAddress: "501호",
      description: "",
      options: [],
      images: [],
      status: "계약완료",
      createdAt: "2026-07-13T00:00:00.000Z",
    };
    const accepted: TradeContract = {
      id: "restart-contract",
      listingId: listing.id,
      listingTitle: listing.title,
      threadId: "restart-thread",
      landlordId: owner.id,
      landlordName: owner.name,
      tenantId: "restart-tenant",
      tenantName: "재기동 임차인",
      status: "accepted",
      tradeType: "월세",
      depositManwon: listing.depositManwon,
      monthlyRentManwon: listing.monthlyRentManwon,
      location: `${listing.location} ${listing.detailAddress}`,
      roomNo: listing.detailAddress,
      proposedAt: "2026-07-13T00:01:00.000Z",
      respondedAt: "2026-07-13T00:02:00.000Z",
    };
    writeFileSync(storePath, JSON.stringify({ listings: [listing], threads: [], contracts: [accepted] }), "utf8");
    const hydratedListing = { ...listing, status: "노출중" as const };
    const { projector, persisted } = makeFakeProjector([hydratedListing]);
    const service = new TradeService(storePath, {
      storeProjector: projector,
      initialListings: [hydratedListing],
    });

    await service.ensureAcceptedListingDurability(service.listAcceptedContracts()[0]);

    assert.equal(service.listListings()[0].status, "계약완료");
    assert.equal(persisted.at(-1)?.[0].status, "계약완료");
  });

  it("waits for a newer queued listing generation instead of scheduling a duplicate retry", async () => {
    let rejectedAcceptedSnapshot = false;
    let acceptedProjectionAttempts = 0;
    const projector = {
      load: async () => [],
      persist: async (listings: TradeListing[]) => {
        if (listings.some((listing) => listing.status === "계약완료")) {
          acceptedProjectionAttempts += 1;
          if (!rejectedAcceptedSnapshot) {
            rejectedAcceptedSnapshot = true;
            throw new Error("first accepted listing projection failed");
          }
        }
      },
    } as unknown as TradeStoreProjector;
    const service = new TradeService(tempStorePath(), { storeProjector: projector });
    const listing = service.createListing(owner, input);
    const buyer = { id: "generation-buyer", name: "세대 임차인" };
    const thread = service.createInquiry(buyer, {
      listingId: listing.id,
      listingTitle: listing.title,
      message: "세대 검증 문의",
    });
    const proposed = service.proposeContract(owner, thread.id).contract;
    const accepted = service.respondContract(buyer, proposed.id, true).contract;
    await (service as unknown as { pendingProjection: Promise<unknown> }).pendingProjection;

    service.updateListing(owner, listing.id, { description: "더 최신 스냅샷" });
    await service.ensureAcceptedListingDurability(accepted);

    assert.equal(acceptedProjectionAttempts, 2);
  });
});
