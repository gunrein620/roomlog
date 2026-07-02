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

function lineOrientation(line) {
  if (line.orientation) return line.orientation;

  return Math.abs(line.x2 - line.x1) >= Math.abs(line.y2 - line.y1) ? "horizontal" : "vertical";
}

function lineBounds(line) {
  return {
    maxX: Math.max(line.x1, line.x2),
    maxY: Math.max(line.y1, line.y2),
    minX: Math.min(line.x1, line.x2),
    minY: Math.min(line.y1, line.y2)
  };
}

function lineCenter(line) {
  return {
    x: (line.x1 + line.x2) / 2,
    y: (line.y1 + line.y2) / 2
  };
}

function isOutsideDimensionLine(line, options = {}) {
  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;
  const orientation = lineOrientation(line);
  const bounds = lineBounds(line);
  const marginX = Math.max(18, width * 0.08);
  const marginY = Math.max(18, height * 0.08);
  const longEnough = lineLength(line) >= Math.max(48, Math.min(width || 600, height || 400) * 0.18);
  const thinEnough = Number(line.thickness ?? 1) <= 3;
  const hasArrowMarkers = Array.isArray(line.markers) && line.markers.some((marker) => String(marker).startsWith("arrow"));

  if (!longEnough) return false;
  if (hasArrowMarkers) return true;
  if (!thinEnough) return false;

  if (orientation === "horizontal") {
    return bounds.maxY <= marginY || (height > 0 && bounds.minY >= height - marginY);
  }

  return bounds.maxX <= marginX || (width > 0 && bounds.minX >= width - marginX);
}

export function filterCommercialWallCandidates(lines, options = {}) {
  const dimensionCandidates = [];
  const walls = [];
  let removedNoiseCount = 0;

  for (const line of lines ?? []) {
    if (!line || lineLength(line) <= 0) continue;
    const thickness = Number(line.thickness ?? 6);

    if (isOutsideDimensionLine(line, options)) {
      dimensionCandidates.push({
        confidence: Number(line.confidence ?? 0.78),
        line,
        source: "outside-dimension-line"
      });
      removedNoiseCount += 1;
      continue;
    }

    if (thickness <= 2 && lineLength(line) < Math.max(80, Math.min(options.width ?? 0, options.height ?? 0) * 0.28)) {
      removedNoiseCount += 1;
      continue;
    }

    walls.push(line);
  }

  return {
    dimensionCandidates,
    removedNoiseCount,
    walls: mergeDetectedWallLines(walls, options)
  };
}

function parseDimensionLengthMm(text = "") {
  const normalized = String(text).replace(/,/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(m|mm|cm)?/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2] ?? (value >= 100 ? "mm" : "m");
  if (unit === "m") return Math.round(value * 1000);
  if (unit === "cm") return Math.round(value * 10);

  return Math.round(value);
}

export function estimateScaleCandidateFromDimensions(candidates = []) {
  const parsed = candidates
    .map((candidate) => {
      const line = candidate.line ?? candidate;
      const pixelLength = Math.round(lineLength(line));
      const realLengthMm = parseDimensionLengthMm(candidate.text ?? candidate.label ?? "");
      if (!pixelLength || !realLengthMm) return null;

      return {
        confidence: Number(candidate.confidence ?? 0.6),
        line,
        pixelLength,
        pixelToMmRatio: realLengthMm / pixelLength,
        realLengthMm,
        source: "outside-dimension-ocr"
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.confidence - left.confidence);

  return parsed[0] ?? null;
}

function candidateId(prefix, index, point) {
  return `${prefix}-${Math.round(point.x)}-${Math.round(point.y)}-${index + 1}`;
}

export function detectOpeningCandidates(input = {}) {
  const candidates = [];
  const arcs = Array.isArray(input.arcs) ? input.arcs : [];
  const gaps = Array.isArray(input.gaps) ? input.gaps : [];
  const windowLines = Array.isArray(input.windowLines) ? input.windowLines : [];

  arcs.forEach((arc, index) => {
    const nearGap = gaps.find((gap) => Math.hypot((gap.x1 + gap.x2) / 2 - arc.x, (gap.y1 + gap.y2) / 2 - arc.y) <= (arc.radius ?? 36) * 1.4);
    const widthMm = nearGap ? Math.round(lineLength(nearGap) * (input.pixelToMmRatio ?? 20)) : undefined;
    candidates.push({
      confidence: nearGap ? 0.84 : 0.66,
      id: candidateId("door", index, arc),
      position: { x: Number(arc.x) || 0, y: Number(arc.y) || 0 },
      source: nearGap ? "arc+wall-gap" : "arc",
      status: "CANDIDATE",
      type: "DOOR",
      widthMm
    });
  });

  windowLines.forEach((line, index) => {
    candidates.push({
      confidence: Number(line.confidence ?? 0.72),
      id: candidateId("window", index, lineCenter(line)),
      position: lineCenter(line),
      source: "thin-double-line",
      status: "CANDIDATE",
      type: "WINDOW",
      widthMm: Math.round(lineLength(line) * (input.pixelToMmRatio ?? 20))
    });
  });

  return candidates;
}

export function updateCandidateStatus(candidates = [], candidateIdValue, status) {
  return candidates.map((candidate) =>
    candidate.id === candidateIdValue && ["CANDIDATE", "CONFIRMED", "REJECTED"].includes(status)
      ? { ...candidate, status }
      : candidate
  );
}

export function moveCandidate(candidates = [], candidateIdValue, delta = {}) {
  return candidates.map((candidate) =>
    candidate.id === candidateIdValue
      ? {
          ...candidate,
          position: {
            x: Number(candidate.position?.x ?? 0) + Number(delta.x ?? 0),
            y: Number(candidate.position?.y ?? 0) + Number(delta.y ?? 0)
          }
        }
      : candidate
  );
}

function fixtureTypeFromText(text = "") {
  const normalized = String(text).replace(/\s+/g, "");
  if (/싱크|주방|식당/.test(normalized)) return "SINK";
  if (/욕실|화장실|샤워/.test(normalized)) return "BATH";
  if (/붙박|수납|창고|장/.test(normalized)) return "BUILT_IN_STORAGE";
  return "FIXTURE";
}

export function detectFixtureCandidates(input = {}) {
  const labels = Array.isArray(input.labels) ? input.labels : [];
  const shapes = Array.isArray(input.shapes) ? input.shapes : [];

  return labels
    .map((label, index) => {
      const nearShape = shapes.find((shape) => Math.hypot((shape.x ?? 0) - (label.x ?? 0), (shape.y ?? 0) - (label.y ?? 0)) <= 80);
      return {
        confidence: Math.min(0.98, Number(label.confidence ?? 0.55) + (nearShape ? 0.08 : 0)),
        id: candidateId("fixture", index, { x: Number(label.x) || 0, y: Number(label.y) || 0 }),
        label: String(label.text ?? ""),
        movable: false,
        position: { x: Number(label.x) || 0, y: Number(label.y) || 0 },
        sizeMm: nearShape
          ? {
              depth: Math.round(Number(nearShape.height ?? 0) * (input.pixelToMmRatio ?? 20)),
              width: Math.round(Number(nearShape.width ?? 0) * (input.pixelToMmRatio ?? 20))
            }
          : undefined,
        source: nearShape ? "ocr+shape" : "ocr",
        status: "CANDIDATE",
        type: fixtureTypeFromText(label.text)
      };
    })
    .filter((candidate) => candidate.type !== "FIXTURE" || candidate.confidence >= 0.7);
}

export function removeSmallWallComponents(mask, options = {}) {
  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;
  const minArea = options.minArea ?? 18;

  if (width <= 0 || height <= 0 || !Array.isArray(mask)) return [];

  const cleaned = Array.from({ length: width * height }, () => false);
  const visited = Array.from({ length: width * height }, () => false);
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) continue;

    const queue = [index];
    const component = [];
    visited[index] = true;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const x = current % width;
      const y = Math.floor(current / width);
      component.push(current);

      for (const [dx, dy] of neighbors) {
        const nextX = x + dx;
        const nextY = y + dy;
        const next = nextY * width + nextX;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        if (visited[next] || !mask[next]) continue;
        visited[next] = true;
        queue.push(next);
      }
    }

    if (component.length >= minArea) {
      component.forEach((componentIndex) => {
        cleaned[componentIndex] = true;
      });
    }
  }

  return cleaned;
}

export function limitDetectedWallCandidates(lines, options = {}) {
  const maxLines = options.maxLines ?? 24;

  return [...lines].sort((lineA, lineB) => lineLength(lineB) - lineLength(lineA)).slice(0, maxLines);
}

export function mergeDetectedWallLines(lines, options = {}) {
  const axisTolerance = options.axisTolerance ?? 4;
  const gapTolerance = options.gapTolerance ?? 12;
  const minLength = options.minLength ?? 24;
  const maxLines = options.maxLines ?? 24;
  const normalized = lines
    .map((line) => {
      const orientation = lineOrientation(line);
      if (orientation === "horizontal") {
        const x1 = Math.min(line.x1, line.x2);
        const x2 = Math.max(line.x1, line.x2);
        const y = Math.round((line.y1 + line.y2) / 2);
        return { x1, y1: y, x2, y2: y, orientation };
      }

      const y1 = Math.min(line.y1, line.y2);
      const y2 = Math.max(line.y1, line.y2);
      const x = Math.round((line.x1 + line.x2) / 2);
      return { x1: x, y1, x2: x, y2, orientation };
    })
    .filter((line) => lineLength(line) >= minLength)
    .sort((lineA, lineB) => {
      if (lineA.orientation !== lineB.orientation) return lineA.orientation === "horizontal" ? -1 : 1;
      const axisA = lineA.orientation === "horizontal" ? lineA.y1 : lineA.x1;
      const axisB = lineB.orientation === "horizontal" ? lineB.y1 : lineB.x1;
      if (axisA !== axisB) return axisA - axisB;
      return lineA.orientation === "horizontal" ? lineA.x1 - lineB.x1 : lineA.y1 - lineB.y1;
    });
  const merged = [];

  for (const line of normalized) {
    const previous = merged.at(-1);
    if (!previous || previous.orientation !== line.orientation) {
      merged.push({ ...line, weight: 1 });
      continue;
    }

    if (line.orientation === "horizontal") {
      const sameAxis = Math.abs(previous.y1 - line.y1) <= axisTolerance;
      const closeGap = line.x1 - previous.x2 <= gapTolerance;
      if (sameAxis && closeGap) {
        const weight = previous.weight + 1;
        const y = Math.round((previous.y1 * previous.weight + line.y1) / weight);
        previous.x1 = Math.min(previous.x1, line.x1);
        previous.x2 = Math.max(previous.x2, line.x2);
        previous.y1 = y;
        previous.y2 = y;
        previous.weight = weight;
        continue;
      }
    } else {
      const sameAxis = Math.abs(previous.x1 - line.x1) <= axisTolerance;
      const closeGap = line.y1 - previous.y2 <= gapTolerance;
      if (sameAxis && closeGap) {
        const weight = previous.weight + 1;
        const x = Math.round((previous.x1 * previous.weight + line.x1) / weight);
        previous.y1 = Math.min(previous.y1, line.y1);
        previous.y2 = Math.max(previous.y2, line.y2);
        previous.x1 = x;
        previous.x2 = x;
        previous.weight = weight;
        continue;
      }
    }

    merged.push({ ...line, weight: 1 });
  }

  return limitDetectedWallCandidates(
    merged.map(({ weight: _weight, ...line }) => line),
    { maxLines }
  );
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

  return limitDetectedWallCandidates(
    mergeDetectedWallLines(lines, { ...options, minLength: options.minLength ?? minRunLength }),
    options
  );
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

  const cleanedMask = removeSmallWallComponents(mask, {
    height,
    minArea: options.minComponentArea ?? Math.max(16, Math.round((width * height) / 20000)),
    width
  });

  return detectWallLinesFromMask(cleanedMask, { ...options, width, height });
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
