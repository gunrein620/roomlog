export const MITUNET_SCHEMA = "roomlog-mitunet-floor-plan" as const;
export const MITUNET_VERSION = 1 as const;
export const MAX_POLYGONS_PER_CLASS = 2_000;
export const MAX_POINTS_PER_RING = 2_000;
export const MAX_HOLES_PER_POLYGON = 100;

export type MitunetPoint = [number, number];
export type MitunetRing = MitunetPoint[];
export type MitunetPolygon = { outer: MitunetRing; holes: MitunetRing[] };
export type MitunetPolygonGroups = {
  wall: MitunetPolygon[];
  door: MitunetPolygon[];
  window: MitunetPolygon[];
};

export type MitunetFloorPlan = {
  schema: typeof MITUNET_SCHEMA;
  version: typeof MITUNET_VERSION;
  name: string;
  canvasSize: [number, number];
  contentRect: [number, number, number, number];
  millimetersPerPixel: number | null;
  polygons: MitunetPolygonGroups;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteTuple(value: unknown, length: 2): [number, number] | null;
function finiteTuple(value: unknown, length: 4): [number, number, number, number] | null;
function finiteTuple(value: unknown, length: 2 | 4) {
  if (!Array.isArray(value) || value.length !== length) return null;
  const numbers = value.map(Number);
  if (!numbers.every(Number.isFinite)) return null;
  return numbers;
}

function normalizeRing(value: unknown, maximumCoordinate: number): MitunetRing | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > MAX_POINTS_PER_RING) {
    return null;
  }

  const ring: MitunetRing = [];
  for (const rawPoint of value) {
    const point = finiteTuple(rawPoint, 2);
    if (!point || point.some((coordinate) => Math.abs(coordinate) > maximumCoordinate)) {
      return null;
    }
    ring.push(point);
  }
  return ring;
}

function normalizePolygon(value: unknown, maximumCoordinate: number): MitunetPolygon | null {
  if (!isRecord(value)) return null;
  const outer = normalizeRing(value.outer, maximumCoordinate);
  if (!outer) return null;
  if (!Array.isArray(value.holes) || value.holes.length > MAX_HOLES_PER_POLYGON) return null;

  const holes: MitunetRing[] = [];
  for (const rawHole of value.holes) {
    const hole = normalizeRing(rawHole, maximumCoordinate);
    if (!hole) return null;
    holes.push(hole);
  }
  return { outer, holes };
}

function normalizePolygonGroup(value: unknown, maximumCoordinate: number): MitunetPolygon[] | null {
  if (!Array.isArray(value) || value.length > MAX_POLYGONS_PER_CLASS) return null;
  const polygons: MitunetPolygon[] = [];
  for (const rawPolygon of value) {
    const polygon = normalizePolygon(rawPolygon, maximumCoordinate);
    if (!polygon) return null;
    polygons.push(polygon);
  }
  return polygons;
}

export function buildRoomlogMitunetEditorPath(roomlogOrigin: string, requestId: string): string {
  const url = new URL("/floor-plan-3d/mitunet", roomlogOrigin);
  url.searchParams.set("integration", "roomlog");
  url.searchParams.set("returnOrigin", roomlogOrigin);
  url.searchParams.set("requestId", requestId);
  return `${url.pathname}${url.search}`;
}

export function normalizeMitunetPayload(value: unknown): MitunetFloorPlan | null {
  if (!isRecord(value) || !isRecord(value.polygons)) return null;

  const canvasSize = finiteTuple(value.canvasSize, 2);
  const contentRect = finiteTuple(value.contentRect, 4);
  if (!canvasSize || !contentRect) return null;
  if (canvasSize.some((dimension) => dimension <= 0 || dimension > 100_000)) return null;
  if (contentRect[2] <= 0 || contentRect[3] <= 0) return null;

  const maximumCoordinate = Math.max(...canvasSize, contentRect[2], contentRect[3]) * 4;
  const wall = normalizePolygonGroup(value.polygons.wall, maximumCoordinate);
  const door = normalizePolygonGroup(value.polygons.door, maximumCoordinate);
  const window = normalizePolygonGroup(value.polygons.window, maximumCoordinate);
  if (!wall?.length || !door || !window) return null;

  const rawScale = Number(value.millimetersPerPixel);
  const millimetersPerPixel = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : null;

  return {
    schema: MITUNET_SCHEMA,
    version: MITUNET_VERSION,
    name: typeof value.name === "string" && value.name.trim()
      ? value.name.trim().slice(0, 120)
      : "MitUNet floor plan",
    canvasSize,
    contentRect,
    millimetersPerPixel,
    polygons: { wall, door, window },
  };
}

export function parseMitunetProjectJson(value: unknown): MitunetFloorPlan | null {
  if (!isRecord(value)) return null;

  if (value.schema === MITUNET_SCHEMA && value.version === MITUNET_VERSION) {
    return normalizeMitunetPayload(value);
  }

  if (
    value.schema !== "mitunet-floorplan-3d-project" ||
    value.version !== 1 ||
    !isRecord(value.plan)
  ) {
    return null;
  }

  const plan = value.plan;
  const calibration = isRecord(plan.calibration) ? plan.calibration : null;
  return normalizeMitunetPayload({
    name: typeof value.source_name === "string" ? value.source_name : "MitUNet floor plan",
    canvasSize: plan.canvas_size,
    contentRect: plan.content_rect,
    millimetersPerPixel: calibration?.millimetersPerPixel,
    polygons: plan.polygons,
  });
}
