// register 픽 화면(도면–splat 2점 정합)의 도면 표시 우선순위 — 순수 함수로 분리해 테스트한다.
//
// 배경: 이 화면은 오른쪽 패널에 정합 대상 도면을 보여주는데, 지금까지는 매물 임베드 벽(walls3D,
// 도면 에디터 저장본) → mitunet(도면 이미지 자동 추출) → localStorage 순이었다. 캡처 도면(RoomPlan,
// SplatAsset.captureFloorPlan)은 splat과 같은 ARSession에서 나와 좌표계가 항등이고 실측이라 —
// 있으면 다른 무엇보다 우선한다(정합 자체가 필요 없을 만큼 신뢰도가 높다).
//
// 자산에 이미 서버 FloorPlan 연결(floorPlanId)이 있으면 그 연결(furniture 매칭용 planServerId)은
// 캡처가 있어도 존중한다 — 화면에 보여줄 "도면 모양"은 캡처가 이기지만, 저장 시 붙일 서버 도면
// id까지 캡처가 지우지는 않는다.
import type { WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import { captureFloorPlanToSceneLayout } from "../floor-plan-3d/room-scene/capture-to-layout";
import { mitunetSceneLayoutFromPayload, type MitunetSceneLayout } from "../floor-plan-3d/room-scene/mitunet-geometry";
import { wallsToPlanBounds } from "./splat-plan-shape";

export type RegisterPlanDisplayDecision =
  | { source: "listing-capture"; layout: MitunetSceneLayout; planServerId: string | null }
  | { source: "asset-linked"; planServerId: string }
  | { source: "listing-db"; walls: WheretoputWall3D[] }
  | { source: "listing-mitunet"; layout: MitunetSceneLayout }
  | { source: "keep" };

export function resolveRegisterPlanDisplay(
  asset: { captureFloorPlan?: unknown; floorPlanId?: string | null },
  listingWalls: WheretoputWall3D[],
  listingMitunetPayload?: unknown
): RegisterPlanDisplayDecision {
  const captureLayout = captureFloorPlanToSceneLayout(asset.captureFloorPlan ?? null);
  if (captureLayout) {
    return { source: "listing-capture", layout: captureLayout, planServerId: asset.floorPlanId ?? null };
  }

  if (asset.floorPlanId) return { source: "asset-linked", planServerId: asset.floorPlanId };
  if (listingWalls.length > 0) return { source: "listing-db", walls: listingWalls };

  const mitunetLayout = mitunetSceneLayoutFromPayload(listingMitunetPayload);
  if (mitunetLayout) return { source: "listing-mitunet", layout: mitunetLayout };

  return { source: "keep" };
}

// register 픽 화면 도면 패널이 그리는 두 형태 — PlanShape(page.tsx)와 구조가 같다(kind 판별 유니온).
export type PlanDisplayShape = { kind: "walls"; walls: WheretoputWall3D[] } | { kind: "polygons"; layout: MitunetSceneLayout };

/**
 * 도면 패널의 2점 픽 좌표 변환(minX/minZ/scale)이 기준 삼는 bbox 좌상단. "walls" 형태는
 * wallsToPlanBounds가 실제 발자국에서 구하지만, "polygons" 형태는 bounds.centerX/centerZ에서
 * 역산해야 한다 — mitunet은 항상 centerX/centerZ=0(bbox 중심을 원점으로 잡아 만듦)이라 기존
 * "-width/2" 계산과 결과가 같지만, 캡처(RoomPlan) 도면은 원점을 옮기지 않아(capture-to-layout.ts
 * 헤더 주석) centerX/centerZ가 0이 아닐 수 있다 — 역산하지 않으면 도면이 화면 중앙으로 잘못
 * 밀리고, 그 위에서 찍는 2점 픽 좌표도 같은 만큼 어긋난다.
 */
export function planDisplayBounds(shape: PlanDisplayShape): { minX: number; minZ: number; width: number; depth: number } {
  if (shape.kind === "walls") return wallsToPlanBounds(shape.walls);

  return {
    minX: shape.layout.bounds.centerX - shape.layout.bounds.width / 2,
    minZ: shape.layout.bounds.centerZ - shape.layout.bounds.depth / 2,
    width: shape.layout.bounds.width,
    depth: shape.layout.bounds.depth
  };
}
