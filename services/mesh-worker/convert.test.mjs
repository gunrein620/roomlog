import assert from "node:assert/strict";
import test from "node:test";

import { assertScalePreserved } from "./convert.mjs";

function boxWithExtents(extents) {
  return { min: [0, 0, 0], max: extents };
}

test("동일한 bbox의 스케일을 보존된 것으로 판정한다", () => {
  const box = boxWithExtents([1, 2, 3]);

  assert.doesNotThrow(() => assertScalePreserved(box, box));
});

test("축이 순열된 bbox도 스케일을 보존한 것으로 판정한다", () => {
  const importBox = boxWithExtents([1, 2, 3]);
  const exportBox = boxWithExtents([2, 3, 1]);

  assert.doesNotThrow(() => assertScalePreserved(importBox, exportBox));
});

test("실제 스케일 드리프트는 scale-check 에러로 거부한다", () => {
  const importBox = boxWithExtents([1, 2, 3]);
  const exportBox = boxWithExtents([1.5, 2, 3]);

  assert.throws(
    () => assertScalePreserved(importBox, exportBox),
    (error) => {
      assert.equal(error.stage, "scale-check");
      assert.match(error.message, /정렬된 변 0: import=1\.0000m, export=1\.5000m, ratio=1\.5000/);
      assert.match(error.message, /Object Capture USDZ는 metersPerUnit=1이 확정 전제/);
      return true;
    }
  );
});

test("변 길이가 0인 bbox는 scale-check 에러로 거부한다", () => {
  const zeroExtentBox = boxWithExtents([0, 2, 3]);

  assert.throws(
    () => assertScalePreserved(zeroExtentBox, zeroExtentBox),
    (error) => {
      assert.equal(error.stage, "scale-check");
      assert.match(error.message, /정렬된 바운딩박스 변 길이가 0 이하/);
      return true;
    }
  );
});
