import type { ListingFloorPlan3D } from "../_components/ListingTourRoom3D";

export const OWNER_FURNITURE_DRAFT_PREFIX = "roomlogOwnerFurnitureDraft";

export type OwnerFurnitureEditorSnapshot = {
  composedPlan: Record<string, unknown>;
  review: Record<string, unknown>;
  sourceName: string;
};

export type OwnerFurnitureDraft = {
  requestId: string;
  savedAt: number;
  editorSnapshot?: OwnerFurnitureEditorSnapshot;
  floorPlan: ListingFloorPlan3D;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem">;

export function ownerFurnitureDraftStorageKey(requestId: string) {
  return `${OWNER_FURNITURE_DRAFT_PREFIX}:${requestId}`;
}

export function readOwnerFurnitureDraft(storage: DraftStorage, requestId: string): OwnerFurnitureDraft | null {
  const raw = storage.getItem(ownerFurnitureDraftStorageKey(requestId));
  if (raw === null) return null;
  const draft = JSON.parse(raw) as Partial<OwnerFurnitureDraft> | null;
  if (!draft || draft.requestId !== requestId) throw new Error("가구 배치 요청 정보가 올바르지 않습니다.");
  if (!Number.isFinite(draft.savedAt) || !draft.floorPlan || !Array.isArray(draft.floorPlan.furnitures)) {
    throw new Error("가구 배치 초안 형식이 올바르지 않습니다.");
  }
  return draft as OwnerFurnitureDraft;
}

export function writeOwnerFurnitureDraft(storage: DraftStorage, draft: OwnerFurnitureDraft) {
  storage.setItem(ownerFurnitureDraftStorageKey(draft.requestId), JSON.stringify(draft));
}

export function buildOwnerFloorPlanResumePath(
  returnOrigin: string,
  requestId: string,
  destination: "original" | "3d" | "floor"
) {
  const url = new URL("/floor-plan-3d/mitunet", returnOrigin);
  url.searchParams.set("integration", "roomlog");
  url.searchParams.set("returnOrigin", returnOrigin);
  url.searchParams.set("requestId", requestId);
  url.searchParams.set("resumeView", destination);
  return url.toString();
}
