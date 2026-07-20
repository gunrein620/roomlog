import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TradeService } from "./trade.service";

const owner = { id: "owner-mitunet", name: "집주인" };
const baseInput = {
  title: "MitUNet 매물",
  roomType: "원룸",
  tradeType: "월세" as const,
  depositManwon: 1000,
  monthlyRentManwon: 50,
  location: "서울"
};
const mitunet = {
  schema: "roomlog-mitunet-floor-plan" as const,
  version: 1 as const,
  name: "sample.png",
  canvasSize: [800, 600] as [number, number],
  contentRect: [10, 20, 760, 540] as [number, number, number, number],
  millimetersPerPixel: 4.25,
  polygons: {
    wall: [{ outer: [[10, 10], [100, 10], [100, 30], [10, 30]] as [number, number][], holes: [] }],
    door: [],
    window: []
  }
};

function storePath() {
  return join(mkdtempSync(join(tmpdir(), "roomlog-trade-mitunet-")), "trade-store.json");
}

describe("TradeService MitUNet persistence", () => {
  it("persists a polygon floor plan after restart", () => {
    const filePath = storePath();
    const service = new TradeService(filePath);
    const created = service.createListing(owner, {
      ...baseInput,
      floorPlan: { walls3D: [], furnitures: [], mitunet }
    });
    const restarted = new TradeService(filePath);

    assert.deepEqual(created.floorPlan?.mitunet, mitunet);
    assert.deepEqual(restarted.listListings()[0]?.floorPlan?.mitunet, mitunet);
  });

  it("persists the source-plan surface after the listing is registered", () => {
    const filePath = storePath();
    const service = new TradeService(filePath);
    const sourcePlan = { ...mitunet, surfaceMode: "source" as const, sourceImageB64: "cGxhbg==" };
    service.createListing(owner, {
      ...baseInput,
      floorPlan: { walls3D: [], furnitures: [], mitunet: sourcePlan }
    });

    assert.deepEqual(new TradeService(filePath).listListings()[0]?.floorPlan?.mitunet, sourcePlan);
  });

  it("rejects a malformed MitUNet payload instead of silently dropping it", () => {
    const service = new TradeService(storePath());
    const malformed = { ...mitunet, polygons: { ...mitunet.polygons, wall: [] } };

    assert.throws(
      () => service.createListing(owner, {
        ...baseInput,
        floorPlan: { walls3D: [], furnitures: [], mitunet: malformed }
      }),
      /MitUNet/
    );
  });
});
