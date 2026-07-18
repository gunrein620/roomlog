import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type { MitunetFloorPlan } from "./mitunet-floor-plan";
import {
  shouldShow3DTourControls,
  tradeListingToCard,
  type TradeListing
} from "./listing-catalog";

const mitunetPlan: MitunetFloorPlan = {
  schema: "roomlog-mitunet-floor-plan",
  version: 1,
  name: "MitUNet listing plan",
  canvasSize: [1200, 900],
  contentRect: [0, 0, 1200, 900],
  millimetersPerPixel: 10,
  polygons: {
    wall: [{ outer: [[0, 0], [1200, 0], [1200, 900], [0, 900]], holes: [] }],
    door: [],
    window: []
  }
};

function createListing(floorPlan?: TradeListing["floorPlan"]): TradeListing {
  return {
    id: "trade-mitunet-1",
    ownerId: "owner-1",
    ownerName: "Owner",
    title: "MitUNet test listing",
    roomType: "원룸",
    tradeType: "월세",
    depositManwon: 1000,
    monthlyRentManwon: 50,
    location: "서울시",
    description: "test",
    status: "PUBLISHED",
    createdAt: "2026-07-15T00:00:00.000Z",
    floorPlan
  };
}

describe("trade listing 3D tour mapping", () => {
  it("treats a MitUNet-only plan as a connected 3D tour", () => {
    const card = tradeListingToCard(
      createListing({ walls3D: [], furnitures: [], mitunet: mitunetPlan })
    );

    assert.equal(card.has3DTour, true);
    assert.equal(card.floorPlan3D?.mitunet, mitunetPlan);
    assert.ok(card.badges.includes("3D 투어"));
    assert.ok(card.tags.includes("3D 투어"));
  });

  it("keeps an existing walls3D plan as a connected 3D tour", () => {
    const card = tradeListingToCard(
      createListing({
        walls3D: [{
          id: "wall-1",
          wall_id: "wall-1",
          dimensions: { width: 4, height: 2.4, depth: 0.1 },
          position: [0, 1.2, 0],
          rotation: [0, 0, 0]
        }],
        furnitures: []
      })
    );

    assert.equal(card.has3DTour, true);
    assert.equal(card.floorPlan3D?.walls3D.length, 1);
  });

  it("does not mark a listing without a connected plan as a 3D tour", () => {
    const card = tradeListingToCard(createListing());

    assert.equal(card.has3DTour, false);
    assert.equal(card.floorPlan3D, undefined);
    assert.equal(card.badges.includes("3D 투어"), false);
  });
});

describe("3D tour control visibility", () => {
  it("only exposes 3D entry controls for listings marked as connected tours", () => {
    assert.equal(shouldShow3DTourControls({ has3DTour: true }), true);
    assert.equal(shouldShow3DTourControls({ has3DTour: false }), false);
    assert.equal(shouldShow3DTourControls({}), false);
  });
});
