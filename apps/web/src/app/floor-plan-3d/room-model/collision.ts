// 3D 방 좌표계(x/z 평면)의 가구 footprint, 충돌, 배치 보정 계산.

import type { PlacedFurniture, WheretoputWall3D } from "./types";

export type FootprintPoint = { x: number; z: number };

export type FootprintBounds = {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
};

export type FurnitureFootprint = {
  bounds: FootprintBounds;
  center: FootprintPoint;
  corners: FootprintPoint[];
  depth: number;
  width: number;
};

type Rectangle = {
  corners: FootprintPoint[];
};

function roundMetric(value: number) {
  if (Math.abs(value) < 1e-9) return 0;
  const roundedInteger = Math.round(value);
  if (Math.abs(value - roundedInteger) < 1e-9) return roundedInteger;
  return Math.round(value * 1000) / 1000;
}

function toBounds(points: readonly FootprintPoint[]): FootprintBounds {
  return {
    maxX: roundMetric(Math.max(...points.map((point) => point.x))),
    maxZ: roundMetric(Math.max(...points.map((point) => point.z))),
    minX: roundMetric(Math.min(...points.map((point) => point.x))),
    minZ: roundMetric(Math.min(...points.map((point) => point.z)))
  };
}

function rotatedRectangle(center: FootprintPoint, width: number, depth: number, rotationY: number): Rectangle {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const localCorners = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth }
  ];

  return {
    corners: localCorners.map((corner) => ({
      x: roundMetric(center.x + corner.x * cos - corner.z * sin),
      z: roundMetric(center.z + corner.x * sin + corner.z * cos)
    }))
  };
}

function getAxes(rectangle: Rectangle) {
  const axes: FootprintPoint[] = [];

  for (let index = 0; index < rectangle.corners.length; index += 1) {
    const current = rectangle.corners[index];
    const next = rectangle.corners[(index + 1) % rectangle.corners.length];
    const edge = { x: next.x - current.x, z: next.z - current.z };
    const length = Math.hypot(edge.x, edge.z);
    if (length === 0) continue;
    axes.push({ x: -edge.z / length, z: edge.x / length });
  }

  return axes;
}

function project(rectangle: Rectangle, axis: FootprintPoint) {
  const values = rectangle.corners.map((corner) => corner.x * axis.x + corner.z * axis.z);
  return { max: Math.max(...values), min: Math.min(...values) };
}

function rectanglesOverlap(left: Rectangle, right: Rectangle) {
  const axes = [...getAxes(left), ...getAxes(right)];

  return axes.every((axis) => {
    const leftProjection = project(left, axis);
    const rightProjection = project(right, axis);
    return leftProjection.max >= rightProjection.min && rightProjection.max >= leftProjection.min;
  });
}

function wallRectangle(wall: WheretoputWall3D): Rectangle {
  return rotatedRectangle(
    { x: wall.position[0], z: wall.position[2] },
    wall.dimensions.width,
    wall.dimensions.depth,
    wall.rotation[1]
  );
}

function wallEndpoints(wall: WheretoputWall3D) {
  const angle = wall.rotation[1];
  const half = wall.dimensions.width / 2;
  const dx = Math.cos(angle) * half;
  const dz = Math.sin(angle) * half;

  return [
    { x: wall.position[0] - dx, z: wall.position[2] - dz },
    { x: wall.position[0] + dx, z: wall.position[2] + dz }
  ];
}

function roomBounds(walls: readonly WheretoputWall3D[]) {
  if (walls.length === 0) return null;

  return toBounds(walls.flatMap((wall) => wallEndpoints(wall)));
}

function clamp(value: number, min: number, max: number) {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

function getDimensions(furniture: Pick<PlacedFurniture, "length" | "scale" | "sizeMm">) {
  if (furniture.sizeMm) {
    return {
      depth: Math.max(0.05, (furniture.sizeMm.depth / 1000) * furniture.scale),
      height: Math.max(0.05, ((furniture.sizeMm.height ?? furniture.length[1]) / 1000) * furniture.scale),
      width: Math.max(0.05, (furniture.sizeMm.width / 1000) * furniture.scale)
    };
  }

  return {
    depth: Math.max(0.05, (furniture.length[2] / 1000) * furniture.scale),
    height: Math.max(0.05, (furniture.length[1] / 1000) * furniture.scale),
    width: Math.max(0.05, (furniture.length[0] / 1000) * furniture.scale)
  };
}

function distanceToWallCenterLine(point: FootprintPoint, wall: WheretoputWall3D) {
  const angle = wall.rotation[1];
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const vx = point.x - wall.position[0];
  const vz = point.z - wall.position[2];
  const projected = clamp(vx * ux + vz * uz, -wall.dimensions.width / 2, wall.dimensions.width / 2);
  const projectedPoint = {
    x: wall.position[0] + ux * projected,
    z: wall.position[2] + uz * projected
  };
  const normal = { x: -uz, z: ux };
  const signedDistance = (point.x - projectedPoint.x) * normal.x + (point.z - projectedPoint.z) * normal.z;

  return { projected, projectedPoint, signedDistance };
}

export function getFurnitureFootprint(furniture: Pick<PlacedFurniture, "length" | "position" | "rotation" | "scale" | "sizeMm">): FurnitureFootprint {
  const dimensions = getDimensions(furniture);
  const rectangle = rotatedRectangle(
    { x: furniture.position[0], z: furniture.position[2] },
    dimensions.width,
    dimensions.depth,
    furniture.rotation[1]
  );

  return {
    bounds: toBounds(rectangle.corners),
    center: { x: roundMetric(furniture.position[0]), z: roundMetric(furniture.position[2]) },
    corners: rectangle.corners,
    depth: roundMetric(dimensions.depth),
    width: roundMetric(dimensions.width)
  };
}

export function furnitureIntersectsWall(furniture: PlacedFurniture, wall: WheretoputWall3D) {
  return rectanglesOverlap(getFurnitureFootprint(furniture), wallRectangle(wall));
}

export function furnitureOverlapsFurniture(left: PlacedFurniture, right: PlacedFurniture) {
  return rectanglesOverlap(getFurnitureFootprint(left), getFurnitureFootprint(right));
}

export function clampFurnitureIntoRoom(furniture: PlacedFurniture, walls: readonly WheretoputWall3D[]): PlacedFurniture {
  const bounds = roomBounds(walls);
  if (!bounds) return { ...furniture, position: [...furniture.position] };

  const footprint = getFurnitureFootprint(furniture);
  const center = footprint.center;
  const halfX = Math.max(center.x - footprint.bounds.minX, footprint.bounds.maxX - center.x);
  const halfZ = Math.max(center.z - footprint.bounds.minZ, footprint.bounds.maxZ - center.z);
  const nextX = roundMetric(clamp(furniture.position[0], bounds.minX + halfX, bounds.maxX - halfX));
  const nextZ = roundMetric(clamp(furniture.position[2], bounds.minZ + halfZ, bounds.maxZ - halfZ));

  return {
    ...furniture,
    position: [nextX, furniture.position[1], nextZ]
  };
}

export function snapFurnitureToWall(
  furniture: PlacedFurniture,
  walls: readonly WheretoputWall3D[],
  maxDistance: number
): PlacedFurniture {
  const footprint = getFurnitureFootprint(furniture);
  const center = footprint.center;
  let nearest:
    | {
        clearance: number;
        projectedPoint: FootprintPoint;
        signedDistance: number;
        wall: WheretoputWall3D;
      }
    | null = null;

  for (const wall of walls) {
    const candidate = distanceToWallCenterLine(center, wall);
    const clearance = Math.abs(candidate.signedDistance) - wall.dimensions.depth / 2 - footprint.depth / 2;
    if (clearance > maxDistance) continue;
    if (!nearest || Math.abs(clearance) < Math.abs(nearest.clearance)) {
      nearest = { ...candidate, clearance, wall };
    }
  }

  if (!nearest) return { ...furniture, position: [...furniture.position], rotation: [...furniture.rotation] };

  const side = nearest.signedDistance >= 0 ? 1 : -1;
  const angle = nearest.wall.rotation[1];
  const normal = { x: -Math.sin(angle), z: Math.cos(angle) };
  const offset = nearest.wall.dimensions.depth / 2 + footprint.depth / 2;

  return {
    ...furniture,
    position: [
      roundMetric(nearest.projectedPoint.x + normal.x * side * offset),
      furniture.position[1],
      roundMetric(nearest.projectedPoint.z + normal.z * side * offset)
    ],
    rotation: [furniture.rotation[0], roundMetric(angle), furniture.rotation[2]]
  };
}
