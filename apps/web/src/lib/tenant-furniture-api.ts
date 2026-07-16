import type {
  FurnitureDimensionsMm,
  TenantFurniture,
  TenantFurniturePlacementItem
} from "@roomlog/types/tenant-furniture";
import type { WheretoputWall3D } from "@/app/floor-plan-3d/room-model/types";

type PublicTradeListing = {
  floorPlan?: { walls3D?: unknown } | null;
  id: string;
  location?: string;
  title: string;
};

export type TenantFurnitureListingPlan = {
  id: string;
  location: string | null;
  title: string;
  walls: WheretoputWall3D[];
};

export class TenantFurnitureApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TenantFurnitureApiError";
    this.status = status;
  }
}

function apiListingId(listingId: string) {
  const decoded = decodeURIComponent(listingId);
  return decoded.startsWith("TRADE-") ? decoded.slice("TRADE-".length) : decoded;
}

async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body != null) headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers
  });
  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      typeof body?.message === "string" ? body.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    throw new TenantFurnitureApiError(message, response.status);
  }

  return body as T;
}

function isMetricTuple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => Number.isFinite(entry));
}

function isListingWall(value: unknown): value is WheretoputWall3D {
  if (!value || typeof value !== "object") return false;
  const wall = value as Partial<WheretoputWall3D>;
  const dimensions = wall.dimensions;

  return (
    typeof wall.id === "string" &&
    (typeof wall.wall_id === "string" || typeof wall.wall_id === "number") &&
    isMetricTuple(wall.position) &&
    isMetricTuple(wall.rotation) &&
    Boolean(
      dimensions &&
        Number.isFinite(dimensions.width) &&
        Number.isFinite(dimensions.height) &&
        Number.isFinite(dimensions.depth) &&
        dimensions.width > 0 &&
        dimensions.height > 0 &&
        dimensions.depth > 0
    )
  );
}

function isPlacementItem(value: unknown): value is TenantFurniturePlacementItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TenantFurniturePlacementItem>;
  return (
    typeof item.furnitureId === "string" &&
    Array.isArray(item.position) &&
    item.position.length === 2 &&
    item.position.every((entry) => Number.isFinite(entry)) &&
    Number.isFinite(item.rotation)
  );
}

export async function fetchTenantFurniture(): Promise<TenantFurniture[]> {
  const result = await requestJson<unknown>("/api/tenant-furniture");
  return Array.isArray(result) ? (result as TenantFurniture[]) : [];
}

export async function updateTenantFurnitureDimensions(
  furnitureId: string,
  sizeMm: FurnitureDimensionsMm
): Promise<TenantFurniture> {
  return requestJson<TenantFurniture>(`/api/tenant-furniture/${encodeURIComponent(furnitureId)}`, {
    method: "PATCH",
    body: JSON.stringify({ sizeMm })
  });
}

export async function fetchTenantFurniturePlacement(listingId: string): Promise<TenantFurniturePlacementItem[]> {
  const result = await requestJson<unknown>(
    `/api/tenant-furniture/placements/${encodeURIComponent(apiListingId(listingId))}`
  );
  if (!result || typeof result !== "object") return [];
  const items = (result as { items?: unknown }).items;
  return Array.isArray(items) ? items.filter(isPlacementItem) : [];
}

export async function saveTenantFurniturePlacement(
  listingId: string,
  items: TenantFurniturePlacementItem[]
): Promise<void> {
  await requestJson<unknown>(
    `/api/tenant-furniture/placements/${encodeURIComponent(apiListingId(listingId))}`,
    { method: "PUT", body: JSON.stringify({ items }) }
  );
}

export async function fetchTenantFurnitureListingPlan(
  listingId: string
): Promise<TenantFurnitureListingPlan | null> {
  const listings = await requestJson<unknown>("/api/trade/listings/public");
  if (!Array.isArray(listings)) return null;

  const targetId = apiListingId(listingId);
  const listing = (listings as PublicTradeListing[]).find((item) => item?.id === targetId);
  if (!listing) return null;

  const wallsSource = listing.floorPlan?.walls3D;
  return {
    id: listing.id,
    location: typeof listing.location === "string" ? listing.location : null,
    title: typeof listing.title === "string" && listing.title.trim() ? listing.title : "대상 매물",
    walls: Array.isArray(wallsSource) ? wallsSource.filter(isListingWall) : []
  };
}
