import assert from "node:assert/strict";
import test from "node:test";
import { buildEntranceFloorOverride } from "./entrance-floor-zone.mjs";

test("does not expand a tiny semantic entrance into the adjacent open floor", () => {
  const width = 20;
  const height = 20;
  const labels = new Uint8Array(width * height).fill(1);
  const result = buildEntranceFloorOverride({
    height,
    interiorMask: new Uint8Array(width * height).fill(1),
    labels,
    openings: [],
    permanentSolid: new Uint8Array(width * height),
    rooms: [{
      confidence: 0.9,
      label: "현관",
      polygon: [{ x: 500, y: 500 }, { x: 501, y: 500 }, { x: 500, y: 501 }],
      roomType: "ENTRY",
    }],
    width,
  });

  assert.equal(result, null);
});
