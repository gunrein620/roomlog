import { normalizePlanName, snapToOrthogonal } from "../room-model/wall-model.mjs";

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

function inferStructuralBounds(lines, options = {}) {
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

  const bounds = sourceLines.map(lineBounds);

  return {
    maxX: Math.max(...bounds.map((bound) => bound.maxX)),
    maxY: Math.max(...bounds.map((bound) => bound.maxY)),
    minX: Math.min(...bounds.map((bound) => bound.minX)),
    minY: Math.min(...bounds.map((bound) => bound.minY))
  };
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
  const walls = [];

  for (const line of candidateWalls) {
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
  const finalWalls =
    mode === "conservative"
      ? walls.filter((line) => {
          const keep = isConservativeWallLine(line, structuralBounds, options, conservativeThicknessThreshold(walls, options));
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
      : walls;
  const mergedWalls = mergeDetectedWallLines(finalWalls, options);
  const cleanedWalls = removeContainedDetectedWallFragments(mergedWalls, options);
  removedNoiseCount += mergedWalls.length - cleanedWalls.length;

  return {
    annotationCandidates,
    dimensionCandidates,
    mainPlanBounds: structuralBounds,
    needsReview:
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

function runOverlapRatio(runA, runB) {
  const overlap = overlapLength(runA.start, runA.end, runB.start, runB.end);
  const shortest = Math.max(1, Math.min(runA.end - runA.start, runB.end - runB.start));
  return overlap / shortest;
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
      if (sameAxis && closeGap) {
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
    .slice(0, 24)
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
