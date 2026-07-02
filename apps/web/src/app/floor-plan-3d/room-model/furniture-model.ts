// 가구 카탈로그와 배치 데이터 모델. 임대인 옵션/임차인 배치의 소유권 규칙이 여기에 있다.
// DOM/React/three.js 의존 금지.

import type { ExperienceMode, FurnitureCatalogItem, PlacedFurniture } from "./types";

export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  {
    brand: "Roomlog Basic",
    color: "#8fb5ff",
    furniture_id: "furniture-bed-queen",
    length: [2000, 420, 1500],
    modelUrl: "/furniture-models/bed-queen.glb",
    name: "퀸 침대",
    price: 390000
  },
  {
    brand: "Wheretoput",
    color: "#f3b36a",
    furniture_id: "furniture-sofa-3",
    length: [2100, 760, 880],
    modelUrl: "/furniture-models/sofa-couch.glb",
    name: "3인 소파",
    price: 520000
  },
  {
    brand: "Roomlog Studio",
    color: "#9ed8b3",
    furniture_id: "furniture-desk",
    length: [1200, 740, 600],
    modelUrl: "/furniture-models/table-moon.glb",
    name: "책상",
    price: 160000
  },
  {
    brand: "Roomlog Studio",
    color: "#d6b0ff",
    furniture_id: "furniture-chair",
    length: [520, 820, 520],
    modelUrl: "/furniture-models/chair-kevi.glb",
    name: "의자",
    price: 69000
  },
  {
    brand: "Roomlog Storage",
    color: "#f1d17a",
    furniture_id: "furniture-wardrobe",
    length: [900, 1900, 580],
    modelUrl: "/furniture-models/wardrobe-cabinet.glb",
    name: "옷장",
    price: 240000
  }
];

export function normalizeCatalogItem(item: FurnitureCatalogItem, index: number): FurnitureCatalogItem {
  const fallback = FURNITURE_CATALOG[index % FURNITURE_CATALOG.length];
  const [width, height, depth] = Array.isArray(item.length) ? item.length : fallback.length;

  return {
    brand: item.brand || fallback.brand,
    color: item.color || fallback.color,
    furniture_id: item.furniture_id || fallback.furniture_id,
    imageUrls: item.imageUrls,
    length: [
      Number.isFinite(Number(width)) ? Number(width) : fallback.length[0],
      Number.isFinite(Number(height)) ? Number(height) : fallback.length[1],
      Number.isFinite(Number(depth)) ? Number(depth) : fallback.length[2]
    ],
    modelUrl: item.modelUrl || fallback.modelUrl,
    name: item.name || fallback.name,
    price: Number.isFinite(Number(item.price)) ? Number(item.price) : fallback.price,
    source: item.source,
    sourceUrl: item.sourceUrl,
    thumbnailUrl: item.thumbnailUrl
  };
}

export function isFurnitureCatalogItem(value: unknown): value is FurnitureCatalogItem {
  const item = value as FurnitureCatalogItem;

  return Boolean(
    item &&
      typeof item.brand === "string" &&
      typeof item.color === "string" &&
      typeof item.furniture_id === "string" &&
      Array.isArray(item.length) &&
      item.length.length === 3 &&
      item.length.every((dimension) => typeof dimension === "number" && Number.isFinite(dimension) && dimension > 0) &&
      typeof item.name === "string" &&
      typeof item.price === "number"
  );
}

export function createFurnitureModel(item: FurnitureCatalogItem, position: [number, number, number] = [0, 0, 0]): PlacedFurniture {
  return {
    ...item,
    id: `furniture-${item.furniture_id}-${Date.now()}`,
    position: [position[0], item.length[1] / 2000, position[2]],
    rotation: [0, 0, 0],
    scale: 1
  };
}

export function createLandlordOptionFurniture(furniture: PlacedFurniture): PlacedFurniture {
  return {
    ...furniture,
    editableBy: ["LANDLORD"],
    furnitureId: furniture.furniture_id,
    includedInLease: true,
    locked: true,
    sizeMm: { depth: furniture.length[2], height: furniture.length[1], width: furniture.length[0] },
    source: "LANDLORD_OPTION",
    visibleToTenant: true
  };
}

export function createResidentDesignFurniture(furniture: PlacedFurniture): PlacedFurniture {
  return {
    ...furniture,
    source: furniture.source === "LANDLORD_OPTION" ? furniture.source : "RESIDENT_DESIGN"
  };
}

export function isLandlordOptionFurniture(furniture: PlacedFurniture) {
  return furniture.source === "LANDLORD_OPTION" || furniture.locked === true;
}

export function isLockedFurnitureForResident(furniture: PlacedFurniture, experienceMode: ExperienceMode) {
  return experienceMode === "resident" && isLandlordOptionFurniture(furniture);
}

export function getFurnitureDimensions(furniture: Pick<PlacedFurniture, "length" | "scale">) {
  return {
    depth: Math.max(0.05, (furniture.length[2] / 1000) * furniture.scale),
    height: Math.max(0.05, (furniture.length[1] / 1000) * furniture.scale),
    width: Math.max(0.05, (furniture.length[0] / 1000) * furniture.scale)
  };
}
