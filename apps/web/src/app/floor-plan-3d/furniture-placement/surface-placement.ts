import { furnitureOverlapsFurniture } from "../room-model/collision";
import type {
  FurniturePlacementAttachment,
  FurniturePlacementMode,
  PlacedFurniture,
  WheretoputWall3D
} from "../room-model/types";
import { getFurnitureDimensions } from "./catalog";
import { moveFurnitureDraftToPoint } from "./placement";

const WALL_MOUNT_MAX_DEPTH_MM = 300;
const STACKABLE_MAX_SIDE_MM = 1000;
const STACKABLE_MAX_HEIGHT_MM = 1200;
const SURFACE_EDGE_MARGIN_M = 0.01;
const SURFACE_LIFT_M = 0.004;
const WALL_OFFSET_M = 0.002;
const VERTICAL_EPSILON_M = 0.003;

const FLOOR_ONLY_PATTERN = /소파|침대|매트리스|옷장|식탁|책상|테이블|의자|스툴|벤치|냉장고|세탁기|건조기/i;
const SUPPORT_PATTERN = /테이블|책상|수납|선반|장|서랍|캐비닛|주방|아일랜드|식탁/i;

export type FurniturePlacementPoint = { x: number; y: number; z: number };
export type FurniturePlacementHit =
  | { kind: "floor"; point: FurniturePlacementPoint }
  | { kind: "furniture"; furnitureId: string; point: FurniturePlacementPoint; supportTopY: number }
  | {
      kind: "wall";
      normal: FurniturePlacementPoint;
      point: FurniturePlacementPoint;
      wallId: string;
      wallMaxY: number;
      wallMinY: number;
    };

export type FurniturePlacementResult = {
  attachment: FurniturePlacementAttachment;
  furniture: PlacedFurniture;
  reason?: string;
  valid: boolean;
};

export type ResolveFurniturePlacementInput = {
  draft: PlacedFurniture;
  hit: FurniturePlacementHit;
  placed: readonly PlacedFurniture[];
  walls: readonly WheretoputWall3D[];
};

export function furniturePlacementMode(furniture: Pick<PlacedFurniture, "placement">): FurniturePlacementMode {
  return furniture.placement?.mode ?? "floor";
}

export function canPlaceFurniture(furniture: PlacedFurniture, mode: FurniturePlacementMode) {
  const capability = furniture.placementCapability;
  if (capability) return capability === "any" || capability === mode;
  if (mode === "floor") return true;

  const scale = Number.isFinite(furniture.scale) && furniture.scale > 0 ? furniture.scale : 1;
  const [widthMm, heightMm, depthMm] = furniture.length.map((value) => value * scale);
  const label = `${furniture.category ?? ""} ${furniture.name}`;
  if (FLOOR_ONLY_PATTERN.test(label)) return false;
  if (mode === "wall") return depthMm <= WALL_MOUNT_MAX_DEPTH_MM;
  return Math.max(widthMm, depthMm) <= STACKABLE_MAX_SIDE_MM && heightMm <= STACKABLE_MAX_HEIGHT_MM;
}

export function furnitureBaseY(furniture: PlacedFurniture) {
  if (furniture.modelUrl) return furniture.position[1];
  return furniture.position[1] - getFurnitureDimensions(furniture).height / 2;
}

export function resolveFurniturePlacement(input: ResolveFurniturePlacementInput): FurniturePlacementResult {
  if (input.hit.kind === "floor") return resolveFloorPlacement(input);
  if (input.hit.kind === "furniture") return resolveSurfacePlacement(input);
  return resolveWallPlacement(input);
}

export function rotateFurnitureForPlacement(furniture: PlacedFurniture, direction: -1 | 1): PlacedFurniture {
  const rotation = [...furniture.rotation] as [number, number, number];
  const axis = furniturePlacementMode(furniture) === "wall" ? 2 : 1;
  rotation[axis] = roundAngle(rotation[axis] + direction * Math.PI / 2);
  return { ...furniture, rotation };
}

export function hasAttachedFurniture(furnitureId: string, placed: readonly PlacedFurniture[]) {
  return placed.some((furniture) => furniture.placement?.mode === "surface" && furniture.placement.supportFurnitureId === furnitureId);
}

export function moveAttachedFurniture(input: {
  afterSupport: PlacedFurniture;
  beforeSupport: PlacedFurniture;
  furniture: readonly PlacedFurniture[];
}): PlacedFurniture[] {
  const angleDelta = input.afterSupport.rotation[1] - input.beforeSupport.rotation[1];
  const cos = Math.cos(angleDelta);
  const sin = Math.sin(angleDelta);

  return input.furniture.map((furniture) => {
    if (furniture.placement?.mode !== "surface" || furniture.placement.supportFurnitureId !== input.beforeSupport.id) {
      return furniture;
    }
    const dx = furniture.position[0] - input.beforeSupport.position[0];
    const dz = furniture.position[2] - input.beforeSupport.position[2];
    return {
      ...furniture,
      position: [
        roundMetric(input.afterSupport.position[0] + dx * cos - dz * sin),
        roundMetric(furniture.position[1] + input.afterSupport.position[1] - input.beforeSupport.position[1]),
        roundMetric(input.afterSupport.position[2] + dx * sin + dz * cos)
      ],
      rotation: [furniture.rotation[0], roundAngle(furniture.rotation[1] + angleDelta), furniture.rotation[2]]
    };
  });
}

function resolveFloorPlacement(input: ResolveFurniturePlacementInput): FurniturePlacementResult {
  if (!canPlaceFurniture(input.draft, "floor")) return invalid(input.draft, "floor", "바닥에 놓을 수 없는 가구입니다.");
  const furniture = withPlacement(
    moveFurnitureDraftToPoint(input.draft, input.hit.point, [...input.walls], { ignoreCrossing: true }),
    { mode: "floor" }
  );
  return validateCollision(furniture, input.placed, { mode: "floor" });
}

function resolveSurfacePlacement(input: ResolveFurniturePlacementInput): FurniturePlacementResult {
  const hit = input.hit;
  if (hit.kind !== "furniture") return invalid(input.draft, "surface", "받침 가구를 찾지 못했습니다.");
  const support = input.placed.find((furniture) => furniture.id === hit.furnitureId);
  if (!support) return invalid(input.draft, "surface", "받침 가구를 찾지 못했습니다.");
  if (!canPlaceFurniture(input.draft, "surface")) return invalid(input.draft, "surface", "이 가구는 위에 놓을 수 없습니다.");
  if (furniturePlacementMode(support) !== "floor" || !canSupportFurniture(support)) {
    return invalid(input.draft, "surface", "이 가구는 받침대로 사용할 수 없습니다.");
  }

  const supportDimensions = getFurnitureDimensions(support);
  const draftDimensions = getFurnitureDimensions(input.draft);
  const relativeYaw = input.draft.rotation[1] - support.rotation[1];
  const halfX = Math.abs(Math.cos(relativeYaw)) * draftDimensions.width / 2
    + Math.abs(Math.sin(relativeYaw)) * draftDimensions.depth / 2;
  const halfZ = Math.abs(Math.sin(relativeYaw)) * draftDimensions.width / 2
    + Math.abs(Math.cos(relativeYaw)) * draftDimensions.depth / 2;
  const limitX = supportDimensions.width / 2 - halfX - SURFACE_EDGE_MARGIN_M;
  const limitZ = supportDimensions.depth / 2 - halfZ - SURFACE_EDGE_MARGIN_M;
  if (limitX < 0 || limitZ < 0) return invalid(input.draft, "surface", "받침 가구보다 크기가 큽니다.");

  const local = worldToLocal(hit.point, support.position, support.rotation[1]);
  const snappedLocalX = clamp(local.x, -limitX, limitX);
  const snappedLocalZ = clamp(local.z, -limitZ, limitZ);
  const world = localToWorld({ x: snappedLocalX, z: snappedLocalZ }, support.position, support.rotation[1]);
  const attachment = { mode: "surface", supportFurnitureId: support.id } as const;
  const furniture = withBaseY(withPlacement({
    ...input.draft,
    position: [roundMetric(world.x), input.draft.position[1], roundMetric(world.z)]
  }, attachment), hit.supportTopY + SURFACE_LIFT_M);

  return validateCollision(furniture, input.placed, attachment, support.id);
}

function resolveWallPlacement(input: ResolveFurniturePlacementInput): FurniturePlacementResult {
  const hit = input.hit;
  if (hit.kind !== "wall") return invalid(input.draft, "wall", "벽을 찾지 못했습니다.");
  if (!canPlaceFurniture(input.draft, "wall")) return invalid(input.draft, "wall", "이 가구는 벽에 걸 수 없습니다.");

  const dimensions = getFurnitureDimensions(input.draft);
  const isLandscape = Math.abs(Math.round(input.draft.rotation[2] / (Math.PI / 2))) % 2 === 1;
  const renderedHeight = isLandscape ? dimensions.width : dimensions.height;
  const availableHeight = hit.wallMaxY - hit.wallMinY;
  if (renderedHeight + SURFACE_LIFT_M * 2 > availableHeight) {
    return invalid(input.draft, "wall", "벽 높이 안에 배치할 수 없습니다.");
  }
  const baseY = clamp(hit.point.y - renderedHeight / 2, hit.wallMinY + SURFACE_LIFT_M, hit.wallMaxY - renderedHeight - SURFACE_LIFT_M);
  const normalLength = Math.hypot(hit.normal.x, hit.normal.z) || 1;
  const normalX = hit.normal.x / normalLength;
  const normalZ = hit.normal.z / normalLength;
  const offset = dimensions.depth / 2 + WALL_OFFSET_M;
  const attachment = { mode: "wall", wallId: hit.wallId } as const;
  const yaw = roundAngle(Math.atan2(normalX, normalZ));
  const furniture = withBaseY(withPlacement({
    ...input.draft,
    position: [
      roundMetric(hit.point.x + normalX * offset),
      input.draft.position[1],
      roundMetric(hit.point.z + normalZ * offset)
    ],
    rotation: [0, yaw, input.draft.rotation[2]]
  }, attachment), baseY);

  return validateCollision(furniture, input.placed, attachment);
}

function canSupportFurniture(furniture: PlacedFurniture) {
  return SUPPORT_PATTERN.test(`${furniture.category ?? ""} ${furniture.name}`);
}

function validateCollision(
  furniture: PlacedFurniture,
  placed: readonly PlacedFurniture[],
  attachment: FurniturePlacementAttachment,
  ignoredFurnitureId?: string
): FurniturePlacementResult {
  const collision = placed.some((other) => other.id !== furniture.id
    && other.id !== ignoredFurnitureId
    && verticalSpansOverlap(furniture, other)
    && furnitureOverlapsFurniture(furniture, other));
  return collision ? invalid(furniture, attachment.mode, "다른 가구와 겹칩니다.") : { attachment, furniture, valid: true };
}

function verticalSpansOverlap(left: PlacedFurniture, right: PlacedFurniture) {
  const leftBase = furnitureBaseY(left);
  const rightBase = furnitureBaseY(right);
  const leftTop = leftBase + renderedHeight(left);
  const rightTop = rightBase + renderedHeight(right);
  return Math.min(leftTop, rightTop) - Math.max(leftBase, rightBase) > VERTICAL_EPSILON_M;
}

function renderedHeight(furniture: PlacedFurniture) {
  const dimensions = getFurnitureDimensions(furniture);
  const wallQuarterTurns = Math.abs(Math.round(furniture.rotation[2] / (Math.PI / 2))) % 2;
  return furniturePlacementMode(furniture) === "wall" && wallQuarterTurns === 1 ? dimensions.width : dimensions.height;
}

function withBaseY(furniture: PlacedFurniture, baseY: number): PlacedFurniture {
  const y = furniture.modelUrl ? baseY : baseY + renderedHeight(furniture) / 2;
  return { ...furniture, position: [furniture.position[0], roundMetric(y), furniture.position[2]] };
}

function withPlacement(furniture: PlacedFurniture, placement: FurniturePlacementAttachment): PlacedFurniture {
  return { ...furniture, placement };
}

function invalid(furniture: PlacedFurniture, mode: FurniturePlacementMode, reason: string): FurniturePlacementResult {
  return { attachment: { mode }, furniture, reason, valid: false };
}

function worldToLocal(point: { x: number; z: number }, origin: [number, number, number], yaw: number) {
  const dx = point.x - origin[0];
  const dz = point.z - origin[2];
  return { x: dx * Math.cos(yaw) + dz * Math.sin(yaw), z: -dx * Math.sin(yaw) + dz * Math.cos(yaw) };
}

function localToWorld(point: { x: number; z: number }, origin: [number, number, number], yaw: number) {
  return {
    x: origin[0] + point.x * Math.cos(yaw) - point.z * Math.sin(yaw),
    z: origin[2] + point.x * Math.sin(yaw) + point.z * Math.cos(yaw)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMetric(value: number) {
  return Number(value.toFixed(3));
}

function roundAngle(value: number) {
  return value;
}
