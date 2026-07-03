import type { FurnitureCatalogItem, PlacedFurniture } from "../room-model/types";
import { IKEA_FURNITURE_CATALOG } from "./ikea-catalog";

const MODEL_BY_KIND = {
  bed: "/furniture-models/bed-queen.glb",
  chair: "/furniture-models/chair-kevi.glb",
  desk: "/furniture-models/table-moon.glb",
  drawer: "/furniture-models/wardrobe-cabinet.glb",
  sofa: "/furniture-models/sofa-couch.glb",
  table: "/furniture-models/table-moon.glb",
  wardrobe: "/furniture-models/wardrobe-cabinet.glb"
} as const;

export const ROOMLOG_FURNITURE_CATALOG: FurnitureCatalogItem[] = [
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

export { IKEA_FURNITURE_CATALOG };

export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [...ROOMLOG_FURNITURE_CATALOG, ...IKEA_FURNITURE_CATALOG].map(
  (item, index) => normalizeCatalogItem(item, index)
);

export function normalizeCatalogItem(item: FurnitureCatalogItem, index: number): FurnitureCatalogItem {
  const fallback = ROOMLOG_FURNITURE_CATALOG[index % ROOMLOG_FURNITURE_CATALOG.length];
  const [width, height, depth] = Array.isArray(item.length) ? item.length : fallback.length;
  const modelUrl = item.modelUrl || modelUrlForCatalogItem(item) || fallback.modelUrl;

  return {
    brand: item.brand || fallback.brand,
    category: item.category,
    color: item.color || fallback.color,
    furniture_id: item.furniture_id || fallback.furniture_id,
    imageUrls: item.imageUrls,
    length: [
      Number.isFinite(Number(width)) ? Number(width) : fallback.length[0],
      Number.isFinite(Number(height)) ? Number(height) : fallback.length[1],
      Number.isFinite(Number(depth)) ? Number(depth) : fallback.length[2]
    ],
    modelUrl,
    name: item.name || fallback.name,
    price: Number.isFinite(Number(item.price)) ? Number(item.price) : fallback.price,
    source: item.source,
    sourceUrl: item.sourceUrl,
    thumbnailUrl: item.thumbnailUrl
  };
}

export function furnitureImageUrl(item: Pick<FurnitureCatalogItem, "imageUrls" | "thumbnailUrl">) {
  return item.thumbnailUrl || item.imageUrls?.find((imageUrl) => Boolean(imageUrl));
}

export function catalogKind(item: Pick<FurnitureCatalogItem, "category" | "furniture_id" | "name" | "source">) {
  const text = `${item.source ?? ""} ${item.category ?? ""} ${item.name} ${item.furniture_id}`.toLowerCase();
  if (/bed|침대|매트리스/.test(text)) return "침대";
  if (/chair|stool|bench|의자|체어|스툴|벤치/.test(text)) return "의자";
  if (/dining|table|식탁|테이블/.test(text)) return "식탁";
  if (/sofa|couch|소파/.test(text)) return "소파";
  if (/desk|책상|데스크/.test(text)) return "책상";
  if (/drawer|서랍/.test(text)) return "서랍";
  if (/wardrobe|closet|옷장|행거/.test(text)) return "옷장";

  return "기타";
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

export function getFurnitureDimensions(furniture: Pick<PlacedFurniture, "length" | "scale">) {
  return {
    depth: Math.max(0.05, (furniture.length[2] / 1000) * furniture.scale),
    height: Math.max(0.05, (furniture.length[1] / 1000) * furniture.scale),
    width: Math.max(0.05, (furniture.length[0] / 1000) * furniture.scale)
  };
}

function modelUrlForCatalogItem(item: Pick<FurnitureCatalogItem, "category" | "furniture_id" | "name" | "source">) {
  const kind = catalogKind(item);
  if (kind === "침대") return MODEL_BY_KIND.bed;
  if (kind === "식탁") return MODEL_BY_KIND.table;
  if (kind === "의자") return MODEL_BY_KIND.chair;
  if (kind === "소파") return MODEL_BY_KIND.sofa;
  if (kind === "책상") return MODEL_BY_KIND.desk;
  if (kind === "서랍") return MODEL_BY_KIND.drawer;
  if (kind === "옷장") return MODEL_BY_KIND.wardrobe;

  return undefined;
}
