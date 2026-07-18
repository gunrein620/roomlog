// splat 바닥 높이 추정 — 순수 로직(씬/three.js 무의존).
//
// native 배치(스캔앱 미터 스케일·정합 transform)는 바닥이 월드 y=0에 오는 것이 계약이지만,
// 프로파일의 수동 y 오프셋 오차가 정합 스케일로 증폭되면 바닥이 ±수십 cm 벗어나 도면 좌표로
// 배치되는 가구가 파묻히거나 떠 보인다. 방 안 splat들의 y 히스토그램에서 바닥 슬래브를 찾아
// 보정량을 계산한다. 바닥 = "가장 낮은 '진짜로 촘촘한' 수평 슬래브".
//
// 실제 재구성 splat에서 관측된 세 가지 오판을 방어한다:
//   1) 탐색 범위: 재구성 splat은 ARKit 월드 좌표라 원점이 촬영 시작 지점(바닥 위 ~1.1m)에
//      잡혀 실제 바닥이 음수(대략 -1m, 촬영 높이에 따라 그 아래)로 내려간다. 창이 좁으면(±1.5m)
//      바닥이 창 밖으로 빠지고 천장·가구 상판만 보여 그중 하나(높은 슬래브)를 바닥으로 오판한다.
//      → 창을 ±3m로 넓혀 오프셋된 바닥을 창 안에 담는다. (실측 사례: 976k gaussian 방에서
//      floorY 1.125가 나와 방 전체가 "바닥" 아래로 깔림 = 천장을 바닥으로 latch.)
//   2) 밀도 판정: 천장/가구 상판이 바닥보다 촘촘하면 바닥 빈이 최빈 대비 비율 문턱(40%) 아래로
//      떨어져 건너뛰어진다. → "집계 표본의 일정 비율 이상"이라는 '절대' 문턱을 OR로 더해, 더
//      촘촘한 슬래브가 위에 있어도 바닥이 진짜 슬래브면 스스로 자격을 얻게 한다(스케일 무관).
//   3) 얇은 선 오판: 단일 빈 스파이크(반사선·모서리)에 낚이지 않도록, 빈 하나가 아니라 3-빈
//      이웃 합(±1빈, 0.15m 밴드)의 밀도로 판정한다. 실제 바닥은 빈 경계에 걸쳐 갈라져도 밴드로
//      합산돼 문턱을 넘고, 바닥 아래 소수 플로터는 두 문턱 모두 못 넘어 걸러진다. 밴드로 자격을
//      얻은 뒤 그 이웃 안의 최빈 단일 빈을 실제 바닥 높이로 보고해 밴드 합산의 하향 편향을 없앤다.

export const SPLAT_FLOOR_BIN_SIZE_METERS = 0.05;
// 탐색 창(±3m): 촬영 높이 오프셋으로 바닥이 -1m 안팎(그 아래)에 와도 창 안에 담기게 넓혔다.
export const SPLAT_FLOOR_SEARCH_MIN_Y = -3.0;
export const SPLAT_FLOOR_SEARCH_MAX_Y = 3.0;
export const SPLAT_FLOOR_MIN_SAMPLES = 200;
// 상대 문턱: 최빈 밴드 대비 이 비율 이상이면 자격. 천장이 더 촘촘한 흔한 경우 바닥이 이 아래로
// 떨어질 수 있어 단독으로 쓰지 않고 아래 절대 문턱과 OR한다.
export const SPLAT_FLOOR_DOMINANCE_RATIO = 0.4;
// 절대 문턱: 밴드가 집계 표본 대비 최소 이만큼은 담아야 '진짜 슬래브'로 인정. 스케일 무관.
// 바닥 아래 소수 플로터(대체로 표본의 수 % 미만)는 이 문턱에서 걸러진다.
export const SPLAT_FLOOR_MIN_BAND_FRACTION = 0.05;
// 밴드 반경(빈). 1 → 자기 빈 ±1빈 = 3빈(0.15m) 이웃 합으로 밀도 판정. 빈 경계 갈라짐·단일 스파이크 완화.
export const SPLAT_FLOOR_BAND_RADIUS_BINS = 1;

export interface SplatFloorEstimate {
  /** 추정 바닥 높이(월드 y, 빈 중심값). */
  floorY: number;
  /** 히스토그램에 실제로 집계된 표본 수(범위 밖 제외). */
  samples: number;
}

export function estimateSplatFloorY(sampleYs: readonly number[]): SplatFloorEstimate | null {
  const binCount = Math.round(
    (SPLAT_FLOOR_SEARCH_MAX_Y - SPLAT_FLOOR_SEARCH_MIN_Y) / SPLAT_FLOOR_BIN_SIZE_METERS
  );
  const bins = new Array<number>(binCount).fill(0);
  let samples = 0;

  for (const y of sampleYs) {
    if (!Number.isFinite(y) || y < SPLAT_FLOOR_SEARCH_MIN_Y || y >= SPLAT_FLOOR_SEARCH_MAX_Y) continue;
    bins[Math.floor((y - SPLAT_FLOOR_SEARCH_MIN_Y) / SPLAT_FLOOR_BIN_SIZE_METERS)] += 1;
    samples += 1;
  }

  if (samples < SPLAT_FLOOR_MIN_SAMPLES) return null;

  // 3-빈 이웃 합(밴드) 밀도. 빈 하나가 아니라 밴드로 판정해 빈 경계 갈라짐·단일 스파이크를 완화하고,
  // 최빈값(maxBand)도 실제로 두께가 있는 슬래브가 잡히게 한다.
  const band = new Array<number>(binCount).fill(0);
  let maxBand = 0;
  for (let index = 0; index < binCount; index += 1) {
    const lo = Math.max(0, index - SPLAT_FLOOR_BAND_RADIUS_BINS);
    const hi = Math.min(binCount - 1, index + SPLAT_FLOOR_BAND_RADIUS_BINS);
    let sum = 0;
    for (let j = lo; j <= hi; j += 1) sum += bins[j];
    band[index] = sum;
    if (sum > maxBand) maxBand = sum;
  }

  // 자격 문턱: 상대(최빈 밴드의 일정 비율) 또는 절대(집계 표본의 일정 비율) 중 하나만 넘으면 인정.
  // 상대만 쓰면 천장이 더 촘촘할 때 바닥이 걸러지고, 절대만 쓰면 표본 규모 편차에 약해서 둘을 OR한다.
  const relativeThreshold = maxBand * SPLAT_FLOOR_DOMINANCE_RATIO;
  const absoluteThreshold = samples * SPLAT_FLOOR_MIN_BAND_FRACTION;

  // 가장 낮은 '자격 있는' 밴드를 바닥으로. 바닥 아래 소수 플로터는 두 문턱 모두 못 넘어 건너뛰어진다.
  for (let index = 0; index < binCount; index += 1) {
    const density = band[index];
    if (density <= 0) continue;
    if (density < relativeThreshold && density < absoluteThreshold) continue;

    // 밴드는 위쪽 빈의 질량까지 끌어와 자격을 얻을 수 있어(그 자체로는 반 빈만큼 아래로 치우침),
    // 실제 바닥 높이는 이 밴드 이웃 안의 최빈 단일 빈으로 보고해 하향 편향을 없앤다.
    const lo = Math.max(0, index - SPLAT_FLOOR_BAND_RADIUS_BINS);
    const hi = Math.min(binCount - 1, index + SPLAT_FLOOR_BAND_RADIUS_BINS);
    let peakIndex = lo;
    for (let j = lo; j <= hi; j += 1) {
      if (bins[j] > bins[peakIndex]) peakIndex = j;
    }

    return {
      floorY: SPLAT_FLOOR_SEARCH_MIN_Y + (peakIndex + 0.5) * SPLAT_FLOOR_BIN_SIZE_METERS,
      samples
    };
  }

  return null;
}
