export const GRID_SIZE = 24;
export const DEFAULT_WALL_HEIGHT = 96;
export const DEFAULT_WALL_DEPTH = 8;
export const DEFAULT_PIXEL_TO_METER_RATIO = 1 / 48;
export const WHERETOPUT_WALL_HEIGHT = 2.5;
export const WHERETOPUT_WALL_DEPTH = 0.15;

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

function roundMetric(value) {
  return Math.round(value * 1000) / 1000;
}

function normalizePlanName(name = "plan") {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function projectPointTo3D(point, z = 0, camera = {}) {
  const yaw = camera.yaw ?? 0;
  const pitch = camera.pitch ?? 1;
  const center = camera.center ?? { x: 432, y: 288 };
  const relativeX = point.x - center.x;
  const relativeY = point.y - center.y;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const rotatedX = relativeX * cos - relativeY * sin;
  const rotatedY = relativeX * sin + relativeY * cos;

  return {
    x: 480 + (rotatedX - rotatedY) * 0.55,
    y: 300 + (rotatedX + rotatedY) * 0.22 * pitch - z
  };
}

export function convertWallTo3D(wall, options = {}) {
  const height = options.height ?? DEFAULT_WALL_HEIGHT;
  const depth = options.depth ?? DEFAULT_WALL_DEPTH;
  const camera = options.camera ?? {};
  const bottomStart = projectPointTo3D(wall.start, 0, camera);
  const bottomEnd = projectPointTo3D(wall.end, 0, camera);
  const topEnd = projectPointTo3D(wall.end, height, camera);
  const topStart = projectPointTo3D(wall.start, height, camera);

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
  const camera = options.camera ?? {};
  const floorCorners = [
    projectPointTo3D({ x: minX - pad, y: minY - pad }, 0, camera),
    projectPointTo3D({ x: maxX + pad, y: minY - pad }, 0, camera),
    projectPointTo3D({ x: maxX + pad, y: maxY + pad }, 0, camera),
    projectPointTo3D({ x: minX - pad, y: maxY + pad }, 0, camera)
  ];

  return {
    wallPanels,
    floor: {
      path: createPath(floorCorners)
    }
  };
}

export function convertWallToWheretoputSimulator(wall, options = {}) {
  const pixelToMeterRatio = options.pixelToMeterRatio ?? DEFAULT_PIXEL_TO_METER_RATIO;
  const height = options.height ?? WHERETOPUT_WALL_HEIGHT;
  const depth = options.depth ?? WHERETOPUT_WALL_DEPTH;
  const start = {
    x: roundMetric(wall.start.x * pixelToMeterRatio),
    y: roundMetric(wall.start.y * pixelToMeterRatio)
  };
  const end = {
    x: roundMetric(wall.end.x * pixelToMeterRatio),
    y: roundMetric(wall.end.y * pixelToMeterRatio)
  };
  const length = roundMetric(wallLength(wall) * pixelToMeterRatio);
  const rotation = roundMetric(Math.atan2(end.y - start.y, end.x - start.x));

  return {
    id: wall.id,
    wall_id: wall.id,
    start,
    end,
    length,
    height,
    depth,
    position: [roundMetric((start.x + end.x) / 2), roundMetric(height / 2), roundMetric((start.y + end.y) / 2)],
    rotation: [0, rotation, 0],
    dimensions: {
      width: length,
      height,
      depth
    },
    wall_order: options.wallOrder ?? null
  };
}

export function convertWallsToWheretoputSimulator(walls, options = {}) {
  return walls.map((wall, index) =>
    convertWallToWheretoputSimulator(wall, { ...options, wallOrder: index + 1 })
  );
}

export function createWallsFromRegisteredPlan(plan = {}) {
  const planWidth = Math.max(1, Number(plan.width) || 1280);
  const planHeight = Math.max(1, Number(plan.height) || 900);
  const aspectRatio = planWidth / planHeight;
  const roomWidth = Math.min(660, Math.max(420, aspectRatio >= 1 ? 660 : 520));
  const roomHeight = Math.min(420, Math.max(300, aspectRatio >= 1 ? roomWidth / aspectRatio : 420));
  const left = Math.round((960 - roomWidth) / 2 / GRID_SIZE) * GRID_SIZE;
  const top = Math.round((620 - roomHeight) / 2 / GRID_SIZE) * GRID_SIZE;
  const right = Math.round((left + roomWidth) / GRID_SIZE) * GRID_SIZE;
  const bottom = Math.round((top + roomHeight) / GRID_SIZE) * GRID_SIZE;
  const middleX = Math.round((left + (right - left) * 0.56) / GRID_SIZE) * GRID_SIZE;
  const middleY = Math.round((top + (bottom - top) * 0.52) / GRID_SIZE) * GRID_SIZE;
  const baseId = `upload-${normalizePlanName(plan.name) || "plan"}`;

  return [
    createWall({ x: left, y: top }, { x: right, y: top }, `${baseId}-top`),
    createWall({ x: right, y: top }, { x: right, y: bottom }, `${baseId}-right`),
    createWall({ x: right, y: bottom }, { x: left, y: bottom }, `${baseId}-bottom`),
    createWall({ x: left, y: bottom }, { x: left, y: top }, `${baseId}-left`),
    createWall({ x: left, y: middleY }, { x: middleX, y: middleY }, `${baseId}-inner-a`),
    createWall({ x: middleX, y: middleY }, { x: middleX, y: bottom }, `${baseId}-inner-b`)
  ].filter(Boolean);
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
