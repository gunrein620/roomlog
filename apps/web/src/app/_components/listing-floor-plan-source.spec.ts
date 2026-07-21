import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveListingFloorPlanSource } from "./listing-floor-plan-source";

describe("resolveListingFloorPlanSource — 매물 상세 3D 도면 출처 판정", () => {
  it("prefers capture over mitunet when both are present", () => {
    assert.equal(resolveListingFloorPlanSource(true, true), "capture");
  });

  it("returns capture when only the capture layout is present", () => {
    assert.equal(resolveListingFloorPlanSource(true, false), "capture");
  });

  it("falls back to mitunet when there's no capture layout", () => {
    assert.equal(resolveListingFloorPlanSource(false, true), "mitunet");
  });

  it("returns null when neither is present (e.g. a walls3D-only editor plan)", () => {
    assert.equal(resolveListingFloorPlanSource(false, false), null);
  });
});
