"use client";

// 매물 상세의 "3D 보기"에서 집주인이 등록 시 만든 실제 도면을 읽기 전용으로 렌더한다.
// 편집용 RoomlogThreeFloorPlanView를 재사용하되, 상호작용 콜백은 전부 no-op으로 넘긴다.
// three.js가 무거우므로 page.tsx에서 next/dynamic(ssr:false)으로 이 모듈만 지연 로드한다.

import { useEffect } from "react";
import type { PlacedFurniture, WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import { RoomlogThreeFloorPlanView } from "../floor-plan-3d/room-scene/RoomlogThreeFloorPlanView";

export type ListingFloorPlanWall = {
  id: string;
  wall_id: string | number;
  dimensions: { width: number; height: number; depth: number };
  position: [number, number, number];
  rotation: [number, number, number];
};

export type ListingFloorPlanFurniture = {
  id: string;
  furniture_id: string;
  name: string;
  color: string;
  length: [number, number, number];
  modelUrl?: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  sizeMm?: { width: number; depth: number; height?: number };
};

export type ListingFloorPlan3D = {
  walls3D: ListingFloorPlanWall[];
  furnitures: ListingFloorPlanFurniture[];
  name?: string;
};

const noop = () => {};

export default function ListingTourRoom3D({ floorPlan }: { floorPlan: ListingFloorPlan3D }) {
  // 렌더러는 각 필드의 부분집합만 읽으므로, 슬림 스냅샷을 편집기 타입으로 취급해도 안전하다.
  const wallsData = floorPlan.walls3D as unknown as WheretoputWall3D[];
  const furnitureData = floorPlan.furnitures as unknown as PlacedFurniture[];

  // 캔버스가 시트 애니메이션 도중(최종 크기 전) 마운트되면 draw buffer가 작게 잡혀 빈 화면으로 남는다.
  // 다음 프레임과 시트 전환 종료 후 resize를 쏘아 R3F가 최종 크기로 다시 그리게 한다.
  useEffect(() => {
    const raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    const timer = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 240);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <RoomlogThreeFloorPlanView
      frameloop="always"
      furnitureData={furnitureData}
      hideHint
      onFloorPointerDown={noop}
      onFurniturePointerDown={noop}
      onWallPointerDown={noop}
      pendingFurniture={null}
      selectedFurnitureId={null}
      selectedWallId={null}
      wallsData={wallsData}
    />
  );
}
