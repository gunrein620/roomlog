export const WALK_COLLISION_RADIUS_METERS = 0.22;
export const WALK_MAX_SUBSTEP_METERS = 0.08;

export type WalkPoint = { x: number; z: number };

export type WalkBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type WalkObstacle = {
  id: string;
  center: WalkPoint;
  halfWidth: number;
  halfDepth: number;
  rotationY: number;
};

export type WalkCollisionWorld = {
  bounds: WalkBounds;
  obstacles: WalkObstacle[];
};

function circleIntersectsObstacle(point: WalkPoint, obstacle: WalkObstacle, radius: number) {
  const dx = point.x - obstacle.center.x;
  const dz = point.z - obstacle.center.z;
  const cos = Math.cos(obstacle.rotationY);
  const sin = Math.sin(obstacle.rotationY);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  const nearestX = Math.min(obstacle.halfWidth, Math.max(-obstacle.halfWidth, localX));
  const nearestZ = Math.min(obstacle.halfDepth, Math.max(-obstacle.halfDepth, localZ));
  const distanceX = localX - nearestX;
  const distanceZ = localZ - nearestZ;

  return distanceX * distanceX + distanceZ * distanceZ < radius * radius;
}

function isInsideWalkBounds(point: WalkPoint, bounds: WalkBounds, radius: number) {
  return point.x >= bounds.minX + radius
    && point.x <= bounds.maxX - radius
    && point.z >= bounds.minZ + radius
    && point.z <= bounds.maxZ - radius;
}

export function isWalkPointClear(
  point: WalkPoint,
  world: WalkCollisionWorld,
  radius = WALK_COLLISION_RADIUS_METERS
) {
  if (!isInsideWalkBounds(point, world.bounds, radius)) return false;
  return world.obstacles.every((obstacle) => !circleIntersectsObstacle(point, obstacle, radius));
}

export function resolveWalkMovement(
  start: WalkPoint,
  delta: WalkPoint,
  world: WalkCollisionWorld,
  radius = WALK_COLLISION_RADIUS_METERS
): WalkPoint {
  const distance = Math.hypot(delta.x, delta.z);
  if (distance === 0) return { ...start };

  const substeps = Math.max(1, Math.ceil(distance / WALK_MAX_SUBSTEP_METERS));
  const step = { x: delta.x / substeps, z: delta.z / substeps };
  let current = { ...start };

  for (let index = 0; index < substeps; index += 1) {
    const combined = { x: current.x + step.x, z: current.z + step.z };
    if (isWalkPointClear(combined, world, radius)) {
      current = combined;
      continue;
    }

    const alongX = { x: current.x + step.x, z: current.z };
    if (step.x !== 0 && isWalkPointClear(alongX, world, radius)) {
      current = alongX;
    }

    const alongZ = { x: current.x, z: current.z + step.z };
    if (step.z !== 0 && isWalkPointClear(alongZ, world, radius)) {
      current = alongZ;
    }
  }

  return current;
}

export function findWalkSpawn(
  preferred: WalkPoint,
  world: WalkCollisionWorld,
  radius = WALK_COLLISION_RADIUS_METERS
): WalkPoint | null {
  if (isWalkPointClear(preferred, world, radius)) return { ...preferred };

  const gridStep = 0.25;
  const maxRing = Math.round(3 / gridStep);
  for (let ring = 1; ring <= maxRing; ring += 1) {
    for (let zIndex = -ring; zIndex <= ring; zIndex += 1) {
      for (let xIndex = -ring; xIndex <= ring; xIndex += 1) {
        if (Math.max(Math.abs(xIndex), Math.abs(zIndex)) !== ring) continue;
        const candidate = {
          x: preferred.x + xIndex * gridStep,
          z: preferred.z + zIndex * gridStep
        };
        if (isWalkPointClear(candidate, world, radius)) return candidate;
      }
    }
  }

  return null;
}
