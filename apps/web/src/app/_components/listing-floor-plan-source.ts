// 매물 상세(ListingDetailView)의 3D 히어로/시트가 지금 보여주는 도면이 어디서 왔는지 판정한다.
// 캡처(RoomPlan, ARKit 실측)가 있으면 최우선 — splat과 같은 ARSession이라 정합 없이 항등이고
// 정확도도 가장 높다. 없으면 mitunet(도면 이미지 자동 추출), 둘 다 없으면(walls3D 편집기 도면 등)
// 라벨을 띄우지 않는다 — 그 경로는 애초에 정확도 캐빗이 필요 없다.
export type ListingFloorPlanSource = "capture" | "mitunet" | null;

export function resolveListingFloorPlanSource(hasCaptureLayout: boolean, hasMitunetPlan: boolean): ListingFloorPlanSource {
  if (hasCaptureLayout) return "capture";
  if (hasMitunetPlan) return "mitunet";
  return null;
}

export const LISTING_FLOOR_PLAN_SOURCE_LABEL: Record<Exclude<ListingFloorPlanSource, null>, string> = {
  capture: "실측 캡처 도면",
  mitunet: "도면 이미지에서 자동 추출 · 정확도 낮음"
};
