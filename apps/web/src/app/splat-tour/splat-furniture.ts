import { ROOMLOG_FURNITURE_CATALOG } from "../floor-plan-3d/furniture-placement";
import type { PlacedFurniture } from "../floor-plan-3d/room-model/types";

export type SplatFurnitureSource =
  | "none"
  | "url-off"
  | "url-demo"
  | "resident-design"
  | "floor-plan-draft"
  | "listing-tour"
  | "asset-server";

/** 매물 상세 "3D 보기" 저장의 공유 키 — 상세는 도면별 키와 함께 여기에도 최신본을 쓴다.
 *  (도면별 키는 이름+벽 해시라 투어가 역산할 수 없어, 공유 키로 다리를 놓는다 — 가구 gap 수정.) */
export const LISTING_TOUR_FURNITURE_LATEST_KEY = "roomlogListingTourFurnitureLatest";

export interface SplatFurnitureState {
  furnitures: PlacedFurniture[];
  source: SplatFurnitureSource;
}

type StorageCandidate = {
  furnitures: unknown[];
  savedAt: number;
  source: Exclude<SplatFurnitureSource, "none" | "url-off" | "url-demo">;
};

/** 데모 가구 세트 — ROOMLOG_FURNITURE_CATALOG의 침대·책상·의자를 3×4m 방 안에 배치한다. */
export const DEMO_SPLAT_FURNITURE: readonly PlacedFurniture[] = [
  createDemoFurniture("demo-bed", "furniture-bed-queen", [-0.45, 1.1], 0),
  createDemoFurniture("demo-desk", "furniture-desk", [0.7, -1.4], 0),
  createDemoFurniture("demo-chair", "furniture-chair", [0.7, -0.72], 0)
];

export function resolveSplatFurniture(
  search: string,
  storage: Pick<Storage, "getItem"> | null
): SplatFurnitureState {
  const params = new URLSearchParams(search);
  const furnitureParams = params.getAll("furniture").map((value) => value.trim().toLowerCase());

  if (furnitureParams.some(isFurnitureOffValue)) {
    return { furnitures: [], source: "url-off" };
  }

  if (furnitureParams.some((value) => value === "demo")) {
    return { furnitures: [...DEMO_SPLAT_FURNITURE], source: "url-demo" };
  }

  if (!storage) return createEmptyState();

  const candidate = chooseStorageCandidate([
    readFloorPlanDraft(storage),
    readResidentDesign(storage),
    readListingTourSave(storage)
  ]);
  if (!candidate) return createEmptyState();

  const furnitures = candidate.furnitures.filter(isValidPlacedFurniture);
  if (furnitures.length === 0) return createEmptyState();

  return { furnitures, source: candidate.source };
}

export function loadSplatFurnitureFromBrowser(): SplatFurnitureState {
  if (typeof window === "undefined") return createEmptyState();

  try {
    return resolveSplatFurniture(window.location.search, window.localStorage);
  } catch {
    // 브라우저 저장소 접근이 막힌 환경에서는 투어 렌더를 계속 살린다.
    return resolveSplatFurniture(window.location.search, null);
  }
}

/** resolveViewerFurniture가 참조하는 자산의 최소 형태 — status와 서버 동봉 furnitures만 본다. */
export interface ViewerFurnitureAsset {
  status: string;
  furnitures?: unknown;
}

/**
 * ?asset= 링크 방문자용 가구 소스 결정. 우선순위(높음→낮음):
 *   1. ?furniture=0/off — 언제나 최우선(서버 가구보다도 위).
 *   2. 서버 동봉 가구 — 자산이 REGISTERED이고 유효 furnitures가 있을 때만.
 *      (정합 전엔 도면 좌표와 splat이 안 맞아 가구가 허공에 뜨므로 REGISTERED 게이트 필수.)
 *   3. 기존 로컬/데모 체인(resolveSplatFurniture) — localStorage 초안 → ?furniture=demo.
 */
export function resolveViewerFurniture(
  search: string,
  storage: Pick<Storage, "getItem"> | null,
  asset: ViewerFurnitureAsset | null
): SplatFurnitureState {
  const params = new URLSearchParams(search);
  const furnitureParams = params.getAll("furniture").map((value) => value.trim().toLowerCase());
  if (furnitureParams.some(isFurnitureOffValue)) {
    return { furnitures: [], source: "url-off" };
  }

  const serverFurnitures = resolveServerFurniture(asset);
  if (serverFurnitures) {
    return { furnitures: serverFurnitures, source: "asset-server" };
  }

  return resolveSplatFurniture(search, storage);
}

export function loadViewerFurnitureFromBrowser(asset: ViewerFurnitureAsset | null): SplatFurnitureState {
  if (typeof window === "undefined") return createEmptyState();

  try {
    return resolveViewerFurniture(window.location.search, window.localStorage, asset);
  } catch {
    return resolveViewerFurniture(window.location.search, null, asset);
  }
}

function resolveServerFurniture(asset: ViewerFurnitureAsset | null): PlacedFurniture[] | null {
  if (!asset || asset.status !== "REGISTERED") return null;
  if (!Array.isArray(asset.furnitures)) return null;

  const furnitures = asset.furnitures.filter(isValidPlacedFurniture);
  return furnitures.length > 0 ? furnitures : null;
}

function createEmptyState(): SplatFurnitureState {
  return { furnitures: [], source: "none" };
}

function createDemoFurniture(
  id: string,
  furnitureId: string,
  positionXZ: [number, number],
  yaw: number
): PlacedFurniture {
  const item = ROOMLOG_FURNITURE_CATALOG.find((catalogItem) => catalogItem.furniture_id === furnitureId);
  if (!item) throw new Error(`Missing demo furniture catalog item: ${furnitureId}`);

  return {
    ...item,
    id,
    position: [positionXZ[0], item.length[1] / 2000, positionXZ[1]],
    rotation: [0, yaw, 0],
    scale: 1
  };
}

function readFloorPlanDraft(storage: Pick<Storage, "getItem">): StorageCandidate | null {
  const payload = readStoragePayload(storage, "floorPlanDraft");
  if (!payload) return null;

  return {
    furnitures: readArray(payload.furnitures),
    savedAt: readSavedAt(payload.savedAt),
    source: "floor-plan-draft"
  };
}

function readResidentDesign(storage: Pick<Storage, "getItem">): StorageCandidate | null {
  const payload = readStoragePayload(storage, "residentFloorPlanDesign");
  if (!payload) return null;

  return {
    furnitures: [...readArray(payload.lockedFurnitures), ...readArray(payload.furnitures)],
    savedAt: readSavedAt(payload.savedAt),
    source: "resident-design"
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

function readListingTourSave(storage: Pick<Storage, "getItem">): StorageCandidate | null {
  const payload = readStoragePayload(storage, LISTING_TOUR_FURNITURE_LATEST_KEY);
  if (!payload) return null;

  return {
    furnitures: readArray(payload.furnitures),
    savedAt: readSavedAt(payload.savedAt),
    source: "listing-tour"
  };
}

/** 가장 최근 저장본이 이긴다 — 동률이면 배열 뒤쪽(상세 저장) 우선(기존 draft<resident 동률 규칙 유지). */
function chooseStorageCandidate(candidates: Array<StorageCandidate | null>): StorageCandidate | null {
  return candidates.reduce<StorageCandidate | null>(
    (best, candidate) => (candidate && (!best || candidate.savedAt >= best.savedAt) ? candidate : best),
    null
  );
}

export function isValidPlacedFurniture(value: unknown): value is PlacedFurniture {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isFiniteNumberTuple(value.position, { positive: false }) &&
    isFiniteNumberTuple(value.rotation, { positive: false }) &&
    typeof value.scale === "number" &&
    Number.isFinite(value.scale) &&
    value.scale > 0 &&
    isFiniteNumberTuple(value.length, { positive: true })
  );
}

function isFiniteNumberTuple(value: unknown, { positive }: { positive: boolean }): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item) && (!positive || item > 0))
  );
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readSavedAt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isFurnitureOffValue(value: string): boolean {
  return value === "0" || value === "off" || value === "false" || value === "no";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
