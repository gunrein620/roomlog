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

export function convertWallTo3DBox(wall, options = {}) {
  const height = options.height ?? DEFAULT_WALL_HEIGHT;
  const depth = options.depth ?? DEFAULT_WALL_DEPTH;
  const camera = options.camera ?? {};
  const lineX = wall.end.x - wall.start.x;
  const lineY = wall.end.y - wall.start.y;
  const length = Math.hypot(lineX, lineY) || 1;
  const normal = {
    x: (-lineY / length) * depth,
    y: (lineX / length) * depth
  };
  const startDepth = {
    x: wall.start.x + normal.x,
    y: wall.start.y + normal.y
  };
  const endDepth = {
    x: wall.end.x + normal.x,
    y: wall.end.y + normal.y
  };
  const bottomStart = projectPointTo3D(wall.start, 0, camera);
  const bottomEnd = projectPointTo3D(wall.end, 0, camera);
  const topEnd = projectPointTo3D(wall.end, height, camera);
  const topStart = projectPointTo3D(wall.start, height, camera);
  const bottomStartDepth = projectPointTo3D(startDepth, 0, camera);
  const bottomEndDepth = projectPointTo3D(endDepth, 0, camera);
  const topEndDepth = projectPointTo3D(endDepth, height, camera);
  const topStartDepth = projectPointTo3D(startDepth, height, camera);
  const allPoints = [
    bottomStart,
    bottomEnd,
    topEnd,
    topStart,
    bottomStartDepth,
    bottomEndDepth,
    topEndDepth,
    topStartDepth
  ];

  return {
    id: wall.id,
    height,
    depth,
    frontPath: createPath([bottomStart, bottomEnd, topEnd, topStart]),
    topPath: createPath([topStart, topEnd, topEndDepth, topStartDepth]),
    startCapPath: createPath([bottomStartDepth, bottomStart, topStart, topStartDepth]),
    endCapPath: createPath([bottomEnd, bottomEndDepth, topEndDepth, topEnd]),
    sortY: Math.max(...allPoints.map((point) => point.y)),
    topLine: {
      start: topStart,
      end: topEnd
    }
  };
}

export function convertWallsTo3D(walls, options = {}) {
  const wallBoxes = walls.map((wall) => convertWallTo3DBox(wall, options)).sort((left, right) => left.sortY - right.sortY);
  const wallPanels = wallBoxes.map((box) => ({
    id: box.id,
    height: box.height,
    depth: box.depth,
    path: box.frontPath,
    topLine: box.topLine
  }));
  const points = walls.flatMap((wall) => [wall.start, wall.end]);
  const hasPoints = points.length > 0;
  const minX = hasPoints ? Math.min(...points.map((point) => point.x)) : 120;
  const maxX = hasPoints ? Math.max(...points.map((point) => point.x)) : 720;
  const minY = hasPoints ? Math.min(...points.map((point) => point.y)) : 120;
  const maxY = hasPoints ? Math.max(...points.map((point) => point.y)) : 456;
  const pad = GRID_SIZE + (options.depth ?? DEFAULT_WALL_DEPTH);
  const camera = options.camera ?? {};
  const floorCorners = [
    projectPointTo3D({ x: minX - pad, y: minY - pad }, 0, camera),
    projectPointTo3D({ x: maxX + pad, y: minY - pad }, 0, camera),
    projectPointTo3D({ x: maxX + pad, y: maxY + pad }, 0, camera),
    projectPointTo3D({ x: minX - pad, y: maxY + pad }, 0, camera)
  ];

  return {
    wallPanels,
    wallBoxes,
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

export function convertWallsToWheretoputRoom3D(walls, options = {}) {
  const pixelToMmRatio = options.pixelToMmRatio ?? 20;
  const height = options.height ?? WHERETOPUT_WALL_HEIGHT;
  const depth = options.depth ?? WHERETOPUT_WALL_DEPTH;
  const walls3D = walls.map((wall, index) => {
    const startX = (wall.start.x * pixelToMmRatio) / 1000;
    const startZ = (wall.start.y * pixelToMmRatio) / 1000;
    const endX = (wall.end.x * pixelToMmRatio) / 1000;
    const endZ = (wall.end.y * pixelToMmRatio) / 1000;
    const length = Math.hypot(endX - startX, endZ - startZ);
    const centerX = (startX + endX) / 2;
    const centerZ = (startZ + endZ) / 2;
    const rotation = Math.atan2(endZ - startZ, endX - startX);

    return {
      id: `wall-${index}`,
      wall_id: wall.id,
      start: { x: roundMetric(startX), y: roundMetric(startZ) },
      end: { x: roundMetric(endX), y: roundMetric(endZ) },
      length: roundMetric(length),
      height,
      depth,
      position: [centerX, height / 2, centerZ],
      rotation: [0, rotation, 0],
      dimensions: {
        width: roundMetric(length),
        height,
        depth
      },
      material: "wall",
      original2D: wall,
      wall_order: index
    };
  });

  if (walls3D.length === 0) return walls3D;

  const centerX = walls3D.reduce((sum, wall) => sum + wall.position[0], 0) / walls3D.length;
  const centerZ = walls3D.reduce((sum, wall) => sum + wall.position[2], 0) / walls3D.length;

  return walls3D.map((wall) => ({
    ...wall,
    start: {
      x: roundMetric(wall.start.x - centerX),
      y: roundMetric(wall.start.y - centerZ)
    },
    end: {
      x: roundMetric(wall.end.x - centerX),
      y: roundMetric(wall.end.y - centerZ)
    },
    position: [roundMetric(wall.position[0] - centerX), roundMetric(wall.position[1]), roundMetric(wall.position[2] - centerZ)],
    rotation: wall.rotation.map(roundMetric)
  }));
}

function lineLength(line) {
  return Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
}

export function detectWallLinesFromMask(mask, options = {}) {
  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;
  const minRunLength = options.minRunLength ?? Math.max(24, Math.round(Math.min(width, height) * 0.08));
  const lines = [];

  if (width <= 0 || height <= 0 || !Array.isArray(mask)) return lines;

  for (let y = 0; y < height; y += 1) {
    let runStart = null;
    for (let x = 0; x <= width; x += 1) {
      const isWall = x < width && Boolean(mask[y * width + x]);
      if (isWall && runStart === null) runStart = x;
      if ((!isWall || x === width) && runStart !== null) {
        const runEnd = x - 1;
        if (runEnd - runStart + 1 >= minRunLength) {
          lines.push({
            x1: runStart,
            y1: y,
            x2: runEnd,
            y2: y,
            orientation: "horizontal"
          });
        }
        runStart = null;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let runStart = null;
    for (let y = 0; y <= height; y += 1) {
      const isWall = y < height && Boolean(mask[y * width + x]);
      if (isWall && runStart === null) runStart = y;
      if ((!isWall || y === height) && runStart !== null) {
        const runEnd = y - 1;
        if (runEnd - runStart + 1 >= minRunLength) {
          lines.push({
            x1: x,
            y1: runStart,
            x2: x,
            y2: runEnd,
            orientation: "vertical"
          });
        }
        runStart = null;
      }
    }
  }

  return lines.sort((lineA, lineB) => lineLength(lineB) - lineLength(lineA));
}

export function detectWallLinesFromImageData(imageData, options = {}) {
  const width = imageData?.width ?? 0;
  const height = imageData?.height ?? 0;
  const data = imageData?.data;
  const darkThreshold = options.darkThreshold ?? 170;

  if (!data || width <= 0 || height <= 0) return [];

  const mask = Array.from({ length: width * height }, (_, index) => {
    const offset = index * 4;
    const red = data[offset] ?? 255;
    const green = data[offset + 1] ?? 255;
    const blue = data[offset + 2] ?? 255;
    const alpha = data[offset + 3] ?? 255;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    return alpha > 24 && luminance < darkThreshold;
  });

  return detectWallLinesFromMask(mask, { ...options, width, height });
}

export function createWallsFromDetectedLines(lines, plan = {}) {
  const imageWidth = Math.max(1, Number(plan.width) || 960);
  const imageHeight = Math.max(1, Number(plan.height) || 620);
  const scale = Math.min(860 / imageWidth, 520 / imageHeight);
  const offsetX = (960 - imageWidth * scale) / 2;
  const offsetY = (620 - imageHeight * scale) / 2;
  const baseId = normalizePlanName(plan.name) || "detected";

  return lines
    .filter((line) => lineLength(line) > 0)
    .slice(0, 24)
    .map((line, index) =>
      createWall(
        {
          x: offsetX + line.x1 * scale,
          y: offsetY + line.y1 * scale
        },
        {
          x: offsetX + line.x2 * scale,
          y: offsetY + line.y2 * scale
        },
        `${baseId}-wall-${index + 1}`
      )
    )
    .filter(Boolean);
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
