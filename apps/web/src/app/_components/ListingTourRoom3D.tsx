"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import {
  createFurnitureModel,
  finalizeFurnitureDraft,
  FURNITURE_CATALOG,
  furnitureImageUrl,
  moveFurnitureDraftToPoint,
  rotateFurnitureQuarterTurn
} from "../floor-plan-3d/furniture-placement";
import type { FurnitureCatalogItem, PlacedFurniture, WheretoputWall3D } from "../floor-plan-3d/room-model/types";
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
  source?: string;
};

export type ListingFloorPlan3D = {
  walls3D: ListingFloorPlanWall[];
  furnitures: ListingFloorPlanFurniture[];
  name?: string;
};

const TOUR_HORIZONTAL_SCALE = 1.85;

function floorPlanFurnitureStorageKey(floorPlan: ListingFloorPlan3D) {
  const wallKey = floorPlan.walls3D.map((wall) => `${wall.id}:${wall.wall_id}`).join("|");

  return `roomlogListingTourFurniture:${floorPlan.name ?? "listing"}:${wallKey}`;
}

function readSavedFurnitures(floorPlan: ListingFloorPlan3D) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(floorPlanFurnitureStorageKey(floorPlan));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { furnitures?: ListingFloorPlanFurniture[] };

    return Array.isArray(parsed.furnitures) ? parsed.furnitures : null;
  } catch {
    return null;
  }
}

function catalogSearchText(item: FurnitureCatalogItem) {
  return `${item.name} ${item.brand} ${item.category ?? ""} ${item.furniture_id}`.toLowerCase();
}

export default function ListingTourRoom3D({ floorPlan }: { floorPlan: ListingFloorPlan3D }) {
  const wallsData = floorPlan.walls3D as unknown as WheretoputWall3D[];
  const [isPlacementOpen, setIsPlacementOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [placedFurnitures, setPlacedFurnitures] = useState<PlacedFurniture[]>([]);
  const [pendingFurniture, setPendingFurniture] = useState<PlacedFurniture | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("가구 배치 편집을 열어 옵션 위치를 확인할 수 있습니다.");
  const selectedFurniture = useMemo(
    () => placedFurnitures.find((furniture) => furniture.id === selectedFurnitureId) ?? null,
    [placedFurnitures, selectedFurnitureId]
  );
  const filteredCatalog = useMemo(() => {
    const normalizedQuery = catalogQuery.trim().toLowerCase();
    const catalog = normalizedQuery
      ? FURNITURE_CATALOG.filter((item) => catalogSearchText(item).includes(normalizedQuery))
      : FURNITURE_CATALOG;

    return catalog.slice(0, 12);
  }, [catalogQuery]);

  useEffect(() => {
    const savedFurnitures = readSavedFurnitures(floorPlan);
    setPlacedFurnitures((savedFurnitures ?? floorPlan.furnitures) as unknown as PlacedFurniture[]);
    setPendingFurniture(null);
    setSelectedFurnitureId(null);
    setSaveMessage(savedFurnitures ? "저장된 가구 배치를 불러왔습니다." : "가구 배치 편집을 열어 옵션 위치를 확인할 수 있습니다.");
  }, [floorPlan]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    const timer = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 240);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  function normalizedScenePoint(point: { x: number; z: number }) {
    return {
      x: point.x / TOUR_HORIZONTAL_SCALE,
      z: point.z / TOUR_HORIZONTAL_SCALE
    };
  }

  function handleFurnitureSelect(item: FurnitureCatalogItem) {
    setPendingFurniture(createFurnitureModel(item));
    setSelectedFurnitureId(null);
    setIsPlacementOpen(true);
    setSaveMessage(`${item.name}을 선택했습니다. 3D 바닥을 눌러 위치를 잡아주세요.`);
  }

  function placePendingFurniture(point: { x: number; z: number }) {
    if (!pendingFurniture) return;
    const nextFurniture = moveFurnitureDraftToPoint(pendingFurniture, normalizedScenePoint(point), wallsData);
    setPendingFurniture(nextFurniture);
    setSaveMessage(`${nextFurniture.name} 위치를 잡았습니다. 배치 확정으로 추가하세요.`);
  }

  function handleFloorPointerDown(event: ThreeEvent<PointerEvent>) {
    if (!pendingFurniture) return;
    event.stopPropagation();
    placePendingFurniture(event.point);
  }

  function handleWallPointerDown(_wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) {
    if (!pendingFurniture) return;
    event.stopPropagation();
    placePendingFurniture(event.point);
  }

  function handleFurniturePointerDown(furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    if (pendingFurniture) {
      placePendingFurniture(event.point);
      return;
    }

    setSelectedFurnitureId((currentId) => (currentId === furniture.id ? null : furniture.id));
    setSaveMessage(`${furniture.name}을 선택했습니다.`);
  }

  function confirmPendingFurniturePlacement() {
    if (!pendingFurniture) return;
    const nextFurniture = finalizeFurnitureDraft(pendingFurniture, "resident");
    setPlacedFurnitures((currentFurnitures) => [...currentFurnitures, nextFurniture]);
    setPendingFurniture(null);
    setSelectedFurnitureId(nextFurniture.id);
    setSaveMessage(`${nextFurniture.name} 배치를 추가했습니다.`);
  }

  function rotatePendingFurniture() {
    if (!pendingFurniture) return;
    setPendingFurniture(rotateFurnitureQuarterTurn(pendingFurniture));
    setSaveMessage("선택 중인 가구를 90도 회전했습니다.");
  }

  function rotateSelectedFurniture() {
    if (!selectedFurnitureId) return;
    setPlacedFurnitures((currentFurnitures) =>
      currentFurnitures.map((furniture) => (furniture.id === selectedFurnitureId ? rotateFurnitureQuarterTurn(furniture) : furniture))
    );
    setSaveMessage("선택한 가구를 90도 회전했습니다.");
  }

  function removeSelectedFurniture() {
    if (!selectedFurnitureId) return;
    setPlacedFurnitures((currentFurnitures) => currentFurnitures.filter((furniture) => furniture.id !== selectedFurnitureId));
    setSelectedFurnitureId(null);
    setSaveMessage("선택한 가구를 삭제했습니다.");
  }

  function saveFurnitureLayout() {
    try {
      window.localStorage.setItem(
        floorPlanFurnitureStorageKey(floorPlan),
        JSON.stringify({
          savedAt: Date.now(),
          furnitures: placedFurnitures.map((furniture) => ({
            id: furniture.id,
            furniture_id: furniture.furniture_id,
            name: furniture.name,
            color: furniture.color,
            length: furniture.length,
            modelUrl: furniture.modelUrl,
            position: furniture.position,
            rotation: furniture.rotation,
            scale: furniture.scale,
            sizeMm: furniture.sizeMm,
            source: furniture.source
          }))
        })
      );
      setSaveMessage("이 브라우저에 가구 배치를 저장했습니다.");
    } catch {
      setSaveMessage("저장 공간 문제로 가구 배치를 저장하지 못했습니다.");
    }
  }

  function resetFurnitureLayout() {
    window.localStorage.removeItem(floorPlanFurnitureStorageKey(floorPlan));
    setPlacedFurnitures(floorPlan.furnitures as unknown as PlacedFurniture[]);
    setPendingFurniture(null);
    setSelectedFurnitureId(null);
    setSaveMessage("기본 옵션 배치로 되돌렸습니다.");
  }

  return (
    <div className="listing-tour-room3d">
      <RoomlogThreeFloorPlanView
        cameraPosition={[9, 7.5, 11]}
        frameloop="always"
        furnitureData={placedFurnitures}
        hideHint
        horizontalScale={TOUR_HORIZONTAL_SCALE}
        orbitMinDistance={1.6}
        onFloorPointerDown={handleFloorPointerDown}
        onFurniturePointerDown={handleFurniturePointerDown}
        onWallPointerDown={handleWallPointerDown}
        pendingFurniture={pendingFurniture}
        selectedFurnitureId={selectedFurnitureId}
        selectedWallId={null}
        wallsData={wallsData}
      />

      <section className="listing-tour-furniture" aria-label="3D 가구 배치">
        <div className="listing-tour-furniture-head">
          <div>
            <strong>가구 배치</strong>
            <span>{saveMessage}</span>
          </div>
          <button type="button" onClick={() => setIsPlacementOpen((isOpen) => !isOpen)}>
            {isPlacementOpen ? "닫기" : "배치하기"}
          </button>
        </div>

        {isPlacementOpen ? (
          <div className="listing-tour-furniture-body">
            <div className="listing-tour-furniture-search">
              <input
                aria-label="가구 검색"
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="침대, 책상, 의자 검색"
                type="search"
                value={catalogQuery}
              />
            </div>
            <div className="listing-tour-furniture-grid">
              {filteredCatalog.map((item) => {
                const imageUrl = furnitureImageUrl(item);

                return (
                  <button
                    className={pendingFurniture?.furniture_id === item.furniture_id ? "active" : ""}
                    key={item.furniture_id}
                    onClick={() => handleFurnitureSelect(item)}
                    type="button"
                  >
                    <span className="listing-tour-furniture-thumb" style={{ backgroundColor: item.color }}>
                      {imageUrl ? (
                        <img
                          alt=""
                          decoding="async"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                          src={imageUrl}
                        />
                      ) : null}
                    </span>
                    <strong>{item.name}</strong>
                    <small>{item.brand}</small>
                  </button>
                );
              })}
            </div>
            <div className="listing-tour-furniture-actions">
              <button disabled={!pendingFurniture} onClick={confirmPendingFurniturePlacement} type="button">
                배치 확정
              </button>
              <button disabled={!pendingFurniture} onClick={rotatePendingFurniture} type="button">
                선택 회전
              </button>
              <button disabled={!selectedFurniture} onClick={rotateSelectedFurniture} type="button">
                가구 회전
              </button>
              <button disabled={!selectedFurniture} onClick={removeSelectedFurniture} type="button">
                삭제
              </button>
              <button onClick={saveFurnitureLayout} type="button">
                저장
              </button>
              <button onClick={resetFurnitureLayout} type="button">
                초기화
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
