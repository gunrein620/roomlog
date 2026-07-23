import { furnitureOverlapsFurniture } from "../room-model/collision";
import type {
  FurniturePlacementAttachment,
  FurniturePlacementMode,
  PlacedFurniture,
  WheretoputWall3D
} from "../room-model/types";
import { getFurnitureDimensions } from "./catalog";
import { moveFurnitureDraftToPoint, quarterTurnSnapAngle } from "./placement";

const SURFACE_EDGE_MARGIN_M = 0.01;
const SURFACE_LIFT_M = 0.004;
const WALL_OFFSET_M = 0.002;
const VERTICAL_EPSILON_M = 0.003;

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

// 배치 자유화(사용자 결정 2026-07-23): 어떤 가구든 바닥·가구 위·벽에 붙일 수 있다.
// 품목(소파·침대 등)·크기(벽걸이 깊이, 적재 한도)·placementCapability 게이트를 모두 제거하고,
// 물리적으로 불가능한 것(벽 높이 초과, 2단 적재)만 resolve 단계에서 막는다.
export function canPlaceFurniture(_furniture: PlacedFurniture, _mode: FurniturePlacementMode) {
  return true;
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
  // 섬세 회전으로 어긋난 각도여도 90도 버튼은 절대 그리드(0·90·180·270)로 맞춘다.
  rotation[axis] = roundAngle(quarterTurnSnapAngle(rotation[axis], direction));
  return { ...furniture, rotation };
}

// 1/3 홀드 연속 회전용 임의 각도 회전 — 바닥·표면 가구만.
// 벽걸이는 렌더 높이 계산이 90도 단위 회전을 가정하므로 스냅(rotateFurnitureForPlacement)을 유지한다.
export function rotateFurnitureBy(furniture: PlacedFurniture, angleDelta: number): PlacedFurniture {
  if (furniturePlacementMode(furniture) === "wall") return furniture;
  const rotation = [...furniture.rotation] as [number, number, number];
  rotation[1] = roundAngle(rotation[1] + angleDelta);
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
  // 받침 품목 제한은 폐지 — 어떤 가구든 받침이 될 수 있다. 2단 적재(가구 위 가구 위 가구)만
  // 막는다(따라 움직이기 전파가 1단만 지원).
  if (furniturePlacementMode(support) !== "floor") {
    return invalid(input.draft, "surface", "이 가구는 받침대로 사용할 수 없습니다.");
  }

  const supportDimensions = getFurnitureDimensions(support);
  const draftDimensions = getFurnitureDimensions(input.draft);
  const relativeYaw = input.draft.rotation[1] - support.rotation[1];
  const halfX = Math.abs(Math.cos(relativeYaw)) * draftDimensions.width / 2
    + Math.abs(Math.sin(relativeYaw)) * draftDimensions.depth / 2;
  const halfZ = Math.abs(Math.sin(relativeYaw)) * draftDimensions.width / 2
    + Math.abs(Math.cos(relativeYaw)) * draftDimensions.depth / 2;
  // 받침보다 큰 가구도 허용한다 — 클램프 범위가 뒤집히지 않게 0으로 눌러 받침 중앙에 스냅.
  const limitX = Math.max(0, supportDimensions.width / 2 - halfX - SURFACE_EDGE_MARGIN_M);
  const limitZ = Math.max(0, supportDimensions.depth / 2 - halfZ - SURFACE_EDGE_MARGIN_M);

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
