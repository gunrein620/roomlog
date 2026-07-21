// register 픽 화면의 캡처 도면(RoomPlan) 소스 판정 — 순수 함수로 분리해 우선순위 로직을 테스트한다.
//
// 배경: 커밋 01ed0afe로 서버(auto-register-preview)는 SplatAsset.captureFloorPlan(iOS 인테이크가
// 채운 roomplan.json)을 기본 소스로 읽도록 승격됐는데, 이 화면은 여전히 수동 JSON 업로드로만
// captureFloorPlan을 채웠다 — 자산에 캡처 도면이 있어도 화면이 그 사실을 몰라 자동정합 요청 자체가
// 나가지 않았다. resolveCaptureFloorPlanSource가 "업로드(수동) > 자산" 우선순위를 판정한다 —
// splat-plan-shape.ts의 resolvePlanWalls가 업로드를 에디터 저장본보다 우선하는 것과 같은 원칙
// (명시적 사용자 행위가 자동 로드값을 이긴다).

import type { RoomPlanCaptureFloorPlan } from "@roomlog/types";

export type CaptureFloorPlanSourceKind = "manual" | "asset";

export interface CaptureFloorPlanSource {
  plan: RoomPlanCaptureFloorPlan;
  source: CaptureFloorPlanSourceKind;
}

// 업로드/자산 JSON의 최소 형태만 확인한다(frame + 비어있지 않은 walls[]) — 필드별 정밀 검증은
// 서버 파서(parseCaptureFloorPlanInput)가 400으로 되돌려주므로 여기서 중복하지 않는다.
export function parseCaptureFloorPlanJson(value: unknown): RoomPlanCaptureFloorPlan | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.frame !== "arkit-metric") return null;
  if (!Array.isArray(raw.walls) || raw.walls.length === 0) return null;
  return raw as unknown as RoomPlanCaptureFloorPlan;
}

/**
 * 수동 업로드 > 자산 저장값 우선순위로 화면이 실제로 쓸 캡처 도면을 고른다.
 * 수동 업로드가 있으면(사용자가 명시적으로 JSON을 올렸으면) 자산값이 나중에 도착해도 덮지 않는다.
 */
export function resolveCaptureFloorPlanSource(
  manual: RoomPlanCaptureFloorPlan | null,
  asset: RoomPlanCaptureFloorPlan | null
): CaptureFloorPlanSource | null {
  if (manual) return { plan: manual, source: "manual" };
  if (asset) return { plan: asset, source: "asset" };
  return null;
}
