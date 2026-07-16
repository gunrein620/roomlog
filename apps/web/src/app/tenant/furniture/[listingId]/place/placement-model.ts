import type { TenantFurniture, TenantFurniturePlacementItem } from "@roomlog/types/tenant-furniture";
import {
  clampFurnitureIntoRoom,
  furnitureIntersectsWall,
  furnitureOverlapsFurniture,
  getFurnitureFootprint,
  type FurnitureFootprint
} from "@/app/floor-plan-3d/room-model/collision";
import type { PlacedFurniture, WheretoputWall3D } from "@/app/floor-plan-3d/room-model/types";

export type PlacementAnalysis = {
  footprint: FurnitureFootprint;
  overlapsFurniture: boolean;
  touchesWall: boolean;
};

export function tenantFurnitureToPlacedFurniture(
  furniture: TenantFurniture,
  placement: TenantFurniturePlacementItem
): PlacedFurniture {
  return {
    id: placement.furnitureId,
    furnitureId: placement.furnitureId,
    furniture_id: placement.furnitureId,
    name: furniture.label?.trim() || furniture.category,
    brand: "내 가구",
    category: furniture.category,
    color: "tenant-furniture",
    length: [furniture.sizeMm.width, furniture.sizeMm.height, furniture.sizeMm.depth],
    modelUrl: furniture.meshUrl ?? undefined,
    position: [placement.position[0], 0, placement.position[1]],
    rotation: [0, placement.rotation, 0],
    scale: 1,
    sizeMm: furniture.sizeMm,
    price: 0,
    source: "TENANT_FURNITURE"
  };
}

export function clampPlacementIntoRoom(
  placement: TenantFurniturePlacementItem,
  furniture: TenantFurniture,
  walls: readonly WheretoputWall3D[]
): TenantFurniturePlacementItem {
  const clamped = clampFurnitureIntoRoom(tenantFurnitureToPlacedFurniture(furniture, placement), walls);
  return { ...placement, position: [clamped.position[0], clamped.position[2]] };
}

export function analyzePlacements(
  items: readonly TenantFurniturePlacementItem[],
  furnitureById: ReadonlyMap<string, TenantFurniture>,
  walls: readonly WheretoputWall3D[]
): Map<string, PlacementAnalysis> {
  const placed = items.flatMap((item) => {
    const furniture = furnitureById.get(item.furnitureId);
    return furniture ? [{ item, model: tenantFurnitureToPlacedFurniture(furniture, item) }] : [];
  });

  return new Map(
    placed.map(({ item, model }, index) => [
      item.furnitureId,
      {
        footprint: getFurnitureFootprint(model),
        touchesWall: walls.some((wall) => furnitureIntersectsWall(model, wall)),
        overlapsFurniture: placed.some(
          (other, otherIndex) => otherIndex !== index && furnitureOverlapsFurniture(model, other.model)
        )
      }
    ])
  );
}

export function roomCenter(walls: readonly WheretoputWall3D[]): [number, number] {
  if (walls.length === 0) return [0, 0];
  const endpoints = walls.flatMap((wall) => {
    const half = wall.dimensions.width / 2;
    const dx = Math.cos(wall.rotation[1]) * half;
    const dz = Math.sin(wall.rotation[1]) * half;
    return [
      [wall.position[0] - dx, wall.position[2] - dz] as const,
      [wall.position[0] + dx, wall.position[2] + dz] as const
    ];
  });

  return [
    (Math.min(...endpoints.map(([x]) => x)) + Math.max(...endpoints.map(([x]) => x))) / 2,
    (Math.min(...endpoints.map(([, z]) => z)) + Math.max(...endpoints.map(([, z]) => z))) / 2
  ];
}
