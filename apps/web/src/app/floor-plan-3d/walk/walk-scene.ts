import { getFurnitureFootprint } from "../room-model/collision";
import type { PlacedFurniture, WheretoputWall3D } from "../room-model/types";
import type { WalkCollisionWorld, WalkObstacle, WalkPoint } from "./walk-collision";

function obstacleCorners(obstacle: WalkObstacle): WalkPoint[] {
  const cos = Math.cos(obstacle.rotationY);
  const sin = Math.sin(obstacle.rotationY);

  return [
    [-obstacle.halfWidth, -obstacle.halfDepth],
    [obstacle.halfWidth, -obstacle.halfDepth],
    [obstacle.halfWidth, obstacle.halfDepth],
    [-obstacle.halfWidth, obstacle.halfDepth]
  ].map(([x, z]) => ({
    x: obstacle.center.x + x * cos - z * sin,
    z: obstacle.center.z + x * sin + z * cos
  }));
}

export function createFloorPlanWalkWorld(
  walls: readonly WheretoputWall3D[],
  furniture: readonly PlacedFurniture[],
  horizontalScale = 1
): WalkCollisionWorld {
  const scale = Math.max(0.1, horizontalScale);
  const wallObstacles = walls.map<WalkObstacle>((wall) => ({
    id: `wall:${wall.id}`,
    center: { x: wall.position[0] * scale, z: wall.position[2] * scale },
    halfWidth: wall.dimensions.width * scale / 2,
    halfDepth: wall.dimensions.depth * scale / 2,
    rotationY: wall.rotation[1]
  }));
  const furnitureObstacles = furniture.map<WalkObstacle>((item) => {
    const footprint = getFurnitureFootprint(item);
    return {
      id: `furniture:${item.id}`,
      center: { x: item.position[0] * scale, z: item.position[2] * scale },
      halfWidth: footprint.width * scale / 2,
      halfDepth: footprint.depth * scale / 2,
      rotationY: item.rotation[1]
    };
  });
  const wallCorners = wallObstacles.flatMap(obstacleCorners);
  const bounds = wallCorners.length === 0
    ? { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }
    : {
        minX: Math.min(...wallCorners.map((point) => point.x)),
        maxX: Math.max(...wallCorners.map((point) => point.x)),
        minZ: Math.min(...wallCorners.map((point) => point.z)),
        maxZ: Math.max(...wallCorners.map((point) => point.z))
      };

  return { bounds, obstacles: [...wallObstacles, ...furnitureObstacles] };
}
