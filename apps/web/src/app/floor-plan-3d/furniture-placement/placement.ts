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
  wallsData: WheretoputWall3D[] = []
): PlacedFurniture {
  if (isFinalizedFurniture(furniture)) {
    return furniture;
  }

  const constrainedPoint = constrainFurniturePointToWalls(furniture, point, wallsData);

  return {
    ...furniture,
    position: [Number(constrainedPoint.x.toFixed(2)), furniture.length[1] / 2000, Number(constrainedPoint.z.toFixed(2))]
  };
}

export function rotateFurnitureQuarterTurn(furniture: PlacedFurniture): PlacedFurniture {
  return {
    ...furniture,
    rotation: [0, Number((furniture.rotation[1] + Math.PI / 2).toFixed(4)), 0]
  };
}

export function finalizeFurnitureDraft(furniture: PlacedFurniture, experienceMode: ExperienceMode): PlacedFurniture {
  return experienceMode === "landlord" ? createLandlordOptionFurniture(furniture) : createResidentDesignFurniture(furniture);
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
  wallsData: WheretoputWall3D[]
) {
  const footprint = getFurnitureFootprint(furniture);

  return wallsData.reduce((currentPoint, wall) => constrainPointAwayFromWall(currentPoint, footprint, wall), point);
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
  wall: WheretoputWall3D
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

  if (!isAlongWall || (!intersectsWall && !isNearWallFace)) {
    return point;
  }

  const side = localZ < 0 ? -1 : 1;
  const correctedLocalZ = side * limitZ;

  return {
    x: wall.position[0] + localX * cos - correctedLocalZ * sin,
    z: wall.position[2] + localX * sin + correctedLocalZ * cos
  };
}
