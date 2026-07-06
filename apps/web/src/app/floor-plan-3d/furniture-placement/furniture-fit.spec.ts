import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogItemFootprint, describeFurnitureFit, judgeFurnitureFit } from "./furniture-fit";

describe("judgeFurnitureFit", () => {
  const room = { widthMm: 3000, depthMm: 2500 };

  it("방을 안 쟀으면 unknown", () => {
    assert.equal(judgeFurnitureFit({ widthMm: 1500, depthMm: 2000 }, { widthMm: null, depthMm: null }).verdict, "unknown");
    assert.equal(judgeFurnitureFit({ widthMm: 1500, depthMm: 2000 }, { widthMm: 0, depthMm: 2500 }).verdict, "unknown");
  });

  it("충분히 들어가면 fit + 최소 여유(mm)", () => {
    const result = judgeFurnitureFit({ widthMm: 1200, depthMm: 600 }, room);
    assert.equal(result.verdict, "fit");
    assert.equal(result.clearanceMm, 1800); // min(3000-1200, 2500-600)
    assert.equal(result.rotated, false);
  });

  it("여유 300mm 미만이면 tight", () => {
    const result = judgeFurnitureFit({ widthMm: 2900, depthMm: 2300 }, room);
    assert.equal(result.verdict, "tight");
    assert.equal(result.clearanceMm, 100);
  });

  it("그대로는 안 들어가도 90도 회전으로 들어가면 rotated fit", () => {
    // 2600(가로)는 방 세로 2500 초과지만 회전하면 가로 3000에 들어간다.
    const result = judgeFurnitureFit({ widthMm: 900, depthMm: 2600 }, room);
    assert.equal(result.verdict, "fit");
    assert.equal(result.rotated, true);
    assert.equal(result.clearanceMm, 400); // min(3000-2600, 2500-900)
  });

  it("어느 방향으로도 안 들어가면 no_fit + 부족량", () => {
    const result = judgeFurnitureFit({ widthMm: 3200, depthMm: 2600 }, room);
    assert.equal(result.verdict, "no_fit");
    assert.ok((result.clearanceMm ?? 0) < 0);
  });

  it("catalogItemFootprint는 length [가로, 높이, 세로] 규약을 따른다", () => {
    assert.deepEqual(catalogItemFootprint({ length: [2000, 420, 1500] }), { widthMm: 2000, depthMm: 1500 });
  });

  it("describeFurnitureFit 라벨", () => {
    assert.match(describeFurnitureFit(judgeFurnitureFit({ widthMm: 1200, depthMm: 600 }, room)), /^가능/);
    assert.match(describeFurnitureFit(judgeFurnitureFit({ widthMm: 3200, depthMm: 2600 }, room)), /부족/);
    assert.equal(describeFurnitureFit(judgeFurnitureFit({ widthMm: 1, depthMm: 1 }, { widthMm: null, depthMm: null })), "방 크기를 먼저 재세요");
  });
});
