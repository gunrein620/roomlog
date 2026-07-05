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
    if (ordered.length < minChipsForChain || !matchesSpan) continue;

    // 합이 전체와 몇 % 어긋나도 전체 폭에 정확히 맞물리게 각 구간을 비례 보정한다.
    const scale = planSpanMm / sumMm;
    let cursor = 0;
    ordered.forEach((chip, index) => {
      const isLast = index === ordered.length - 1;
      const endMm = isLast ? planSpanMm : cursor + chip.realLengthMm * scale;
      result.set(chip.id, { endMm, startMm: cursor });
      cursor = endMm;
    });
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

// 벽 세그먼트의 교차좌표(세로벽=x, 가로벽=y)를 가장 가까운 구조 경계선으로 스냅한다.
// boundaries: { verticalLineX: number[](세로벽이 놓일 x), horizontalLineY: number[](가로벽이 놓일 y) } — 캔버스 좌표.
// 구조 치수 경계만 넘겨야 한다(가구/opening/면적 제외는 호출측 책임).
export function snapWallsToStructuralBoundaries(walls = [], boundaries = {}, tolerancePx = 30) {
  const verticalLineX = boundaries.verticalLineX ?? [];
  const horizontalLineY = boundaries.horizontalLineY ?? [];
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

  let movedCount = 0;
  const snapped = walls.map((wall) => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const isVerticalWall = Math.abs(dx) <= Math.abs(dy); // 세로로 선 벽 → x를 스냅
    if (isVerticalWall) {
      const x = (wall.start.x + wall.end.x) / 2;
      const target = nearest(x, verticalLineX);
      if (target !== null && Math.abs(target - x) > 0.01) {
        movedCount += 1;
        return { ...wall, end: { ...wall.end, x: target }, start: { ...wall.start, x: target } };
      }
    } else {
      const y = (wall.start.y + wall.end.y) / 2;
      const target = nearest(y, horizontalLineY);
      if (target !== null && Math.abs(target - y) > 0.01) {
        movedCount += 1;
        return { ...wall, end: { ...wall.end, y: target }, start: { ...wall.start, y: target } };
      }
    }

    return wall;
  });

  return { movedCount, walls: snapped };
}
