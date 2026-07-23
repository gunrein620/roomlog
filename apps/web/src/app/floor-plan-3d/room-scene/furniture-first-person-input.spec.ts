import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FURNITURE_MOVE_SPEED_METERS_PER_SECOND,
  FURNITURE_ROTATE_SPEED_RADIANS_PER_SECOND,
  fineRotateKeyDirection,
  furnitureFlyMovementDelta,
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

  it("no longer maps Q to confirm (fixing is left-click), keeps Escape close or cancel", () => {
    // Q는 이제 섬세 회전(fineRotateKeyDirection) 담당 — 단축키 리졸버에서는 아무것도 아니다.
    assert.equal(
      resolveFurnitureShortcut({
        aimedFurnitureId: null,
        code: "KeyQ",
        mode: "carry",
        repeat: false,
        target: null
      }),
      null
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

  it("moves at 4.5 metres per second (25% slower) with bounded delta", () => {
    assert.equal(FURNITURE_MOVE_SPEED_METERS_PER_SECOND, 4.5);
    assert.deepEqual(
      furnitureFlyMovementDelta(new Set(["forward"]), { x: 0, y: 0, z: -1 }, 1),
      { x: 0, y: 0, z: -0.45 }
    );
  });

  it("flies along the full look direction so looking up and pressing W ascends", () => {
    // 45도 위를 보고 전진 — 수평·수직으로 같은 비율로 이동한다.
    const up45 = furnitureFlyMovementDelta(new Set(["forward"]), { x: 0, y: 1, z: -1 }, 0.1);
    assert.ok(up45.y > 0);
    assert.ok(up45.z < 0);
    assert.ok(Math.abs(up45.y - Math.abs(up45.z)) < 1e-9);

    // 아래를 보고 전진하면 하강한다.
    const down = furnitureFlyMovementDelta(new Set(["forward"]), { x: 0, y: -1, z: -1 }, 0.1);
    assert.ok(down.y < 0);

    // 스트레이프는 수평 성분만 갖는다 — 위를 보고 옆걸음해도 떠오르지 않는다.
    const strafe = furnitureFlyMovementDelta(new Set(["right"]), { x: 0, y: 1, z: -1 }, 0.1);
    assert.equal(strafe.y, 0);
    assert.ok(strafe.x > 0);
  });

  it("maps Q/E to fine-rotation directions at ninety degrees per second", () => {
    assert.equal(fineRotateKeyDirection("KeyQ"), -1);
    assert.equal(fineRotateKeyDirection("KeyE"), 1);
    assert.equal(fineRotateKeyDirection("Digit1"), null);
    assert.equal(fineRotateKeyDirection("KeyW"), null);
    assert.equal(FURNITURE_ROTATE_SPEED_RADIANS_PER_SECOND, Math.PI / 2);
  });
});
