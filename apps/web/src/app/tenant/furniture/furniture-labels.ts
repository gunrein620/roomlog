import type { TenantFurniture, TenantFurnitureCategory } from "@roomlog/types/tenant-furniture";

export const TENANT_FURNITURE_CATEGORY_LABELS: Record<TenantFurnitureCategory, string> = {
  bed: "침대",
  sofa: "소파",
  chair: "의자",
  table: "테이블",
  storage: "수납장",
  refrigerator: "냉장고",
  washerDryer: "세탁기·건조기",
  stove: "레인지",
  oven: "오븐",
  dishwasher: "식기세척기",
  television: "TV",
  sink: "싱크대",
  toilet: "변기",
  bathtub: "욕조",
  fireplace: "벽난로",
  stairs: "계단",
  unknown: "기타 가구"
};

export const TENANT_FURNITURE_CATEGORY_ICONS: Partial<Record<TenantFurnitureCategory, string>> = {
  bed: "🛏",
  sofa: "▰",
  chair: "♧",
  table: "▤",
  storage: "▥",
  refrigerator: "▯",
  television: "▣"
};

export function tenantFurnitureName(item: TenantFurniture) {
  return item.label?.trim() || TENANT_FURNITURE_CATEGORY_LABELS[item.category];
}
