// 치수 줄(row) 클러스터링 + 체인 배치 — 순수 로직(테스트 대상).
//
// 한국 상세 도면은 한 변(위/아래/좌/우)에 치수줄이 여러 겹 중첩된다.
// 예: 위쪽에 전체줄 [10720]과 구간줄 [3040,1440,3120,3120]이 동시에 있다.
// 이 둘을 한 덩어리로 묶으면 합이 전체의 2배가 되어 체인이 깨지므로,
// 합산 체인을 풀기 전에 라벨의 수직 위치로 먼저 "줄"을 갈라낸다.
//
// 좌표 규약:
//   perpCoord  = 치수 축에 수직인 위치(= 줄 정체성). 가로 치수면 라벨 y, 세로 치수면 라벨 x.
//   alongCoord = 치수 축을 따르는 위치(= 줄 안에서의 순서). 가로 치수면 라벨 x, 세로 치수면 라벨 y.
//   둘 다 임의 단위(0~1000 정규화든 px든 무관). 상대 비교만 한다.

// perpCoord가 서로 tolerance 이내로 붙은 치수끼리 한 줄로 묶는다.
export function clusterDimensionRows(chips = [], perpTolerance = 15) {
  const sorted = [...chips].filter((chip) => Number.isFinite(chip.perpCoord)).sort((a, b) => a.perpCoord - b.perpCoord);
  const rows = [];
  let current = [];
  let lastPerp = null;
  for (const chip of sorted) {
    if (lastPerp !== null && chip.perpCoord - lastPerp > perpTolerance) {
      rows.push(current);
      current = [];
    }
    current.push(chip);
    lastPerp = chip.perpCoord;
  }
  if (current.length) rows.push(current);

  return rows;
}

// 각 줄을 검사해서, 값의 합이 전체 폭과 일치하는 체인(또는 단일 전체 치수)만 배치한다.
// 반환: Map<chipId, { startMm, endMm }> — 도면 시작(외벽 안쪽면)으로부터의 mm 오프셋.
// 합이 전체와 안 맞는 줄은 넣지 않는다(호출측이 개별 앵커로 폴백).
export function solveDimensionRowChains(chips = [], planSpanMm = 0, options = {}) {
  const spanTolerance = options.spanTolerance ?? 0.05;
  const perpTolerance = options.perpTolerance ?? 15;
  const minChipsForChain = options.minChipsForChain ?? 2;
  const result = new Map();
  if (!(planSpanMm > 0)) return result;

  const usable = chips.filter((chip) => chip && chip.id != null && chip.realLengthMm > 0 && Number.isFinite(chip.alongCoord));

  // 값이 전체 폭과 일치하는 치수는 "전체 치수"로 먼저 빼낸다. 세로 도면처럼 전체 치수선과
  // 구간 치수선이 바짝 붙어 있어 위치로는 안 갈라지는 경우에도 총치수가 구간과 안 섞이게 한다.
  const totals = usable.filter((chip) => Math.abs(chip.realLengthMm - planSpanMm) / planSpanMm <= spanTolerance);
  for (const chip of totals) result.set(chip.id, { endMm: planSpanMm, startMm: 0 });
  const remaining = usable.filter((chip) => !result.has(chip.id));

  // E: 세로 여백은 여러 컬럼(방 높이들)이 겹쳐 있어 한 컬럼의 구간 합이 전체와 안 맞는 경우가 많다.
  // 그런 부분 체인도 도면 가장자리(위/아래·좌/우)에 붙어 있으면 그 끝에 앵커해 배치한다.
  const allowEdgeAnchoredPartial = options.allowEdgeAnchoredPartial === true;
  const alongStart = Number.isFinite(options.alongStart) ? options.alongStart : null;
  const alongEnd = Number.isFinite(options.alongEnd) ? options.alongEnd : null;
  // 라벨은 세그먼트 중앙에 찍히므로 가장자리 세그먼트여도 라벨은 반세그먼트만큼 안쪽이다.
  // 그만큼 여유를 둔 0.2를 기본으로 한다.
  const edgeFraction = options.edgeFraction ?? 0.2;
  const alongRange = alongStart !== null && alongEnd !== null && alongEnd > alongStart ? alongEnd - alongStart : null;

  // 부분 체인은 비례보정 없이 실제 길이 그대로, 앵커 지점(cursorStart)부터 이어 붙인다.
  const layoutPartialChain = (ordered, cursorStart) => {
    let cursor = cursorStart;
    ordered.forEach((chip) => {
      const endMm = cursor + chip.realLengthMm;
      result.set(chip.id, { endMm, startMm: cursor });
      cursor = endMm;
    });
  };

  for (const row of clusterDimensionRows(remaining, perpTolerance)) {
    const ordered = [...row].sort((a, b) => a.alongCoord - b.alongCoord);
    const sumMm = ordered.reduce((sum, chip) => sum + chip.realLengthMm, 0);
    if (sumMm <= 0) continue;
    const matchesSpan = Math.abs(sumMm - planSpanMm) / planSpanMm <= spanTolerance;

    if (ordered.length === 1) {
      // 단일 치수가 전체 폭과 일치하면 그게 전체 치수줄이다.
      if (matchesSpan) result.set(ordered[0].id, { endMm: planSpanMm, startMm: 0 });
      continue;
    }
    if (ordered.length < minChipsForChain) continue;

    if (matchesSpan) {
      // 전체를 덮는 체인: 합이 전체와 몇 % 어긋나도 전체 폭에 정확히 맞물리게 비례 보정.
      const scale = planSpanMm / sumMm;
      let cursor = 0;
      ordered.forEach((chip, index) => {
        const isLast = index === ordered.length - 1;
        const endMm = isLast ? planSpanMm : cursor + chip.realLengthMm * scale;
        result.set(chip.id, { endMm, startMm: cursor });
        cursor = endMm;
      });
      continue;
    }

    // E: 부분 체인 — 가장자리에 붙어 있고 전체보다 짧을 때만 그 끝에 앵커.
    if (allowEdgeAnchoredPartial && alongRange && sumMm < planSpanMm) {
      const firstAlong = ordered[0].alongCoord;
      const lastAlong = ordered[ordered.length - 1].alongCoord;
      const nearStart = (firstAlong - alongStart) / alongRange < edgeFraction;
      const nearEnd = (alongEnd - lastAlong) / alongRange < edgeFraction;
      if (nearStart) layoutPartialChain(ordered, 0);
      else if (nearEnd) layoutPartialChain(ordered, planSpanMm - sumMm);
    }
  }

  return result;
}

// 배치된 체인/전체 치수의 경계(도면 시작 기준 mm 오프셋)를 모은다. 인접 경계는 mergeToleranceMm 이내면 합친다.
// 이 경계들이 곧 "벽이 있어야 할 자리"다 — 가로 치수면 세로벽의 x, 세로 치수면 가로벽의 y.
export function structuralBoundaryOffsetsMm(chips = [], planSpanMm = 0, options = {}) {
  if (!(planSpanMm > 0)) return [];
  const layout = solveDimensionRowChains(chips, planSpanMm, options);
  const offsets = new Set([0, Math.round(planSpanMm)]);
  for (const { startMm, endMm } of layout.values()) {
    offsets.add(Math.round(startMm));
    offsets.add(Math.round(endMm));
  }
  const mergeToleranceMm = options.mergeToleranceMm ?? 30;
  const sorted = [...offsets].sort((a, b) => a - b);
  const merged = [];
  for (const offset of sorted) {
    if (!merged.length || offset - merged[merged.length - 1] > mergeToleranceMm) merged.push(offset);
  }

  return merged;
}

// 픽셀 검출 축척 샘플을 벽 union 기반 "기대 축척"으로 교차검증한다.
// 기대 축척과 tolerance(기본 30%) 넘게 벗어난 샘플은 오검출(짧은 선 오인 등)이므로 버린다.
// 기대 축척이 없으면(벽 탐지 전) 원본을 그대로 둔다. 게이트 후 하나도 안 남으면 빈 배열
// (→ 호출측이 union 기반 축척으로 폴백하게).
/**
 * @param {Array<{ratio:number}>} samples
 * @param {number|null} expectedRatio
 * @param {number} [tolerance]
 */
export function filterRatioSamplesNearExpected(samples = [], expectedRatio = null, tolerance = 0.3) {
  if (!(expectedRatio > 0)) return samples;

  return samples.filter((sample) => Math.abs(sample.ratio - expectedRatio) / expectedRatio <= tolerance);
}

// 여러 소스(검출된 치수선 끝점 + 체인 산술)에서 모은 경계 좌표를 정렬·병합한다.
// tolerance 이내로 붙은 좌표는 한 경계로 평균낸다.
export function mergeCoordinates(coords = [], tolerance = 6) {
  const sorted = [...coords].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const merged = [];
  let bucket = [];
  for (const value of sorted) {
    if (!bucket.length || value - bucket[bucket.length - 1] <= tolerance) bucket.push(value);
    else {
      merged.push(bucket.reduce((sum, v) => sum + v, 0) / bucket.length);
      bucket = [value];
    }
  }
  if (bucket.length) merged.push(bucket.reduce((sum, v) => sum + v, 0) / bucket.length);

  return merged;
}

// 벽 세그먼트의 교차좌표(세로벽=x, 가로벽=y)를 가장 가까운 구조 경계선으로 스냅한다.
// boundaries: { verticalLineX: number[](세로벽이 놓일 x), horizontalLineY: number[](가로벽이 놓일 y) } — 캔버스 좌표.
// 구조 치수 경계만 넘겨야 한다(가구/opening/면적 제외는 호출측 책임).
export function snapWallsToStructuralBoundaries(walls = [], boundaries = {}, tolerancePx = 30, options = {}) {
  const verticalLineX = [...(boundaries.verticalLineX ?? [])].sort((a, b) => a - b);
  const horizontalLineY = [...(boundaries.horizontalLineY ?? [])].sort((a, b) => a - b);
  // 치수 경계는 벽 "면"을 가리키는데 벽은 중심선이다. 외곽 경계에 스냅하는 외벽은
  // 중심선을 반두께만큼 안쪽으로 밀어야 벽 면이 치수선에 맞는다(3D 순치수가 도면과 일치).
  const applyFaceOffset = options.applyFaceOffset !== false;
  const outerV = verticalLineX.length ? { max: verticalLineX[verticalLineX.length - 1], min: verticalLineX[0] } : null;
  const outerH = horizontalLineY.length ? { max: horizontalLineY[horizontalLineY.length - 1], min: horizontalLineY[0] } : null;
  const nearest = (value, lines) => {
    let best = null;
    let bestDelta = Infinity;
    for (const line of lines) {
      const delta = Math.abs(line - value);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = line;
      }
    }

    return best !== null && bestDelta <= tolerancePx ? best : null;
  };
  // 외곽 경계면 중심선을 도면 안쪽으로 반두께 오프셋. 내부 경계는 중심선 그대로(중심선 치수 관례).
  const faceAdjust = (target, outer, halfThickness) => {
    if (!applyFaceOffset || !outer || halfThickness <= 0) return target;
    if (Math.abs(target - outer.min) < 0.5) return target + halfThickness;
    if (Math.abs(target - outer.max) < 0.5) return target - halfThickness;

    return target;
  };

  let movedCount = 0;
  const snapped = walls.map((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const isVerticalWall = Math.abs(dx) <= Math.abs(dy); // 세로로 선 벽 → x를 스냅
    const halfThickness = Number(wall.thicknessPx ?? wall.depthPx ?? 0) / 2;
    if (isVerticalWall) {
      const x = (wall.start.x + wall.end.x) / 2;
      const hit = nearest(x, verticalLineX);
      if (hit !== null) {
        const target = faceAdjust(hit, outerV, halfThickness);
        if (Math.abs(target - x) > 0.01) {
          movedCount += 1;
          return { ...wall, end: { ...wall.end, x: target }, start: { ...wall.start, x: target } };
        }
      }
    } else {
      const y = (wall.start.y + wall.end.y) / 2;
      const hit = nearest(y, horizontalLineY);
      if (hit !== null) {
        const target = faceAdjust(hit, outerH, halfThickness);
        if (Math.abs(target - y) > 0.01) {
          movedCount += 1;
          return { ...wall, end: { ...wall.end, y: target }, start: { ...wall.start, y: target } };
        }
      }
    }

    return wall;
  });

  return { movedCount, walls: snapped };
}

function wallAxis(wall) {
  const dx = (wall.end?.x ?? 0) - (wall.start?.x ?? 0);
  const dy = (wall.end?.y ?? 0) - (wall.start?.y ?? 0);

  return Math.abs(dx) <= Math.abs(dy) ? "vertical" : "horizontal";
}

function wallCenterCoord(wall, axis) {
  return axis === "vertical" ? ((wall.start?.x ?? 0) + (wall.end?.x ?? 0)) / 2 : ((wall.start?.y ?? 0) + (wall.end?.y ?? 0)) / 2;
}

function wallProjectedRange(wall, axis) {
  const a = axis === "vertical" ? wall.start?.y ?? 0 : wall.start?.x ?? 0;
  const b = axis === "vertical" ? wall.end?.y ?? 0 : wall.end?.x ?? 0;

  return { max: Math.max(a, b), min: Math.min(a, b) };
}

function overlapLength(a, b) {
  return Math.max(0, Math.min(a.max, b.max) - Math.max(a.min, b.min));
}

function wallExtents(walls) {
  const xs = [];
  const ys = [];
  for (const wall of walls) {
    if (!wall?.start || !wall?.end) continue;
    xs.push(wall.start.x, wall.end.x);
    ys.push(wall.start.y, wall.end.y);
  }
  if (!xs.length || !ys.length) return null;

  return { maxX: Math.max(...xs), maxY: Math.max(...ys), minX: Math.min(...xs), minY: Math.min(...ys) };
}

function medianWallThickness(walls) {
  const values = walls
    .map((wall) => Number(wall.thicknessPx ?? wall.depthPx ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!values.length) return undefined;

  return values[Math.floor(values.length / 2)];
}

function uniqueSortedCoords(coords, tolerancePx) {
  return mergeCoordinates(coords, Math.max(1, tolerancePx / 2)).sort((a, b) => a - b);
}

function crossingCoordsForBoundary(walls, axis, coordinate, tolerancePx, extents) {
  const coords = [];
  if (axis === "vertical") {
    for (const wall of walls) {
      if (wallAxis(wall) !== "horizontal") continue;
      const minX = Math.min(wall.start.x, wall.end.x);
      const maxX = Math.max(wall.start.x, wall.end.x);
      if (coordinate < minX - tolerancePx || coordinate > maxX + tolerancePx) continue;
      coords.push((wall.start.y + wall.end.y) / 2);
    }
    return uniqueSortedCoords(coords.length >= 2 ? coords : [extents.minY, extents.maxY], tolerancePx);
  }

  for (const wall of walls) {
    if (wallAxis(wall) !== "vertical") continue;
    const minY = Math.min(wall.start.y, wall.end.y);
    const maxY = Math.max(wall.start.y, wall.end.y);
    if (coordinate < minY - tolerancePx || coordinate > maxY + tolerancePx) continue;
    coords.push((wall.start.x + wall.end.x) / 2);
  }

  return uniqueSortedCoords(coords.length >= 2 ? coords : [extents.minX, extents.maxX], tolerancePx);
}

function hasExistingWallOnBoundary(walls, axis, coordinate, range, tolerancePx, minWallLengthPx) {
  return walls.some((wall) => {
    if (wallAxis(wall) !== axis) return false;
    if (Math.abs(wallCenterCoord(wall, axis) - coordinate) > tolerancePx) return false;

    return overlapLength(wallProjectedRange(wall, axis), range) >= minWallLengthPx;
  });
}

function isOuterBoundary(axis, coordinate, extents, tolerancePx) {
  if (axis === "vertical") return Math.abs(coordinate - extents.minX) <= tolerancePx || Math.abs(coordinate - extents.maxX) <= tolerancePx;

  return Math.abs(coordinate - extents.minY) <= tolerancePx || Math.abs(coordinate - extents.maxY) <= tolerancePx;
}

export function inferMissingWallsFromStructuralBoundaries(walls = [], boundaries = {}, tolerancePx = 30, options = {}) {
  const extents = wallExtents(walls);
  if (!extents) return { createdCount: 0, walls };

  const minWallLengthPx = options.minWallLengthPx ?? 40;
  const source = options.source ?? "dimension-inferred-wall";
  const thicknessPx = options.thicknessPx ?? medianWallThickness(walls);
  const created = [];
  const nextWalls = [...walls];

  const inferForAxis = (axis, coordinates) => {
    const sorted = uniqueSortedCoords(coordinates ?? [], tolerancePx);
    for (const coordinate of sorted) {
      if (!Number.isFinite(coordinate) || isOuterBoundary(axis, coordinate, extents, tolerancePx)) continue;
      const crossings = crossingCoordsForBoundary(nextWalls, axis, coordinate, tolerancePx, extents);
      if (crossings.length < 2) continue;
      const range = { min: crossings[0], max: crossings[crossings.length - 1] };
      if (range.max - range.min < minWallLengthPx) continue;
      if (hasExistingWallOnBoundary(nextWalls, axis, coordinate, range, tolerancePx, minWallLengthPx)) continue;

      const index = created.length + 1;
      const wall =
        axis === "vertical"
          ? {
              end: { x: coordinate, y: range.max },
              id: `dimension-inferred-v-${Math.round(coordinate)}-${index}`,
              orientation: "vertical",
              source,
              start: { x: coordinate, y: range.min },
              ...(thicknessPx ? { thicknessPx } : {})
            }
          : {
              end: { x: range.max, y: coordinate },
              id: `dimension-inferred-h-${Math.round(coordinate)}-${index}`,
              orientation: "horizontal",
              source,
              start: { x: range.min, y: coordinate },
              ...(thicknessPx ? { thicknessPx } : {})
            };
      created.push(wall);
      nextWalls.push(wall);
    }
  };

  inferForAxis("vertical", boundaries.verticalLineX);
  inferForAxis("horizontal", boundaries.horizontalLineY);

  return { createdCount: created.length, createdWalls: created, walls: nextWalls };
}
