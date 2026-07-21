import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FURNITURE_MOVE_SPEED_METERS_PER_SECOND,
  furnitureFirstPersonMovementDelta,
  resolveFurnitureShortcut
} from "./furniture-first-person-input";

describe("furniture first-person input", () => {
  it("uses E contextually for aimed pickup or cursor selection", () => {
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: "chair",
        code: "KeyE",
        mode: "explore",
        repeat: false,
        target: null
      }),
      "pickup-aimed"
    );
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "KeyE",
        mode: "explore",
        repeat: false,
        target: null
      }),
      "open-select"
    );
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "KeyE",
        mode: "select",
        repeat: false,
        target: null
      }),
      "close-select"
    );
  });

  it("uses Q to confirm carry and Escape to close or cancel", () => {
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "KeyQ",
        mode: "carry",
        repeat: false,
        target: null
      }),
      "confirm"
    );
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "Escape",
        mode: "carry",
        repeat: false,
        target: null
      }),
      "cancel"
    );
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "Escape",
        mode: "select",
        repeat: false,
        target: null
      }),
      "close-select"
    );
  });

  it("ignores repeats and editable targets", () => {
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "KeyE",
        mode: "explore",
        repeat: true,
        target: null
      }),
      null
    );
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "KeyQ",
        mode: "carry",
        repeat: false,
        target: { tagName: "INPUT" }
      }),
      null
    );
  });

  it("moves at exactly six metres per second with bounded delta", () => {
    assert.equal(FURNITURE_MOVE_SPEED_METERS_PER_SECOND, 6);
    assert.deepEqual(
      furnitureFirstPersonMovementDelta(new Set(["forward"]), { x: 0, z: -1 }, 1),
      { x: 0, z: -0.6000000000000001 }
    );
  });
});
