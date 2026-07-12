export const MAX_MANAGER_LISTING_PHOTOS = 10;
export const MANAGER_LISTING_FLOOR_PLAN_STORAGE_KEY = "roomlogListingFloorPlan3D";

type NumberTuple3 = [number, number, number];

export interface ManagerListingFloorPlanWall extends Record<string, unknown> {
  id: string;
  wall_id: string | number;
  dimensions: { width: number; height: number; depth: number };
  position: NumberTuple3;
  rotation: NumberTuple3;
}

export interface ManagerListingFloorPlan {
  walls3D: ManagerListingFloorPlanWall[];
  furnitures: Array<Record<string, unknown>>;
  name?: string;
}

export interface ManagerListingPhotoSelection {
  existingUrls: string[];
  newFiles: File[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberTuple3(value: unknown): NumberTuple3 | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const tuple = value.map(Number);
  return tuple.every(Number.isFinite) ? tuple as NumberTuple3 : null;
}

function normalizeWall(value: unknown, index: number): ManagerListingFloorPlanWall | null {
  if (!isRecord(value) || !isRecord(value.dimensions)) return null;
  const width = Number(value.dimensions.width);
  const height = Number(value.dimensions.height);
  const depth = Number(value.dimensions.depth);
  const position = numberTuple3(value.position);
  const rotation = numberTuple3(value.rotation);
  if (![width, height, depth].every((size) => Number.isFinite(size) && size > 0)) return null;
  if (!position || !rotation) return null;

  const fallbackId = `wall-${index}`;
  return {
    ...value,
    id: String(value.id ?? fallbackId),
    wall_id: typeof value.wall_id === "number" ? value.wall_id : String(value.wall_id ?? fallbackId),
    dimensions: { width, height, depth },
    position,
    rotation,
  };
}

export function normalizeManagerListingFloorPlan(value: unknown): ManagerListingFloorPlan | null {
  let wallsSource: unknown;
  let furnituresSource: unknown;
  let nameSource: unknown;

  if (Array.isArray(value)) {
    wallsSource = value;
  } else if (isRecord(value)) {
    const room3d = isRecord(value.room3d) ? value.room3d : null;
    wallsSource = Array.isArray(value.walls3D)
      ? value.walls3D
      : Array.isArray(value.walls)
        ? value.walls
        : room3d?.walls3D ?? room3d?.walls;
    furnituresSource = value.furnitures ?? room3d?.furnitures;
    nameSource = value.name ?? room3d?.name;
  }

  if (!Array.isArray(wallsSource)) return null;
  const walls3D = wallsSource
    .map(normalizeWall)
    .filter((wall): wall is ManagerListingFloorPlanWall => wall !== null);
  if (walls3D.length === 0) return null;

  return {
    walls3D,
    furnitures: Array.isArray(furnituresSource) ? furnituresSource.filter(isRecord) : [],
    ...(typeof nameSource === "string" && nameSource.trim() ? { name: nameSource.trim() } : {}),
  };
}

export function parseManagerListingFloorPlan(raw: string): ManagerListingFloorPlan | null {
  try {
    return normalizeManagerListingFloorPlan(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function readManagerListingFloorPlanSnapshot(
  storage: Pick<Storage, "getItem"> | null = typeof window === "undefined" ? null : window.localStorage,
): ManagerListingFloorPlan | null {
  const raw = storage?.getItem(MANAGER_LISTING_FLOOR_PLAN_STORAGE_KEY);
  return raw ? parseManagerListingFloorPlan(raw) : null;
}

export function mergeManagerListingPhotos(
  existingUrls: readonly string[],
  newFiles: readonly File[],
): ManagerListingPhotoSelection {
  if (newFiles.some((file) => !file.type.startsWith("image/"))) {
    throw new Error("이미지 파일만 추가할 수 있습니다.");
  }

  const normalizedUrls = [...new Set(existingUrls.filter((url) => typeof url === "string" && url.trim()))];
  const fileKeys = new Set<string>();
  const normalizedFiles = newFiles.filter((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (fileKeys.has(key)) return false;
    fileKeys.add(key);
    return true;
  });

  if (normalizedUrls.length + normalizedFiles.length > MAX_MANAGER_LISTING_PHOTOS) {
    throw new Error(`사진은 최대 ${MAX_MANAGER_LISTING_PHOTOS}장까지 등록할 수 있습니다.`);
  }

  return { existingUrls: normalizedUrls, newFiles: normalizedFiles };
}
