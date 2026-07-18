import assert from "node:assert/strict";
import test from "node:test";
import {
  ESTIMATED_DOOR_WIDTH_MM,
  estimateCalibrationFromDoors,
} from "../viewer/review-editor.mjs";

const door = (width, height = 12) => ({ kind: "door", width, height });

test("estimates mm/px from the median detected door width", () => {
  const calibration = estimateCalibrationFromDoors([
    door(40), door(50), door(60),
    { kind: "window", width: 200, height: 12 },
  ]);
  assert.ok(calibration);
  assert.equal(calibration.estimated, true);
  assert.equal(calibration.millimetersPerPixel, ESTIMATED_DOOR_WIDTH_MM / 50);
  assert.equal(calibration.actualMillimeters, ESTIMATED_DOOR_WIDTH_MM);
});

test("averages the middle pair for an even door count", () => {
  const calibration = estimateCalibrationFromDoors([door(40), door(60)]);
  assert.equal(calibration.millimetersPerPixel, ESTIMATED_DOOR_WIDTH_MM / 50);
});

test("uses the long side of each door footprint", () => {
  const calibration = estimateCalibrationFromDoors([{ kind: "door", width: 12, height: 45 }]);
  assert.equal(calibration.millimetersPerPixel, ESTIMATED_DOOR_WIDTH_MM / 45);
});

test("returns null without doors or outside the plausible range", () => {
  assert.equal(estimateCalibrationFromDoors([]), null);
  assert.equal(estimateCalibrationFromDoors([{ kind: "window", width: 50, height: 12 }]), null);
  // 900mm over 5px = 180 mm/px — implausibly coarse, likely a bad detection.
  assert.equal(estimateCalibrationFromDoors([{ kind: "door", width: 5, height: 5 }]), null);
  // 900mm over 800px = ~1.1 mm/px — implausibly fine for a 1024px plan.
  assert.equal(estimateCalibrationFromDoors([door(800)]), null);
});
