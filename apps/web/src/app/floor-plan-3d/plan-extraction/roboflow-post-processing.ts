const ROBOFLOW_EDITOR_CANVAS_WIDTH = 1600;
const ROBOFLOW_EDITOR_CANVAS_HEIGHT = 1200;

export type RoboflowDetectionBox = { height: number; width: number; x: number; y: number };
export type RoboflowOpeningDetection = {
  boundingBox: RoboflowDetectionBox;
  confidence: number;
  id: string;
  source: string;
  type: "DOOR" | "WINDOW";
};
export type RoboflowWallDetection = {
  boundingBox: RoboflowDetectionBox;
  confidence: number;
  id: string;
};
export type RoboflowFloorPlanDetections = {
  imageHeight?: number;
  imageWidth?: number;
  openings: RoboflowOpeningDetection[];
  summary: string;
  walls: RoboflowWallDetection[];
};
export type RoboflowDetectionOverlayBox = {
  box: { x1: number; x2: number; y1: number; y2: number };
  confidence: number;
  type: "WALL" | "DOOR" | "WINDOW";
  variant?: "raw" | "postprocessed";
};

export const ROBOFLOW_SITE_CONFIDENCE_THRESHOLD = 0.35;
export const ROBOFLOW_OPENING_CONFIDENCE_THRESHOLD = 0.15;

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeOverlayBox(box: RoboflowDetectionOverlayBox["box"]) {
  return {
    x1: Math.min(box.x1, box.x2),
    x2: Math.max(box.x1, box.x2),
    y1: Math.min(box.y1, box.y2),
    y2: Math.max(box.y1, box.y2)
  };
}

export function createPostProcessedWallOverlayBox(
  box: RoboflowDetectionOverlayBox["box"],
  confidence = 1
): RoboflowDetectionOverlayBox {
  return {
    box: normalizeOverlayBox(box),
    confidence,
    type: "WALL",
    variant: "postprocessed"
  };
}

function getIntervalOverlap(startA: number, endA: number, startB: number, endB: number) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

export function convertRoboflowBoxToEditorBox(box: RoboflowDetectionBox, imageWidth = 1000, imageHeight = 1000) {
  const imageAspect = Math.max(1e-6, imageWidth / imageHeight);
  const canvasAspect = ROBOFLOW_EDITOR_CANVAS_WIDTH / ROBOFLOW_EDITOR_CANVAS_HEIGHT;
  let drawWidth = ROBOFLOW_EDITOR_CANVAS_WIDTH * 0.8;
  let drawHeight = drawWidth / imageAspect;
  if (imageAspect <= canvasAspect) {
    drawHeight = ROBOFLOW_EDITOR_CANVAS_HEIGHT * 0.8;
    drawWidth = drawHeight * imageAspect;
  }

  return {
    x1: -drawWidth / 2 + (box.x / 1000) * drawWidth,
    x2: -drawWidth / 2 + ((box.x + box.width) / 1000) * drawWidth,
    y1: -drawHeight / 2 + (box.y / 1000) * drawHeight,
    y2: -drawHeight / 2 + ((box.y + box.height) / 1000) * drawHeight
  };
}

export function buildAdjustedWallBoxesFromRawAndGenerated(
  rawWallBoxes: RoboflowDetectionOverlayBox[],
  generatedWallBoxes: RoboflowDetectionOverlayBox[]
) {
  const wallRuns = [...rawWallBoxes, ...generatedWallBoxes]
    .filter((wallBox) => wallBox.type === "WALL")
    .map((wallBox) => {
      const box = normalizeOverlayBox(wallBox.box);
      const width = box.x2 - box.x1;
      const height = box.y2 - box.y1;
      const horizontal = width >= height;

      return {
        axis: horizontal ? (box.y1 + box.y2) / 2 : (box.x1 + box.x2) / 2,
        confidence: wallBox.confidence,
        end: horizontal ? box.x2 : box.y2,
        horizontal,
        start: horizontal ? box.x1 : box.y1,
        thickness: Math.max(4, horizontal ? height : width)
      };
    })
    .filter((run) => run.end - run.start >= 8);

  const adjustedBoxes: RoboflowDetectionOverlayBox[] = [];
  for (const horizontal of [true, false]) {
    const axisRuns = wallRuns
      .filter((run) => run.horizontal === horizontal)
      .sort((left, right) => left.axis - right.axis || left.start - right.start);
    const axisClusters: typeof axisRuns[] = [];
    const axisTolerance = 18;
    for (const run of axisRuns) {
      const cluster = axisClusters.find((candidate) => {
        const clusterAxis = candidate.reduce((sum, item) => sum + item.axis, 0) / Math.max(1, candidate.length);
        return Math.abs(clusterAxis - run.axis) <= axisTolerance;
      });
      if (cluster) cluster.push(run);
      else axisClusters.push([run]);
    }

    for (const cluster of axisClusters) {
      const axis =
        cluster.reduce((sum, run) => sum + run.axis * Math.max(1, run.end - run.start), 0) /
        cluster.reduce((sum, run) => sum + Math.max(1, run.end - run.start), 0);
      const thickness = Math.max(...cluster.map((run) => run.thickness));
      const gapTolerance = Math.max(36, Math.min(72, thickness * 2.5));
      const intervals = [...cluster].sort((left, right) => left.start - right.start);
      let current = { ...intervals[0] };
      for (const interval of intervals.slice(1)) {
        if (interval.start <= current.end + gapTolerance) {
          current.end = Math.max(current.end, interval.end);
          current.confidence = Math.max(current.confidence, interval.confidence);
          current.thickness = Math.max(current.thickness, interval.thickness);
        } else {
          const halfThickness = Math.max(thickness, current.thickness) / 2;
          adjustedBoxes.push(
            createPostProcessedWallOverlayBox(
              horizontal
                ? { x1: current.start, x2: current.end, y1: axis - halfThickness, y2: axis + halfThickness }
                : { x1: axis - halfThickness, x2: axis + halfThickness, y1: current.start, y2: current.end },
              current.confidence
            )
          );
          current = { ...interval };
        }
      }

      const halfThickness = Math.max(thickness, current.thickness) / 2;
      adjustedBoxes.push(
        createPostProcessedWallOverlayBox(
          horizontal
            ? { x1: current.start, x2: current.end, y1: axis - halfThickness, y2: axis + halfThickness }
            : { x1: axis - halfThickness, x2: axis + halfThickness, y1: current.start, y2: current.end },
          current.confidence
        )
      );
    }
  }

  return adjustedBoxes;
}

function clipSegmentToRange(start: number, end: number, min: number, max: number) {
  const normalizedMin = Math.min(min, max);
  const normalizedMax = Math.max(min, max);
  const availableLength = normalizedMax - normalizedMin;
  if (availableLength <= 0) return [normalizedMin, normalizedMax] as const;

  return [
    clampValue(Math.min(start, end), normalizedMin, normalizedMax),
    clampValue(Math.max(start, end), normalizedMin, normalizedMax)
  ] as const;
}

export function trimWallBoxCornerOverlaps(wallBoxes: RoboflowDetectionOverlayBox[]) {
  const cornerTolerance = 6;
  const maxTrimOverlap = cornerTolerance * 2;
  const trimmedBoxes = wallBoxes.map((wallBox) => ({ ...wallBox, box: normalizeOverlayBox(wallBox.box) }));
  const isHorizontal = (box: RoboflowDetectionOverlayBox["box"]) => box.x2 - box.x1 >= box.y2 - box.y1;
  const pointInsideRange = (value: number, min: number, max: number) => value >= min - cornerTolerance && value <= max + cornerTolerance;

  for (let horizontalIndex = 0; horizontalIndex < trimmedBoxes.length; horizontalIndex += 1) {
    const horizontalWall = trimmedBoxes[horizontalIndex];
    if (horizontalWall.type !== "WALL" || !isHorizontal(horizontalWall.box)) continue;

    for (let verticalIndex = 0; verticalIndex < trimmedBoxes.length; verticalIndex += 1) {
      if (horizontalIndex === verticalIndex) continue;
      const verticalWall = trimmedBoxes[verticalIndex];
      if (verticalWall.type !== "WALL" || isHorizontal(verticalWall.box)) continue;

      const horizontalBox = horizontalWall.box;
      const verticalBox = verticalWall.box;
      const overlapX = getIntervalOverlap(horizontalBox.x1, horizontalBox.x2, verticalBox.x1, verticalBox.x2);
      const overlapY = getIntervalOverlap(horizontalBox.y1, horizontalBox.y2, verticalBox.y1, verticalBox.y2);
      if (overlapX <= 0 || overlapY <= 0) continue;
      if (overlapX > maxTrimOverlap && overlapY > maxTrimOverlap) continue;

      const horizontalStartsInsideVertical =
        pointInsideRange(horizontalBox.x1, verticalBox.x1, verticalBox.x2) && horizontalBox.x2 > verticalBox.x2 + cornerTolerance;
      const horizontalEndsInsideVertical =
        pointInsideRange(horizontalBox.x2, verticalBox.x1, verticalBox.x2) && horizontalBox.x1 < verticalBox.x1 - cornerTolerance;
      if (horizontalStartsInsideVertical) {
        horizontalBox.x1 = Math.min(horizontalBox.x2, verticalBox.x2);
        continue;
      }
      if (horizontalEndsInsideVertical) {
        horizontalBox.x2 = Math.max(horizontalBox.x1, verticalBox.x1);
        continue;
      }

      const verticalStartsInsideHorizontal =
        pointInsideRange(verticalBox.y1, horizontalBox.y1, horizontalBox.y2) && verticalBox.y2 > horizontalBox.y2 + cornerTolerance;
      const verticalEndsInsideHorizontal =
        pointInsideRange(verticalBox.y2, horizontalBox.y1, horizontalBox.y2) && verticalBox.y1 < horizontalBox.y1 - cornerTolerance;
      if (verticalStartsInsideHorizontal) {
        verticalBox.y1 = Math.min(verticalBox.y2, horizontalBox.y2);
      } else if (verticalEndsInsideHorizontal) {
        verticalBox.y2 = Math.max(verticalBox.y1, horizontalBox.y1);
      }
    }
  }

  return trimmedBoxes.filter((wallBox) => {
    const box = wallBox.box;
    const length = isHorizontal(box) ? box.x2 - box.x1 : box.y2 - box.y1;
    return length >= 8;
  });
}

export function snapOpeningBoxEdgesToNearbyWallBreaks(
  openingBoxes: RoboflowDetectionOverlayBox[],
  rawWallBoxes: RoboflowDetectionOverlayBox[]
) {
  const openingEdgeSnapTolerance = 14;
  const wallBoxes = rawWallBoxes
    .filter((wallBox) => wallBox.type === "WALL")
    .map((wallBox) => ({ ...wallBox, box: normalizeOverlayBox(wallBox.box) }));
  const nearestBreak = (edge: number, breakpoints: number[]) => {
    let nearest = edge;
    let nearestDistance = openingEdgeSnapTolerance + 1;
    for (const breakpoint of breakpoints) {
      const distance = Math.abs(edge - breakpoint);
      if (distance < nearestDistance) {
        nearest = breakpoint;
        nearestDistance = distance;
      }
    }

    return nearestDistance <= openingEdgeSnapTolerance ? nearest : edge;
  };

  return openingBoxes.map((openingBox) => {
    if (openingBox.type === "WALL" || !wallBoxes.length) return openingBox;

    const opening = normalizeOverlayBox(openingBox.box);
    const horizontal = opening.x2 - opening.x1 >= opening.y2 - opening.y1;
    const crossOverlapMin = horizontal ? opening.y1 : opening.x1;
    const crossOverlapMax = horizontal ? opening.y2 : opening.x2;
    const crossSpan = Math.max(1, crossOverlapMax - crossOverlapMin);
    const breakpoints = wallBoxes.flatMap((wallBox) => {
      const wall = wallBox.box;
      const wallHorizontal = wall.x2 - wall.x1 >= wall.y2 - wall.y1;
      if (wallHorizontal !== horizontal) return [];

      const overlap = horizontal
        ? getIntervalOverlap(opening.y1, opening.y2, wall.y1, wall.y2)
        : getIntervalOverlap(opening.x1, opening.x2, wall.x1, wall.x2);
      if (overlap < crossSpan * 0.45) return [];

      return horizontal ? [wall.x1, wall.x2] : [wall.y1, wall.y2];
    });
    if (!breakpoints.length) return openingBox;

    if (horizontal) {
      const x1 = nearestBreak(opening.x1, breakpoints);
      const x2 = nearestBreak(opening.x2, breakpoints);
      return x2 - x1 >= 8 ? { ...openingBox, box: { ...openingBox.box, x1, x2 } } : openingBox;
    }

    const y1 = nearestBreak(opening.y1, breakpoints);
    const y2 = nearestBreak(opening.y2, breakpoints);
    return y2 - y1 >= 8 ? { ...openingBox, box: { ...openingBox.box, y1, y2 } } : openingBox;
  });
}

export function fitOpeningBoxesToPostProcessedWalls(
  openingBoxes: RoboflowDetectionOverlayBox[],
  wallBoxes: RoboflowDetectionOverlayBox[]
) {
  const fittedWalls = wallBoxes
    .filter((wallBox) => wallBox.type === "WALL")
    .map((wallBox) => ({ ...wallBox, box: normalizeOverlayBox(wallBox.box) }));

  return openingBoxes.map((openingBox) => {
    if (openingBox.type === "WALL" || !fittedWalls.length) return openingBox;

    const opening = normalizeOverlayBox(openingBox.box);
    const openingCenter = { x: (opening.x1 + opening.x2) / 2, y: (opening.y1 + opening.y2) / 2 };
    let bestWall: (typeof fittedWalls)[number] | null = null;
    let bestScore = Infinity;

    for (const wallBox of fittedWalls) {
      const wall = wallBox.box;
      const wallWidth = wall.x2 - wall.x1;
      const wallHeight = wall.y2 - wall.y1;
      const isHorizontal = wallWidth >= wallHeight;
      const wallCenter = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
      const primaryOverlap = isHorizontal
        ? getIntervalOverlap(opening.x1, opening.x2, wall.x1, wall.x2)
        : getIntervalOverlap(opening.y1, opening.y2, wall.y1, wall.y2);
      const primarySpan = isHorizontal ? Math.max(1, opening.x2 - opening.x1) : Math.max(1, opening.y2 - opening.y1);
      const centerDistance = isHorizontal ? Math.abs(openingCenter.y - wallCenter.y) : Math.abs(openingCenter.x - wallCenter.x);
      const wallThickness = isHorizontal ? wallHeight : wallWidth;
      const openingThickness = isHorizontal ? opening.y2 - opening.y1 : opening.x2 - opening.x1;
      const maxCenterDistance = Math.max(36, wallThickness * 4, openingThickness);
      if (primaryOverlap <= primarySpan * 0.12 || centerDistance > maxCenterDistance) continue;

      const score = centerDistance * 4 - primaryOverlap;
      if (score < bestScore) {
        bestScore = score;
        bestWall = wallBox;
      }
    }

    if (!bestWall) return openingBox;

    const wall = bestWall.box;
    const isHorizontal = wall.x2 - wall.x1 >= wall.y2 - wall.y1;
    if (isHorizontal) {
      const [x1, x2] = clipSegmentToRange(opening.x1, opening.x2, wall.x1, wall.x2);
      return { ...openingBox, box: { x1, x2, y1: wall.y1, y2: wall.y2 } };
    }

    const [y1, y2] = clipSegmentToRange(opening.y1, opening.y2, wall.y1, wall.y2);
    return { ...openingBox, box: { x1: wall.x1, x2: wall.x2, y1, y2 } };
  });
}

export function alignWallBoxesToFittedOpeningLines(
  wallBoxes: RoboflowDetectionOverlayBox[],
  fittedOpeningBoxes: RoboflowDetectionOverlayBox[]
) {
  const fittedOpeningLineTolerance = 12;
  const fittedOpenings = fittedOpeningBoxes
    .filter((openingBox) => openingBox.type !== "WALL")
    .map((openingBox) => ({ ...openingBox, box: normalizeOverlayBox(openingBox.box) }));

  return wallBoxes.map((wallBox) => {
    if (wallBox.type !== "WALL" || !fittedOpenings.length) return wallBox;

    const wall = normalizeOverlayBox(wallBox.box);
    const wallHorizontal = wall.x2 - wall.x1 >= wall.y2 - wall.y1;
    const wallPrimaryLength = wallHorizontal ? wall.x2 - wall.x1 : wall.y2 - wall.y1;
    const wallCrossCenter = wallHorizontal ? (wall.y1 + wall.y2) / 2 : (wall.x1 + wall.x2) / 2;
    const wallThickness = wallHorizontal ? wall.y2 - wall.y1 : wall.x2 - wall.x1;
    let bestOpening: (typeof fittedOpenings)[number] | null = null;
    let bestScore = -Infinity;

    for (const openingBox of fittedOpenings) {
      const opening = openingBox.box;
      const openingHorizontal = opening.x2 - opening.x1 >= opening.y2 - opening.y1;
      if (openingHorizontal !== wallHorizontal) continue;

      const primaryOverlap = wallHorizontal
        ? getIntervalOverlap(wall.x1, wall.x2, opening.x1, opening.x2)
        : getIntervalOverlap(wall.y1, wall.y2, opening.y1, opening.y2);
      const openingPrimaryLength = wallHorizontal ? opening.x2 - opening.x1 : opening.y2 - opening.y1;
      const minimumPrimaryOverlap = Math.min(wallPrimaryLength, openingPrimaryLength) * 0.45;
      if (primaryOverlap < minimumPrimaryOverlap) continue;

      const openingCrossCenter = wallHorizontal ? (opening.y1 + opening.y2) / 2 : (opening.x1 + opening.x2) / 2;
      const crossDistance = Math.abs(wallCrossCenter - openingCrossCenter);
      if (crossDistance > Math.max(fittedOpeningLineTolerance, wallThickness * 1.2)) continue;

      const score = primaryOverlap - crossDistance * 4;
      if (score > bestScore) {
        bestOpening = openingBox;
        bestScore = score;
      }
    }

    if (!bestOpening) return wallBox;

    const opening = bestOpening.box;
    if (wallHorizontal) {
      const nextBox = { ...wallBox.box, y1: opening.y1, y2: opening.y2 };
      return nextBox.y2 - nextBox.y1 >= 4 ? { ...wallBox, box: nextBox } : wallBox;
    }

    const nextBox = { ...wallBox.box, x1: opening.x1, x2: opening.x2 };
    return nextBox.x2 - nextBox.x1 >= 4 ? { ...wallBox, box: nextBox } : wallBox;
  });
}

export function alignConnectedPerpendicularWallBoxCorners(wallBoxes: RoboflowDetectionOverlayBox[]) {
  const perpendicularCornerLineTolerance = 14;
  const perpendicularCornerTouchTolerance = 24;
  const boxes = wallBoxes.map((wallBox) => ({ ...wallBox, box: normalizeOverlayBox(wallBox.box) }));
  const intervalsTouch = (startA: number, endA: number, startB: number, endB: number) =>
    Math.max(0, Math.max(startA, startB) - Math.min(endA, endB)) <= perpendicularCornerTouchTolerance;

  for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
      const leftBox = boxes[leftIndex].box;
      const rightBox = boxes[rightIndex].box;
      const leftHorizontal = leftBox.x2 - leftBox.x1 >= leftBox.y2 - leftBox.y1;
      const rightHorizontal = rightBox.x2 - rightBox.x1 >= rightBox.y2 - rightBox.y1;
      if (leftHorizontal === rightHorizontal) continue;

      const horizontalBox = leftHorizontal ? leftBox : rightBox;
      const verticalBox = leftHorizontal ? rightBox : leftBox;
      if (!intervalsTouch(horizontalBox.x1, horizontalBox.x2, verticalBox.x1, verticalBox.x2)) continue;
      if (!intervalsTouch(horizontalBox.y1, horizontalBox.y2, verticalBox.y1, verticalBox.y2)) continue;

      if (Math.abs(verticalBox.y1 - horizontalBox.y1) <= perpendicularCornerLineTolerance) verticalBox.y1 = horizontalBox.y1;
      if (Math.abs(verticalBox.y2 - horizontalBox.y2) <= perpendicularCornerLineTolerance) verticalBox.y2 = horizontalBox.y2;
      if (Math.abs(horizontalBox.x1 - verticalBox.x1) <= perpendicularCornerLineTolerance) horizontalBox.x1 = verticalBox.x1;
      if (Math.abs(horizontalBox.x2 - verticalBox.x2) <= perpendicularCornerLineTolerance) horizontalBox.x2 = verticalBox.x2;
    }
  }

  return boxes;
}

