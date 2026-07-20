import type { FurnitureCatalogItem } from "../room-model/types";
import { catalogKind } from "./catalog";

export const FURNITURE_CATEGORY_ORDER = [
  "소파·의자",
  "침실",
  "테이블·책상",
  "수납",
  "주방·다이닝",
  "욕실·세탁",
  "조명",
  "데코",
  "야외",
  "가전·전자"
] as const;

export function furnitureCategoryLabel(item: FurnitureCatalogItem) {
  return item.category?.trim() || catalogKind(item);
}

export function listFurnitureCategoryFilters(items: FurnitureCatalogItem[]) {
  const available = new Set(items.map(furnitureCategoryLabel));
  const ordered = FURNITURE_CATEGORY_ORDER.filter((category) => available.has(category));
  const remaining = [...available]
    .filter((category) => !FURNITURE_CATEGORY_ORDER.includes(category as (typeof FURNITURE_CATEGORY_ORDER)[number]))
    .sort((left, right) => left.localeCompare(right, "ko"));

  return ["전체", ...ordered, ...remaining];
}
