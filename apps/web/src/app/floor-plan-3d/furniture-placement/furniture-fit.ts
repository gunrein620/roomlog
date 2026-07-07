// 가구 적합도 판정 — MVP의 핵심: "이 가구가 측정한 방에 들어갈 만한가"를
// 가능/빡빡/불가 3단계로 답한다. 90도 회전 배치도 함께 시도한다.
// UI/React 의존 없는 순수 함수 — 컨테이너와 테스트가 같은 로직을 공유한다.

import type { FurnitureCatalogItem } from "../room-model/types";

export type FurnitureFitVerdict = "fit" | "tight" | "no_fit" | "unknown";

export type FurnitureFitResult = {
  verdict: FurnitureFitVerdict;
  // 들어가는 배치 기준, 방 가로/세로 중 더 좁게 남는 쪽의 여유(mm). 안 들어가면 부족량(음수).
  clearanceMm: number | null;
  // 90도 회전해야만 들어가는 경우 true.
  rotated: boolean;
};

// 여유가 이 값 미만이면 "빡빡" — 문 여닫이/통행로/걸레받이를 감안한 실무 여유치.
export const DEFAULT_TIGHT_MARGIN_MM = 300;

export function judgeFurnitureFit(
  footprint: { widthMm: number; depthMm: number },
  room: { widthMm: number | null; depthMm: number | null },
  tightMarginMm: number = DEFAULT_TIGHT_MARGIN_MM
): FurnitureFitResult {
  const { widthMm, depthMm } = footprint;
  if (!room.widthMm || !room.depthMm || room.widthMm <= 0 || room.depthMm <= 0 || widthMm <= 0 || depthMm <= 0) {
    return { verdict: "unknown", clearanceMm: null, rotated: false };
  }

  // 배치 방향별 여유 = 가로/세로 중 더 타이트한 축의 남는 공간.
  const clearanceAsIs = Math.min(room.widthMm - widthMm, room.depthMm - depthMm);
  const clearanceRotated = Math.min(room.widthMm - depthMm, room.depthMm - widthMm);
  const best = Math.max(clearanceAsIs, clearanceRotated);
  const rotated = clearanceRotated > clearanceAsIs;

  if (best < 0) return { verdict: "no_fit", clearanceMm: Math.round(best), rotated: false };
  if (best < tightMarginMm) return { verdict: "tight", clearanceMm: Math.round(best), rotated };
  return { verdict: "fit", clearanceMm: Math.round(best), rotated };
}

// 카탈로그 항목의 바닥 footprint(mm). length 규약은 [가로, 높이, 세로].
export function catalogItemFootprint(item: Pick<FurnitureCatalogItem, "length">): { widthMm: number; depthMm: number } {
  return { widthMm: Number(item.length[0]) || 0, depthMm: Number(item.length[2]) || 0 };
}

export function describeFurnitureFit(result: FurnitureFitResult): string {
  switch (result.verdict) {
    case "fit":
      return `가능 · 여유 ${result.clearanceMm}mm${result.rotated ? " (회전 배치)" : ""}`;
    case "tight":
      return `빡빡 · 여유 ${result.clearanceMm}mm${result.rotated ? " (회전 배치)" : ""}`;
    case "no_fit":
      return `불가 · ${Math.abs(result.clearanceMm ?? 0)}mm 부족`;
    default:
      return "방 크기를 먼저 재세요";
  }
}
