export const MITUNET_FLOOR_PLAN_SCHEMA = "roomlog-mitunet-floor-plan" as const;
export const MITUNET_FLOOR_PLAN_VERSION = 1 as const;

const MAX_POLYGONS_PER_CLASS = 2_000;
const MAX_POINTS_PER_RING = 2_000;
const MAX_HOLES_PER_POLYGON = 100;
const MAX_SOURCE_IMAGE_BASE64_LENGTH = 4_000_000;

export type MitunetPoint = [number, number];
export type MitunetRing = MitunetPoint[];
export type MitunetPolygon = { outer: MitunetRing; holes: MitunetRing[] };
export type MitunetSurfaceMode = "floor" | "source";
export type MitunetFloorPlan = {
  schema: typeof MITUNET_FLOOR_PLAN_SCHEMA;
  version: typeof MITUNET_FLOOR_PLAN_VERSION;
  name: string;
  canvasSize: [number, number];
  contentRect: [number, number, number, number];
  millimetersPerPixel: number | null;
  polygons: {
    wall: MitunetPolygon[];
    door: MitunetPolygon[];
    window: MitunetPolygon[];
  };
  sourceImageB64?: string;
  surfaceMode?: MitunetSurfaceMode;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteTuple(value: unknown, length: 2): [number, number] | null;
function finiteTuple(value: unknown, length: 4): [number, number, number, number] | null;
function finiteTuple(value: unknown, length: 2 | 4) {
  if (!Array.isArray(value) || value.length !== length) return null;
  const numbers = value.map(Number);
  return numbers.every(Number.isFinite) ? numbers : null;
}

function normalizeRing(value: unknown, coordinateLimit: number): MitunetRing | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > MAX_POINTS_PER_RING) return null;
  const ring: MitunetRing = [];
  for (const rawPoint of value) {
    const point = finiteTuple(rawPoint, 2);
    if (!point || point.some((coordinate) => Math.abs(coordinate) > coordinateLimit)) return null;
    ring.push(point);
  }
  return ring;
}

function normalizePolygon(value: unknown, coordinateLimit: number): MitunetPolygon | null {
  if (!isRecord(value) || !Array.isArray(value.holes) || value.holes.length > MAX_HOLES_PER_POLYGON) return null;
  const outer = normalizeRing(value.outer, coordinateLimit);
  if (!outer) return null;
  const holes: MitunetRing[] = [];
  for (const rawHole of value.holes) {
    const hole = normalizeRing(rawHole, coordinateLimit);
    if (!hole) return null;
    holes.push(hole);
  }
  return { outer, holes };
}

function normalizeGroup(value: unknown, coordinateLimit: number): MitunetPolygon[] | null {
  if (!Array.isArray(value) || value.length > MAX_POLYGONS_PER_CLASS) return null;
  const polygons: MitunetPolygon[] = [];
  for (const rawPolygon of value) {
    const polygon = normalizePolygon(rawPolygon, coordinateLimit);
    if (!polygon) return null;
    polygons.push(polygon);
  }
  return polygons;
}

function normalizeSourceImageB64(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_SOURCE_IMAGE_BASE64_LENGTH) return undefined;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : undefined;
}

export function normalizeMitunetFloorPlan(value: unknown): MitunetFloorPlan | null {
  if (!isRecord(value) || !isRecord(value.polygons)) return null;
  if (value.schema !== MITUNET_FLOOR_PLAN_SCHEMA || value.version !== MITUNET_FLOOR_PLAN_VERSION) return null;

  const canvasSize = finiteTuple(value.canvasSize, 2);
  const contentRect = finiteTuple(value.contentRect, 4);
  if (!canvasSize || !contentRect || canvasSize.some((dimension) => dimension <= 0 || dimension > 100_000)) return null;
  if (contentRect[2] <= 0 || contentRect[3] <= 0) return null;

  const coordinateLimit = Math.max(...canvasSize, contentRect[2], contentRect[3]) * 4;
  const wall = normalizeGroup(value.polygons.wall, coordinateLimit);
  const door = normalizeGroup(value.polygons.door, coordinateLimit);
  const window = normalizeGroup(value.polygons.window, coordinateLimit);
  if (!wall?.length || !door || !window) return null;

  const scale = Number(value.millimetersPerPixel);
  const sourceImageB64 = normalizeSourceImageB64(value.sourceImageB64);
  const surfaceMode: MitunetSurfaceMode | undefined = value.surfaceMode === "floor"
    ? "floor"
    : sourceImageB64
      ? "source"
      : undefined;
  return {
    schema: MITUNET_FLOOR_PLAN_SCHEMA,
    version: MITUNET_FLOOR_PLAN_VERSION,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 120) : "MitUNet floor plan",
    canvasSize,
    contentRect,
    millimetersPerPixel: Number.isFinite(scale) && scale > 0 ? scale : null,
    polygons: { wall, door, window },
    ...(surfaceMode ? { surfaceMode } : {}),
    ...(sourceImageB64 && surfaceMode === "source" ? { sourceImageB64 } : {})
  };
}
