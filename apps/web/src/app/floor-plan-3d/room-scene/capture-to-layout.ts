// RoomPlan(iOS) 캡처 도면(RoomPlanCaptureFloorPlan, ARKit 실측 미터)을 도면 뷰어가 쓰는
// MitunetSceneLayout으로 변환한다.
//
// mitunet 경로(createMitunetSceneLayout)는 픽셀 좌표라 원점이 무의미해서 bbox 중심으로
// 옮기지만, 캡처 좌표는 옮기지 않는다 — 캡처는 splat과 같은 ARSession에서 나와 splat
// 좌표계와 항등이고(향후 정합·가구 배치가 이 항등에 의존), 중심 정렬을 하면 그 항등이
// 깨진다. 대신 bounds.centerX/centerZ에 실제 중심값을 담아 카메라 오토핏 등 소비자가
// 방 중심을 알 수 있게 한다. 이 파일은 좌표를 그대로 통과시킨다.
//
// (mitunet-to-walls.ts / mitunet-floor-plan-walls.ts의 기존 OBB 변환기와는 무관 — 건드리지 않음.)

import type { MetricOpening, MetricWall, RoomPlanCaptureFloorPlan } from "@roomlog/types";
import type { MitunetSceneLayout, MitunetScenePolygon } from "./mitunet-geometry";

/** 실측 벽 두께가 0(실데이터가 전부 그렇다)일 때 렌더용으로 합성하는 최소 두께. 없으면 폴리곤이 선으로 퇴화한다. */
const MIN_WALL_THICKNESS_METERS = 0.1;

type Point = [number, number];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]);
}

function isMetricWall(value: unknown): value is MetricWall {
  if (!value || typeof value !== "object") return false;
  const wall = value as Record<string, unknown>;
  return isPoint(wall.start) && isPoint(wall.end) && isFiniteNumber(wall.height) && isFiniteNumber(wall.thickness);
}

function isMetricOpening(value: unknown): value is MetricOpening {
  if (!value || typeof value !== "object") return false;
  const opening = value as Record<string, unknown>;
  return (
    (opening.kind === "door" || opening.kind === "window")
    && isPoint(opening.center)
    && isFiniteNumber(opening.width)
    && isFiniteNumber(opening.height)
  );
}

function subtract(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1]];
}

function length(vector: Point) {
  return Math.hypot(vector[0], vector[1]);
}

/** 진행 방향(단위 벡터)의 수직 단위 벡터. */
function normal(direction: Point): Point {
  return [-direction[1], direction[0]];
}

type ResolvedWall = {
  start: Point;
  end: Point;
  /** 단위 벡터. */
  direction: Point;
  halfThickness: number;
  polygon: MitunetScenePolygon;
};

/** 벽 세그먼트를 두께만큼 양옆으로 밀어 사각형 폴리곤(4점)으로 만든다. */
function resolveWall(wall: MetricWall): ResolvedWall | null {
  const segment = subtract(wall.end, wall.start);
  const segmentLength = length(segment);
  if (!(segmentLength > 0)) return null;

  const direction: Point = [segment[0] / segmentLength, segment[1] / segmentLength];
  const perpendicular = normal(direction);
  const thickness = wall.thickness > 0 ? wall.thickness : MIN_WALL_THICKNESS_METERS;
  const halfThickness = thickness / 2;
  const offset: Point = [perpendicular[0] * halfThickness, perpendicular[1] * halfThickness];

  const outer: Point[] = [
    [wall.start[0] + offset[0], wall.start[1] + offset[1]],
    [wall.end[0] + offset[0], wall.end[1] + offset[1]],
    [wall.end[0] - offset[0], wall.end[1] - offset[1]],
    [wall.start[0] - offset[0], wall.start[1] - offset[1]]
  ];

  return {
    start: wall.start,
    end: wall.end,
    direction,
    halfThickness,
    polygon: { outer, holes: [] }
  };
}

/** 점과 세그먼트 사이 최단 거리. */
function distanceToSegment(point: Point, start: Point, end: Point) {
  const segment = subtract(end, start);
  const segmentLengthSq = segment[0] ** 2 + segment[1] ** 2;
  if (segmentLengthSq === 0) return length(subtract(point, start));

  const t = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * segment[0] + (point[1] - start[1]) * segment[1]
  ) / segmentLengthSq));
  const closest: Point = [start[0] + segment[0] * t, start[1] + segment[1] * t];
  return length(subtract(point, closest));
}

// MetricOpening엔 방향이 없다. 가장 가까운 벽 세그먼트를 찾아 그 방향(폭 = 벽 방향,
// 두께 = 벽 두께)을 빌려온다. 가까운 벽이 없으면(빈 벽 목록) 그 개구부는 건너뛴다.
function resolveOpening(opening: MetricOpening, walls: ResolvedWall[]): MitunetScenePolygon | null {
  let nearest: ResolvedWall | null = null;
  let nearestDistance = Infinity;
  for (const wall of walls) {
    const distance = distanceToSegment(opening.center, wall.start, wall.end);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = wall;
    }
  }
  if (!nearest) return null;

  const halfWidth = opening.width / 2;
  const along: Point = [nearest.direction[0] * halfWidth, nearest.direction[1] * halfWidth];
  const perpendicular = normal(nearest.direction);
  const across: Point = [perpendicular[0] * nearest.halfThickness, perpendicular[1] * nearest.halfThickness];
  const [cx, cz] = opening.center;

  return {
    outer: [
      [cx - along[0] + across[0], cz - along[1] + across[1]],
      [cx + along[0] + across[0], cz + along[1] + across[1]],
      [cx + along[0] - across[0], cz + along[1] - across[1]],
      [cx - along[0] - across[0], cz - along[1] - across[1]]
    ],
    holes: []
  };
}

/** 미검증 JSON을 관대하게 파싱한다. 유효한 캡처 도면이 아니면 null. */
export function captureFloorPlanToSceneLayout(plan: unknown): MitunetSceneLayout | null {
  if (!plan || typeof plan !== "object") return null;
  const candidate = plan as Partial<RoomPlanCaptureFloorPlan>;
  if (!Array.isArray(candidate.walls)) return null;

  const walls = candidate.walls.filter(isMetricWall);
  const resolvedWalls = walls.map(resolveWall).filter((wall): wall is ResolvedWall => wall !== null);
  if (resolvedWalls.length === 0) return null;

  const openings = Array.isArray(candidate.openings) ? candidate.openings.filter(isMetricOpening) : [];
  const doorPolygons: MitunetScenePolygon[] = [];
  const windowPolygons: MitunetScenePolygon[] = [];
  for (const opening of openings) {
    const polygon = resolveOpening(opening, resolvedWalls);
    if (!polygon) continue;
    (opening.kind === "door" ? doorPolygons : windowPolygons).push(polygon);
  }

  // bounds는 실제 벽 폴리곤의 bbox — 원점은 옮기지 않으므로 centerX/centerZ가 0이 아닌
  // 실제 중심값을 담는다(위 헤더 주석 참조).
  const wallVertices = resolvedWalls.flatMap((wall) => wall.polygon.outer);
  const xs = wallVertices.map(([x]) => x);
  const zs = wallVertices.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    bounds: {
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
      width: maxX - minX,
      depth: maxZ - minZ
    },
    // 캡처는 항상 ARKit 실측이다.
    hasPhysicalScale: true,
    wall: resolvedWalls.map((wall) => wall.polygon),
    door: doorPolygons,
    window: windowPolygons
  };
}
