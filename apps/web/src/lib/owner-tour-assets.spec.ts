import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  deriveOwnerTourActions,
  pickListingSplatAsset,
  resolveRegisterPlanSource,
  type OwnerListingAssets
} from "./owner-tour-assets";
import type { TradeListing } from "./listing-catalog";
import type { WheretoputWall3D } from "../app/floor-plan-3d/room-model/types";

// 픽 도면 우선순위 테스트용 최소 벽.
const wall = (id: string): WheretoputWall3D => ({
  id,
  wall_id: id,
  dimensions: { width: 3, height: 2.4, depth: 0.1 },
  position: [0, 0, 0],
  rotation: [0, 0, 0]
});

// TradeListing은 필드가 많아 테스트에 필요한 것만 채운다.
const listing = (id: string, title: string): TradeListing =>
  ({ id, title, ownerId: "o", ownerName: "n", roomType: "원룸", tradeType: "월세", depositManwon: 0, monthlyRentManwon: 0, location: "", description: "", status: "노출중", createdAt: "" } as TradeListing);

describe("pickListingSplatAsset — 매물당 대표 자산", () => {
  it("returns null for no assets", () => {
    assert.equal(pickListingSplatAsset([]), null);
  });

  it("prefers UPLOADED(정합 필요) over every other status", () => {
    const chosen = pickListingSplatAsset([
      { id: "reg", status: "REGISTERED" },
      { id: "proc", status: "PROCESSING" },
      { id: "up", status: "UPLOADED" },
      { id: "fail", status: "FAILED" }
    ]);
    assert.deepEqual(chosen, { assetId: "up", status: "UPLOADED" });
  });

  it("prefers FAILED over PROCESSING/REGISTERED when no UPLOADED", () => {
    const chosen = pickListingSplatAsset([
      { id: "reg", status: "REGISTERED" },
      { id: "fail", status: "FAILED" },
      { id: "proc", status: "PROCESSING" }
    ]);
    assert.deepEqual(chosen, { assetId: "fail", status: "FAILED" });
  });
});

describe("deriveOwnerTourActions — 벨 조치 필요 목록", () => {
  it("keeps only UPLOADED(정합) and FAILED(재업로드), dropping PROCESSING/REGISTERED/none", () => {
    const data: OwnerListingAssets = {
      listings: [listing("L1", "방배 402호"), listing("L2", "역삼 오피스텔"), listing("L3", "제작 중집"), listing("L4", "정합 끝집"), listing("L5", "자산 없음")],
      assetByListing: {
        L1: { assetId: "a1", status: "UPLOADED" },
        L2: { assetId: "a2", status: "FAILED" },
        L3: { assetId: "a3", status: "PROCESSING" },
        L4: { assetId: "a4", status: "REGISTERED" }
      }
    };
    const actions = deriveOwnerTourActions(data);
    assert.equal(actions.length, 2);
    assert.deepEqual(actions[0], { listingId: "L1", title: "방배 402호", assetId: "a1", status: "UPLOADED" });
    assert.deepEqual(actions[1], { listingId: "L2", title: "역삼 오피스텔", assetId: "a2", status: "FAILED" });
  });

  it("returns empty when nothing needs action", () => {
    assert.deepEqual(deriveOwnerTourActions({ listings: [listing("L1", "집")], assetByListing: {} }), []);
  });
});

describe("resolveRegisterPlanSource — register 픽 도면 우선순위", () => {
  it("respects an asset's existing server floor plan (floorPlanId) over the listing snapshot", () => {
    const decision = resolveRegisterPlanSource({ floorPlanId: "fp-1", listingId: "L1" }, [wall("w1")]);
    assert.deepEqual(decision, { source: "asset-linked", planServerId: "fp-1" });
  });

  it("uses the listing snapshot (listing-db) when the asset has no floorPlanId and walls exist", () => {
    const walls = [wall("w1"), wall("w2")];
    const decision = resolveRegisterPlanSource({ floorPlanId: null, listingId: "L1" }, walls);
    assert.equal(decision.source, "listing-db");
    if (decision.source === "listing-db") assert.equal(decision.walls.length, 2);
  });

  it("keeps existing (localStorage/placeholder) when no floorPlanId and no listing walls", () => {
    assert.deepEqual(resolveRegisterPlanSource({ floorPlanId: null, listingId: "L1" }, []), { source: "keep" });
  });
});
