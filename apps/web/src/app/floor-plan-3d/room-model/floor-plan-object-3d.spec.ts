import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { convertFloorPlanObjectsTo3D } from "./floor-plan-object-3d";
import type { Wall } from "./types";

const walls: Wall[] = [{ id: "w1", start: { x: 0, y: 0 }, end: { x: 150, y: 0 } }];

describe("floor plan object 3D conversion", () => {
  it("uses the opening span width instead of an oversized swing symbol box", () => {
    const [door] = convertFloorPlanObjectsTo3D(
      [
        {
          category: "opening",
          center: { x: 75, y: 0 },
          id: "door-1",
          rotationDeg: 0,
          size: { width: 120, height: 120 },
          spanOnWall: { start: { x: 60, y: 0 }, end: { x: 90, y: 0 } },
          type: "swingDoor"
        }
      ],
      walls,
      { pixelToMmRatio: 10 }
    );

    assert.equal(door.size.width, 0.3);
    assert.equal(door.size.depth, 0.08);
  });
});
