import type { WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import {
  WALL_CLIP_CEILING_MARGIN_METERS,
  WALL_CLIP_FLOOR_BAND_METERS,
  WALL_CLIP_INSET_METERS
} from "./splat-walls";

export type PlanWallsSource = "resident-design" | "floor-plan-draft" | "tour-upload" | "capture";

// register 픽 화면에서 업로드한 도면을 뷰어(벽 대체·걷기 경계·미니맵)와 공유하는 전용 키.
// 에디터 저장본(floorPlanDraft/residentFloorPlanDesign)을 덮지 않기 위해 별도 키를 쓴다.
const TOUR_UPLOAD_STORAGE_KEY = "splatTourPlanUpload";

export interface PlanWallsState {
  walls: WheretoputWall3D[];
  source: PlanWallsSource;
}

export interface ViewerPlanWallsState {
  walls: WheretoputWall3D[] | null;
  source: "server" | PlanWallsSource | "placeholder";
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
// RoomPlan(iOS)은 벽을 두께 0인 면으로 모델링한다(실캡처로 확인, 커밋 4dd61e07). isValidPlanWall이
// depth>0을 요구하므로, 렌더용 최소 두께를 합성해 실캡처 벽이 조용히 걸러지지 않게 한다.
const CAPTURE_WALL_MIN_DEPTH_METERS = 0.05;

export function resolvePlanWalls(storage: Pick<Storage, "getItem"> | null): PlanWallsState | null {
  if (!storage) return null;

  const editorCandidate = chooseStorageCandidate(
    readFloorPlanDraft(storage),
    readResidentDesign(storage)
  );
  const uploadCandidate = readTourUpload(storage);
  // 업로드는 명시적 행위이므로 savedAt 동률에서도 에디터 저장본을 이긴다.
  const candidate =
    uploadCandidate && (!editorCandidate || uploadCandidate.savedAt >= editorCandidate.savedAt)
      ? uploadCandidate
      : editorCandidate;
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

/**
 * 서버 저장된 도면 초안(floorPlanDraft)의 서버 FloorPlan id를 읽는다.
 * 에디터가 서버 저장에 성공하면 `{ ...payload, id: saved.id }`로 기록하고,
 * 실패 시엔 `status: "LOCAL_DRAFT"`로 남긴다 — 후자는 서버에 없으므로 연결 대상에서 제외한다.
 * register 픽 화면이 정합 저장 때 이 id를 실어 SplatAsset.floorPlanId를 채운다.
 */
export function readFloorPlanDraftServerId(storage: Pick<Storage, "getItem">): string | null {
  const payload = readStoragePayload(storage, "floorPlanDraft");
  if (!payload) return null;
  if (payload.status === "LOCAL_DRAFT") return null;

  return typeof payload.id === "string" && payload.id.trim() !== "" ? payload.id.trim() : null;
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

function readTourUpload(storage: Pick<Storage, "getItem">): StorageCandidate | null {
  const payload = readStoragePayload(storage, TOUR_UPLOAD_STORAGE_KEY);
  if (!payload) return null;

  return {
    savedAt: readSavedAt(payload.savedAt),
    source: "tour-upload",
    walls: readRoom3DWalls(payload)
  };
}

/** register 업로드 도면을 뷰어와 공유하도록 저장한다. 실패(용량·차단)해도 조용히 넘어간다. */
export function persistTourUploadPlanWalls(
  walls: readonly WheretoputWall3D[],
  storage: Pick<Storage, "setItem">,
  savedAt: number
): boolean {
  try {
    storage.setItem(TOUR_UPLOAD_STORAGE_KEY, JSON.stringify({ room3d: { walls }, savedAt }));
    return true;
  } catch {
    return false;
  }
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

/**
 * 업로드된 도면 JSON에서 벽 배열을 뽑는다. 허용 형태(관대한 순서로):
 * 벽 배열 그대로 | { walls: [...] } | { room3d: { walls: [...] } } (floorPlanDraft/residentFloorPlanDesign 포맷).
 * 유효한 벽이 하나도 없으면 빈 배열.
 */
export function planWallsFromPayload(payload: unknown): WheretoputWall3D[] {
  const candidates: unknown[] = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? [...readArray(payload.walls), ...readRoom3DWalls(payload)]
      : [];

  return candidates.filter(isValidPlanWall);
}

/**
 * RoomPlan(iOS) 캡처 도면(SplatAsset.captureFloorPlan, roomplan.json)을 뷰어 벽으로 변환한다.
 * 이 경로의 벽은 splat과 같은 ARSession에서 나와 좌표계가 동일하므로(RoomPlanExporter.swift 주석)
 * 정합(transform) 없이 항등으로 그대로 쓴다. 입력은 미검증 JSON이니 관대하게 파싱하고, 유효한
 * 벽이 하나도 없으면 빈 배열을 돌려준다.
 */
export function planWallsFromCaptureFloorPlan(payload: unknown): WheretoputWall3D[] {
  if (!isRecord(payload)) return [];

  return readArray(payload.walls).reduce<WheretoputWall3D[]>((walls, rawWall, index) => {
    const wall = metricWallToPlanWall(rawWall, index);
    if (wall) walls.push(wall);
    return walls;
  }, []);
}

/**
 * MetricWall(start/end 세그먼트, ARKit 실측 미터) 하나를 WheretoputWall3D로 변환한다.
 * position = 세그먼트 중점(y는 height/2, 기존 도면 벽과 동일하게 바닥부터 절반 높이).
 * rotation[1](yaw)은 wallLocalToWorldXZ의 역함수가 되도록 구한다 — 그 함수는
 * z = position[2] − localX·sin(ry) + localZ·cos(ry) 로 z에 음의 sin을 쓰므로,
 * 방향벡터 (dx,dz) = end−start 에 대해 cos(ry) = dx/len, sin(ry) = −dz/len 를 만족해야 하고,
 * 이는 곧 ry = atan2(−dz, dx)다(왕복 테스트로 검증).
 */
function metricWallToPlanWall(value: unknown, index: number): WheretoputWall3D | null {
  if (!isRecord(value)) return null;
  if (!isFiniteNumberPair(value.start) || !isFiniteNumberPair(value.end)) return null;
  if (!isPositiveFiniteNumber(value.height)) return null;
  if (!isFiniteNumber(value.thickness) || value.thickness < 0) return null;

  const [startX, startZ] = value.start;
  const [endX, endZ] = value.end;
  const dx = endX - startX;
  const dz = endZ - startZ;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) return null;

  const wall: WheretoputWall3D = {
    id: `capture-wall-${index}`,
    wall_id: `capture-wall-${index}`,
    material: "wall",
    dimensions: {
      width: length,
      height: value.height,
      depth: Math.max(value.thickness, CAPTURE_WALL_MIN_DEPTH_METERS)
    },
    position: [(startX + endX) / 2, value.height / 2, (startZ + endZ) / 2],
    rotation: [0, Math.atan2(-dz, dx), 0]
  };

  return isValidPlanWall(wall) ? wall : null;
}

function isFiniteNumberPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);
}

/**
 * 벽 출처 우선순위: 캡처 도면(같은 ARSession이라 정합 불필요) → 공개 자산 벽(연결된 도면/매물
 * 스냅샷) → 브라우저 도면 → placeholder.
 */
export function resolveViewerPlanWalls(
  capturePayload: unknown,
  serverPayload: unknown,
  browserState: PlanWallsState | null
): ViewerPlanWallsState {
  const captureWalls = planWallsFromCaptureFloorPlan(capturePayload);
  if (captureWalls.length > 0) {
    return { walls: captureWalls, source: "capture" };
  }

  const serverWalls = planWallsFromPayload(serverPayload);
  if (serverWalls.length > 0) {
    return { walls: serverWalls, source: "server" };
  }

  const browserWalls = browserState?.walls.filter(isValidPlanWall) ?? [];
  if (browserState && browserWalls.length > 0) {
    return { walls: browserWalls, source: browserState.source };
  }

  return { walls: null, source: "placeholder" };
}

/** 벽 하나의 바닥 발자국(XZ) 4모서리 — 도면 SVG 렌더용. */
export function planWallFootprint(wall: WheretoputWall3D): { x: number; z: number }[] {
  return wallFootprintCorners(wall);
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
