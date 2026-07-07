// splat 바닥 높이 추정 — 순수 로직(씬/three.js 무의존).
//
// native 배치(스캔앱 미터 스케일·정합 transform)는 바닥이 월드 y=0에 오는 것이 계약이지만,
// 프로파일의 수동 y 오프셋 오차가 정합 스케일로 증폭되면 바닥이 ±수십 cm 벗어나 도면 좌표로
// 배치되는 가구가 파묻히거나 떠 보인다. 방 안 splat들의 y 히스토그램에서 바닥 슬래브를 찾아
// 보정량을 계산한다. 바닥은 "가장 낮은 지배적 수평 슬래브" — 최빈 빈이 아니라, 최빈 빈 대비
// 일정 비율 이상인 빈 중 가장 낮은 것을 고른다(침대·책상 상판이 바닥보다 촘촘한 스캔 대비,
// 바닥 아래 소수 플로터는 비율 문턱에서 걸러짐).

export const SPLAT_FLOOR_BIN_SIZE_METERS = 0.05;
export const SPLAT_FLOOR_SEARCH_MIN_Y = -1.5;
export const SPLAT_FLOOR_SEARCH_MAX_Y = 1.5;
export const SPLAT_FLOOR_MIN_SAMPLES = 200;
export const SPLAT_FLOOR_DOMINANCE_RATIO = 0.4;

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

  let maxCount = 0;
  for (const count of bins) {
    if (count > maxCount) maxCount = count;
  }

  const threshold = maxCount * SPLAT_FLOOR_DOMINANCE_RATIO;
  for (let index = 0; index < binCount; index += 1) {
    if (bins[index] < threshold || bins[index] === 0) continue;

    return {
      floorY: SPLAT_FLOOR_SEARCH_MIN_Y + (index + 0.5) * SPLAT_FLOOR_BIN_SIZE_METERS,
      samples
    };
  }

  return null;
}
