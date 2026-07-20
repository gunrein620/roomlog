// 소유자 도면(walls3D) 원시 JSON → 매처(floor-plan-match.ts) 입력(OwnerWallLike[]) 파싱.
//
// 소스는 두 곳(우선순위, SplatAssetService.resolveOwnerFloorPlanWalls가 조회): SplatAsset.floorPlanId가
// 있으면 FloorPlan.room3d.walls, 없으면 SplatAsset.listingId의 TradeListing.floorPlan.walls3D 스냅샷.
// 둘 다 web WheretoputWall3D({position,rotation,dimensions,...})와 같은 JSON shape이고, 벽 유효성 판정은
// apps/web/src/app/splat-tour/splat-plan-shape.ts의 isValidPlanWall을 그대로 포팅했다
// (api는 web 모듈을 import하지 않는다 — floor-plan-match.ts 헤더와 동일 원칙).

import type { OwnerWallLike } from "../roomlog/services/floor-plan-match";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isFiniteTuple3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

function isValidOwnerWall(value: unknown): value is OwnerWallLike {
  if (!isRecord(value) || !isRecord(value.dimensions)) return false;
  return (
    isPositiveFiniteNumber(value.dimensions.width) &&
    isPositiveFiniteNumber(value.dimensions.height) &&
    isPositiveFiniteNumber(value.dimensions.depth) &&
    isFiniteTuple3(value.position) &&
    isFiniteTuple3(value.rotation)
  );
}

export type PublicOwnerWall3D = OwnerWallLike & {
  id: string;
  wall_id: string | number;
  material?: "wall";
};

/**
 * 공개 뷰어용 — 렌더에 필요한 필드만 화이트리스트로 정규화한다.
 * legacy 벽에 id가 없어도 유효 geometry를 버리지 않도록 배열 위치 기반 ID를 부여한다.
 */
export function normalizePublicWalls3D(value: unknown): PublicOwnerWall3D[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((wall, index) => {
    if (!isValidOwnerWall(wall)) return [];

    const record = wall as unknown as Record<string, unknown>;
    const fallbackId = `wall-${index + 1}`;
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : fallbackId;
    const wallId =
      typeof record.wall_id === "string" && record.wall_id.trim()
        ? record.wall_id.trim()
        : typeof record.wall_id === "number" && Number.isFinite(record.wall_id)
          ? record.wall_id
          : id;

    return [
      {
        id,
        wall_id: wallId,
        dimensions: {
          width: wall.dimensions.width,
          height: wall.dimensions.height,
          depth: wall.dimensions.depth
        },
        position: [wall.position[0], wall.position[1], wall.position[2]],
        rotation: [wall.rotation[0], wall.rotation[1], wall.rotation[2]],
        ...(record.material === "wall" ? { material: "wall" as const } : {})
      }
    ];
  });
}

/** 벽 배열이 아니거나 개별 항목이 유효하지 않으면 걸러낸다(빈 배열은 "쓸만한 도면 없음" 신호). */
export function parseOwnerWalls3D(value: unknown): OwnerWallLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidOwnerWall).map((wall) => ({
    position: wall.position,
    rotation: wall.rotation,
    dimensions: wall.dimensions
  }));
}

/** JSON 필드(room3d 또는 floorPlan 스냅샷 객체)에서 주어진 키를 뽑는다. 레코드가 아니면 undefined. */
export function extractJsonField(json: unknown, key: string): unknown {
  return isRecord(json) ? json[key] : undefined;
}
