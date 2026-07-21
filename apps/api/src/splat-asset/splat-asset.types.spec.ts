import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { parseSpawnViewInput } from "./splat-asset.types";

describe("parseSpawnViewInput", () => {
  it("parses a valid { spawnView: { position, target } } body", () => {
    const body = {
      spawnView: {
        position: [-0.304, 1.45, -0.731],
        target: [0.22, 0.477, -2.505]
      }
    };

    assert.deepEqual(parseSpawnViewInput(body), {
      position: [-0.304, 1.45, -0.731],
      target: [0.22, 0.477, -2.505]
    });
  });

  it("coerces numeric strings", () => {
    const body = { spawnView: { position: ["1", "2", "3"], target: [0, 0, 0] } };
    assert.deepEqual(parseSpawnViewInput(body), { position: [1, 2, 3], target: [0, 0, 0] });
  });

  it("rejects a missing spawnView", () => {
    assert.throws(() => parseSpawnViewInput({}), BadRequestException);
  });

  it("rejects a position/target that isn't a 3-tuple", () => {
    assert.throws(
      () => parseSpawnViewInput({ spawnView: { position: [1, 2], target: [0, 0, 0] } }),
      BadRequestException
    );
    assert.throws(
      () => parseSpawnViewInput({ spawnView: { position: [1, 2, 3, 4], target: [0, 0, 0] } }),
      BadRequestException
    );
  });

  it("rejects non-finite numbers", () => {
    assert.throws(
      () => parseSpawnViewInput({ spawnView: { position: [1, Number.NaN, 3], target: [0, 0, 0] } }),
      BadRequestException
    );
    assert.throws(
      () => parseSpawnViewInput({ spawnView: { position: [1, 2, 3], target: [0, Infinity, 0] } }),
      BadRequestException
    );
  });
});
