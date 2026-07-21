import assert from "node:assert/strict";
import test from "node:test";
import type { RoomPlanCaptureFloorPlan } from "@roomlog/types";
import { parseCaptureFloorPlanJson, resolveCaptureFloorPlanSource } from "./register-capture-source";

const validPlan: RoomPlanCaptureFloorPlan = {
  frame: "arkit-metric",
  walls: [{ start: [0, 0], end: [1, 0], height: 2.4, thickness: 0.1 }],
  openings: []
};

test("parseCaptureFloorPlanJson: 유효한 캡처 도면을 그대로 통과시킨다", () => {
  assert.deepEqual(parseCaptureFloorPlanJson(validPlan), validPlan);
});

test("parseCaptureFloorPlanJson: frame이 다르거나 walls가 비었으면 null", () => {
  assert.equal(parseCaptureFloorPlanJson({ ...validPlan, frame: "world" }), null);
  assert.equal(parseCaptureFloorPlanJson({ ...validPlan, walls: [] }), null);
  assert.equal(parseCaptureFloorPlanJson({ ...validPlan, walls: undefined }), null);
});

test("parseCaptureFloorPlanJson: 원시값·배열·null은 null", () => {
  assert.equal(parseCaptureFloorPlanJson(null), null);
  assert.equal(parseCaptureFloorPlanJson(undefined), null);
  assert.equal(parseCaptureFloorPlanJson("not json"), null);
  assert.equal(parseCaptureFloorPlanJson([validPlan]), null);
});

test("resolveCaptureFloorPlanSource: 자산값만 있으면 자산을 쓰고 출처를 asset으로 표시한다", () => {
  const resolved = resolveCaptureFloorPlanSource(null, validPlan);
  assert.deepEqual(resolved, { plan: validPlan, source: "asset" });
});

test("resolveCaptureFloorPlanSource: 수동 업로드가 있으면 자산값이 있어도 수동이 이긴다", () => {
  const manualPlan = { ...validPlan, walls: [validPlan.walls[0], validPlan.walls[0]] };
  const resolved = resolveCaptureFloorPlanSource(manualPlan, validPlan);
  assert.deepEqual(resolved, { plan: manualPlan, source: "manual" });
});

test("resolveCaptureFloorPlanSource: 둘 다 없으면 null(자동정합 잠들어 있음)", () => {
  assert.equal(resolveCaptureFloorPlanSource(null, null), null);
});
