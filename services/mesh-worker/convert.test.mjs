import assert from "node:assert/strict";
import test from "node:test";

import { assertScalePreserved, runConversionJob } from "./convert.mjs";

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

test("변환 실패는 failure 콜백을 한 번 보내고 실패 결과를 반환한다", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const callbackCalls = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  });
  console.error = () => {};
  globalThis.fetch = async (url, init) => {
    if (String(url) === "https://cdn.example/missing.usdz") {
      return new Response("missing", { status: 404 });
    }
    callbackCalls.push({ url: String(url), init });
    return new Response(null, { status: 204 });
  };

  const result = await runConversionJob({
    furnitureId: "tf-failure",
    usdzUrl: "https://cdn.example/missing.usdz",
    glbUploadUrl: "https://s3.example/put",
    glbUploadHeaders: {},
    glbPublicUrl: "https://cdn.example/out.glb",
    callbackBase: "https://api.example/api",
    workerSecret: "worker-secret"
  });

  assert.deepEqual(result, {
    ok: false,
    error: "[download] USDZ 다운로드가 404를 반환했습니다(https://cdn.example/missing.usdz)."
  });
  assert.equal(callbackCalls.length, 1);
  assert.equal(
    callbackCalls[0].url,
    "https://api.example/api/tenant-furniture/tf-failure/mesh-conversion/failure"
  );
  assert.equal(callbackCalls[0].init.headers["x-worker-secret"], "worker-secret");
  assert.deepEqual(JSON.parse(callbackCalls[0].init.body), { error: result.error });
});
