import { DEFAULT_PIXEL_TO_MM_RATIO, normalizePlanName, snapToOrthogonal } from "../room-model/wall-model.mjs";

function createDetectedWall(start, end, id) {
  const roundedStart = {
    x: Math.round(start.x),
    y: Math.round(start.y)
  };
  const orthogonalEnd = snapToOrthogonal(roundedStart, {
    x: Math.round(end.x),
    y: Math.round(end.y)
  });

  if (roundedStart.x === orthogonalEnd.x && roundedStart.y === orthogonalEnd.y) {
    return null;
  }

  return {
    id,
    start: roundedStart,
    end: orthogonalEnd
  };
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

function lineHasMarker(line, patterns = []) {
  const markers = Array.isArray(line.markers) ? line.markers : [];
  return markers.some((marker) => patterns.some((pattern) => String(marker).includes(pattern)));
}

function isAnnotationLine(line) {
  return lineHasMarker(line, ["annotation", "dashed", "guide", "selection", "highlight"]);
}

function linesIntersectOrthogonally(lineA, lineB, tolerance = 6) {
  const orientationA = lineOrientation(lineA);
  const orientationB = lineOrientation(lineB);
  if (orientationA === orientationB) return false;

  const horizontal = orientationA === "horizontal" ? lineA : lineB;
  const vertical = orientationA === "vertical" ? lineA : lineB;
  const hBounds = lineBounds(horizontal);
  const vBounds = lineBounds(vertical);
  const y = Math.round((horizontal.y1 + horizontal.y2) / 2);
  const x = Math.round((vertical.x1 + vertical.x2) / 2);

  return (
    x >= hBounds.minX - tolerance &&
    x <= hBounds.maxX + tolerance &&
    y >= vBounds.minY - tolerance &&
    y <= vBounds.maxY + tolerance
  );
}

function inferStructuralBounds(allLines, options = {}) {
  // 구조 경계는 두께 있는 선(실제 벽)만으로 추정한다. 얇은 치수선을 포함하면
  // 경계가 치수선까지 부풀어서 "경계 바깥 치수선" 필터가 무력화된다.
  const structuralMinThickness = options.structuralMinThickness ?? 3;
  const thickLines = allLines.filter((line) => Number(line.thickness ?? 6) >= structuralMinThickness);
  const lines = thickLines.length >= 3 ? thickLines : allLines;
  const adjacency = new Map();
  lines.forEach((_line, index) => adjacency.set(index, new Set()));

  for (let index = 0; index < lines.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < lines.length; otherIndex += 1) {
      if (!linesIntersectOrthogonally(lines[index], lines[otherIndex], 8)) continue;
      adjacency.get(index)?.add(otherIndex);
      adjacency.get(otherIndex)?.add(index);
    }
  }

  const visited = new Set();
  const components = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (visited.has(index)) continue;
    const stack = [index];
    const componentIndexes = [];
    visited.add(index);

    while (stack.length) {
      const current = stack.pop();
      componentIndexes.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    const componentLines = componentIndexes.map((componentIndex) => lines[componentIndex]);
    const orientations = new Set(componentLines.map(lineOrientation));
    if (componentLines.length >= 2 && orientations.size >= 2) components.push(componentLines);
  }

  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;
  const edgeMarginX = Math.max(16, width * 0.055);
  const edgeMarginY = Math.max(16, height * 0.055);
  const componentScores = components
    .map((componentLines) => {
      const bounds = componentLines.map(lineBounds);
      const minX = Math.min(...bounds.map((bound) => bound.minX));
      const maxX = Math.max(...bounds.map((bound) => bound.maxX));
      const minY = Math.min(...bounds.map((bound) => bound.minY));
      const maxY = Math.max(...bounds.map((bound) => bound.maxY));
      const area = Math.max(1, maxX - minX) * Math.max(1, maxY - minY);
      const totalLength = componentLines.reduce((total, line) => total + lineLength(line), 0);
      const densityScore = totalLength / Math.sqrt(area);
      const score = componentLines.length * 100000 + densityScore * 10000 + totalLength;
      const touchesImageEdge =
        (width > 0 && (minX <= edgeMarginX || maxX >= width - edgeMarginX)) ||
        (height > 0 && (minY <= edgeMarginY || maxY >= height - edgeMarginY));
      return { componentLines, densityScore, score, touchesImageEdge };
    })
    .filter((component) => !(component.touchesImageEdge && component.componentLines.length <= 4 && component.densityScore < 1.8))
    .sort((a, b) => b.score - a.score);
  const bestScore = componentScores[0]?.score ?? 0;
  const sourceLines = componentScores.length
    ? componentScores
        .filter((component) => component.score >= Math.max(150000, bestScore * 0.22) && component.densityScore >= 0.45)
        .flatMap((component) => component.componentLines)
    : lines;
  if (!sourceLines.length) return null;

  const bboxOf = (boxLines) => {
    const boxBounds = boxLines.map(lineBounds);
    return {
      maxX: Math.max(...boxBounds.map((bound) => bound.maxX)),
      maxY: Math.max(...boxBounds.map((bound) => bound.maxY)),
      minX: Math.min(...boxBounds.map((bound) => bound.minX)),
      minY: Math.min(...boxBounds.map((bound) => bound.minY))
    };
  };
  const componentBounds = bboxOf(sourceLines);
  const thickBounds = bboxOf(lines);
  const areaOf = (box) => Math.max(1, box.maxX - box.minX) * Math.max(1, box.maxY - box.minY);

  // 창문/문 opening으로 외곽선이 조각나면 컴포넌트끼리 서로 닿지 않아 경계가 국소 조각으로
  // 붕괴한다. 컴포넌트 경계가 두꺼운 선 전체 범위 대비 지나치게 작으면 전체 bbox를 신뢰한다.
  if (areaOf(componentBounds) < areaOf(thickBounds) * 0.5) return thickBounds;

  return componentBounds;
}

function overlapLength(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function isOffsetDimensionFromStructuralBounds(line, structuralBounds, options = {}) {
  if (!structuralBounds) return false;

  const orientation = lineOrientation(line);
  const bounds = lineBounds(line);
  const tolerance = options.dimensionOffsetTolerance ?? 18;
  const maxOffset = options.dimensionMaxOffset ?? Math.max(220, Math.min(options.width ?? 900, options.height ?? 700) * 0.34);
  const thinEnough = Number(line.thickness ?? 1) <= 3;
  const hasDimensionMarker = lineHasMarker(line, ["arrow", "tick", "dimension"]);
  if (!thinEnough && !hasDimensionMarker) return false;

  if (orientation === "horizontal") {
    const horizontalOverlap = overlapLength(bounds.minX, bounds.maxX, structuralBounds.minX, structuralBounds.maxX);
    const structuralWidth = Math.max(1, structuralBounds.maxX - structuralBounds.minX);
    const offsetAbove = structuralBounds.minY - bounds.maxY;
    const offsetBelow = bounds.minY - structuralBounds.maxY;
    const outsideByBand =
      (offsetAbove >= tolerance && offsetAbove <= maxOffset) ||
      (offsetBelow >= tolerance && offsetBelow <= maxOffset);

    return outsideByBand && horizontalOverlap / structuralWidth >= 0.55;
  }

  const verticalOverlap = overlapLength(bounds.minY, bounds.maxY, structuralBounds.minY, structuralBounds.maxY);
  const structuralHeight = Math.max(1, structuralBounds.maxY - structuralBounds.minY);
  const offsetLeft = structuralBounds.minX - bounds.maxX;
  const offsetRight = bounds.minX - structuralBounds.maxX;
  const outsideByBand =
    (offsetLeft >= tolerance && offsetLeft <= maxOffset) ||
    (offsetRight >= tolerance && offsetRight <= maxOffset);

  return outsideByBand && verticalOverlap / structuralHeight >= 0.55;
}

function outsideOffsetFromStructuralBounds(line, structuralBounds) {
  if (!structuralBounds) return null;

  const orientation = lineOrientation(line);
  const bounds = lineBounds(line);

  if (orientation === "horizontal") {
    const offsetAbove = structuralBounds.minY - bounds.maxY;
    const offsetBelow = bounds.minY - structuralBounds.maxY;
    if (offsetAbove > 0) return { orientation, side: "above", offset: offsetAbove };
    if (offsetBelow > 0) return { orientation, side: "below", offset: offsetBelow };
    return null;
  }

  const offsetLeft = structuralBounds.minX - bounds.maxX;
  const offsetRight = bounds.minX - structuralBounds.maxX;
  if (offsetLeft > 0) return { orientation, side: "left", offset: offsetLeft };
  if (offsetRight > 0) return { orientation, side: "right", offset: offsetRight };
  return null;
}

function lineAxisPosition(line) {
  return lineOrientation(line) === "horizontal" ? (line.y1 + line.y2) / 2 : (line.x1 + line.x2) / 2;
}

function lineSpan(line) {
  const bounds = lineBounds(line);
  return lineOrientation(line) === "horizontal"
    ? { axis: (line.y1 + line.y2) / 2, end: bounds.maxX, start: bounds.minX }
    : { axis: (line.x1 + line.x2) / 2, end: bounds.maxY, start: bounds.minY };
}

function isContainedCollinearFragment(candidate, keeper, options = {}) {
  if (candidate === keeper) return false;
  if (lineOrientation(candidate) !== lineOrientation(keeper)) return false;

  const candidateThickness = Number(candidate.thickness ?? 1);
  const keeperThickness = Number(keeper.thickness ?? 1);
  const axisTolerance =
    options.containedAxisTolerance ??
    Math.max(options.axisTolerance ?? 5, Math.min(12, Math.max(candidateThickness, keeperThickness) * 0.85));
  const rangeTolerance = options.containedRangeTolerance ?? 14;
  const candidateSpan = lineSpan(candidate);
  const keeperSpan = lineSpan(keeper);
  if (Math.abs(candidateSpan.axis - keeperSpan.axis) > axisTolerance) return false;

  const candidateLength = Math.max(0, candidateSpan.end - candidateSpan.start);
  const keeperLength = Math.max(0, keeperSpan.end - keeperSpan.start);
  if (keeperLength < candidateLength - rangeTolerance) return false;

  const contained =
    candidateSpan.start >= keeperSpan.start - rangeTolerance &&
    candidateSpan.end <= keeperSpan.end + rangeTolerance;
  if (!contained) return false;

  return (
    keeperLength > candidateLength + rangeTolerance ||
    keeperThickness >= candidateThickness ||
    candidateThickness <= 2
  );
}

export function removeContainedDetectedWallFragments(lines, options = {}) {
  const sortedByLength = [...(lines ?? [])].sort((lineA, lineB) => lineLength(lineB) - lineLength(lineA));
  const keepers = [];
  const dropped = new Set();

  for (const line of sortedByLength) {
    if (keepers.some((keeper) => isContainedCollinearFragment(line, keeper, options))) {
      dropped.add(line);
      continue;
    }

    keepers.push(line);
  }

  return (lines ?? []).filter((line) => !dropped.has(line));
}

function isSegmentedOutsideDimensionFromGroup(line, candidateWalls, structuralBounds, options = {}) {
  const outside = outsideOffsetFromStructuralBounds(line, structuralBounds);
  if (!outside) return false;

  const tolerance = options.dimensionOffsetTolerance ?? 18;
  const maxOffset = options.dimensionMaxOffset ?? Math.max(220, Math.min(options.width ?? 900, options.height ?? 700) * 0.34);
  if (outside.offset < tolerance || outside.offset > maxOffset) return false;

  const axisTolerance = options.axisTolerance ?? 8;
  const axis = lineAxisPosition(line);
  const sameAxisLines = candidateWalls.filter((otherLine) => {
    const otherOutside = outsideOffsetFromStructuralBounds(otherLine, structuralBounds);
    return (
      otherOutside?.orientation === outside.orientation &&
      otherOutside.side === outside.side &&
      Math.abs(lineAxisPosition(otherLine) - axis) <= axisTolerance
    );
  });

  const connectedToMainWall = candidateWalls.some((otherLine) => {
    if (sameAxisLines.includes(otherLine)) return false;
    if (!linesIntersectOrthogonally(line, otherLine, 8)) return false;
    const otherBounds = lineBounds(otherLine);
    return !outsideOffsetFromStructuralBounds(otherLine, structuralBounds) && overlapLength(
      otherBounds.minX,
      otherBounds.maxX,
      structuralBounds.minX,
      structuralBounds.maxX
    ) + overlapLength(otherBounds.minY, otherBounds.maxY, structuralBounds.minY, structuralBounds.maxY) > 0;
  });
  if (connectedToMainWall) return false;

  if (outside.orientation === "horizontal") {
    const structuralWidth = Math.max(1, structuralBounds.maxX - structuralBounds.minX);
    const combinedOverlap = sameAxisLines.reduce((total, candidate) => {
      const bounds = lineBounds(candidate);
      return total + overlapLength(bounds.minX, bounds.maxX, structuralBounds.minX, structuralBounds.maxX);
    }, 0);
    return combinedOverlap / structuralWidth >= 0.32;
  }

  const structuralHeight = Math.max(1, structuralBounds.maxY - structuralBounds.minY);
  const combinedOverlap = sameAxisLines.reduce((total, candidate) => {
    const bounds = lineBounds(candidate);
    return total + overlapLength(bounds.minY, bounds.maxY, structuralBounds.minY, structuralBounds.maxY);
  }, 0);
  return combinedOverlap / structuralHeight >= 0.32;
}

function isThinInteriorSymbol(line, candidateWalls, structuralBounds, options = {}) {
  if (!structuralBounds) return false;
  if (line.thickness === undefined || line.thickness === null) return false;
  const thickness = Number(line.thickness ?? 1);
  if (thickness > 2) return false;

  const bounds = lineBounds(line);
  const insideStructuralBounds =
    bounds.minX >= structuralBounds.minX - 8 &&
    bounds.maxX <= structuralBounds.maxX + 8 &&
    bounds.minY >= structuralBounds.minY - 8 &&
    bounds.maxY <= structuralBounds.maxY + 8;
  if (!insideStructuralBounds) return false;

  const minInteriorLength = Math.max(48, Math.min(options.width ?? 800, options.height ?? 600) * 0.08);
  if (lineLength(line) < minInteriorLength) return true;

  const touchesThickWall = candidateWalls.some((otherLine) => {
    if (otherLine === line || Number(otherLine.thickness ?? 1) <= 2) return false;
    return linesIntersectOrthogonally(line, otherLine, 8);
  });

  return !touchesThickWall;
}

function hasInteriorFillContext(lines) {
  const supportedLines = (lines ?? []).filter((line) => Number.isFinite(Number(line.fillSupport)));
  if (supportedLines.length < 3) return false;
  return supportedLines.some((line) => Number(line.fillSupport ?? 0) >= 0.14);
}

function isLowFillNonUnitLine(line, candidateWalls, structuralBounds) {
  if (!structuralBounds || !hasInteriorFillContext(candidateWalls)) return false;
  if (!Number.isFinite(Number(line.fillSupport))) return false;
  if (Number(line.fillSupport ?? 0) >= 0.045) return false;

  const bounds = lineBounds(line);
  const nearStructuralBounds =
    bounds.minX >= structuralBounds.minX - 16 &&
    bounds.maxX <= structuralBounds.maxX + 16 &&
    bounds.minY >= structuralBounds.minY - 16 &&
    bounds.maxY <= structuralBounds.maxY + 16;
  if (!nearStructuralBounds) return false;

  const highFillIntersections = candidateWalls.filter((otherLine) => {
    if (otherLine === line || Number(otherLine.fillSupport ?? 0) < 0.14) return false;
    return linesIntersectOrthogonally(line, otherLine, 8);
  }).length;

  return highFillIntersections === 0 || lineLength(line) < Math.max(70, lineLength(candidateWalls[0] ?? line) * 0.35);
}

function conservativeThicknessThreshold(lines, options = {}) {
  const thicknesses = (lines ?? [])
    .map((line) => Number(line.thickness ?? 1))
    .filter((thickness) => Number.isFinite(thickness) && thickness > 0)
    .sort((left, right) => left - right);
  if (!thicknesses.length) return Number(options.minConservativeWallThickness ?? 4);

  const median = thicknesses[Math.floor(thicknesses.length / 2)];
  return Math.max(Number(options.minConservativeWallThickness ?? 4), median * 0.7);
}

function isConservativeWallLine(line, structuralBounds, options = {}, threshold = 4) {
  const thickness = Number(line.thickness ?? 1);
  if (!Number.isFinite(thickness) || thickness < threshold) return false;

  const minLength = Math.max(80, Math.round(Math.min(options.width ?? 800, options.height ?? 600) * 0.12));
  if (lineLength(line) < minLength) return false;

  if (Number.isFinite(Number(line.fillSupport)) && Number(line.fillSupport ?? 0) < 0.02 && hasInteriorFillContext([line])) {
    return false;
  }

  if (!structuralBounds) return true;
  const bounds = lineBounds(line);
  const nearStructuralBounds =
    bounds.minX >= structuralBounds.minX - 18 &&
    bounds.maxX <= structuralBounds.maxX + 18 &&
    bounds.minY >= structuralBounds.minY - 18 &&
    bounds.maxY <= structuralBounds.maxY + 18;

  return nearStructuralBounds;
}

function isConnectedThickWallStub(line, candidateWalls, structuralBounds, options = {}, threshold = 4) {
  const thickness = Number(line.thickness ?? 1);
  const length = lineLength(line);
  const minStubLength = options.wallFirstMinStubLength ?? Math.max(24, Math.round(Math.min(options.width ?? 800, options.height ?? 600) * 0.032));
  if (!Number.isFinite(thickness) || thickness < Math.max(4, threshold * 0.8)) return false;
  if (length < minStubLength) return false;

  if (structuralBounds) {
    const bounds = lineBounds(line);
    const insideStructuralBounds =
      bounds.minX >= structuralBounds.minX - 18 &&
      bounds.maxX <= structuralBounds.maxX + 18 &&
      bounds.minY >= structuralBounds.minY - 18 &&
      bounds.maxY <= structuralBounds.maxY + 18;
    if (!insideStructuralBounds) return false;
  }

  return candidateWalls.some((otherLine) => {
    if (otherLine === line || lineOrientation(otherLine) === lineOrientation(line)) return false;
    if (Number(otherLine.thickness ?? 1) < Math.max(4, threshold * 0.8)) return false;
    if (lineLength(otherLine) < Math.max(80, length * 1.3)) return false;
    return linesIntersectOrthogonally(line, otherLine, 10);
  });
}

function isSmallClosedWallLoopSegment(line, candidateWalls, structuralBounds, options = {}, threshold = 4) {
  const thickness = Number(line.thickness ?? 1);
  const length = lineLength(line);
  const minLoopLength = options.wallFirstMinLoopLength ?? Math.max(30, Math.round(Math.min(options.width ?? 800, options.height ?? 600) * 0.045));
  const maxLoopLength = options.wallFirstMaxLoopLength ?? Math.max(120, Math.round(Math.min(options.width ?? 800, options.height ?? 600) * 0.18));
  if (!Number.isFinite(thickness) || thickness < Math.max(4, threshold * 0.8)) return false;
  if (length < minLoopLength || length > maxLoopLength) return false;

  if (structuralBounds) {
    const bounds = lineBounds(line);
    const insideStructuralBounds =
      bounds.minX >= structuralBounds.minX - 24 &&
      bounds.maxX <= structuralBounds.maxX + 24 &&
      bounds.minY >= structuralBounds.minY - 24 &&
      bounds.maxY <= structuralBounds.maxY + 24;
    if (!insideStructuralBounds) return false;
  }

  const orthogonalNeighbors = candidateWalls.filter((otherLine) => {
    if (otherLine === line || lineOrientation(otherLine) === lineOrientation(line)) return false;
    if (Number(otherLine.thickness ?? 1) < Math.max(4, threshold * 0.8)) return false;
    const otherLength = lineLength(otherLine);
    if (otherLength < minLoopLength || otherLength > maxLoopLength) return false;
    return linesIntersectOrthogonally(line, otherLine, 10);
  });

  if (orthogonalNeighbors.length < 2) return false;

  return orthogonalNeighbors.some((firstNeighbor, firstIndex) =>
    orthogonalNeighbors.slice(firstIndex + 1).some((secondNeighbor) => Math.abs(lineAxisPosition(firstNeighbor) - lineAxisPosition(secondNeighbor)) >= minLoopLength * 0.65)
  );
}

// 순흑으로 꽉 채워 그린 작은 사각 벽(덕트/샤프트/기둥)은 굵고 짧은 밴드 하나로 나온다.
// 긴 축 방향 밴드(length >= thickness)만 벽으로 삼아 교차 중복을 피한다.
function isSolidWallBlockLine(line, structuralBounds, options = {}, threshold = 4) {
  const thickness = Number(line.thickness ?? 1);
  const length = lineLength(line);
  const maxBlockLength =
    options.wallFirstMaxBlockLength ?? Math.max(72, Math.round(Math.min(options.width ?? 800, options.height ?? 600) * 0.09));
  // 덕트/기둥은 350mm(≈4% 스케일)를 넘지 않는다. 그보다 두꺼운 채움은 가구다.
  const maxBlockThickness =
    options.wallFirstMaxBlockThickness ?? Math.max(26, Math.round(Math.min(options.width ?? 800, options.height ?? 600) * 0.04));
  if (!Number.isFinite(thickness) || thickness < Math.max(10, threshold * 1.6)) return false;
  if (thickness > maxBlockThickness) return false;
  if (length > maxBlockLength || thickness > length) return false;
  if (thickness < length * 0.4) return false;

  if (!structuralBounds) return true;

  const bounds = lineBounds(line);
  return (
    bounds.minX >= structuralBounds.minX - 24 &&
    bounds.maxX <= structuralBounds.maxX + 24 &&
    bounds.minY >= structuralBounds.minY - 24 &&
    bounds.maxY <= structuralBounds.maxY + 24
  );
}

function typicalLongWallThickness(lines, options = {}) {
  const minLongLength = Math.max(90, Math.round(Math.min(options.width ?? 800, options.height ?? 600) * 0.11));
  const thicknesses = (lines ?? [])
    .filter((line) => lineLength(line) >= minLongLength)
    .map((line) => Number(line.thickness ?? 0))
    .filter((thickness) => Number.isFinite(thickness) && thickness >= 3)
    .sort((left, right) => left - right);
  if (thicknesses.length < 3) return null;

  return thicknesses[Math.floor(thicknesses.length / 2)];
}

// 벽 두께 중앙값보다 훨씬 두꺼운 밴드는 가구 채움(싱크대 상판, 붙박이 진회색 면)이다.
// 작은 솔리드 벽 블록은 예외로 남긴다.
function isFurnitureFillBand(line, typicalThickness, structuralBounds, options = {}, threshold = 4) {
  if (!typicalThickness) return false;

  const thickness = Number(line.thickness ?? 1);
  const cap = options.maxWallThickness ?? Math.max(24, Math.round(typicalThickness * 3.2));
  if (!Number.isFinite(thickness) || thickness <= cap) return false;

  return !isSolidWallBlockLine(line, structuralBounds, options, threshold);
}

function isWallFirstLine(line, structuralBounds, options = {}, threshold = 4) {
  const thickness = Number(line.thickness ?? 1);
  // 내부 칸막이벽은 외벽(15~19px)보다 훨씬 얇게 그려지므로, 외벽 두께 기반
  // 임계값을 그대로 쓰면 진짜 내벽이 잘린다. 게이트 상한을 5px로 둔다.
  if (!Number.isFinite(thickness) || thickness < Math.max(3, Math.min(threshold * 0.68, 5))) return false;

  const minLength = Math.max(90, Math.round(Math.min(options.width ?? 800, options.height ?? 600) * 0.11));
  if (lineLength(line) < minLength) {
    return (
      isConnectedThickWallStub(line, options.candidateWalls ?? [], structuralBounds, options, threshold) ||
      isSmallClosedWallLoopSegment(line, options.candidateWalls ?? [], structuralBounds, options, threshold) ||
      isSolidWallBlockLine(line, structuralBounds, options, threshold)
    );
  }

  if (!structuralBounds) return true;

  const bounds = lineBounds(line);
  return (
    bounds.minX >= structuralBounds.minX - 36 &&
    bounds.maxX <= structuralBounds.maxX + 36 &&
    bounds.minY >= structuralBounds.minY - 36 &&
    bounds.maxY <= structuralBounds.maxY + 36
  );
}

function lineCoversStructuralSide(line, structuralBounds, side, tolerance = 10) {
  const bounds = lineBounds(line);
  if (side === "top") {
    return (
      lineOrientation(line) === "horizontal" &&
      Math.abs(lineAxisPosition(line) - structuralBounds.minY) <= tolerance &&
      overlapLength(bounds.minX, bounds.maxX, structuralBounds.minX, structuralBounds.maxX) >=
        (structuralBounds.maxX - structuralBounds.minX) * 0.62
    );
  }
  if (side === "bottom") {
    return (
      lineOrientation(line) === "horizontal" &&
      Math.abs(lineAxisPosition(line) - structuralBounds.maxY) <= tolerance &&
      overlapLength(bounds.minX, bounds.maxX, structuralBounds.minX, structuralBounds.maxX) >=
        (structuralBounds.maxX - structuralBounds.minX) * 0.62
    );
  }
  if (side === "left") {
    return (
      lineOrientation(line) === "vertical" &&
      Math.abs(lineAxisPosition(line) - structuralBounds.minX) <= tolerance &&
      overlapLength(bounds.minY, bounds.maxY, structuralBounds.minY, structuralBounds.maxY) >=
        (structuralBounds.maxY - structuralBounds.minY) * 0.62
    );
  }

  return (
    lineOrientation(line) === "vertical" &&
    Math.abs(lineAxisPosition(line) - structuralBounds.maxX) <= tolerance &&
    overlapLength(bounds.minY, bounds.maxY, structuralBounds.minY, structuralBounds.maxY) >=
      (structuralBounds.maxY - structuralBounds.minY) * 0.62
  );
}

function wallFirstCompleteAndExtend(lines, structuralBounds, options = {}) {
  if (!structuralBounds) return { adjustedCount: 0, walls: lines };

  const snapDistance = options.wallFirstSnapDistance ?? Math.max(36, Math.round(Math.min(options.width ?? 800, options.height ?? 600) * 0.055));
  let adjustedCount = 0;
  const extendedWalls = lines.map((line) => {
    const orientation = lineOrientation(line);
    const bounds = lineBounds(line);
    const nextLine = { ...line };

    if (orientation === "horizontal") {
      if (bounds.minX > structuralBounds.minX && bounds.minX - structuralBounds.minX <= snapDistance) {
        nextLine.x1 = structuralBounds.minX;
        adjustedCount += 1;
      }
      if (bounds.maxX < structuralBounds.maxX && structuralBounds.maxX - bounds.maxX <= snapDistance) {
        nextLine.x2 = structuralBounds.maxX;
        adjustedCount += 1;
      }
    } else {
      if (bounds.minY > structuralBounds.minY && bounds.minY - structuralBounds.minY <= snapDistance) {
        nextLine.y1 = structuralBounds.minY;
        adjustedCount += 1;
      }
      if (bounds.maxY < structuralBounds.maxY && structuralBounds.maxY - bounds.maxY <= snapDistance) {
        nextLine.y2 = structuralBounds.maxY;
        adjustedCount += 1;
      }
    }

    return nextLine;
  });

  const sideTolerance = options.wallFirstSideTolerance ?? Math.max(10, Math.round(snapDistance * 0.3));
  const sides = {
    bottom: extendedWalls.some((line) => lineCoversStructuralSide(line, structuralBounds, "bottom", sideTolerance)),
    left: extendedWalls.some((line) => lineCoversStructuralSide(line, structuralBounds, "left", sideTolerance)),
    right: extendedWalls.some((line) => lineCoversStructuralSide(line, structuralBounds, "right", sideTolerance)),
    top: extendedWalls.some((line) => lineCoversStructuralSide(line, structuralBounds, "top", sideTolerance))
  };
  const presentSideCount = Object.values(sides).filter(Boolean).length;
  const inferredWalls = [];
  const inferredThickness = Math.max(4, Math.round(conservativeThicknessThreshold(extendedWalls, options)));
  const allowInferredOuterEdges = extendedWalls.length <= (options.wallFirstMaxInferredEdgeWallCount ?? 8);

  if (allowInferredOuterEdges && presentSideCount >= 3 && !sides.left) {
    inferredWalls.push({
      confidence: 0.48,
      markers: ["wall-first-inferred-outer"],
      orientation: "vertical",
      thickness: inferredThickness,
      x1: structuralBounds.minX,
      x2: structuralBounds.minX,
      y1: structuralBounds.minY,
      y2: structuralBounds.maxY
    });
  }
  if (allowInferredOuterEdges && presentSideCount >= 3 && !sides.right) {
    inferredWalls.push({
      confidence: 0.48,
      markers: ["wall-first-inferred-outer"],
      orientation: "vertical",
      thickness: inferredThickness,
      x1: structuralBounds.maxX,
      x2: structuralBounds.maxX,
      y1: structuralBounds.minY,
      y2: structuralBounds.maxY
    });
  }
  if (allowInferredOuterEdges && presentSideCount >= 3 && !sides.top) {
    inferredWalls.push({
      confidence: 0.48,
      markers: ["wall-first-inferred-outer"],
      orientation: "horizontal",
      thickness: inferredThickness,
      x1: structuralBounds.minX,
      x2: structuralBounds.maxX,
      y1: structuralBounds.minY,
      y2: structuralBounds.minY
    });
  }
  if (allowInferredOuterEdges && presentSideCount >= 3 && !sides.bottom) {
    inferredWalls.push({
      confidence: 0.48,
      markers: ["wall-first-inferred-outer"],
      orientation: "horizontal",
      thickness: inferredThickness,
      x1: structuralBounds.minX,
      x2: structuralBounds.maxX,
      y1: structuralBounds.maxY,
      y2: structuralBounds.maxY
    });
  }

  return {
    adjustedCount: adjustedCount + inferredWalls.length,
    walls: [...extendedWalls, ...inferredWalls]
  };
}

export function filterCommercialWallCandidates(lines, options = {}) {
  const annotationCandidates = [];
  const dimensionCandidates = [];
  const candidateWalls = [];
  let removedNoiseCount = 0;

  for (const line of lines ?? []) {
    if (!line || lineLength(line) <= 0) continue;
    const thickness = Number(line.thickness ?? 6);

    if (isAnnotationLine(line)) {
      annotationCandidates.push({
        confidence: Number(line.confidence ?? 0.74),
        line,
        source: "annotation-line"
      });
      removedNoiseCount += 1;
      continue;
    }

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

    candidateWalls.push(line);
  }

  const structuralBounds = inferStructuralBounds(candidateWalls, options);
  const typicalThickness = typicalLongWallThickness(candidateWalls, options);
  const furnitureThreshold = conservativeThicknessThreshold(candidateWalls, options);
  const walls = [];

  for (const line of candidateWalls) {
    if (isFurnitureFillBand(line, typicalThickness, structuralBounds, options, furnitureThreshold)) {
      annotationCandidates.push({
        confidence: Number(line.confidence ?? 0.78),
        line,
        source: "furniture-fill-band"
      });
      removedNoiseCount += 1;
      continue;
    }

    if (isThinInteriorSymbol(line, candidateWalls, structuralBounds, options)) {
      annotationCandidates.push({
        confidence: Number(line.confidence ?? 0.7),
        line,
        source: "thin-interior-symbol"
      });
      removedNoiseCount += 1;
      continue;
    }

    if (isLowFillNonUnitLine(line, candidateWalls, structuralBounds)) {
      annotationCandidates.push({
        confidence: Number(line.confidence ?? 0.76),
        line,
        source: "low-fill-non-unit-line"
      });
      removedNoiseCount += 1;
      continue;
    }

    if (
      isOffsetDimensionFromStructuralBounds(line, structuralBounds, options) ||
      isSegmentedOutsideDimensionFromGroup(line, candidateWalls, structuralBounds, options)
    ) {
      dimensionCandidates.push({
        confidence: Number(line.confidence ?? 0.72),
        line,
        source: "offset-dimension-line"
      });
      removedNoiseCount += 1;
      continue;
    }

    walls.push(line);
  }

  const mode = options.mode ?? "balanced";
  const conservativeThreshold = conservativeThicknessThreshold(walls, options);
  const finalWalls =
    mode === "conservative"
      ? walls.filter((line) => {
          const keep = isConservativeWallLine(line, structuralBounds, options, conservativeThreshold);
          if (!keep) {
            annotationCandidates.push({
              confidence: Number(line.confidence ?? 0.68),
              line,
              source: "conservative-uncertain-line"
            });
            removedNoiseCount += 1;
          }

          return keep;
        })
      : mode === "wall-first"
        ? walls.filter((line) => {
            const keep = isWallFirstLine(line, structuralBounds, { ...options, candidateWalls: walls }, conservativeThreshold);
            if (!keep) {
              annotationCandidates.push({
                confidence: Number(line.confidence ?? 0.68),
                line,
                source: "wall-first-non-wall-line"
              });
              removedNoiseCount += 1;
            }

            return keep;
          })
        : walls;
  const mergedWalls = mergeDetectedWallLines(
    finalWalls,
    mode === "wall-first"
      ? {
          ...options,
          gapTolerance:
            options.wallFirstGapTolerance ??
            options.gapTolerance ??
            Math.max(32, Math.round(Math.min(options.width ?? 800, options.height ?? 600) * 0.04)),
          maxLines: options.maxLines ?? 40,
          respectPerpendicularGapMarkers: true
        }
      : options
  );
  const wallFirstCompletion =
    mode === "wall-first" ? wallFirstCompleteAndExtend(mergedWalls, structuralBounds, options) : { adjustedCount: 0, walls: mergedWalls };
  const cleanedWalls = removeContainedDetectedWallFragments(wallFirstCompletion.walls, options);
  removedNoiseCount += wallFirstCompletion.walls.length - cleanedWalls.length;

  return {
    annotationCandidates,
    dimensionCandidates,
    mainPlanBounds: structuralBounds,
    needsReview:
      wallFirstCompletion.adjustedCount > 0 ||
      (mode === "conservative" && cleanedWalls.length === 0) ||
      cleanedWalls.length > 18 ||
      annotationCandidates.length > 8 ||
      candidateWalls.filter((line) => Number(line.thickness ?? 6) <= 2 && !outsideOffsetFromStructuralBounds(line, structuralBounds)).length > 4 ||
      dimensionCandidates.length + annotationCandidates.length > 18,
    removedNoiseCount,
    walls: cleanedWalls
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
    const widthMm = nearGap ? Math.round(lineLength(nearGap) * (input.pixelToMmRatio ?? DEFAULT_PIXEL_TO_MM_RATIO)) : undefined;
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
      widthMm: Math.round(lineLength(line) * (input.pixelToMmRatio ?? DEFAULT_PIXEL_TO_MM_RATIO))
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
              depth: Math.round(Number(nearShape.height ?? 0) * (input.pixelToMmRatio ?? DEFAULT_PIXEL_TO_MM_RATIO)),
              width: Math.round(Number(nearShape.width ?? 0) * (input.pixelToMmRatio ?? DEFAULT_PIXEL_TO_MM_RATIO))
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

function hasPerpendicularGapMarker(lines, firstLine, secondLine, options = {}) {
  if (!options.respectPerpendicularGapMarkers) return false;
  if (lineOrientation(firstLine) !== lineOrientation(secondLine)) return false;

  const orientation = lineOrientation(firstLine);
  const axisTolerance = options.axisTolerance ?? 4;
  const markerTolerance = options.gapMarkerTolerance ?? Math.max(10, axisTolerance * 2);
  const firstBounds = lineBounds(firstLine);
  const secondBounds = lineBounds(secondLine);
  const minThickness = Math.max(3, Math.min(Number(firstLine.thickness ?? 6), Number(secondLine.thickness ?? 6)) * 0.55);

  if (orientation === "horizontal") {
    const gapStart = firstBounds.maxX;
    const gapEnd = secondBounds.minX;
    const axis = Math.round((firstLine.y1 + secondLine.y1) / 2);

    return lines.some((line) => {
      if (line === firstLine || line === secondLine || lineOrientation(line) !== "vertical") return false;
      if (Number(line.thickness ?? 1) < minThickness) return false;
      const bounds = lineBounds(line);
      const markerX = Math.round((line.x1 + line.x2) / 2);
      return (
        markerX >= gapStart - markerTolerance &&
        markerX <= gapEnd + markerTolerance &&
        axis >= bounds.minY - markerTolerance &&
        axis <= bounds.maxY + markerTolerance
      );
    });
  }

  const gapStart = firstBounds.maxY;
  const gapEnd = secondBounds.minY;
  const axis = Math.round((firstLine.x1 + secondLine.x1) / 2);

  return lines.some((line) => {
    if (line === firstLine || line === secondLine || lineOrientation(line) !== "horizontal") return false;
    if (Number(line.thickness ?? 1) < minThickness) return false;
    const bounds = lineBounds(line);
    const markerY = Math.round((line.y1 + line.y2) / 2);
    return (
      markerY >= gapStart - markerTolerance &&
      markerY <= gapEnd + markerTolerance &&
      axis >= bounds.minX - markerTolerance &&
      axis <= bounds.maxX + markerTolerance
    );
  });
}

function runOverlapRatio(runA, runB) {
  const overlap = overlapLength(runA.start, runA.end, runB.start, runB.end);
  const shortest = Math.max(1, Math.min(runA.end - runA.start, runB.end - runB.start));
  return overlap / shortest;
}

function runBalanceRatio(runA, runB) {
  const overlap = overlapLength(runA.start, runA.end, runB.start, runB.end);
  const longest = Math.max(1, Math.max(runA.end - runA.start, runB.end - runB.start));
  return overlap / longest;
}

function createBandLine(band, orientation, options = {}) {
  const thickness = band.maxAxis - band.minAxis + 1;
  const minWallThickness = options.minWallThickness ?? Math.max(3, Math.round(Math.min(options.width ?? 900, options.height ?? 700) * 0.004));
  if (thickness < minWallThickness) return null;

  const starts = band.runs.map((run) => run.start).sort((a, b) => a - b);
  const ends = band.runs.map((run) => run.end).sort((a, b) => a - b);
  const medianIndex = Math.floor(starts.length / 2);
  const start = Math.round(starts[medianIndex]);
  const end = Math.round(ends[medianIndex]);
  if (end - start < (options.minRunLength ?? 24)) return null;

  const axis = Math.round((band.minAxis + band.maxAxis) / 2);
  const confidence = Math.min(0.98, 0.66 + Math.min(0.24, thickness / 40) + Math.min(0.08, band.runs.length / 100));

  if (orientation === "horizontal") {
    return {
      confidence,
      markers: ["wall-band"],
      orientation,
      thickness,
      x1: start,
      x2: end,
      y1: axis,
      y2: axis
    };
  }

  return {
    confidence,
    markers: ["wall-band"],
    orientation,
    thickness,
    x1: axis,
    x2: axis,
    y1: start,
    y2: end
  };
}

function extractWallBandsFromRuns(rows, orientation, options = {}) {
  const minRunLength = options.minRunLength ?? 24;
  const axisGapTolerance = options.bandAxisGapTolerance ?? 1;
  const overlapRatio = options.bandOverlapRatio ?? 0.64;
  // 벽 run과 길이가 크게 다른 run(가구 채움/카운터)은 같은 밴드로 흡수하지 않는다.
  const balanceRatio = options.bandRunBalanceRatio ?? 0.6;
  const bands = [];
  let activeBands = [];

  for (let axis = 0; axis < rows.length; axis += 1) {
    const runs = rows[axis].filter((run) => run.end - run.start + 1 >= minRunLength);
    const nextActiveBands = [];
    const usedBands = new Set();

    for (const run of runs) {
      let bestBand = null;
      let bestOverlap = 0;

      for (const band of activeBands) {
        if (axis - band.maxAxis > axisGapTolerance + 1) continue;
        if (runBalanceRatio(run, band.lastRun) < balanceRatio) continue;
        const candidateOverlap = runOverlapRatio(run, band.lastRun);
        if (candidateOverlap > bestOverlap) {
          bestBand = band;
          bestOverlap = candidateOverlap;
        }
      }

      if (bestBand && bestOverlap >= overlapRatio && !usedBands.has(bestBand)) {
        bestBand.maxAxis = axis;
        bestBand.lastRun = run;
        bestBand.runs.push(run);
        nextActiveBands.push(bestBand);
        usedBands.add(bestBand);
      } else {
        const band = { lastRun: run, maxAxis: axis, minAxis: axis, runs: [run] };
        nextActiveBands.push(band);
        usedBands.add(band);
      }
    }

    for (const band of activeBands) {
      if (!usedBands.has(band) && axis - band.maxAxis > axisGapTolerance) {
        bands.push(band);
      } else if (!nextActiveBands.includes(band)) {
        nextActiveBands.push(band);
      }
    }

    activeBands = nextActiveBands;
  }

  bands.push(...activeBands);

  return bands
    .map((band) => createBandLine(band, orientation, options))
    .filter(Boolean);
}

export function detectWallBandLinesFromMask(mask, options = {}) {
  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;
  const minRunLength = options.minRunLength ?? Math.max(24, Math.round(Math.min(width, height) * 0.06));
  if (width <= 0 || height <= 0 || !Array.isArray(mask)) return [];

  const horizontalRows = Array.from({ length: height }, () => []);
  const verticalRows = Array.from({ length: width }, () => []);

  for (let y = 0; y < height; y += 1) {
    let runStart = null;
    for (let x = 0; x <= width; x += 1) {
      const isWall = x < width && Boolean(mask[y * width + x]);
      if (isWall && runStart === null) runStart = x;
      if ((!isWall || x === width) && runStart !== null) {
        horizontalRows[y].push({ end: x - 1, start: runStart });
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
        verticalRows[x].push({ end: y - 1, start: runStart });
        runStart = null;
      }
    }
  }

  return [
    ...extractWallBandsFromRuns(horizontalRows, "horizontal", { ...options, minRunLength }),
    ...extractWallBandsFromRuns(verticalRows, "vertical", { ...options, minRunLength })
  ];
}

export function mergeDetectedWallLines(lines, options = {}) {
  const axisTolerance = options.axisTolerance ?? 4;
  const gapTolerance = options.gapTolerance ?? 12;
  const minLength = options.minLength ?? 24;
  const maxLines = options.maxLines ?? 24;
  const normalized = lines
    .map((line) => {
      const orientation = lineOrientation(line);
      const metadata = {};
      if (line.confidence !== undefined) metadata.confidence = line.confidence;
      if (line.fillSupport !== undefined) metadata.fillSupport = line.fillSupport;
      if (line.markers !== undefined) metadata.markers = line.markers;
      if (line.thickness !== undefined) metadata.thickness = line.thickness;

      if (orientation === "horizontal") {
        const x1 = Math.min(line.x1, line.x2);
        const x2 = Math.max(line.x1, line.x2);
        const y = Math.round((line.y1 + line.y2) / 2);
        return {
          ...metadata,
          orientation,
          x1,
          x2,
          y1: y,
          y2: y
        };
      }

      const y1 = Math.min(line.y1, line.y2);
      const y2 = Math.max(line.y1, line.y2);
      const x = Math.round((line.x1 + line.x2) / 2);
      return {
        ...metadata,
        orientation,
        x1: x,
        x2: x,
        y1,
        y2
      };
    })
    .filter((line) => lineLength(line) >= minLength)
    .sort((lineA, lineB) => {
      if (lineA.orientation !== lineB.orientation) return lineA.orientation === "horizontal" ? -1 : 1;
      const axisA = lineA.orientation === "horizontal" ? lineA.y1 : lineA.x1;
      const axisB = lineB.orientation === "horizontal" ? lineB.y1 : lineB.x1;
      const startA = lineA.orientation === "horizontal" ? lineA.x1 : lineA.y1;
      const startB = lineB.orientation === "horizontal" ? lineB.x1 : lineB.y1;
      if (Math.abs(axisA - axisB) <= axisTolerance && startA !== startB) return startA - startB;
      if (axisA !== axisB) return axisA - axisB;
      return startA - startB;
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
      if (sameAxis && closeGap && !hasPerpendicularGapMarker(normalized, previous, line, options)) {
        const weight = previous.weight + 1;
        const y = Math.round((previous.y1 * previous.weight + line.y1) / weight);
        previous.x1 = Math.min(previous.x1, line.x1);
        previous.x2 = Math.max(previous.x2, line.x2);
        previous.y1 = y;
        previous.y2 = y;
        previous.thickness = Math.max(Number(previous.thickness ?? previous.weight), Number(line.thickness ?? 1), weight);
        if (Number.isFinite(Number(previous.fillSupport)) || Number.isFinite(Number(line.fillSupport))) {
          previous.fillSupport = Math.max(Number(previous.fillSupport ?? 0), Number(line.fillSupport ?? 0));
        }
        previous.weight = weight;
        continue;
      }
    } else {
      const sameAxis = Math.abs(previous.x1 - line.x1) <= axisTolerance;
      const closeGap = line.y1 - previous.y2 <= gapTolerance;
      if (sameAxis && closeGap && !hasPerpendicularGapMarker(normalized, previous, line, options)) {
        const weight = previous.weight + 1;
        const x = Math.round((previous.x1 * previous.weight + line.x1) / weight);
        previous.y1 = Math.min(previous.y1, line.y1);
        previous.y2 = Math.max(previous.y2, line.y2);
        previous.x1 = x;
        previous.x2 = x;
        previous.thickness = Math.max(Number(previous.thickness ?? previous.weight), Number(line.thickness ?? 1), weight);
        if (Number.isFinite(Number(previous.fillSupport)) || Number.isFinite(Number(line.fillSupport))) {
          previous.fillSupport = Math.max(Number(previous.fillSupport ?? 0), Number(line.fillSupport ?? 0));
        }
        previous.weight = weight;
        continue;
      }
    }

    merged.push({ ...line, weight: 1 });
  }

  return limitDetectedWallCandidates(
    merged.map(({ weight, ...line }) => ({
      ...line,
      thickness: Math.max(Number(line.thickness ?? 1), Number(weight ?? 1))
    })),
    { maxLines }
  );
}

export function detectWallLinesFromMask(mask, options = {}) {
  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;
  const minRunLength = options.minRunLength ?? Math.max(24, Math.round(Math.min(width, height) * 0.08));
  const lines = [];

  if (width <= 0 || height <= 0 || !Array.isArray(mask)) return lines;

  const bandLines = detectWallBandLinesFromMask(mask, { ...options, height, minRunLength, width });
  if (bandLines.length >= 3) {
    return limitDetectedWallCandidates(
      mergeDetectedWallLines(bandLines, {
        ...options,
        axisTolerance: Math.max(options.axisTolerance ?? 4, 6),
        gapTolerance: options.gapTolerance ?? 2,
        minLength: options.minLength ?? minRunLength
      }),
      options
    );
  }

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

function buildLuminanceMask(imageData, threshold) {
  const { data } = imageData;
  return Array.from({ length: imageData.width * imageData.height }, (_, index) => {
    const offset = index * 4;
    const red = data[offset] ?? 255;
    const green = data[offset + 1] ?? 255;
    const blue = data[offset + 2] ?? 255;
    const alpha = data[offset + 3] ?? 255;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    return alpha > 24 && luminance < threshold;
  });
}

// 어두운 픽셀 분포를 둘로 나눠(Otsu) 순흑 벽과 진회색 가구 채움(싱크대 상판 등)을
// 분리할 수 있으면 벽 쪽 임계값을 돌려준다. 분리가 불확실하면 baseThreshold 유지.
export function estimateWallLuminanceThreshold(imageData, options = {}) {
  const baseThreshold = Math.round(options.baseThreshold ?? 128);
  const data = imageData?.data;
  const pixelCount = (imageData?.width ?? 0) * (imageData?.height ?? 0);
  if (!data || pixelCount <= 0) return baseThreshold;

  const histogram = new Array(Math.max(1, baseThreshold)).fill(0);
  let darkTotal = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    if ((data[offset + 3] ?? 255) <= 24) continue;
    const luminance = Math.round(
      (data[offset] ?? 255) * 0.2126 + (data[offset + 1] ?? 255) * 0.7152 + (data[offset + 2] ?? 255) * 0.0722
    );
    if (luminance >= baseThreshold) continue;
    histogram[luminance] += 1;
    darkTotal += 1;
  }

  if (darkTotal < Math.max(400, Math.round(pixelCount * 0.002))) return baseThreshold;

  let totalSum = 0;
  for (let luminance = 0; luminance < baseThreshold; luminance += 1) totalSum += luminance * histogram[luminance];

  let weightDarker = 0;
  let sumDarker = 0;
  let bestVariance = 0;
  let bestSplit = null;

  for (let luminance = 0; luminance < baseThreshold; luminance += 1) {
    weightDarker += histogram[luminance];
    sumDarker += luminance * histogram[luminance];
    if (!weightDarker) continue;
    const weightLighter = darkTotal - weightDarker;
    if (!weightLighter) break;
    const meanDarker = sumDarker / weightDarker;
    const meanLighter = (totalSum - sumDarker) / weightLighter;
    const variance = weightDarker * weightLighter * (meanDarker - meanLighter) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestSplit = { meanDarker, meanLighter, weightDarker, weightLighter };
    }
  }

  if (!bestSplit) return baseThreshold;

  const separation = bestSplit.meanLighter - bestSplit.meanDarker;
  const darkerRatio = bestSplit.weightDarker / darkTotal;
  const lighterRatio = bestSplit.weightLighter / darkTotal;
  // 벽(가장 어두운 계층)이 지배적이고 두 계층이 뚜렷이 떨어져 있을 때만 낮춘다.
  if (separation < (options.minClassSeparation ?? 26)) return baseThreshold;
  if (darkerRatio < (options.minDarkerRatio ?? 0.3) || lighterRatio < (options.minLighterRatio ?? 0.05)) {
    return baseThreshold;
  }

  return Math.max(32, Math.min(baseThreshold, Math.round((bestSplit.meanDarker + bestSplit.meanLighter) / 2)));
}

// 문설주·짧은 벽·샤프트 같은 짧고 두꺼운 세그먼트는 기본 minRunLength에서 소실되므로
// 두께 조건을 강화한 짧은 run 기준으로 한 번 더 추출해 보강한다.
function recoverShortWallBandLines(mask, primaryLines, options = {}) {
  const width = Number(options.width) || 0;
  const height = Number(options.height) || 0;
  const primaryMinRunLength = options.minRunLength ?? Math.max(24, Math.round(Math.min(width, height) * 0.06));
  const shortMinRunLength =
    options.shortSegmentMinRunLength ?? Math.max(20, Math.round(Math.min(width, height) * 0.025));
  if (shortMinRunLength >= primaryMinRunLength) return primaryLines;

  const shortLines = detectWallBandLinesFromMask(mask, {
    ...options,
    height,
    minRunLength: shortMinRunLength,
    minWallThickness: Math.max(options.shortSegmentMinThickness ?? 5, options.minWallThickness ?? 3),
    width
  })
    .filter((line) => lineLength(line) < primaryMinRunLength)
    .map((line) => ({ ...line, markers: [...(line.markers ?? []), "short-wall-recovered"] }));

  if (!shortLines.length) return primaryLines;

  return removeContainedDetectedWallFragments([...primaryLines, ...shortLines], options);
}

export function detectWallLinesFromImageData(imageData, options = {}) {
  const width = imageData?.width ?? 0;
  const height = imageData?.height ?? 0;
  const data = imageData?.data;
  const darkThreshold = options.darkThreshold ?? 170;
  const strictLineThreshold = Math.min(darkThreshold, options.strictLineThreshold ?? 128);

  if (!data || width <= 0 || height <= 0) return [];

  const cleanMask = (mask) =>
    removeSmallWallComponents(mask, {
      height,
      minArea: options.minComponentArea ?? Math.max(16, Math.round((width * height) / 20000)),
      width
    });

  if (options.strictLineMask) {
    const bandOptions = {
      ...options,
      bandAxisGapTolerance: options.bandAxisGapTolerance ?? 2,
      bandOverlapRatio: options.bandOverlapRatio ?? 0.5,
      height,
      minWallThickness: options.minWallThickness ?? 3,
      width
    };
    const wallThreshold = estimateWallLuminanceThreshold(imageData, { baseThreshold: strictLineThreshold });
    let cleanedMask = cleanMask(buildLuminanceMask(imageData, wallThreshold));
    let bandLines = detectWallBandLinesFromMask(cleanedMask, bandOptions);

    // 적응 임계값이 벽까지 지워버린 경우(밴드 부족) 원래 임계값으로 되돌린다.
    if (wallThreshold < strictLineThreshold && bandLines.length < 3) {
      cleanedMask = cleanMask(buildLuminanceMask(imageData, strictLineThreshold));
      bandLines = detectWallBandLinesFromMask(cleanedMask, bandOptions);
    }

    return annotateLinesWithFillSupport(recoverShortWallBandLines(cleanedMask, bandLines, bandOptions), imageData);
  }

  const cleanedMask = cleanMask(buildLuminanceMask(imageData, darkThreshold));

  return annotateLinesWithFillSupport(detectWallLinesFromMask(cleanedMask, { ...options, width, height }), imageData);
}

function isFilledInteriorImagePixel(imageData, x, y) {
  const width = imageData?.width ?? 0;
  const height = imageData?.height ?? 0;
  const data = imageData?.data;
  if (!data || x < 0 || y < 0 || x >= width || y >= height) return false;

  const offset = (Math.round(y) * width + Math.round(x)) * 4;
  const red = data[offset] ?? 255;
  const green = data[offset + 1] ?? 255;
  const blue = data[offset + 2] ?? 255;
  const alpha = data[offset + 3] ?? 255;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const nearWhite = red > 238 && green > 238 && blue > 238 && colorSpread < 18;

  return alpha > 24 && luminance >= 75 && luminance <= 246 && !nearWhite;
}

function measureLineFillSupportFromImage(line, imageData) {
  const length = Math.max(1, lineLength(line));
  const sampleCount = Math.max(8, Math.min(90, Math.round(length / 7)));
  const sideOffset = Math.max(8, Math.round(Number(line.thickness ?? 4) * 1.6));
  let positive = 0;
  let negative = 0;

  for (let index = 0; index <= sampleCount; index += 1) {
    const ratio = index / sampleCount;
    const x = line.x1 + (line.x2 - line.x1) * ratio;
    const y = line.y1 + (line.y2 - line.y1) * ratio;

    if (lineOrientation(line) === "horizontal") {
      if (isFilledInteriorImagePixel(imageData, x, y + sideOffset)) positive += 1;
      if (isFilledInteriorImagePixel(imageData, x, y - sideOffset)) negative += 1;
    } else {
      if (isFilledInteriorImagePixel(imageData, x + sideOffset, y)) positive += 1;
      if (isFilledInteriorImagePixel(imageData, x - sideOffset, y)) negative += 1;
    }
  }

  return Math.round((Math.max(positive, negative) / (sampleCount + 1)) * 1000) / 1000;
}

function annotateLinesWithFillSupport(lines, imageData) {
  return (lines ?? []).map((line) => ({
    ...line,
    fillSupport: measureLineFillSupportFromImage(line, imageData)
  }));
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizedPointToPixel(point, imageData) {
  const width = Math.max(1, Number(imageData?.width) || 1);
  const height = Math.max(1, Number(imageData?.height) || 1);

  return {
    x: (clampNumber(Number(point?.x) || 0, 0, 1000) / 1000) * (width - 1),
    y: (clampNumber(Number(point?.y) || 0, 0, 1000) / 1000) * (height - 1)
  };
}

function normalizedLineToPixel(line, imageData) {
  const start = normalizedPointToPixel({ x: line?.x1, y: line?.y1 }, imageData);
  const end = normalizedPointToPixel({ x: line?.x2, y: line?.y2 }, imageData);
  const orientation = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? "horizontal" : "vertical";

  if (orientation === "horizontal") {
    const y = Math.round((start.y + end.y) / 2);
    return {
      orientation,
      x1: Math.round(Math.min(start.x, end.x)),
      x2: Math.round(Math.max(start.x, end.x)),
      y1: y,
      y2: y
    };
  }

  const x = Math.round((start.x + end.x) / 2);
  return {
    orientation,
    x1: x,
    x2: x,
    y1: Math.round(Math.min(start.y, end.y)),
    y2: Math.round(Math.max(start.y, end.y))
  };
}

function pixelLineToNormalized(line, imageData) {
  const width = Math.max(1, Number(imageData?.width) || 1);
  const height = Math.max(1, Number(imageData?.height) || 1);

  return {
    x1: (line.x1 / Math.max(1, width - 1)) * 1000,
    x2: (line.x2 / Math.max(1, width - 1)) * 1000,
    y1: (line.y1 / Math.max(1, height - 1)) * 1000,
    y2: (line.y2 / Math.max(1, height - 1)) * 1000
  };
}

function imagePixelLuminance(imageData, x, y) {
  const width = imageData?.width ?? 0;
  const height = imageData?.height ?? 0;
  const data = imageData?.data;
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  if (!data || roundedX < 0 || roundedY < 0 || roundedX >= width || roundedY >= height) return 255;

  const offset = (roundedY * width + roundedX) * 4;
  const red = data[offset] ?? 255;
  const green = data[offset + 1] ?? 255;
  const blue = data[offset + 2] ?? 255;

  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function scoreDarkAxis(line, imageData, axis, darkThreshold) {
  const orientation = lineOrientation(line);
  const length = Math.max(1, lineLength(line));
  const sampleCount = Math.max(12, Math.min(240, Math.round(length)));
  let dark = 0;

  for (let index = 0; index <= sampleCount; index += 1) {
    const ratio = index / sampleCount;
    const x = orientation === "horizontal" ? line.x1 + (line.x2 - line.x1) * ratio : axis;
    const y = orientation === "horizontal" ? axis : line.y1 + (line.y2 - line.y1) * ratio;
    if (imagePixelLuminance(imageData, x, y) <= darkThreshold) dark += 1;
  }

  return dark / (sampleCount + 1);
}

export function snapNormalizedLineToWallEvidence(line, imageData, options = {}) {
  if (!imageData?.data || !imageData.width || !imageData.height) return null;

  const pixelLine = normalizedLineToPixel(line, imageData);
  const orientation = lineOrientation(pixelLine);
  const minDimension = Math.max(1, Math.min(imageData.width, imageData.height));
  const searchRadius = Math.max(2, Math.round(Number(options.searchRadiusPx) || minDimension * 0.03));
  const darkThreshold = Number(options.darkThreshold) || estimateWallLuminanceThreshold(imageData);
  const minConfidence = Number(options.minConfidence) || 0.18;
  const baseAxis = orientation === "horizontal" ? pixelLine.y1 : pixelLine.x1;
  let bestAxis = baseAxis;
  let bestScore = 0;

  for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
    const axis = Math.round(baseAxis + offset);
    if (axis < 0 || axis >= (orientation === "horizontal" ? imageData.height : imageData.width)) continue;
    const score = scoreDarkAxis(pixelLine, imageData, axis, darkThreshold);
    if (score > bestScore) {
      bestAxis = axis;
      bestScore = score;
    }
  }

  if (bestScore < minConfidence) return null;

  let minAxis = bestAxis;
  let maxAxis = bestAxis;
  const thicknessThreshold = Math.max(0.08, bestScore * 0.45);
  for (let axis = bestAxis - 1; axis >= bestAxis - searchRadius; axis -= 1) {
    if (axis < 0 || scoreDarkAxis(pixelLine, imageData, axis, darkThreshold) < thicknessThreshold) break;
    minAxis = axis;
  }
  const axisLimit = orientation === "horizontal" ? imageData.height : imageData.width;
  for (let axis = bestAxis + 1; axis <= bestAxis + searchRadius; axis += 1) {
    if (axis >= axisLimit || scoreDarkAxis(pixelLine, imageData, axis, darkThreshold) < thicknessThreshold) break;
    maxAxis = axis;
  }
  const snappedAxis = Math.round((minAxis + maxAxis) / 2);

  const snappedLine =
    orientation === "horizontal"
      ? {
          confidence: Math.min(0.98, bestScore),
          markers: ["ai-wall-evidence"],
          orientation,
          thickness: Math.max(1, maxAxis - minAxis + 1),
          x1: clampNumber(pixelLine.x1, 0, imageData.width - 1),
          x2: clampNumber(pixelLine.x2, 0, imageData.width - 1),
          y1: snappedAxis,
          y2: snappedAxis
        }
      : {
          confidence: Math.min(0.98, bestScore),
          markers: ["ai-wall-evidence"],
          orientation,
          thickness: Math.max(1, maxAxis - minAxis + 1),
          x1: snappedAxis,
          x2: snappedAxis,
          y1: clampNumber(pixelLine.y1, 0, imageData.height - 1),
          y2: clampNumber(pixelLine.y2, 0, imageData.height - 1)
        };

  return snappedLine;
}

function roomPolygonEdgesToPixelLines(rooms = [], imageData) {
  return rooms.flatMap((room, roomIndex) => {
    const polygon = Array.isArray(room?.polygon) ? room.polygon : [];
    if (polygon.length < 4) return [];
    const points = polygon.map((point) => normalizedPointToPixel(point, imageData));

    return points.flatMap((point, index) => {
      const next = points[(index + 1) % points.length];
      const dx = Math.abs(next.x - point.x);
      const dy = Math.abs(next.y - point.y);
      if (dx < 1 && dy < 1) return [];
      const orientation = dx >= dy ? "horizontal" : "vertical";
      if (orientation === "horizontal") {
        const y = Math.round((point.y + next.y) / 2);
        return [
          {
            confidence: Number(room?.confidence) || 0.5,
            markers: ["ai-room-edge"],
            orientation,
            roomIndex,
            x1: Math.round(Math.min(point.x, next.x)),
            x2: Math.round(Math.max(point.x, next.x)),
            y1: y,
            y2: y
          }
        ];
      }

      const x = Math.round((point.x + next.x) / 2);
      return [
        {
          confidence: Number(room?.confidence) || 0.5,
          markers: ["ai-room-edge"],
          orientation,
          roomIndex,
          x1: x,
          x2: x,
          y1: Math.round(Math.min(point.y, next.y)),
          y2: Math.round(Math.max(point.y, next.y))
        }
      ];
    });
  });
}

function mergeCollinearPixelLines(lines, options = {}) {
  const axisTolerance = options.axisTolerance ?? 4;
  const overlapTolerance = options.overlapTolerance ?? 8;
  const merged = [];

  for (const line of [...lines].sort((lineA, lineB) => lineOrientation(lineA).localeCompare(lineOrientation(lineB)) || lineLength(lineB) - lineLength(lineA))) {
    const orientation = lineOrientation(line);
    const bounds = lineBounds(line);
    const match = merged.find((candidate) => {
      if (lineOrientation(candidate) !== orientation) return false;
      const candidateBounds = lineBounds(candidate);
      if (orientation === "horizontal") {
        if (Math.abs(candidate.y1 - line.y1) > axisTolerance) return false;
        return bounds.minX <= candidateBounds.maxX + overlapTolerance && bounds.maxX >= candidateBounds.minX - overlapTolerance;
      }

      if (Math.abs(candidate.x1 - line.x1) > axisTolerance) return false;
      return bounds.minY <= candidateBounds.maxY + overlapTolerance && bounds.maxY >= candidateBounds.minY - overlapTolerance;
    });

    if (!match) {
      merged.push({ ...line });
      continue;
    }

    const matchBounds = lineBounds(match);
    if (orientation === "horizontal") {
      const y = Math.round((match.y1 + line.y1) / 2);
      match.x1 = Math.min(matchBounds.minX, bounds.minX);
      match.x2 = Math.max(matchBounds.maxX, bounds.maxX);
      match.y1 = y;
      match.y2 = y;
    } else {
      const x = Math.round((match.x1 + line.x1) / 2);
      match.x1 = x;
      match.x2 = x;
      match.y1 = Math.min(matchBounds.minY, bounds.minY);
      match.y2 = Math.max(matchBounds.maxY, bounds.maxY);
    }
    match.confidence = Math.max(Number(match.confidence) || 0, Number(line.confidence) || 0);
  }

  return merged;
}

export function createWallCandidatesFromRoomPolygons(rooms = [], imageData, options = {}) {
  if (!imageData?.width || !imageData.height) return [];

  const minLength = options.minLength ?? Math.max(8, Math.min(imageData.width, imageData.height) * 0.04);
  const mergedLines = mergeCollinearPixelLines(roomPolygonEdgesToPixelLines(rooms, imageData), options).filter((line) => lineLength(line) >= minLength);

  return mergedLines
    .map((line) => {
      const snappedLine = imageData?.data
        ? snapNormalizedLineToWallEvidence(pixelLineToNormalized(line, imageData), imageData, {
            darkThreshold: options.darkThreshold,
            minConfidence: options.minEvidenceConfidence,
            searchRadiusPx: options.searchRadiusPx
          })
        : null;
      const nextLine = snappedLine
        ? {
            ...snappedLine,
            confidence: Math.max(Number(line.confidence) || 0.5, Number(snappedLine.confidence) || 0),
            markers: ["ai-room-edge", ...(snappedLine.markers ?? [])]
          }
        : {
            ...line,
            confidence: Math.max(0.35, Math.min(0.95, Number(line.confidence) || 0.5)),
            markers: ["ai-room-edge"],
            thickness: Number(line.thickness) || 1
          };

      return nextLine;
    })
    .filter((line) => lineLength(line) >= minLength);
}

export function createWallsFromDetectedLines(lines, plan = {}) {
  const imageWidth = Math.max(1, Number(plan.width) || 960);
  const imageHeight = Math.max(1, Number(plan.height) || 620);
  const canvasWidth = Math.max(1, Number(plan.canvasWidth) || 1600);
  const canvasHeight = Math.max(1, Number(plan.canvasHeight) || 1200);
  const imageFillRatio = Math.max(0.1, Math.min(1, Number(plan.imageFillRatio) || 0.8));
  const imageAspect = imageWidth / imageHeight;
  const canvasAspect = canvasWidth / canvasHeight;
  let drawWidth = canvasWidth * imageFillRatio;
  let drawHeight = drawWidth / imageAspect;
  if (imageAspect <= canvasAspect) {
    drawHeight = canvasHeight * imageFillRatio;
    drawWidth = drawHeight * imageAspect;
  }
  const scale = drawWidth / imageWidth;
  const offsetX = -drawWidth / 2;
  const offsetY = -drawHeight / 2;
  const baseId = normalizePlanName(plan.name) || "detected";
  const cleanedLines = removeContainedDetectedWallFragments(lines, {
    axisTolerance: plan.axisTolerance ?? 5,
    containedRangeTolerance: plan.containedRangeTolerance ?? 10
  });

  return cleanedLines
    .filter((line) => lineLength(line) > 0)
    .slice(0, Math.max(1, Number(plan.maxWalls) || 32))
    .map((line, index) =>
      createDetectedWall(
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
