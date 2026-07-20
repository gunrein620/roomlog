import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  fromCaptureFloorPlan,
  fromOwnerFloorPlan,
  matchFloorPlans,
  type OwnerWallLike,
  type WallSegment,
  type WallSegments
} from "./floor-plan-match";
import type { RoomPlanCaptureFloorPlan } from "@roomlog/types";

// 픽스처 생성 유틸 — floor-plan-match.ts 내부 R(θ)·+t 규약(similarity-solve.ts와 동일:
// R(θ)(x,z) = (cosθ·x − sinθ·z, sinθ·x + cosθ·z))을 그대로 복제해 "정답" 변환을 심는다.

type Pt = [number, number];

function rotate([x, z]: Pt, yawRadians: number): Pt {
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  return [cos * x - sin * z, sin * x + cos * z];
}

function transformPoint(p: Pt, yawRadians: number, tx: number, tz: number): Pt {
  const [rx, rz] = rotate(p, yawRadians);
  return [rx + tx, rz + tz];
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function polygonToSegments(corners: Pt[]): WallSegment[] {
  return corners.map((start, i) => ({ start, end: corners[(i + 1) % corners.length] }));
}

function transformSegments(segments: WallSegment[], yawDegrees: number, tx: number, tz: number): WallSegment[] {
  const yawRadians = toRadians(yawDegrees);
  return segments.map((seg) => ({
    start: transformPoint(seg.start, yawRadians, tx, tz),
    end: transformPoint(seg.end, yawRadians, tx, tz)
  }));
}

/** 6x4 사각형에서 우상단 모서리를 잘라낸 L자 방 — 90°/180° 회전 대칭이 없다. */
function lShapeCorners(): Pt[] {
  return [
    [0, 0],
    [6, 0],
    [6, 3],
    [4, 3],
    [4, 4],
    [0, 4]
  ];
}

function squareCorners(size = 4): Pt[] {
  return [
    [0, 0],
    [size, 0],
    [size, size],
    [0, size]
  ];
}

function closeTo(actual: number, expected: number, tolerance: number, message: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

describe("floor-plan-match adapters", () => {
  it("fromCaptureFloorPlan carries RoomPlan walls/openings through as segments", () => {
    const capture: RoomPlanCaptureFloorPlan = {
      frame: "arkit-metric",
      walls: [{ start: [0, 0], end: [3, 0], height: 2.4, thickness: 0.1 }],
      openings: [{ kind: "door", center: [1.5, 0], width: 0.9, height: 2.0 }]
    };

    const segments = fromCaptureFloorPlan(capture);

    assert.deepEqual(segments.segments, [{ start: [0, 0], end: [3, 0] }]);
    assert.deepEqual(segments.openings, [{ kind: "door", center: [1.5, 0] }]);
  });

  it("fromOwnerFloorPlan derives centerline segments from position/rotation/width", () => {
    // 폭 4m 벽, yaw=90° → 로컬 X축(길이)이 월드 Z축으로 눕는다.
    const wall: OwnerWallLike = {
      position: [2, 1.2, 5],
      rotation: [0, Math.PI / 2, 0],
      dimensions: { width: 4, height: 2.4, depth: 0.1 }
    };

    const { segments } = fromOwnerFloorPlan([wall]);

    assert.equal(segments.length, 1);
    const [seg] = segments;
    // wallLocalToWorldXZ(localX, 0, wall) with ry=90°: x = position.x, z = position.z - localX.
    // halfWidth=2 → endpoints at localX=-2 (z=5+2=7) and localX=+2 (z=5-2=3), x pinned at position.x=2.
    closeTo(seg.start[0], 2, 1e-9, "start.x");
    closeTo(seg.end[0], 2, 1e-9, "end.x");
    const zValues = [seg.start[1], seg.end[1]].sort((a, b) => a - b);
    closeTo(zValues[0], 3, 1e-9, "min z endpoint");
    closeTo(zValues[1], 7, 1e-9, "max z endpoint");
  });
});

describe("matchFloorPlans", () => {
  it("(a) recovers a known yaw + translation on an identical, rotated/translated plan", () => {
    const captureSegments = polygonToSegments(lShapeCorners());
    const trueYawDeg = 37;
    const trueTx = 2.3;
    const trueTz = -1.7;
    const ownerSegments = transformSegments(captureSegments, trueYawDeg, trueTx, trueTz);

    const capture: WallSegments = { segments: captureSegments };
    const owner: WallSegments = { segments: ownerSegments };

    const result = matchFloorPlans(capture, owner, { sampleSpacingMeters: 0.1 });

    assert.notEqual(result.confidence, "failed");
    closeTo(result.best.transform.rotationYDegrees, trueYawDeg, 1.0, "rotationYDegrees");
    closeTo(result.best.transform.offsetX, trueTx, 0.05, "offsetX");
    closeTo(result.best.transform.offsetZ, trueTz, 0.05, "offsetZ");
    assert.equal(result.best.transform.rotationXDegrees, 180);
    assert.equal(result.best.transform.scaleMultiplier, 1);
    assert.equal(result.best.transform.offsetY, 0);
  });

  it("(b) still recovers the transform when the owner plan has extra, unmatched geometry", () => {
    const captureSegments = polygonToSegments(lShapeCorners());
    const trueYawDeg = -18;
    const trueTx = 0.6;
    const trueTz = 4.1;
    const mainRoomOwnerSegments = transformSegments(captureSegments, trueYawDeg, trueTx, trueTz);

    // 캡처엔 없는 별도 작은 방(옷장)을 소유자 도면에 덧붙인다 — capture ⊂ owner 커버리지.
    const closetSegments = transformSegments(
      polygonToSegments([
        [7, 0],
        [8.5, 0],
        [8.5, 1.2],
        [7, 1.2]
      ]),
      trueYawDeg,
      trueTx,
      trueTz
    );

    const capture: WallSegments = { segments: captureSegments };
    const owner: WallSegments = { segments: [...mainRoomOwnerSegments, ...closetSegments] };

    const result = matchFloorPlans(capture, owner, { sampleSpacingMeters: 0.1 });

    assert.notEqual(result.confidence, "failed");
    closeTo(result.best.transform.rotationYDegrees, trueYawDeg, 1.5, "rotationYDegrees");
    closeTo(result.best.transform.offsetX, trueTx, 0.1, "offsetX");
    closeTo(result.best.transform.offsetZ, trueTz, 0.1, "offsetZ");
  });

  it("(c) reports ambiguous with multiple close alternatives for a near-square room", () => {
    const captureSegments = polygonToSegments(squareCorners(4));
    const ownerSegments = transformSegments(captureSegments, 12, 1, 1);

    const capture: WallSegments = { segments: captureSegments };
    const owner: WallSegments = { segments: ownerSegments };

    const result = matchFloorPlans(capture, owner, { sampleSpacingMeters: 0.1 });

    assert.equal(result.confidence, "ambiguous");
    assert.equal(result.alternatives.length, 3);
    for (const alt of result.alternatives) {
      closeTo(alt.score, result.best.score, 0.06, "alternative score should be close to best for a square room");
    }
  });

  it("(d) reports failed for plans that cannot be reconciled by any rigid transform", () => {
    const captureSegments = polygonToSegments(squareCorners(1.5));
    const ownerSegments = transformSegments(
      polygonToSegments([
        [0, 0],
        [10, 0],
        [10, 3],
        [0, 3]
      ]),
      5,
      20,
      -15
    );

    const capture: WallSegments = { segments: captureSegments };
    const owner: WallSegments = { segments: ownerSegments };

    const result = matchFloorPlans(capture, owner, { sampleSpacingMeters: 0.1 });

    assert.equal(result.confidence, "failed");
  });

  it("(e) matching door/window openings disambiguate an otherwise-symmetric square room", () => {
    const captureSegments = polygonToSegments(squareCorners(4));
    const trueYawDeg = 25;
    const trueTx = 5;
    const trueTz = -3;
    const ownerSegments = transformSegments(captureSegments, trueYawDeg, trueTx, trueTz);

    const captureDoor: Pt = [2, 0]; // 남쪽 벽 중점
    const ownerDoor = transformPoint(captureDoor, toRadians(trueYawDeg), trueTx, trueTz);

    const withoutOpenings = matchFloorPlans(
      { segments: captureSegments },
      { segments: ownerSegments },
      { sampleSpacingMeters: 0.1 }
    );
    assert.equal(withoutOpenings.confidence, "ambiguous");

    const withOpenings = matchFloorPlans(
      {
        segments: captureSegments,
        openings: [{ kind: "door", center: captureDoor }]
      },
      {
        segments: ownerSegments,
        openings: [{ kind: "door", center: ownerDoor }]
      },
      { sampleSpacingMeters: 0.1 }
    );

    assert.equal(withOpenings.confidence, "auto");
    closeTo(withOpenings.best.transform.rotationYDegrees, trueYawDeg, 1.0, "rotationYDegrees");
    closeTo(withOpenings.best.transform.offsetX, trueTx, 0.05, "offsetX");
    closeTo(withOpenings.best.transform.offsetZ, trueTz, 0.05, "offsetZ");
    // 개구부 보너스로 최상위 후보와 나머지의 점수 격차가 열림 전보다 뚜렷이 커져야 한다.
    const runnerUpGap = withOpenings.alternatives[0].score - withOpenings.best.score;
    assert.ok(runnerUpGap > 0.15, `expected a clear score gap from matched openings, got ${runnerUpGap}`);
  });
});
