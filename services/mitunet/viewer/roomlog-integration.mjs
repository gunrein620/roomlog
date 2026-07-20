export const ROOMLOG_MESSAGE_TYPE = "roomlog.floor-plan.completed";
export const ROOMLOG_MESSAGE_SCHEMA = "roomlog-mitunet-floor-plan";
export const ROOMLOG_MESSAGE_VERSION = 1;

import { decodeRoomFloorLabels } from "./room-floor-zones.mjs";

const FURNITURE_ASSET_BASE_URL = "/floor-plan-3d/furniture-assets/";
const UNCALIBRATED_FURNITURE_SCALE = 0.55 / 2.7;
const MAX_PREVIEW_IMAGE_BASE64_LENGTH = 4_000_000;
const FURNITURE_PASTELS = [
  "#93B7F2",
  "#F4AE62",
  "#91D2AF",
  "#C7A1F5",
  "#F0CB67",
  "#E99A9A",
];

export function readRoomLogContext(locationLike, allowedOrigins = []) {
  const params = new URLSearchParams(locationLike?.search ?? "");
  if (params.get("integration") !== "roomlog") return null;

  const returnOrigin = params.get("returnOrigin") ?? "";
  const requestId = params.get("requestId")?.trim() ?? "";
  if (!allowedOrigins.includes(returnOrigin) || !requestId) return null;

  return { requestId, returnOrigin };
}

function clonePolygons(polygons) {
  return JSON.parse(JSON.stringify({
    wall: Array.isArray(polygons?.wall) ? polygons.wall : [],
    door: Array.isArray(polygons?.door) ? polygons.door : [],
    window: Array.isArray(polygons?.window) ? polygons.window : [],
  }));
}

function cloneFloorMaterials(value) {
  if (value == null) return undefined;
  if (!Array.isArray(value.zones) || value.zones.length > 255) {
    throw new Error("Invalid room floor material map");
  }
  decodeRoomFloorLabels(value);
  return JSON.parse(JSON.stringify(value));
}

function previewSurface(plan, mode, previewImageB64) {
  if (mode !== "source") return { surfaceMode: "floor" };
  const sourceImageB64 = previewImageB64 ?? plan?.input_image_b64;
  if (
    typeof sourceImageB64 !== "string"
    || sourceImageB64.length === 0
    || sourceImageB64.length > MAX_PREVIEW_IMAGE_BASE64_LENGTH
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(sourceImageB64)
  ) {
    return { surfaceMode: "floor" };
  }
  return { sourceImageB64, surfaceMode: "source" };
}

function copyTuple(value, length, fallback) {
  if (!Array.isArray(value) || value.length < length) return [...fallback];
  return value.slice(0, length).map(Number);
}

function invalidFurniture(index, reason) {
  throw new Error(`Invalid furniture at index ${index}: ${reason}`);
}

function validatedFurniturePath(value, index) {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    return invalidFurniture(index, "relativePath is required");
  }
  if (
    value.startsWith("/")
    || value.includes("\\")
    || /[%?#\u0000-\u001f]/.test(value)
  ) {
    return invalidFurniture(index, "relativePath is unsafe");
  }

  const segments = value.split("/");
  if (
    segments.length < 2
    || segments.some((segment) => !segment || segment === "." || segment === "..")
    || !segments.at(-1).toLowerCase().endsWith(".glb")
  ) {
    return invalidFurniture(index, "relativePath must be a nested GLB asset");
  }
  return { relativePath: value, segments };
}

function validatedFiniteTuple(value, index) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    return invalidFurniture(index, "position must contain three finite numbers");
  }
  return [...value];
}

function validatedSizeMm(value, index) {
  const dimensions = [value?.width, value?.height, value?.depth];
  if (
    dimensions.some(
      (entry) => typeof entry !== "number" || !Number.isFinite(entry) || entry <= 0,
    )
  ) {
    return invalidFurniture(index, "sizeMm dimensions must be positive finite numbers");
  }
  return { width: dimensions[0], height: dimensions[1], depth: dimensions[2] };
}

function furnitureDisplayName(filename) {
  const withoutExtension = filename.replace(/\.glb$/i, "");
  const withoutIkeaPrefix = withoutExtension.replace(/^ikea[-_ ]+/i, "");
  const withoutSku = withoutIkeaPrefix.replace(/[-_ ]+[a-z]?\d{6,}$/i, "");
  const words = withoutSku.split(/[-_ ]+/).filter(Boolean);
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") || "Furniture";
}

function furnitureColor(relativePath) {
  let hash = 0;
  for (const character of relativePath) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return FURNITURE_PASTELS[hash % FURNITURE_PASTELS.length];
}

function mapFurniturePlacements(furnitures, hasPhysicalScale) {
  if (!Array.isArray(furnitures)) {
    throw new Error("Invalid furniture collection: expected an array");
  }

  return furnitures.map((furniture, index) => {
    if (!furniture || typeof furniture !== "object") {
      return invalidFurniture(index, "placement must be an object");
    }
    const id = typeof furniture.id === "string" ? furniture.id.trim() : "";
    if (!id) return invalidFurniture(index, "id is required");

    const { relativePath, segments } = validatedFurniturePath(furniture.relativePath, index);
    const position = validatedFiniteTuple(furniture.position, index);
    if (typeof furniture.rotationY !== "number" || !Number.isFinite(furniture.rotationY)) {
      return invalidFurniture(index, "rotationY must be finite");
    }
    const sizeMm = validatedSizeMm(furniture.sizeMm, index);

    return {
      id,
      furniture_id: `glb-dataset-${relativePath}`,
      name: furnitureDisplayName(segments.at(-1)),
      category: segments[0],
      brand: "",
      color: furnitureColor(relativePath),
      price: 0,
      source: "furniture-glb-dataset",
      modelUrl: `${FURNITURE_ASSET_BASE_URL}${relativePath}`,
      length: [sizeMm.width, sizeMm.height, sizeMm.depth],
      position,
      rotation: [0, furniture.rotationY, 0],
      scale: hasPhysicalScale ? 1 : UNCALIBRATED_FURNITURE_SCALE,
      sizeMm,
    };
  });
}

export function buildRoomLogCompletion(
  context,
  plan,
  sourceName = "",
  furnitures = [],
  previewMode = "floor",
  previewImageB64,
) {
  if (!context) throw new Error("RoomLog integration is not active");
  if (!Array.isArray(plan?.polygons?.wall) || plan.polygons.wall.length === 0) {
    throw new Error("A rendered wall plan is required");
  }

  const millimetersPerPixel = Number(plan?.calibration?.millimetersPerPixel);
  const hasPhysicalScale = Number.isFinite(millimetersPerPixel) && millimetersPerPixel > 0;
  const floorMaterials = cloneFloorMaterials(plan.floor_materials);
  const surface = previewSurface(plan, previewMode, previewImageB64);
  return {
    type: ROOMLOG_MESSAGE_TYPE,
    schema: ROOMLOG_MESSAGE_SCHEMA,
    version: ROOMLOG_MESSAGE_VERSION,
    requestId: context.requestId,
    payload: {
      name: String(sourceName || "MitUNet floor plan"),
      canvasSize: copyTuple(plan.canvas_size, 2, [1024, 1024]),
      contentRect: copyTuple(plan.content_rect, 4, [0, 0, 1024, 1024]),
      millimetersPerPixel: hasPhysicalScale ? millimetersPerPixel : null,
      polygons: clonePolygons(plan.polygons),
      furnitures: mapFurniturePlacements(furnitures, hasPhysicalScale),
      ...surface,
      ...(floorMaterials ? { floorMaterials } : {}),
    },
  };
}

export function sendRoomLogCompletion(
  context,
  plan,
  sourceName,
  furnitures = [],
  previewMode = "floor",
  previewImageB64,
) {
  const message = buildRoomLogCompletion(
    context,
    plan,
    sourceName,
    furnitures,
    previewMode,
    previewImageB64,
  );
  if (!globalThis.window?.localStorage) {
    throw new Error("RoomLog storage is not available in this browser");
  }

  const storageValue = {
    name: message.payload.name,
    savedAt: Date.now(),
    walls3D: [],
    furnitures: message.payload.furnitures,
    mitunet: message.payload,
  };
  const storageKey = `roomlogListingFloorPlan3D:${context.requestId}`;
  window.localStorage.setItem(storageKey, JSON.stringify(storageValue));

  const returnUrl = new URL("/?flow=listing#my-page", context.returnOrigin);
  returnUrl.searchParams.set("floorPlanRequestId", context.requestId);
  window.location.href = returnUrl.toString();
  return message;
}
