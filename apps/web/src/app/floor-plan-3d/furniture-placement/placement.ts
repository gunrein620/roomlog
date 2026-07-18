import type { ExperienceMode, FurnitureCatalogItem, PlacedFurniture, WheretoputWall3D } from "../room-model/types";
import { getFurnitureDimensions } from "./catalog";

const WALL_SNAP_TOLERANCE_M = 0.18;

export function createFurnitureModel(item: FurnitureCatalogItem, position: [number, number, number] = [0, 0, 0]): PlacedFurniture {
  return {
    ...item,
    id: `furniture-${item.furniture_id}-${Date.now()}`,
    position: [position[0], item.length[1] / 2000, position[2]],
    rotation: [0, 0, 0],
    scale: 1
  };
}

export function moveFurnitureDraftToPoint(
  furniture: PlacedFurniture,
  point: { x: number; z: number },
  wallsData: WheretoputWall3D[] = [],
  options: { ignoreCrossing?: boolean } = {}
): PlacedFurniture {
  if (isFinalizedFurniture(furniture)) {
    return furniture;
  }

  const constrainedPoint = constrainFurniturePointToWalls(furniture, point, wallsData, options.ignoreCrossing === true);

  return {
    ...furniture,
    position: [Number(constrainedPoint.x.toFixed(2)), furniture.length[1] / 2000, Number(constrainedPoint.z.toFixed(2))]
  };
}

export function rotateFurnitureQuarterTurn(furniture: PlacedFurniture, direction: -1 | 1 = 1): PlacedFurniture {
  return {
    ...furniture,
    rotation: [0, Number((furniture.rotation[1] + direction * Math.PI / 2).toFixed(4)), 0]
  };
}

export function finalizeFurnitureDraft(furniture: PlacedFurniture, experienceMode: ExperienceMode): PlacedFurniture {
  return experienceMode === "landlord" ? createLandlordOptionFurniture(furniture) : createResidentDesignFurniture(furniture);
}

// 배치 완료된 가구를 다시 집어들 때 초안으로 되돌린다 — 확정 표시(source/locked)가
// 남아 있으면 moveFurnitureDraftToPoint가 이동을 거부하므로 반드시 풀어줘야 한다.
export function reopenFurnitureDraft(furniture: PlacedFurniture): PlacedFurniture {
  return { ...furniture, editableBy: undefined, includedInLease: undefined, locked: undefined, source: undefined };
}

export function createLandlordOptionFurniture(furniture: PlacedFurniture): PlacedFurniture {
  return {
    ...furniture,
    editableBy: ["LANDLORD"],
    furnitureId: furniture.furniture_id,
    includedInLease: true,
    locked: true,
    sizeMm: { depth: furniture.length[2], height: furniture.length[1], width: furniture.length[0] },
    source: "LANDLORD_OPTION",
    visibleToTenant: true
  };
}

export function createResidentDesignFurniture(furniture: PlacedFurniture): PlacedFurniture {
  return {
    ...furniture,
    source: furniture.source === "LANDLORD_OPTION" ? furniture.source : "RESIDENT_DESIGN"
  };
}

export function isLandlordOptionFurniture(furniture: PlacedFurniture) {
  return furniture.source === "LANDLORD_OPTION" || furniture.locked === true;
}

export function isLockedFurnitureForResident(furniture: PlacedFurniture, experienceMode: ExperienceMode) {
  return experienceMode === "resident" && isLandlordOptionFurniture(furniture);
}

function isFinalizedFurniture(furniture: PlacedFurniture) {
  return furniture.source === "LANDLORD_OPTION" || furniture.source === "RESIDENT_DESIGN";
}

function constrainFurniturePointToWalls(
  furniture: PlacedFurniture,
  point: { x: number; z: number },
  wallsData: WheretoputWall3D[],
  ignoreCrossing = false
) {
  const footprint = getFurnitureFootprint(furniture);
  // 이동 경로가 벽을 가로지르는지 판정할 기준점 — 가구의 현재 위치.
  // 첫 배치처럼 현재 위치가 의미 없는 기본값일 때는 경로 검사를 끈다(겹침 방지만 적용).
  const fromPoint = ignoreCrossing ? undefined : { x: furniture.position[0], z: furniture.position[2] };

  return wallsData.reduce((currentPoint, wall) => constrainPointAwayFromWall(currentPoint, footprint, wall, fromPoint), point);
}

function getFurnitureFootprint(furniture: PlacedFurniture) {
  const dimensions = getFurnitureDimensions(furniture);
  const angle = furniture.rotation[1] ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfWidth = dimensions.width / 2;
  const halfDepth = dimensions.depth / 2;

  return {
    halfX: Math.abs(cos) * halfWidth + Math.abs(sin) * halfDepth,
    halfZ: Math.abs(sin) * halfWidth + Math.abs(cos) * halfDepth
  };
}

function constrainPointAwayFromWall(
  point: { x: number; z: number },
  footprint: { halfX: number; halfZ: number },
  wall: WheretoputWall3D,
  fromPoint?: { x: number; z: number }
) {
  const angle = wall.rotation[1] ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - wall.position[0];
  const dz = point.z - wall.position[2];
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  const halfAlongWall = Math.abs(cos) * footprint.halfX + Math.abs(sin) * footprint.halfZ;
  const halfAcrossWall = Math.abs(-sin) * footprint.halfX + Math.abs(cos) * footprint.halfZ;
  const limitX = wall.dimensions.width / 2 + halfAlongWall;
  const limitZ = wall.dimensions.depth / 2 + halfAcrossWall;
  const localZDistance = Math.abs(localZ);
  const isAlongWall = Math.abs(localX) <= limitX;
  const intersectsWall = localZDistance < limitZ;
  const isNearWallFace = localZDistance <= limitZ + WALL_SNAP_TOLERANCE_M;

  // 목표점이 벽 너머(겹치지도 않는 반대편)면 기존 검사로는 그냥 통과됐다 —
  // 현재 위치 → 목표점 선분이 이 벽을 가로지르면 통과로 보고 출발한 쪽 면에 세운다.
  let crossedWall = false;
  let fromLocalZ = 0;
  if (fromPoint) {
    const fromDx = fromPoint.x - wall.position[0];
    const fromDz = fromPoint.z - wall.position[2];
    const fromLocalX = fromDx * cos + fromDz * sin;
    fromLocalZ = -fromDx * sin + fromDz * cos;
    if (fromLocalZ !== localZ && Math.sign(fromLocalZ) !== Math.sign(localZ)) {
      const crossT = fromLocalZ / (fromLocalZ - localZ);
      const crossLocalX = fromLocalX + (localX - fromLocalX) * crossT;
      crossedWall = Math.abs(crossLocalX) <= limitX;
    }
  }

  if (!crossedWall && (!isAlongWall || (!intersectsWall && !isNearWallFace))) {
    return point;
  }

  const side = crossedWall ? (fromLocalZ < 0 ? -1 : 1) : localZ < 0 ? -1 : 1;
  const correctedLocalZ = side * limitZ;

  return {
    x: wall.position[0] + localX * cos - correctedLocalZ * sin,
    z: wall.position[2] + localX * sin + correctedLocalZ * cos
  };
}
