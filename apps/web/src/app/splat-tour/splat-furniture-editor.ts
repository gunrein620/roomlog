import {
  createFurnitureModel,
  finalizeFurnitureDraft,
  furnitureCategoryLabel,
  moveFurnitureDraftToPoint,
  reopenFurnitureDraft,
  rotateFurnitureQuarterTurn
} from "../floor-plan-3d/furniture-placement";
import type { FurnitureCatalogItem, PlacedFurniture } from "../floor-plan-3d/room-model/types";

export type TourFurnitureBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type TourFurnitureDraft = {
  placed: PlacedFurniture[];
  pending: PlacedFurniture | null;
  original: PlacedFurniture | null;
};

export function beginTourFurnitureDraft(item: FurnitureCatalogItem, placed: PlacedFurniture[]): TourFurnitureDraft {
  return {
    placed,
    pending: createFurnitureModel(item),
    original: null
  };
}

export function clampTourFurniturePoint(
  furniture: PlacedFurniture,
  point: { x: number; z: number },
  bounds: TourFurnitureBounds
): PlacedFurniture {
  return moveFurnitureDraftToPoint(furniture, {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, point.z))
  });
}

export function confirmTourFurnitureDraft(draft: TourFurnitureDraft): TourFurnitureDraft {
  if (!draft.pending) return draft;

  const finalized = finalizeFurnitureDraft(draft.pending, "resident");
  const confirmed = draft.original
    ? {
        ...finalized,
        editableBy: draft.original.editableBy,
        includedInLease: draft.original.includedInLease,
        locked: draft.original.locked,
        source: draft.original.source,
        visibleToTenant: draft.original.visibleToTenant
      }
    : finalized;

  return {
    placed: [...draft.placed, confirmed],
    pending: null,
    original: null
  };
}

export function cancelTourFurnitureDraft(draft: TourFurnitureDraft): TourFurnitureDraft {
  return {
    placed: draft.original ? [...draft.placed, draft.original] : draft.placed,
    pending: null,
    original: null
  };
}

export function deleteTourFurnitureDraft(draft: TourFurnitureDraft): TourFurnitureDraft {
  return {
    ...draft,
    pending: null,
    original: null
  };
}

export function reopenTourFurnitureDraft(draft: TourFurnitureDraft, id: string): TourFurnitureDraft {
  const original = draft.placed.find((item) => item.id === id) ?? null;
  if (!original) return draft;

  return {
    placed: draft.placed.filter((item) => item.id !== id),
    pending: reopenFurnitureDraft(original),
    original
  };
}

export function rotateTourFurnitureDraft(draft: TourFurnitureDraft, direction: -1 | 1 = 1): TourFurnitureDraft {
  return draft.pending
    ? { ...draft, pending: rotateFurnitureQuarterTurn(draft.pending, direction) }
    : draft;
}

export function filterTourFurnitureCatalog(
  items: FurnitureCatalogItem[],
  category: string,
  query: string
): FurnitureCatalogItem[] {
  const needle = query.trim().toLocaleLowerCase("ko");
  return items.filter((item) => {
    if (category !== "전체" && furnitureCategoryLabel(item) !== category) return false;
    if (!needle) return true;
    return `${item.name} ${item.brand} ${item.category ?? ""} ${item.furniture_id}`.toLocaleLowerCase("ko").includes(needle);
  });
}

export function createTourFurnitureSavePayload(furnitures: PlacedFurniture[], savedAt = Date.now()): string {
  return JSON.stringify({ savedAt, furnitures });
}

export function shouldEnableTourFurnitureFloor(pendingFurniture: PlacedFurniture | null): boolean {
  return pendingFurniture !== null;
}
