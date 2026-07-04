import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { moveObject, recutWallsForMovedOpening, resizeObject, resizeOpeningSpan, rotateObjectQuarterTurn } from "./object-editing";
import type { FloorPlanObject } from "./types";
import type { Wall } from "../room-model/types";

const swingDoor: FloorPlanObject = {
  attachedWallId: "wall-a",
  category: "opening",
  center: { x: 50, y: 20 },
  confidence: 0.9,
  evidence: "leaf+arc",
  id: "door-1",
  label: "여닫이문",
  rotationDeg: 0,
  size: { height: 40, width: 30 },
  source: "openai-object-graph",
  spanOnWall: { start: { x: 35, y: 20 }, end: { x: 65, y: 20 } },
  status: "CANDIDATE",
  swing: { hinge: "start", opensTowards: { x: 50, y: 52 } },
  type: "swingDoor"
};

const sink: FloorPlanObject = {
  category: "fixture",
  center: { x: 80, y: 80 },
  id: "sink-1",
  label: "세면대",
  rotationDeg: 0,
  size: { height: 24, width: 30 },
  source: "openai-object-graph",
  status: "CANDIDATE",
  type: "sink"
};

describe("object editing", () => {
  it("moves visible opening geometry together with the object center", () => {
    const [movedDoor] = moveObject([swingDoor], "door-1", { x: 12, y: -4 });

    assert.deepEqual(movedDoor.center, { x: 62, y: 16 });
    assert.deepEqual(movedDoor.spanOnWall, { start: { x: 47, y: 16 }, end: { x: 77, y: 16 } });
    assert.deepEqual(movedDoor.swing, { hinge: "start", opensTowards: { x: 62, y: 48 } });
  });

  it("uses the clamped center delta for opening geometry near edit bounds", () => {
    const [movedDoor] = moveObject([swingDoor], "door-1", { x: 20, y: 0 }, { height: 100, width: 60, x: 0, y: 0 });

    assert.deepEqual(movedDoor.center, { x: 60, y: 20 });
    assert.deepEqual(movedDoor.spanOnWall, { start: { x: 45, y: 20 }, end: { x: 75, y: 20 } });
    assert.deepEqual(movedDoor.swing?.opensTowards, { x: 60, y: 52 });
  });

  it("reopens the wall gap at the moved door span instead of placing the door on top of a wall", () => {
    const splitWalls: Wall[] = [
      { id: "wall-a-a", start: { x: 0, y: 20 }, end: { x: 35, y: 20 } },
      { id: "wall-a-b", start: { x: 65, y: 20 }, end: { x: 120, y: 20 } }
    ];
    const [movedDoor] = moveObject([swingDoor], "door-1", { x: 30, y: 0 });

    assert.deepEqual(recutWallsForMovedOpening(splitWalls, swingDoor, movedDoor), [
      { id: "wall-a-opening-a", start: { x: 0, y: 20 }, end: { x: 65, y: 20 } },
      { id: "wall-a-opening-b", start: { x: 95, y: 20 }, end: { x: 120, y: 20 } }
    ]);
  });

  it("resizes an opening by dragging one span endpoint and keeps the center on the gap", () => {
    const [resizedDoor] = resizeOpeningSpan([swingDoor], "door-1", "end", { x: 80, y: 24 });

    assert.deepEqual(resizedDoor.spanOnWall, { start: { x: 35, y: 20 }, end: { x: 80, y: 20 } });
    assert.deepEqual(resizedDoor.center, { x: 57.5, y: 20 });
    assert.deepEqual(resizedDoor.size, { height: 40, width: 45 });
  });

  it("resizes a box object from a corner while preserving its opposite corner", () => {
    const [resizedSink] = resizeObject([sink], "sink-1", "se", { x: 105, y: 102 });

    assert.deepEqual(resizedSink.center, { x: 85, y: 85 });
    assert.deepEqual(resizedSink.size, { height: 34, width: 40 });
  });

  it("rotates opening span and swing geometry instead of only changing rotation metadata", () => {
    const [rotatedDoor] = rotateObjectQuarterTurn([swingDoor], "door-1");

    assert.equal(rotatedDoor.rotationDeg, 90);
    assert.deepEqual(rotatedDoor.spanOnWall, { start: { x: 50, y: 5 }, end: { x: 50, y: 35 } });
    assert.deepEqual(rotatedDoor.swing?.opensTowards, { x: 18, y: 20 });
  });
});
