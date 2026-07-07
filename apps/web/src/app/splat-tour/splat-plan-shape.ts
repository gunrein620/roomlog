import type { WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import {
  WALL_CLIP_CEILING_MARGIN_METERS,
  WALL_CLIP_FLOOR_BAND_METERS,
  WALL_CLIP_INSET_METERS
} from "./splat-walls";

export type PlanWallsSource = "resident-design" | "floor-plan-draft";

export interface PlanWallsState {
  walls: WheretoputWall3D[];
  source: PlanWallsSource;
}

export interface PlanBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  height: number;
  centerX: number;
  centerZ: number;
}

type StorageCandidate = {
  savedAt: number;
  source: PlanWallsSource;
  walls: unknown[];
};

const DEFAULT_PLAN_HEIGHT_METERS = 2.4;

export function resolvePlanWalls(storage: Pick<Storage, "getItem"> | null): PlanWallsState | null {
  if (!storage) return null;

  const candidate = chooseStorageCandidate(
    readFloorPlanDraft(storage),
    readResidentDesign(storage)
  );
  if (!candidate) return null;

  const walls = candidate.walls.filter(isValidPlanWall);
  if (walls.length === 0) return null;

  return { source: candidate.source, walls };
}

export function loadPlanWallsFromBrowser(): PlanWallsState | null {
  if (typeof window === "undefined") return null;

  try {
    return resolvePlanWalls(window.localStorage);
  } catch {
    return null;
  }
}

export function wallsToPlanBounds(walls: readonly WheretoputWall3D[]): PlanBounds {
  const validWalls = walls.filter(isValidPlanWall);
  const corners = validWalls.flatMap((wall) => wallFootprintCorners(wall));
  const height = maxWallHeight(validWalls);

  if (corners.length === 0) {
    return {
      minX: 0,
      maxX: 0,
      minZ: 0,
      maxZ: 0,
      width: 0,
      depth: 0,
      height,
      centerX: 0,
      centerZ: 0
    };
  }

  const minX = Math.min(...corners.map((corner) => corner.x));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const minZ = Math.min(...corners.map((corner) => corner.z));
  const maxZ = Math.max(...corners.map((corner) => corner.z));

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    height,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2
  };
}

export function isNearAnyPlanWall(
  point: { x: number; y: number; z: number },
  walls: readonly WheretoputWall3D[],
  roomHeight: number,
  inset = WALL_CLIP_INSET_METERS
): boolean {
  if (
    !isFiniteNumber(point.x) ||
    !isFiniteNumber(point.y) ||
    !isFiniteNumber(point.z) ||
    !isFiniteNumber(roomHeight) ||
    !isFiniteNumber(inset)
  ) {
    return false;
  }

  if (point.y <= WALL_CLIP_FLOOR_BAND_METERS || point.y >= roomHeight + WALL_CLIP_CEILING_MARGIN_METERS) {
    return false;
  }

  return walls.some((wall) => {
    if (!isValidPlanWall(wall)) return false;

    const local = worldToWallLocalXZ(
      point.x - wall.position[0],
      point.z - wall.position[2],
      wall.rotation[1]
    );

    return (
      Math.abs(local.x) <= wall.dimensions.width / 2 + inset &&
      Math.abs(local.z) <= wall.dimensions.depth / 2 + inset
    );
  });
}

function readFloorPlanDraft(storage: Pick<Storage, "getItem">): StorageCandidate | null {
  const payload = readStoragePayload(storage, "floorPlanDraft");
  if (!payload) return null;

  return {
    savedAt: readSavedAt(payload.savedAt),
    source: "floor-plan-draft",
    walls: readRoom3DWalls(payload)
  };
}

function readResidentDesign(storage: Pick<Storage, "getItem">): StorageCandidate | null {
  const payload = readStoragePayload(storage, "residentFloorPlanDesign");
  if (!payload) return null;

  return {
    savedAt: readSavedAt(payload.savedAt),
    source: "resident-design",
    walls: readRoom3DWalls(payload)
  };
}

function readStoragePayload(storage: Pick<Storage, "getItem">, key: string): Record<string, unknown> | null {
  try {
    const rawValue = storage.getItem(key);
    if (rawValue === null) return null;

    const parsed = JSON.parse(rawValue);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function chooseStorageCandidate(
  draft: StorageCandidate | null,
  resident: StorageCandidate | null
): StorageCandidate | null {
  if (draft && resident) {
    return resident.savedAt >= draft.savedAt ? resident : draft;
  }

  return resident ?? draft;
}

function readRoom3DWalls(payload: Record<string, unknown>): unknown[] {
  const room3d = payload.room3d;
  if (!isRecord(room3d)) return [];

  return readArray(room3d.walls);
}

function isValidPlanWall(value: unknown): value is WheretoputWall3D {
  if (!isRecord(value) || !isRecord(value.dimensions)) return false;

  return (
    isPositiveFiniteNumber(value.dimensions.width) &&
    isPositiveFiniteNumber(value.dimensions.height) &&
    isPositiveFiniteNumber(value.dimensions.depth) &&
    isFiniteNumberTuple(value.position) &&
    isFiniteNumberTuple(value.rotation)
  );
}

function wallFootprintCorners(wall: WheretoputWall3D): { x: number; z: number }[] {
  const halfWidth = wall.dimensions.width / 2;
  const halfDepth = wall.dimensions.depth / 2;
  const localCorners = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth }
  ];

  return localCorners.map((corner) => wallLocalToWorldXZ(corner.x, corner.z, wall));
}

function wallLocalToWorldXZ(localX: number, localZ: number, wall: WheretoputWall3D): { x: number; z: number } {
  const ry = wall.rotation[1];
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);

  return {
    x: wall.position[0] + localX * cos + localZ * sin,
    z: wall.position[2] - localX * sin + localZ * cos
  };
}

function worldToWallLocalXZ(dx: number, dz: number, ry: number): { x: number; z: number } {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);

  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos
  };
}

function maxWallHeight(walls: readonly WheretoputWall3D[]): number {
  const heights = walls.map((wall) => wall.dimensions.height).filter(isPositiveFiniteNumber);

  return heights.length > 0 ? Math.max(...heights) : DEFAULT_PLAN_HEIGHT_METERS;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readSavedAt(value: unknown): number {
  return isFiniteNumber(value) ? value : 0;
}

function isFiniteNumberTuple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
