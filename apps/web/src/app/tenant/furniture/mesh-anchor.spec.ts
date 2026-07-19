import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { anchorMeshOffset, checkMeshScaleSanity } from "./mesh-anchor";

describe("anchorMeshOffset", () => {
  it("규약대로(발자국 중심 원점·바닥 y=0)면 오프셋이 항등에 가깝다", () => {
    // 07-19 실기 검증한 의자 USDZ extent와 동일한 형태(원점 대칭 x/z, 바닥 y≈0).
    const box = { min: [-0.3633, -0.0000000281, -0.3873] as const, max: [0.3633, 0.8061, 0.3873] as const };
    const [dx, dy, dz] = anchorMeshOffset({ min: [...box.min], max: [...box.max] });
    assert.ok(Math.abs(dx) < 1e-6);
    assert.ok(Math.abs(dz) < 1e-6);
    assert.ok(Math.abs(dy - 0.0000000281) < 1e-6);
  });

  it("bbox가 원점에서 벗어나 있으면 중심을 원점으로, 최저점을 바닥으로 되돌린다", () => {
    const offset = anchorMeshOffset({ min: [1, 2, -1], max: [3, 2.8, 3] });
    assert.deepEqual(offset, [-2, -2, -1]);
  });
});

describe("checkMeshScaleSanity", () => {
  it("메시 높이가 등록 치수와 비슷하면 경고 없음", () => {
    // sizeMm.height 800mm = 0.8m, 메시 높이 0.806m → 비율 ~1.0
    const box = { min: [-0.36, 0, -0.39] as [number, number, number], max: [0.36, 0.806, 0.39] as [number, number, number] };
    const warning = checkMeshScaleSanity(box, { width: 700, depth: 700, height: 800 });
    assert.equal(warning, null);
  });

  it("메시가 등록 치수의 절반 미만으로 작으면 경고를 돌려준다", () => {
    // sizeMm.height 2000mm(2m)인데 메시 높이는 0.8m → 비율 0.4, 회귀 의심
    const box = { min: [-0.3, 0, -0.3] as [number, number, number], max: [0.3, 0.8, 0.3] as [number, number, number] };
    const warning = checkMeshScaleSanity(box, { width: 700, depth: 700, height: 2000 });
    assert.match(warning ?? "", /메시 높이/);
  });

  it("메시가 등록 치수의 2배를 초과하면 경고를 돌려준다", () => {
    const box = { min: [-0.3, 0, -0.3] as [number, number, number], max: [0.3, 1.8, 0.3] as [number, number, number] };
    const warning = checkMeshScaleSanity(box, { width: 700, depth: 700, height: 800 });
    assert.match(warning ?? "", /메시 높이/);
  });

  it("X·Z가 크게 어긋나도(촬영 바운딩 박스 잘림) 검증 대상이 아니다", () => {
    // X·Z만 등록 치수를 훨씬 초과해도(촬영 볼륨 잘림으로 인한 과대추정) 높이가 맞으면 경고 없음.
    const box = { min: [-1.5, 0, -1.5] as [number, number, number], max: [1.5, 0.8, 1.5] as [number, number, number] };
    const warning = checkMeshScaleSanity(box, { width: 700, depth: 700, height: 800 });
    assert.equal(warning, null);
  });

  it("sizeMm.height가 0 이하면 비교 불가로 보고 경고를 건너뛴다", () => {
    const box = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
    assert.equal(checkMeshScaleSanity(box, { width: 700, depth: 700, height: 0 }), null);
  });
});
