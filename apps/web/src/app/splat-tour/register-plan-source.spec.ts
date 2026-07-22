import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import { captureFloorPlanToSceneLayout } from "../floor-plan-3d/room-scene/capture-to-layout";
import { planDisplayBounds, resolveRegisterPlanDisplay } from "./register-plan-source";

const wall = (id: string): WheretoputWall3D => ({
  id,
  wall_id: id,
  dimensions: { width: 3, height: 2.4, depth: 0.1 },
  position: [0, 0, 0],
  rotation: [0, 0, 0]
});

// capture-to-layout.spec.ts와 동일한 최소 위상(닫힌 사각 방) — 여기선 우선순위만 확인하면 되므로 단순화.
const captureFloorPlan = {
  frame: "arkit-metric" as const,
  walls: [
    { start: [0, 0], end: [4, 0], height: 2.34, thickness: 0 },
    { start: [4, 0], end: [4, 3], height: 2.34, thickness: 0 },
    { start: [4, 3], end: [0, 3], height: 2.34, thickness: 0 },
    { start: [0, 3], end: [0, 0], height: 2.34, thickness: 0 }
  ]
};

const mitunetPayload = {
  schema: "roomlog-mitunet-floor-plan",
  version: 1,
  name: "sample",
  canvasSize: [1000, 800],
  contentRect: [0, 0, 1000, 800],
  millimetersPerPixel: null,
  polygons: {
    wall: [{ outer: [[200, 100], [600, 100], [600, 140], [200, 140]], holes: [] }],
    door: [],
    window: []
  }
};

describe("resolveRegisterPlanDisplay — register 픽 화면 도면 우선순위", () => {
  it("prefers the capture floor plan over everything else, even an existing server link and editor walls", () => {
    const decision = resolveRegisterPlanDisplay(
      { captureFloorPlan, floorPlanId: "fp-1" },
      [wall("w1")],
      mitunetPayload
    );
    assert.equal(decision.source, "listing-capture");
    if (decision.source === "listing-capture") {
      assert.equal(decision.layout.wall.length, 4);
      assert.equal(decision.planServerId, "fp-1"); // 기존 서버 도면 연결은 캡처가 있어도 보존
    }
  });

  it("keeps an existing server floor plan link (asset-linked) when there is no capture", () => {
    const decision = resolveRegisterPlanDisplay({ floorPlanId: "fp-1" }, [wall("w1")], mitunetPayload);
    assert.deepEqual(decision, { source: "asset-linked", planServerId: "fp-1" });
  });

  it("falls back to the listing's editor snapshot (listing-db) when there's no capture or server link", () => {
    const walls = [wall("w1"), wall("w2")];
    const decision = resolveRegisterPlanDisplay({ floorPlanId: null }, walls, mitunetPayload);
    assert.equal(decision.source, "listing-db");
    if (decision.source === "listing-db") assert.equal(decision.walls.length, 2);
  });

  it("falls back to mitunet(도면 이미지 자동 추출) when walls3D is empty", () => {
    const decision = resolveRegisterPlanDisplay({ floorPlanId: null }, [], mitunetPayload);
    assert.equal(decision.source, "listing-mitunet");
    if (decision.source === "listing-mitunet") assert.equal(decision.layout.wall.length, 1);
  });

  it("returns keep when nothing is available (capture, link, walls, mitunet all absent)", () => {
    assert.deepEqual(resolveRegisterPlanDisplay({ floorPlanId: null }, [], undefined), { source: "keep" });
  });

  it("ignores an invalid/empty capture floor plan and continues down the priority chain", () => {
    const decision = resolveRegisterPlanDisplay({ captureFloorPlan: { walls: [] }, floorPlanId: null }, [wall("w1")], mitunetPayload);
    assert.equal(decision.source, "listing-db");
  });
});

describe("planDisplayBounds — 도면 패널 2점 픽 좌표 변환의 기준점", () => {
  it("uses the wall footprint bbox for the walls shape", () => {
    const bounds = planDisplayBounds({ kind: "walls", walls: [wall("w1")] });
    // wall()은 원점(position [0,0,0])의 3m×0.1m 벽이라 minX/minZ는 절반 폭만큼 음수다.
    assert.equal(bounds.minX, -1.5);
    assert.equal(bounds.minZ, -0.05);
  });

  it("derives minX/minZ from center for a zero-centered (mitunet) layout — matches the old -width/2 shortcut", () => {
    const layout = captureFloorPlanToSceneLayout({
      frame: "arkit-metric",
      walls: [
        { start: [-2, -1.5], end: [2, -1.5], height: 2.4, thickness: 0 },
        { start: [2, -1.5], end: [2, 1.5], height: 2.4, thickness: 0 },
        { start: [2, 1.5], end: [-2, 1.5], height: 2.4, thickness: 0 },
        { start: [-2, 1.5], end: [-2, -1.5], height: 2.4, thickness: 0 }
      ]
    });
    assert.ok(layout);
    assert.equal(layout!.bounds.centerX, 0);
    const bounds = planDisplayBounds({ kind: "polygons", layout: layout! });
    assert.equal(bounds.minX, -layout!.bounds.width / 2);
    assert.equal(bounds.minZ, -layout!.bounds.depth / 2);
  });

  it("derives minX/minZ from a non-zero center for an off-origin (capture) layout — the bug this fixes", () => {
    // capture-to-layout.ts는 ARKit 원점을 그대로 보존하므로 방이 원점 대칭이 아닐 수 있다(예: (0,0)~(4,3)).
    const layout = captureFloorPlanToSceneLayout({
      frame: "arkit-metric",
      walls: [
        { start: [0, 0], end: [4, 0], height: 2.34, thickness: 0 },
        { start: [4, 0], end: [4, 3], height: 2.34, thickness: 0 },
        { start: [4, 3], end: [0, 3], height: 2.34, thickness: 0 },
        { start: [0, 3], end: [0, 0], height: 2.34, thickness: 0 }
      ]
    });
    assert.ok(layout);
    assert.equal(layout!.bounds.centerX, 2);
    assert.equal(layout!.bounds.centerZ, 1.5);
    const bounds = planDisplayBounds({ kind: "polygons", layout: layout! });
    // 잘못된(원점 대칭 가정) 계산이었다면 minX = -width/2 ≈ -2.05가 나와야 했다 — 실제로는 방이
    // x∈[0,4] 근처에 있으므로 그와 다르게, 실제 min에 가까워야 한다.
    assert.ok(Math.abs(bounds.minX - (-layout!.bounds.width / 2)) > 1);
    assert.equal(bounds.minX, layout!.bounds.centerX - layout!.bounds.width / 2);
    assert.equal(bounds.minZ, layout!.bounds.centerZ - layout!.bounds.depth / 2);
  });
});
