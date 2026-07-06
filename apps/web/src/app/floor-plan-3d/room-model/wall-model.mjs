import {
  DEFAULT_PIXEL_TO_MM_RATIO,
  DEFAULT_PIXEL_TO_METER_RATIO,
  DEFAULT_WALL_DEPTH_PX,
  DEFAULT_WALL_HEIGHT_PX,
  GRID_SIZE_PX,
  WHERETOPUT_WALL_DEPTH_M,
  WHERETOPUT_WALL_HEIGHT_M
} from "./units.ts";
import { detectClosedLoops, mergeCollinearWalls } from "./wall-graph.ts";

export const GRID_SIZE = GRID_SIZE_PX;
export const DEFAULT_WALL_HEIGHT = DEFAULT_WALL_HEIGHT_PX;
export const DEFAULT_WALL_DEPTH = DEFAULT_WALL_DEPTH_PX;
export { DEFAULT_PIXEL_TO_METER_RATIO, DEFAULT_PIXEL_TO_MM_RATIO };
export const WHERETOPUT_WALL_HEIGHT = WHERETOPUT_WALL_HEIGHT_M;
export const WHERETOPUT_WALL_DEPTH = WHERETOPUT_WALL_DEPTH_M;
const DEFAULT_MIN_DETECTION_ROOM_WALLS = 3;
const DEFAULT_MAX_DETECTION_WALL_DEPTH_PX = 32;
const DEFAULT_DETECTION_CONFIDENCE_THRESHOLD = 0.5;
const DEFAULT_DETECTION_AXIS_SNAP_TOLERANCE_PX = 18;
const DEFAULT_DETECTION_SEGMENT_MERGE_GAP_PX = 28;
const DEFAULT_DETECTION_OPENING_PADDING_PX = 24;
const DEFAULT_DETECTION_OPENING_AXIS_TOLERANCE_PX = 40;
const DEFAULT_DETECTION_CORNER_EXTEND_TOLERANCE_PX = 56;

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

export function moveWall(wall, delta) {
  const dx = Number(delta?.x ?? 0);
  const dy = Number(delta?.y ?? 0);

  return {
    ...wall,
    end: { x: wall.end.x + dx, y: wall.end.y + dy },
    start: { x: wall.start.x + dx, y: wall.start.y + dy }
  };
}

export function resizeWall(wall, endpoint, point) {
  const anchor = endpoint === "start" ? wall.end : wall.start;
  const target = point ?? anchor;
  const horizontal = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
  const resizedPoint = horizontal ? { x: target.x, y: anchor.y } : { x: anchor.x, y: target.y };

  if (endpoint === "start") {
    return { ...wall, start: resizedPoint };
  }

  return { ...wall, end: resizedPoint };
}

export function summarizeWalls(walls) {
  const totalLength = walls.reduce((sum, wall) => sum + wallLength(wall), 0);

  return {
    wallCount: walls.length,
    approximateMeters: Math.round(totalLength * DEFAULT_PIXEL_TO_METER_RATIO * 10) / 10,
    status: walls.length > 0 ? "편집중" : "초안"
  };
}


function roundMetric(value) {
  return Math.round(value * 1000) / 1000;
}

function normalizedDetectionBoxToEditorBox(box, metrics) {
  const canvasWidth = Math.max(1, Number(metrics.canvasWidth) || 1600);
  const canvasHeight = Math.max(1, Number(metrics.canvasHeight) || 1200);
  const imageWidth = Math.max(1, Number(metrics.imageWidth) || 1);
  const imageHeight = Math.max(1, Number(metrics.imageHeight) || 1);
  const imageAspect = imageWidth / imageHeight;
  const canvasAspect = canvasWidth / canvasHeight;
  let drawWidth = canvasWidth * 0.8;
  let drawHeight = drawWidth / imageAspect;
  if (imageAspect <= canvasAspect) {
    drawHeight = canvasHeight * 0.8;
    drawWidth = drawHeight * imageAspect;
  }

  return {
    drawWidth,
    x1: -drawWidth / 2 + (Number(box.x) / 1000) * drawWidth,
    x2: -drawWidth / 2 + ((Number(box.x) + Number(box.width)) / 1000) * drawWidth,
    y1: -drawHeight / 2 + (Number(box.y) / 1000) * drawHeight,
    y2: -drawHeight / 2 + ((Number(box.y) + Number(box.height)) / 1000) * drawHeight
  };
}

function subtractIntervalsFromSpan(spanStart, spanEnd, holes) {
  let segments = [[spanStart, spanEnd]];
  for (const [holeStart, holeEnd] of holes) {
    segments = segments.flatMap(([segmentStart, segmentEnd]) => {
      if (holeEnd <= segmentStart || holeStart >= segmentEnd) return [[segmentStart, segmentEnd]];
      const remaining = [];
      if (holeStart > segmentStart) remaining.push([segmentStart, holeStart]);
      if (holeEnd < segmentEnd) remaining.push([holeEnd, segmentEnd]);
      return remaining;
    });
  }
  return segments;
}

function normalizeSpan(start, end) {
  return start <= end ? [start, end] : [end, start];
}

function intervalsTouchOrOverlap(leftStart, leftEnd, rightStart, rightEnd, gapTolerance) {
  return rightStart <= leftEnd + gapTolerance && leftStart <= rightEnd + gapTolerance;
}

function toDetectionWallRun(wallBox, metrics, options) {
  const box = normalizedDetectionBoxToEditorBox(wallBox, metrics);
  const boxWidth = Math.abs(box.x2 - box.x1);
  const boxHeight = Math.abs(box.y2 - box.y1);
  const longSide = Math.max(boxWidth, boxHeight);
  const shortSide = Math.max(1, Math.min(boxWidth, boxHeight));
  const minSegmentLength = Math.max(48, box.drawWidth * 0.04);
  const confidence = Number.isFinite(Number(wallBox.confidence)) ? Number(wallBox.confidence) : 0;

  if (confidence < options.minConfidence || longSide < minSegmentLength || longSide / shortSide < 1.6) return null;

  const horizontal = boxWidth >= boxHeight;
  const [spanStart, spanEnd] = normalizeSpan(horizontal ? box.x1 : box.y1, horizontal ? box.x2 : box.y2);
  const thickness = Math.max(4, Math.min(horizontal ? boxHeight : boxWidth, options.maxDepthPx));

  return {
    axisCenter: horizontal ? (box.y1 + box.y2) / 2 : (box.x1 + box.x2) / 2,
    confidence,
    minSegmentLength,
    orientation: horizontal ? "horizontal" : "vertical",
    sourceCount: 1,
    spanEnd,
    spanStart,
    thickness
  };
}

function toExistingWallRun(wall, options) {
  if (!wall?.start || !wall?.end) return null;

  const span = wallSpan(wall);
  const lengthPx = span.end - span.start;
  const minSegmentLength = Math.max(32, options.axisSnapTolerancePx * 2);
  if (lengthPx < minSegmentLength) return null;

  return {
    axisCenter: span.axis,
    confidence: Number.isFinite(Number(wall.confidence)) ? Number(wall.confidence) : 1,
    minSegmentLength,
    orientation: span.orientation,
    sourceCount: 1,
    spanEnd: span.end,
    spanStart: span.start,
    thickness: Math.max(4, Math.min(Number(wall.depthPx ?? wall.thicknessPx ?? DEFAULT_WALL_DEPTH), options.maxDepthPx))
  };
}

function mergeDetectionWallRuns(runs, options) {
  const sortedRuns = [...runs].sort((left, right) => {
    if (left.orientation !== right.orientation) return left.orientation.localeCompare(right.orientation);
    if (Math.abs(left.axisCenter - right.axisCenter) > options.axisSnapTolerancePx) return left.axisCenter - right.axisCenter;
    return left.spanStart - right.spanStart;
  });

  return sortedRuns.reduce((mergedRuns, run) => {
    const matchingRun = mergedRuns.find(
      (mergedRun) =>
        mergedRun.orientation === run.orientation &&
        Math.abs(mergedRun.axisCenter - run.axisCenter) <= options.axisSnapTolerancePx &&
        intervalsTouchOrOverlap(mergedRun.spanStart, mergedRun.spanEnd, run.spanStart, run.spanEnd, options.segmentMergeGapPx)
    );

    if (!matchingRun) {
      mergedRuns.push({ ...run });
      return mergedRuns;
    }

    const mergedLength = Math.max(1, matchingRun.spanEnd - matchingRun.spanStart);
    const runLength = Math.max(1, run.spanEnd - run.spanStart);
    const totalLength = mergedLength + runLength;
    matchingRun.axisCenter = (matchingRun.axisCenter * mergedLength + run.axisCenter * runLength) / totalLength;
    matchingRun.confidence = Math.max(matchingRun.confidence, run.confidence);
    matchingRun.minSegmentLength = Math.min(matchingRun.minSegmentLength, run.minSegmentLength);
    matchingRun.sourceCount += run.sourceCount;
    matchingRun.spanEnd = Math.max(matchingRun.spanEnd, run.spanEnd);
    matchingRun.spanStart = Math.min(matchingRun.spanStart, run.spanStart);
    matchingRun.thickness = Math.max(matchingRun.thickness, run.thickness);
    return mergedRuns;
  }, []);
}

function buildWallFromRunSegment(run, segmentStart, segmentEnd, index, pixelToMmRatio) {
  const lengthPx = segmentEnd - segmentStart;
  const wallId = `rf-wall-${index + 1}`;
  const wall = {
    confidence: run.confidence,
    depthPx: run.thickness,
    id: wallId,
    lengthMm: Math.round(lengthPx * pixelToMmRatio),
    lengthPx: Math.round(lengthPx),
    orientation: run.orientation,
    source: "roboflow-postprocessed",
    thicknessMm: Math.round(run.thickness * pixelToMmRatio),
    thicknessPx: Math.round(run.thickness)
  };

  if (run.orientation === "horizontal") {
    return {
      ...wall,
      end: { x: segmentEnd, y: run.axisCenter },
      start: { x: segmentStart, y: run.axisCenter }
    };
  }

  return {
    ...wall,
    end: { x: run.axisCenter, y: segmentEnd },
    start: { x: run.axisCenter, y: segmentStart }
  };
}

function splitDetectionWallRunsByOpenings(runs, openingBoxes, options) {
  const walls = [];

  runs.forEach((run) => {
    const openingAxisTolerance = Math.max(
      run.thickness + options.axisSnapTolerancePx,
      options.openingAxisTolerancePx
    );
    const holes = openingBoxes
      .filter((openingBox) =>
        run.orientation === "horizontal"
          ? openingBox.y1 <= run.axisCenter + openingAxisTolerance && openingBox.y2 >= run.axisCenter - openingAxisTolerance
          : openingBox.x1 <= run.axisCenter + openingAxisTolerance && openingBox.x2 >= run.axisCenter - openingAxisTolerance
      )
      .map((openingBox) => {
        const [holeStart, holeEnd] =
          run.orientation === "horizontal"
            ? normalizeSpan(openingBox.x1, openingBox.x2)
            : normalizeSpan(openingBox.y1, openingBox.y2);
        return [holeStart - options.openingPaddingPx, holeEnd + options.openingPaddingPx];
      });

    subtractIntervalsFromSpan(run.spanStart, run.spanEnd, holes).forEach(([segmentStart, segmentEnd]) => {
      if (segmentEnd - segmentStart < run.minSegmentLength) return;
      walls.push(buildWallFromRunSegment(run, segmentStart, segmentEnd, walls.length, options.pixelToMmRatio));
    });
  });

  return walls;
}

function wallSpan(wall) {
  if (wall.orientation === "vertical" || Math.abs(wall.end.y - wall.start.y) > Math.abs(wall.end.x - wall.start.x)) {
    const [start, end] = normalizeSpan(wall.start.y, wall.end.y);
    return { axis: wall.start.x, end, orientation: "vertical", start };
  }

  const [start, end] = normalizeSpan(wall.start.x, wall.end.x);
  return { axis: wall.start.y, end, orientation: "horizontal", start };
}

function snapWallIntersections(walls, tolerancePx, pixelToMmRatio, options = {}) {
  const horizontals = walls.filter((wall) => wallSpan(wall).orientation === "horizontal");
  const verticals = walls.filter((wall) => wallSpan(wall).orientation === "vertical");
  // 탐지 박스가 모서리에 못 미치는 경우 벽을 연장해 코너를 닫는다.
  // 단, 연장 경로가 문 opening을 지나면 opening을 다시 메우게 되므로 건너뛴다.
  const extendTolerancePx = options.extendTolerancePx ?? tolerancePx;
  const openingBoxes = options.openingBoxes ?? [];
  const extensionCrossesOpening = (orientation, axis, fromValue, toValue) => {
    const [rangeStart, rangeEnd] = normalizeSpan(fromValue, toValue);
    return openingBoxes.some((openingBox) => {
      const straddlesAxis =
        orientation === "horizontal"
          ? openingBox.y1 <= axis + tolerancePx && openingBox.y2 >= axis - tolerancePx
          : openingBox.x1 <= axis + tolerancePx && openingBox.x2 >= axis - tolerancePx;
      if (!straddlesAxis) return false;
      const [holeStart, holeEnd] =
        orientation === "horizontal" ? normalizeSpan(openingBox.x1, openingBox.x2) : normalizeSpan(openingBox.y1, openingBox.y2);
      return holeStart < rangeEnd && holeEnd > rangeStart;
    });
  };

  return walls.map((wall) => {
    const span = wallSpan(wall);
    const perpendiculars = span.orientation === "horizontal" ? verticals : horizontals;
    let nextWall = { ...wall, start: { ...wall.start }, end: { ...wall.end } };

    for (const endpointName of ["start", "end"]) {
      const endpoint = nextWall[endpointName];
      const endpointValue = span.orientation === "horizontal" ? endpoint.x : endpoint.y;
      const candidate = perpendiculars
        .map((perpendicular) => {
          const perpendicularSpan = wallSpan(perpendicular);
          const crossAxis = perpendicularSpan.axis;
          const alongAxis = span.axis;
          const gap = Math.abs(endpointValue - crossAxis);
          const coversAxis = alongAxis >= perpendicularSpan.start - extendTolerancePx && alongAxis <= perpendicularSpan.end + extendTolerancePx;
          return { crossAxis, coversAxis, gap };
        })
        .filter(
          (item) =>
            item.coversAxis &&
            item.gap > 0 &&
            item.gap <= extendTolerancePx &&
            !extensionCrossesOpening(span.orientation, span.axis, endpointValue, item.crossAxis)
        )
        .sort((left, right) => left.gap - right.gap)[0];

      if (!candidate) continue;
      if (span.orientation === "horizontal") {
        nextWall[endpointName] = { ...endpoint, x: candidate.crossAxis };
      } else {
        nextWall[endpointName] = { ...endpoint, y: candidate.crossAxis };
      }
    }

    const lengthPx = wallLength(nextWall);
    return {
      ...nextWall,
      lengthMm: Math.round(lengthPx * pixelToMmRatio),
      lengthPx: Math.round(lengthPx)
    };
  });
}

function toGeneratedWallBoxes(walls) {
  return walls.map((wall) => {
    const horizontal = wallSpan(wall).orientation === "horizontal";
    const halfThickness = Math.max(2, Number(wall.depthPx ?? wall.thicknessPx ?? DEFAULT_WALL_DEPTH) / 2);
    return {
      box: horizontal
        ? {
            x1: Math.min(wall.start.x, wall.end.x),
            x2: Math.max(wall.start.x, wall.end.x),
            y1: wall.start.y - halfThickness,
            y2: wall.start.y + halfThickness
          }
        : {
            x1: wall.start.x - halfThickness,
            x2: wall.start.x + halfThickness,
            y1: Math.min(wall.start.y, wall.end.y),
            y2: Math.max(wall.start.y, wall.end.y)
          },
      confidence: Number(wall.confidence ?? 0),
      type: "WALL"
    };
  });
}

export function buildWallsFromDetectionBoxes(input = {}) {
  const currentWalls = input.currentWalls ?? [];
  const minGeneratedWallCount =
    input.minGeneratedWallCount ?? (currentWalls.length > 0 ? DEFAULT_MIN_DETECTION_ROOM_WALLS : 1);
  const pixelToMmRatio = input.pixelToMmRatio ?? DEFAULT_PIXEL_TO_MM_RATIO;
  const options = {
    axisSnapTolerancePx: input.axisSnapTolerancePx ?? DEFAULT_DETECTION_AXIS_SNAP_TOLERANCE_PX,
    maxDepthPx: input.maxDepthPx ?? DEFAULT_MAX_DETECTION_WALL_DEPTH_PX,
    minConfidence: input.minConfidence ?? DEFAULT_DETECTION_CONFIDENCE_THRESHOLD,
    openingAxisTolerancePx: input.openingAxisTolerancePx ?? DEFAULT_DETECTION_OPENING_AXIS_TOLERANCE_PX,
    openingPaddingPx: input.openingPaddingPx ?? DEFAULT_DETECTION_OPENING_PADDING_PX,
    pixelToMmRatio,
    segmentMergeGapPx: input.segmentMergeGapPx ?? DEFAULT_DETECTION_SEGMENT_MERGE_GAP_PX
  };
  const metrics = {
    canvasHeight: input.canvasHeight,
    canvasWidth: input.canvasWidth,
    imageHeight: input.imageHeight,
    imageWidth: input.imageWidth
  };
  const openingBoxes = (input.openingBoxes ?? []).map((box) => normalizedDetectionBoxToEditorBox(box, metrics));
  const wallRuns = (input.wallBoxes ?? [])
    .map((wallBox) => toDetectionWallRun(wallBox, metrics, options))
    .filter(Boolean);
  const existingWallRuns = currentWalls.map((wall) => toExistingWallRun(wall, options)).filter(Boolean);
  const mergedRuns = mergeDetectionWallRuns([...existingWallRuns, ...wallRuns], options);
  const splitWalls = splitDetectionWallRunsByOpenings(mergedRuns, openingBoxes, options);
  const generatedWalls = snapWallIntersections(splitWalls, options.axisSnapTolerancePx, pixelToMmRatio, {
    extendTolerancePx: input.cornerExtendTolerancePx ?? DEFAULT_DETECTION_CORNER_EXTEND_TOLERANCE_PX,
    openingBoxes
  });
  const generatedWallBoxes = toGeneratedWallBoxes(generatedWalls);

  if (generatedWalls.length < minGeneratedWallCount) {
    return {
      generatedWallCount: 0,
      generatedWallBoxes: [],
      walls: currentWalls
    };
  }

  return {
    generatedWallCount: generatedWalls.length,
    generatedWallBoxes,
    walls: generatedWalls
  };
}

function stableWallId(wallId) {
  return `wall-${String(wallId).replace(/[^a-z0-9가-힣_-]+/gi, "-").replace(/^-+|-+$/g, "") || "unknown"}`;
}

export function normalizePlanName(name = "plan") {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
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
  const pixelToMmRatio = options.pixelToMmRatio ?? DEFAULT_PIXEL_TO_MM_RATIO;
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
    // 탐지 벽 박스처럼 벽별 두께 정보(에디터 px)가 있으면 고정 두께 대신 사용한다.
    // depthPx ?? thicknessPx 폴백은 이 파일의 다른 두께 소비처와 동일한 규칙.
    const wallThicknessPx = Number(wall.depthPx ?? wall.thicknessPx ?? 0);
    const wallDepth = wallThicknessPx > 0 ? Math.max(0.05, roundMetric((wallThicknessPx * pixelToMmRatio) / 1000)) : depth;

    return {
      id: options.stableIds ? stableWallId(wall.id) : `wall-${index}`,
      wall_id: wall.id,
      start: { x: roundMetric(startX), y: roundMetric(startZ) },
      end: { x: roundMetric(endX), y: roundMetric(endZ) },
      length: roundMetric(length),
      height,
      depth: wallDepth,
      position: [centerX, height / 2, centerZ],
      rotation: [0, rotation, 0],
      dimensions: {
        width: roundMetric(length),
        height,
        depth: wallDepth
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

export function convertOptimizedWallsToWheretoputRoom3D(walls, options = {}) {
  const optimizedWalls = options.mergeCollinear
    ? mergeCollinearWalls(walls, {
        gapTolerancePx: options.gapTolerancePx,
        tolerancePx: options.tolerancePx
      })
    : walls;

  return convertWallsToWheretoputRoom3D(optimizedWalls, options);
}

export function buildClosedLoopFloorPolygons(walls, options = {}) {
  const pixelToMmRatio = options.pixelToMmRatio ?? DEFAULT_PIXEL_TO_MM_RATIO;
  const pixelToMeterRatio = pixelToMmRatio / 1000;
  const loops = detectClosedLoops(walls, options.tolerancePx ?? 1);

  return loops.map((loop) => ({
    perimeterMeters: roundMetric(loop.perimeterPx * pixelToMeterRatio),
    points: loop.points.map((point) => ({
      x: roundMetric(point.x * pixelToMeterRatio),
      z: roundMetric(point.y * pixelToMeterRatio)
    })),
    wallIds: [...loop.wallIds]
  }));
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
