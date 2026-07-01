export const GRID_SIZE = 24;
export const DEFAULT_WALL_HEIGHT = 96;
export const DEFAULT_WALL_DEPTH = 8;

export function snapToGrid(point, gridSize = GRID_SIZE) {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize
  };
}

export function snapToOrthogonal(start, end) {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);

  if (dx >= dy) {
    return { x: end.x, y: start.y };
  }

  return { x: start.x, y: end.y };
}

export function createWall(start, end, id) {
  const snappedStart = snapToGrid(start);
  const snappedEnd = snapToOrthogonal(snappedStart, snapToGrid(end));

  if (snappedStart.x === snappedEnd.x && snappedStart.y === snappedEnd.y) {
    return null;
  }

  return {
    id,
    start: snappedStart,
    end: snappedEnd
  };
}

export function wallLength(wall) {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

export function distanceToWall(point, wall) {
  const lineX = wall.end.x - wall.start.x;
  const lineY = wall.end.y - wall.start.y;
  const lengthSquared = lineX * lineX + lineY * lineY;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - wall.start.x, point.y - wall.start.y);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - wall.start.x) * lineX + (point.y - wall.start.y) * lineY) / lengthSquared
    )
  );
  const projection = {
    x: wall.start.x + t * lineX,
    y: wall.start.y + t * lineY
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

export function findNearestWall(walls, point, maxDistance = 18) {
  return walls.reduce(
    (nearest, wall) => {
      const distance = distanceToWall(point, wall);

      if (distance <= maxDistance && distance < nearest.distance) {
        return { wall, distance };
      }

      return nearest;
    },
    { wall: null, distance: Infinity }
  ).wall;
}

export function removeWall(walls, wallId) {
  return walls.filter((wall) => wall.id !== wallId);
}

export function summarizeWalls(walls) {
  const totalLength = walls.reduce((sum, wall) => sum + wallLength(wall), 0);

  return {
    wallCount: walls.length,
    approximateMeters: Math.round((totalLength / GRID_SIZE) * 0.5 * 10) / 10,
    status: walls.length > 0 ? "편집중" : "초안"
  };
}

function createPath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ")
    .concat(" Z");
}

export function projectPointTo3D(point, z = 0) {
  return {
    x: 480 + (point.x - point.y) * 0.55,
    y: 110 + (point.x + point.y) * 0.22 - z
  };
}

export function convertWallTo3D(wall, options = {}) {
  const height = options.height ?? DEFAULT_WALL_HEIGHT;
  const depth = options.depth ?? DEFAULT_WALL_DEPTH;
  const bottomStart = projectPointTo3D(wall.start, 0);
  const bottomEnd = projectPointTo3D(wall.end, 0);
  const topEnd = projectPointTo3D(wall.end, height);
  const topStart = projectPointTo3D(wall.start, height);

  return {
    id: wall.id,
    height,
    depth,
    path: createPath([bottomStart, bottomEnd, topEnd, topStart]),
    topLine: {
      start: topStart,
      end: topEnd
    }
  };
}

export function convertWallsTo3D(walls, options = {}) {
  const wallPanels = walls.map((wall) => convertWallTo3D(wall, options));
  const points = walls.flatMap((wall) => [wall.start, wall.end]);
  const hasPoints = points.length > 0;
  const minX = hasPoints ? Math.min(...points.map((point) => point.x)) : 120;
  const maxX = hasPoints ? Math.max(...points.map((point) => point.x)) : 720;
  const minY = hasPoints ? Math.min(...points.map((point) => point.y)) : 120;
  const maxY = hasPoints ? Math.max(...points.map((point) => point.y)) : 456;
  const pad = GRID_SIZE;
  const floorCorners = [
    projectPointTo3D({ x: minX - pad, y: minY - pad }, 0),
    projectPointTo3D({ x: maxX + pad, y: minY - pad }, 0),
    projectPointTo3D({ x: maxX + pad, y: maxY + pad }, 0),
    projectPointTo3D({ x: minX - pad, y: maxY + pad }, 0)
  ];

  return {
    wallPanels,
    floor: {
      path: createPath(floorCorners)
    }
  };
}

export function createStarterWalls() {
  return [
    createWall({ x: 144, y: 120 }, { x: 720, y: 120 }, "starter-top"),
    createWall({ x: 720, y: 120 }, { x: 720, y: 456 }, "starter-right"),
    createWall({ x: 720, y: 456 }, { x: 144, y: 456 }, "starter-bottom"),
    createWall({ x: 144, y: 456 }, { x: 144, y: 120 }, "starter-left"),
    createWall({ x: 144, y: 288 }, { x: 432, y: 288 }, "starter-inner-a"),
    createWall({ x: 432, y: 288 }, { x: 432, y: 456 }, "starter-inner-b")
  ].filter(Boolean);
}
