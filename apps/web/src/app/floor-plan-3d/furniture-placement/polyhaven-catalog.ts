import type { FurnitureCatalogItem, FurniturePlacementCapability } from "../room-model/types";
import { resolveFurnitureAssetBaseUrl } from "./glb-dataset-catalog";

const LARGE_ASSET_BYTES = 50 * 1024 * 1024;

type PolyhavenManifestItem = {
  assetId?: string;
  bytes?: number;
  catalogCategoryLabel?: string;
  displayName?: string;
  placementCapability?: FurniturePlacementCapability;
  relativePath?: string;
  sizeMm?: { width?: number; height?: number; depth?: number };
  sourceUrl?: string;
  tags?: unknown[];
  thumbnailPath?: string;
};

let catalogPromise: Promise<FurnitureCatalogItem[]> | undefined;

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function assetUrl(baseUrl: string, relativePath: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${relativePath.replace(/^\/+/, "")}`;
}

export function resolvePolyhavenCatalogUrl(configuredBaseUrl = process.env.NEXT_PUBLIC_FURNITURE_ASSET_BASE_URL) {
  return `${resolveFurnitureAssetBaseUrl(configuredBaseUrl)}polyhaven-cc0/catalog.json`;
}

export function polyhavenCatalogFromManifest(
  manifest: unknown,
  configuredBaseUrl = resolveFurnitureAssetBaseUrl(),
): FurnitureCatalogItem[] {
  const records = (manifest as { items?: unknown })?.items;
  if (!Array.isArray(records)) return [];
  const catalog: FurnitureCatalogItem[] = [];
  for (const raw of records as PolyhavenManifestItem[]) {
    const assetId = typeof raw.assetId === "string" ? raw.assetId.trim() : "";
    const relativePath = typeof raw.relativePath === "string" ? raw.relativePath.replaceAll("\\", "/") : "";
    const thumbnailPath = typeof raw.thumbnailPath === "string" ? raw.thumbnailPath.replaceAll("\\", "/") : "";
    const width = positiveNumber(raw.sizeMm?.width);
    const height = positiveNumber(raw.sizeMm?.height);
    const depth = positiveNumber(raw.sizeMm?.depth);
    if (!assetId || !relativePath.endsWith(".glb") || !thumbnailPath || !width || !height || !depth) continue;
    const thumbnailUrl = assetUrl(configuredBaseUrl, thumbnailPath);
    catalog.push({
      assetBytes: positiveNumber(raw.bytes) ?? undefined,
      brand: "Poly Haven",
      category: raw.catalogCategoryLabel?.trim() || "데코",
      color: "var(--surface-container-high)",
      furniture_id: `polyhaven-${assetId}`,
      imageUrls: [thumbnailUrl],
      length: [width, height, depth],
      modelUrl: assetUrl(configuredBaseUrl, relativePath),
      name: raw.displayName?.trim() || assetId.replaceAll("_", " "),
      placementCapability: raw.placementCapability ?? "floor",
      price: 0,
      source: "polyhaven-cc0",
      sourceUrl: raw.sourceUrl,
      tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
      thumbnailUrl,
    });
  }
  return catalog;
}

export function isLargeFurnitureAsset(item: Pick<FurnitureCatalogItem, "assetBytes">) {
  return (item.assetBytes ?? 0) >= LARGE_ASSET_BYTES;
}

export function resetPolyhavenCatalogCache() {
  catalogPromise = undefined;
}

export function loadPolyhavenCatalog(fetcher: typeof fetch = fetch): Promise<FurnitureCatalogItem[]> {
  if (catalogPromise) return catalogPromise;
  const baseUrl = resolveFurnitureAssetBaseUrl();
  catalogPromise = fetcher(`${baseUrl}polyhaven-cc0/catalog.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Poly Haven catalog fetch failed: ${response.status}`);
      const items = polyhavenCatalogFromManifest(await response.json(), baseUrl);
      if (!items.length) throw new Error("Poly Haven catalog is empty.");
      return items;
    })
    .catch((error) => {
      catalogPromise = undefined;
      throw error;
    });
  return catalogPromise;
}
