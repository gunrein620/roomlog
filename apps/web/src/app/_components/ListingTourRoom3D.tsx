"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createFurnitureModel,
  finalizeFurnitureDraft,
  FURNITURE_CATALOG,
  furnitureImageUrl,
  moveFurnitureDraftToPoint,
  reopenFurnitureDraft,
  rotateFurnitureQuarterTurn
} from "../floor-plan-3d/furniture-placement";
import type { FurnitureCatalogItem, PlacedFurniture, WheretoputWall3D } from "../floor-plan-3d/room-model/types";
import { RoomlogThreeFloorPlanView } from "../floor-plan-3d/room-scene/RoomlogThreeFloorPlanView";
import { LISTING_TOUR_FURNITURE_LATEST_KEY } from "../splat-tour/splat-furniture";

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

export default function ListingTourRoom3D({
  floorPlan,
  variant = "sheet"
}: {
  floorPlan: ListingFloorPlan3D;
  /** hero = 상세 히어로 스테이지(좌측 글래스 가구 패널 + hover 하이라이트), sheet = 기존 3D 시트 */
  variant?: "sheet" | "hero";
}) {
  const wallsData = floorPlan.walls3D as unknown as WheretoputWall3D[];
  const [isPlacementOpen, setIsPlacementOpen] = useState(false);
  // hero 패널 접기 — 시안의 우상단 "가구 배치" 토글. 모바일에선 도면이 좁아 기본 접힘이 낫지만
  // 데스크톱 첫인상엔 패널이 보여야 해서 열림 기본, 사용자가 토글로 제어한다.
  const [isHeroPanelOpen, setIsHeroPanelOpen] = useState(true);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [placedFurnitures, setPlacedFurnitures] = useState<PlacedFurniture[]>([]);
  const [pendingFurniture, setPendingFurniture] = useState<PlacedFurniture | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("가구 배치 편집을 열어 옵션 위치를 확인할 수 있습니다.");
  // 가구 드래그 이동 — 좌클릭을 누른 채 끌면 커서를 따라오고, 떼면 그 자리에 멈춘다(확정은 ✓).
  const [isFurnitureDragging, setIsFurnitureDragging] = useState(false);
  // 배치된 가구를 다시 집어들 때(재편집) 취소하면 되돌릴 원래 상태 + 원본 분류(source) 보존용.
  const pendingFurnitureOriginRef = useRef<PlacedFurniture | null>(null);
  // 집고 있는 가구가 사용자 위치를 한 번이라도 받았는지 — 첫 배치는 벽 통과 검사를 끈다.
  const pendingFurniturePlacedOnceRef = useRef(false);
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

  useEffect(() => {
    if (!isFurnitureDragging) return;
    const endDrag = () => setIsFurnitureDragging(false);
    window.addEventListener("pointerup", endDrag);
    return () => window.removeEventListener("pointerup", endDrag);
  }, [isFurnitureDragging]);

  function restorePendingFurnitureOrigin() {
    const original = pendingFurnitureOriginRef.current;
    if (!original) return false;
    pendingFurnitureOriginRef.current = null;
    setPlacedFurnitures((currentFurnitures) => [...currentFurnitures, original]);
    return true;
  }

  function normalizedScenePoint(point: { x: number; z: number }) {
    return {
      x: point.x / TOUR_HORIZONTAL_SCALE,
      z: point.z / TOUR_HORIZONTAL_SCALE
    };
  }

  function handleFurnitureSelect(item: FurnitureCatalogItem) {
    // 재편집 중이던 가구가 있으면 원위치로 되돌려 놓고 새 가구를 집는다.
    restorePendingFurnitureOrigin();
    pendingFurniturePlacedOnceRef.current = false;
    setPendingFurniture(createFurnitureModel(item));
    setSelectedFurnitureId(null);
    setIsPlacementOpen(true);
    setSaveMessage(`${item.name}을 선택했습니다. 3D 바닥을 눌러 위치를 잡고 끌어서 옮기세요.`);
  }

  function placePendingFurniture(point: { x: number; z: number }) {
    if (!pendingFurniture) return;
    // 카탈로그에서 갓 꺼낸 가구의 현재 위치(원점)는 이동 경로가 아니다 —
    // 첫 배치는 벽 통과 검사를 끄고, 그 뒤부터(드래그) 경로 기준으로 벽에 막는다.
    const nextFurniture = moveFurnitureDraftToPoint(pendingFurniture, normalizedScenePoint(point), wallsData, {
      ignoreCrossing: !pendingFurniturePlacedOnceRef.current
    });
    pendingFurniturePlacedOnceRef.current = true;
    // 벽에 막혀 위치가 그대로면 상태 업데이트를 건너뛴다 — 드래그 중 무의미한 리렌더 방지.
    if (nextFurniture.position[0] === pendingFurniture.position[0] && nextFurniture.position[2] === pendingFurniture.position[2]) return;
    setPendingFurniture(nextFurniture);
    setSaveMessage(`${nextFurniture.name} 위치를 잡았습니다. ✓로 배치를 확정하세요.`);
  }

  function handleFloorPointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0 || !pendingFurniture) return;
    event.stopPropagation();
    placePendingFurniture(event.point);
    setIsFurnitureDragging(true);
  }

  function handleFloorPointerMove(event: ThreeEvent<PointerEvent>) {
    if (!isFurnitureDragging || !pendingFurniture) return;
    placePendingFurniture(event.point);
  }

  function handleWallPointerDown(_wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0 || !pendingFurniture) return;
    event.stopPropagation();
    placePendingFurniture(event.point);
    setIsFurnitureDragging(true);
  }

  function handleFurniturePointerDown(furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (pendingFurniture) {
      placePendingFurniture(event.point);
      setIsFurnitureDragging(true);
      return;
    }

    // 배치된 가구를 클릭하면 다시 집어들어 재편집 모드로 — 취소(✕)하면 원래 자리로 돌아간다.
    // 확정 표시(source)가 붙은 채로는 이동이 막히므로 초안 상태로 되돌려서 집는다.
    pendingFurnitureOriginRef.current = furniture;
    pendingFurniturePlacedOnceRef.current = true;
    setPlacedFurnitures((currentFurnitures) => currentFurnitures.filter((item) => item.id !== furniture.id));
    setPendingFurniture(reopenFurnitureDraft(furniture));
    setSelectedFurnitureId(null);
    setIsFurnitureDragging(true);
    setSaveMessage(`${furniture.name} 재편집 — 끌어서 옮기고 ✓로 확정하세요.`);
  }

  function confirmPendingFurniturePlacement() {
    if (!pendingFurniture) return;
    // 재편집이면 원본 분류(source)를 보존한다 — 임대인 옵션 가구가 세입자 배치로 둔갑하지 않게.
    const origin = pendingFurnitureOriginRef.current;
    pendingFurnitureOriginRef.current = null;
    const finalized = finalizeFurnitureDraft(pendingFurniture, "resident");
    const nextFurniture = origin ? { ...finalized, source: origin.source } : finalized;
    setPlacedFurnitures((currentFurnitures) => [...currentFurnitures, nextFurniture]);
    setPendingFurniture(null);
    setSelectedFurnitureId(null);
    setSaveMessage(`${nextFurniture.name} 배치를 확정했습니다.`);
  }

  function cancelPendingFurniturePlacement() {
    if (!pendingFurniture) return;
    const targetName = pendingFurniture.name;
    const restored = restorePendingFurnitureOrigin();
    setPendingFurniture(null);
    setSelectedFurnitureId(null);
    setSaveMessage(restored ? `${targetName} 원래 자리로 되돌렸습니다.` : `${targetName} 배치를 취소했습니다.`);
  }

  function deletePendingFurniture() {
    if (!pendingFurniture) return;
    const targetName = pendingFurniture.name;
    pendingFurnitureOriginRef.current = null;
    setPendingFurniture(null);
    setSelectedFurnitureId(null);
    setSaveMessage(`${targetName}을 삭제했습니다.`);
  }

  function rotatePendingFurniture() {
    if (!pendingFurniture) return;
    setPendingFurniture(rotateFurnitureQuarterTurn(pendingFurniture));
    setSaveMessage("집고 있는 가구를 90도 회전했습니다.");
  }

  function saveFurnitureLayout() {
    try {
      const payload = JSON.stringify({
        savedAt: Date.now(),
        planName: floorPlan.name,
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
      });
      window.localStorage.setItem(floorPlanFurnitureStorageKey(floorPlan), payload);
      // 공유 최신본 키에도 함께 쓴다 — 1인칭 투어는 도면별 키를 역산할 수 없어 이 키를 읽는다(가구 gap 수정).
      window.localStorage.setItem(LISTING_TOUR_FURNITURE_LATEST_KEY, payload);
      setSaveMessage("이 브라우저에 가구 배치를 저장했습니다. 1인칭 투어에도 반영돼요.");
    } catch {
      setSaveMessage("저장 공간 문제로 가구 배치를 저장하지 못했습니다.");
    }
  }

  function resetFurnitureLayout() {
    window.localStorage.removeItem(floorPlanFurnitureStorageKey(floorPlan));
    pendingFurnitureOriginRef.current = null;
    setPlacedFurnitures(floorPlan.furnitures as unknown as PlacedFurniture[]);
    setPendingFurniture(null);
    setSelectedFurnitureId(null);
    setSaveMessage("기본 옵션 배치로 되돌렸습니다.");
  }

  return (
    <div className={variant === "hero" ? "listing-tour-room3d hero-stage" : "listing-tour-room3d"}>
      <RoomlogThreeFloorPlanView
        cameraPosition={[9, 7.5, 11]}
        controlsEnabled={!isFurnitureDragging}
        frameloop="always"
        furnitureData={placedFurnitures}
        furnitureVerticalScale={TOUR_HORIZONTAL_SCALE}
        hideHint
        horizontalScale={TOUR_HORIZONTAL_SCALE}
        orbitMinDistance={1.6}
        sceneBackground={variant === "hero" ? null : undefined}
        onFloorPointerDown={handleFloorPointerDown}
        onFloorPointerMove={handleFloorPointerMove}
        onFurniturePointerDown={handleFurniturePointerDown}
        onPendingCancel={cancelPendingFurniturePlacement}
        onPendingConfirm={confirmPendingFurniturePlacement}
        onPendingDelete={deletePendingFurniture}
        onPendingRotate={rotatePendingFurniture}
        onWallPointerDown={handleWallPointerDown}
        pendingFurniture={pendingFurniture}
        selectedFurnitureId={selectedFurnitureId}
        selectedWallId={null}
        wallsData={wallsData}
      />

      {variant === "hero" ? (
        <button
          className="hero-furniture-toggle"
          type="button"
          aria-pressed={isHeroPanelOpen}
          onClick={() => setIsHeroPanelOpen((isOpen) => !isOpen)}
        >
          <span className={isHeroPanelOpen ? "hero-furniture-toggle-dot on" : "hero-furniture-toggle-dot"} aria-hidden="true" />
          가구 배치
        </button>
      ) : null}

      {variant !== "hero" || isHeroPanelOpen ? (
      <section className="listing-tour-furniture" aria-label="3D 가구 배치">
        <div className="listing-tour-furniture-head">
          <div>
            <strong>
              가구 배치
              {variant === "hero" ? <em className="hero-furniture-count">{placedFurnitures.length}</em> : null}
            </strong>
            <span>{saveMessage}</span>
          </div>
          <button type="button" onClick={() => setIsPlacementOpen((isOpen) => !isOpen)}>
            {isPlacementOpen ? "닫기" : "배치하기"}
          </button>
        </div>

        {variant === "hero" ? (
          <ul className="hero-furniture-list" aria-label="배치된 가구 목록">
            {placedFurnitures.map((furniture) => (
              <li key={furniture.id}>
                {/* hover(데스크톱)·탭(터치) 모두 지원 — 도면에서 해당 가구가 파랗게 밝아진다 */}
                <button
                  className={selectedFurnitureId === furniture.id ? "active" : ""}
                  type="button"
                  onMouseEnter={() => setSelectedFurnitureId(furniture.id)}
                  onMouseLeave={() => setSelectedFurnitureId((current) => (current === furniture.id ? null : current))}
                  onFocus={() => setSelectedFurnitureId(furniture.id)}
                  onBlur={() => setSelectedFurnitureId((current) => (current === furniture.id ? null : current))}
                  onClick={() => setSelectedFurnitureId((current) => (current === furniture.id ? null : furniture.id))}
                >
                  <span className="hero-furniture-dot" style={{ backgroundColor: furniture.color }} aria-hidden="true" />
                  <span className="hero-furniture-name">{furniture.name}</span>
                </button>
              </li>
            ))}
            {placedFurnitures.length === 0 ? (
              <li className="hero-furniture-empty">아직 배치된 가구가 없어요 — 배치하기로 넣어보세요</li>
            ) : null}
          </ul>
        ) : null}

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
            <p className="listing-tour-furniture-hint">
              가구를 놓거나 배치된 가구를 클릭해 끌어서 옮기고, 가구 위 버튼으로 ✓확정·⟳회전·✕취소·🗑삭제하세요.
            </p>
            <div className="listing-tour-furniture-actions">
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
      ) : null}
    </div>
  );
}
