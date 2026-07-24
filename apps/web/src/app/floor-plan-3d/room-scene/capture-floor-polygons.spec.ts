import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captureFloorPolygons } from "./capture-floor-polygons";

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const polygonArea = (points: [number, number][]) => {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[(i + 1) % points.length];
    sum += x0 * z1 - x1 * z0;
  }
  return round(Math.abs(sum) / 2);
};

const wall = (start: [number, number], end: [number, number]) => ({
  start,
  end,
  height: 2.34,
  thickness: 0
});

describe("captureFloorPolygons", () => {
  it("closes a square room (endpoints match exactly) into one loop", () => {
    const walls = [
      wall([0, 0], [4, 0]),
      wall([4, 0], [4, 3]),
      wall([4, 3], [0, 3]),
      wall([0, 3], [0, 0])
    ];
    const loops = captureFloorPolygons(walls);
    assert.equal(loops.length, 1);
    assert.equal(polygonArea(loops[0]), 12);
  });

  it("snaps endpoints within tolerance and still closes the loop", () => {
    // 코너마다 5cm 안쪽으로 어긋난 실측 노이즈를 흉내낸다(허용오차 0.15m 이내).
    const walls = [
      wall([0, 0], [4, 0.04]),
      wall([3.96, 0.02], [4.02, 3]),
      wall([4, 3.03], [0.03, 2.98]),
      wall([-0.02, 3], [0.01, -0.01])
    ];
    const loops = captureFloorPolygons(walls);
    assert.equal(loops.length, 1);
    // 스냅 오차 때문에 정확히 12는 아니지만 근사해야 한다.
    assert.ok(Math.abs(polygonArea(loops[0]) - 12) < 0.5, `area was ${polygonArea(loops[0])}`);
  });

  it("returns no loop for an open (3-wall) scan instead of guessing a rectangle", () => {
    const walls = [wall([0, 0], [4, 0]), wall([4, 0], [4, 3]), wall([4, 3], [0, 3])];
    const loops = captureFloorPolygons(walls);
    assert.deepEqual(loops, []);
  });

  it("returns one loop per room for two disconnected squares", () => {
    const roomA = [
      wall([0, 0], [3, 0]),
      wall([3, 0], [3, 3]),
      wall([3, 3], [0, 3]),
      wall([0, 3], [0, 0])
    ];
    const roomB = [
      wall([10, 10], [14, 10]),
      wall([14, 10], [14, 13]),
      wall([14, 13], [10, 13]),
      wall([10, 13], [10, 10])
    ];
    const loops = captureFloorPolygons([...roomA, ...roomB]);
    assert.equal(loops.length, 2);
    const areas = loops.map(polygonArea).sort((a, b) => a - b);
    assert.deepEqual(areas, [9, 12]);
  });

  it("excludes loops whose area is below the noise threshold", () => {
    // 0.3 x 0.3 = 0.09㎡, 문턱(0.5㎡) 미만이라 버려져야 한다.
    const tinyLoop = [
      wall([0, 0], [0.3, 0]),
      wall([0.3, 0], [0.3, 0.3]),
      wall([0.3, 0.3], [0, 0.3]),
      wall([0, 0.3], [0, 0])
    ];
    const loops = captureFloorPolygons(tinyLoop);
    assert.deepEqual(loops, []);
  });

  it("returns an empty array for no walls", () => {
    assert.deepEqual(captureFloorPolygons([]), []);
  });
});
