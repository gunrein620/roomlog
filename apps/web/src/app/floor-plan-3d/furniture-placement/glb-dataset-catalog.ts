import type { FurnitureCatalogItem } from "../room-model/types";

// 로컬 GLB 데이터셋(/floor-plan-3d/furniture-assets, furniture-glb-dataset 마운트)을
// 기존 가구 카탈로그 형태로 변환한다. manifest의 sizeMm은 GLB 실측 바운딩박스(mm)로
// 오프라인 스크립트가 채워 둔 값이라, 모델이 실제 비율 그대로 배치된다.
const LOCAL_FURNITURE_ASSET_BASE_URL = "/floor-plan-3d/furniture-assets/";

/**
 * `NEXT_PUBLIC_FURNITURE_ASSET_BASE_URL` points to the public S3/CloudFront
 * prefix containing catalog.json and the category folders. Leaving it blank
 * keeps the local Next route working for development.
 */
export function resolveFurnitureAssetBaseUrl(configuredBaseUrl = process.env.NEXT_PUBLIC_FURNITURE_ASSET_BASE_URL) {
  const baseUrl = configuredBaseUrl?.trim();
  if (!baseUrl) return LOCAL_FURNITURE_ASSET_BASE_URL;
  return `${baseUrl.replace(/\/+$/, "")}/`;
}

export const GLB_DATASET_ASSET_BASE = resolveFurnitureAssetBaseUrl();
export const GLB_DATASET_MANIFEST_URL = `${GLB_DATASET_ASSET_BASE}catalog.json`;

// 카테고리 폴더명 → 한국어 종류 라벨(카탈로그 필터 칩에 그대로 노출).
export const GLB_CATEGORY_LABELS: Record<string, string> = {
  appliance: "가전",
  bathroom: "욕실",
  bed: "침대",
  chair: "의자",
  decor: "소품",
  "desk-table": "책상·테이블",
  kitchen: "주방",
  lighting: "조명",
  sofa: "소파",
  storage: "수납"
};

const ITEM_COLORS = ["#8fb5ff", "#f3b36a", "#9ed8b3", "#d6b0ff", "#f1d17a", "#9fd3e8"];

type GlbManifestItem = {
  category?: string;
  catalogCategoryLabel?: string;
  displayNameKo?: string;
  excludedFromCatalog?: boolean;
  fileName?: string;
  imageUrls?: string[];
  relativePath?: string;
  sizeMm?: { width?: number; height?: number; depth?: number };
  sourceUrl?: string;
  thumbnailUrl?: string;
};

function prettifyFileName(fileName: string): string {
  return fileName
    .replace(/\.glb$/i, "")
    .replace(/^ikea-/i, "")
    .replace(/-?\d{6,}$/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function finitePositive(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function glbDatasetCatalogFromManifest(manifest: unknown): FurnitureCatalogItem[] {
  const items = (manifest as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];

  const catalog: FurnitureCatalogItem[] = [];
  for (const raw of items as GlbManifestItem[]) {
    if (raw?.excludedFromCatalog) continue;
    const relativePath = typeof raw?.relativePath === "string" ? raw.relativePath.replaceAll("\\", "/") : "";
    if (!relativePath.toLowerCase().endsWith(".glb")) continue;
    // 실측 치수가 없으면 비율이 깨진 채 늘어나므로 카탈로그에서 제외한다.
    const width = finitePositive(raw.sizeMm?.width);
    const height = finitePositive(raw.sizeMm?.height);
    const depth = finitePositive(raw.sizeMm?.depth);
    if (!width || !height || !depth) continue;

    const category = typeof raw.category === "string" && raw.category ? raw.category : "decor";
    const fileName = typeof raw.fileName === "string" && raw.fileName ? raw.fileName : relativePath;
    const thumbnailUrl = typeof raw.thumbnailUrl === "string" && raw.thumbnailUrl ? raw.thumbnailUrl : undefined;
    const imageUrls = Array.isArray(raw.imageUrls)
      ? raw.imageUrls.filter((imageUrl): imageUrl is string => typeof imageUrl === "string" && Boolean(imageUrl))
      : thumbnailUrl ? [thumbnailUrl] : undefined;
    catalog.push({
      brand: "IKEA",
      category: raw.catalogCategoryLabel || GLB_CATEGORY_LABELS[category] || category,
      color: ITEM_COLORS[catalog.length % ITEM_COLORS.length],
      furniture_id: `glb-dataset-${relativePath}`,
      imageUrls,
      length: [width, height, depth],
      modelUrl: `${GLB_DATASET_ASSET_BASE}${relativePath}`,
      name: raw.displayNameKo || prettifyFileName(fileName) || fileName,
      price: 0,
      source: "furniture-glb-dataset",
      sourceUrl: typeof raw.sourceUrl === "string" && raw.sourceUrl ? raw.sourceUrl : undefined,
      thumbnailUrl
    });
  }
  return catalog;
}

export async function loadGlbDatasetCatalog(fetcher: typeof fetch = fetch): Promise<FurnitureCatalogItem[]> {
  const response = await fetcher(GLB_DATASET_MANIFEST_URL);
  if (!response.ok) throw new Error(`GLB dataset manifest fetch failed: ${response.status}`);
  return glbDatasetCatalogFromManifest(await response.json());
}
