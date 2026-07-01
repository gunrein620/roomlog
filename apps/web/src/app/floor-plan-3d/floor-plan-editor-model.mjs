export const GRID_SIZE = 24;

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
