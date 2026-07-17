export const FURNITURE_MANIFEST_URL = "/floor-plan-3d/furniture-assets/manifest.json";
export const FURNITURE_ASSET_BASE_URL = "/floor-plan-3d/furniture-assets/";

const cleanPath = value => String(value ?? "").replace(/^\/+/, "");

export function normalizeFurnitureCatalog(manifest) {
  return (Array.isArray(manifest?.items) ? manifest.items : [])
    .filter(item => item?.relativePath && item?.fileName && item?.category)
    .map(item => ({
      category: String(item.category),
      fileName: String(item.fileName),
      relativePath: cleanPath(item.relativePath),
      modelUrl: FURNITURE_ASSET_BASE_URL + cleanPath(item.relativePath),
      sizeMm: {
        width: Number(item.sizeMm?.width) || 1000,
        height: Number(item.sizeMm?.height) || 1000,
        depth: Number(item.sizeMm?.depth) || 1000,
      },
      sizeMeters: {
        width: (Number(item.sizeMm?.width) || 1000) / 1000,
        height: (Number(item.sizeMm?.height) || 1000) / 1000,
        depth: (Number(item.sizeMm?.depth) || 1000) / 1000,
      },
    }));
}

export function filterFurnitureCatalog(items, query = "", category = "all", limit = 60, offset = 0) {
  const term = String(query).trim().toLowerCase();
  const numericLimit = Number(limit);
  const pageSize = Math.min(60, Math.max(1, Number.isFinite(numericLimit) ? Math.trunc(numericLimit) : 60));
  const numericOffset = Number(offset);
  const pageOffset = Math.max(0, Number.isFinite(numericOffset) ? Math.trunc(numericOffset) : 0);
  return items.filter(item => (
    (category === "all" || item.category === category)
    && (!term || item.fileName.toLowerCase().includes(term))
  )).slice(pageOffset, pageOffset + pageSize);
}

export function createFurniturePlacement(item, position, id = crypto.randomUUID()) {
  return {
    id,
    relativePath: item.relativePath,
    position: [Number(position.x), Number(position.y), Number(position.z)],
    rotationY: 0,
    sizeMm: { ...item.sizeMm },
  };
}

export function cloneFurniturePlacements(placements = []) {
  return placements.map(item => ({
    id: String(item.id),
    relativePath: cleanPath(item.relativePath),
    position: item.position.slice(0, 3).map(Number),
    rotationY: Number(item.rotationY) || 0,
    sizeMm: { ...item.sizeMm },
  }));
}

export function resolveFurnitureToolbarMode({
  currentView,
  hasSelectedFurniture = false,
  hasPendingFurniture = false,
} = {}) {
  if (currentView !== "furnishing") return "hidden";
  if (hasPendingFurniture) return "pending";
  return hasSelectedFurniture ? "selection" : "hidden";
}

export function positionFurnitureToolbar({
  anchorX,
  anchorY,
  toolbarWidth,
  toolbarHeight,
  viewportWidth,
  viewportHeight,
  margin = 8,
  gap = 12,
}) {
  const maximumLeft = Math.max(margin, viewportWidth - toolbarWidth - margin);
  const maximumTop = Math.max(margin, viewportHeight - toolbarHeight - margin);
  return {
    left: Math.min(maximumLeft, Math.max(margin, anchorX - toolbarWidth / 2)),
    top: Math.min(maximumTop, Math.max(margin, anchorY - toolbarHeight - gap)),
  };
}

export function shouldUpdateFurniturePreview({
  isTracking = false,
  force = false,
} = {}) {
  return Boolean(isTracking || force);
}
