import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { rayPlaneIntersectionXZ } from "./register-pick";

const near = (actual: number, expected: number, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} ≉ ${expected}`);

describe("rayPlaneIntersectionXZ — 바닥 평면 픽", () => {
  it("탑다운(수직 하향) 광선의 교차 XZ = 광선 원점의 XZ (기존 event.point 동치)", () => {
    // 기존 탑다운 뷰어는 카메라 바로 아래로 쏘는 수직 광선을 썼다 → 교차점 XZ = 원점 XZ.
    const hit = rayPlaneIntersectionXZ({ origin: { x: 2, y: 8, z: -3 }, direction: { x: 0, y: -1, z: 0 } });
    assert.ok(hit);
    near(hit.x, 2);
    near(hit.z, -3);
  });

  it("기울어진 광선이라도 같은 월드 지점을 픽한다(각도 무관)", () => {
    // 원점 (0,8,8)에서 목표 바닥점 (2,0,-3)을 향하는 광선. 정규화하지 않아도 같은 점.
    const target = { x: 2, y: 0, z: -3 };
    const origin = { x: 0, y: 8, z: 8 };
    const direction = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
    const hit = rayPlaneIntersectionXZ({ origin, direction });
    assert.ok(hit);
    near(hit.x, 2);
    near(hit.z, -3);
  });

  it("정규화된 방향과 비정규화 방향이 같은 결과", () => {
    const origin = { x: -1, y: 5, z: 4 };
    const raw = { x: 3, y: -5, z: -2 };
    const len = Math.hypot(raw.x, raw.y, raw.z);
    const normalized = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
    const a = rayPlaneIntersectionXZ({ origin, direction: raw });
    const b = rayPlaneIntersectionXZ({ origin, direction: normalized });
    assert.ok(a && b);
    near(a.x, b.x);
    near(a.z, b.z);
  });

  it("임의 planeY(바닥 높이)를 존중한다", () => {
    const hit = rayPlaneIntersectionXZ({ origin: { x: 0, y: 8, z: 0 }, direction: { x: 1, y: -1, z: 0 } }, 2);
    assert.ok(hit);
    // y가 8→2로 6 내려가는 동안 x는 +6.
    near(hit.x, 6);
    near(hit.z, 0);
  });

  it("평면과 평행한 광선은 null", () => {
    assert.equal(rayPlaneIntersectionXZ({ origin: { x: 0, y: 8, z: 0 }, direction: { x: 1, y: 0, z: 0 } }), null);
  });

  it("교차가 광선 뒤쪽(위쪽을 향해 쏨)이면 null", () => {
    // 카메라가 평면 위에서 위로 쏘면 바닥 평면은 뒤쪽 → 픽 아님.
    assert.equal(rayPlaneIntersectionXZ({ origin: { x: 0, y: 8, z: 0 }, direction: { x: 0, y: 1, z: 0 } }), null);
  });
});
