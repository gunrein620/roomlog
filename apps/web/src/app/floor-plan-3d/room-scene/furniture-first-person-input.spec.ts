import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FURNITURE_MOVE_SPEED_METERS_PER_SECOND,
  furnitureFirstPersonMovementDelta,
  resolveFurnitureShortcut
} from "./furniture-first-person-input";

describe("furniture first-person input", () => {
  it("uses E only for an aimed existing furniture item", () => {
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
      null
    );
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "Digit2",
        mode: "select",
        repeat: false,
        target: null
      }),
      "close-select"
    );
  });

  it("uses 2 to open selection from explore or carry", () => {
    for (const code of ["Digit2", "Numpad2"]) {
      assert.equal(
        resolveFurnitureShortcut({ aimedFurnitureId: null, code, mode: "explore", repeat: false, target: null }),
        "open-select"
      );
      assert.equal(
        resolveFurnitureShortcut({ aimedFurnitureId: null, code, mode: "carry", repeat: false, target: null }),
        "open-select"
      );
    }
  });

  it("uses 1 and 3 to rotate a carried furniture item", () => {
    for (const code of ["Digit1", "Numpad1"]) {
      assert.equal(
        resolveFurnitureShortcut({ aimedFurnitureId: null, code, mode: "carry", repeat: false, target: null }),
        "rotate-left"
      );
    }
    for (const code of ["Digit3", "Numpad3"]) {
      assert.equal(
        resolveFurnitureShortcut({ aimedFurnitureId: null, code, mode: "carry", repeat: false, target: null }),
        "rotate-right"
      );
    }
    assert.equal(
      resolveFurnitureShortcut({ aimedFurnitureId: null, code: "Digit1", mode: "explore", repeat: false, target: null }),
      null
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

  it("uses R to remove or cancel the carried furniture", () => {
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "KeyR",
        mode: "carry",
        repeat: false,
        target: null
      }),
      "remove"
    );
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "KeyR",
        mode: "explore",
        repeat: false,
        target: null
      }),
      null
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
