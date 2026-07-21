"use client";

import type { ThreeEvent } from "@react-three/fiber";
import type { TenantFurniture } from "@roomlog/types/tenant-furniture";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createMitunetFloorFurnitureDraft,
  createFurnitureModel,
  finalizeFurnitureDraft,
  FURNITURE_CATALOG,
  furnitureCategoryLabel,
  furnitureImageUrl,
  hasAttachedFurniture,
  listFurnitureCategoryFilters,
  loadGlbDatasetCatalog,
  moveAttachedFurniture,
  reopenFurnitureDraft,
  resolveFurniturePlacement,
  rotateFurnitureForPlacement,
  rotateFurnitureQuarterTurn
} from "../floor-plan-3d/furniture-placement";
import type { FurniturePlacementHit, FurniturePlacementResult } from "../floor-plan-3d/furniture-placement";
import type {
  FurnitureCatalogItem,
  FurniturePlacementAttachment,
  PlacedFurniture,
  WheretoputWall3D
} from "../floor-plan-3d/room-model/types";
import { RoomlogThreeFloorPlanView } from "../floor-plan-3d/room-scene/RoomlogThreeFloorPlanView";
import type { FurnitureInteractionMode } from "../floor-plan-3d/room-scene/furniture-first-person-input";
import { resolveMitunetFurnitureSceneScale } from "../floor-plan-3d/room-scene/mitunet-geometry";
import { listingTourFurnitureStorageKey } from "../splat-tour/splat-furniture";
import { TourJoystick, type TourJoystickVector } from "../splat-tour/tour-joystick";
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";
import { fetchTenantFurniture, TenantFurnitureApiError } from "@/lib/tenant-furniture-api";
import {
  TENANT_FURNITURE_CATEGORY_ICONS,
  tenantFurnitureName
} from "../tenant/furniture/furniture-labels";

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
  placement?: FurniturePlacementAttachment;
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
  mitunet?: MitunetFloorPlan;
};

type SimulationMode = "overview" | "walk" | "furniture";

type ListingTourRoom3DProps = {
  floorPlan: ListingFloorPlan3D;
  simulationOpen?: boolean;
  listingId: string;
  /** hero = 상세 히어로 스테이지, sheet = 기존 3D 시트 */
  variant?: "sheet" | "hero";
  experience?: "listing" | "owner";
  initialSimulationMode?: SimulationMode;
  onOwnerFurnitureSave?: (furnitures: ListingFloorPlanFurniture[]) => void;
};

function serializeFurnitureLayout(furnitures: PlacedFurniture[]): ListingFloorPlanFurniture[] {
  return furnitures.map((furniture) => ({
    id: furniture.id,
    furniture_id: furniture.furniture_id,
    name: furniture.name,
    color: furniture.color,
    length: furniture.length,
    modelUrl: furniture.modelUrl,
    position: furniture.position,
    rotation: furniture.rotation,
    scale: furniture.scale,
    placement: furniture.placement,
    sizeMm: furniture.sizeMm,
    source: furniture.source
  }));
}

function readSavedFurnitures(listingId: string) {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(listingTourFurnitureStorageKey(listingId));
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as { furnitures?: unknown } | null;

  if (!Array.isArray(parsed?.furnitures)) {
    throw new Error("저장된 가구 배치 형식이 올바르지 않습니다.");
  }

  return parsed.furnitures as ListingFloorPlanFurniture[];
}

function catalogSearchText(item: FurnitureCatalogItem) {
  return `${item.name} ${item.brand} ${item.category ?? ""} ${item.furniture_id}`.toLowerCase();
}

function tenantFurnitureCatalogItem(furniture: TenantFurniture): FurnitureCatalogItem {
  return {
    brand: "내 가구",
    category: furniture.category,
    color: "lightgray",
    furniture_id: furniture.id,
    length: [furniture.sizeMm.width, furniture.sizeMm.height, furniture.sizeMm.depth],
    modelUrl: furniture.meshUrl ?? undefined,
    name: tenantFurnitureName(furniture),
    price: 0,
    source: furniture.source
  };
}

function normalizeMitunetListingFurniture(
  furniture: PlacedFurniture,
  mitunetPlan: MitunetFloorPlan | undefined
): PlacedFurniture {
  if (
    !mitunetPlan
    || !furniture.modelUrl
    || furniture.source === "furniture-glb-dataset"
    || (furniture.placement?.mode && furniture.placement.mode !== "floor")
  ) {
    return furniture;
  }

  return {
    ...furniture,
    position: [furniture.position[0], 0.006, furniture.position[2]],
    scale: resolveMitunetFurnitureSceneScale(mitunetPlan)
  };
}

function sameFurnitureTransform(left: PlacedFurniture, right: PlacedFurniture) {
  return left.position.every((value, index) => value === right.position[index])
    && left.rotation.every((value, index) => value === right.rotation[index])
    && left.placement?.mode === right.placement?.mode
    && left.placement?.supportFurnitureId === right.placement?.supportFurnitureId
    && left.placement?.wallId === right.placement?.wallId;
}

export default function ListingTourRoom3D({
  experience = "listing",
  floorPlan,
  initialSimulationMode = "walk",
  simulationOpen,
  listingId,
  onOwnerFurnitureSave,
  variant = "sheet"
}: ListingTourRoom3DProps) {
  const wallsData = floorPlan.walls3D as unknown as WheretoputWall3D[];
  const [simulationMode, setSimulationMode] = useState<SimulationMode>(initialSimulationMode);
  const [furnitureInteractionMode, setFurnitureInteractionMode] = useState<FurnitureInteractionMode>("explore");
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const walkMoveInputRef = useRef<TourJoystickVector>({ forward: 0, strafe: 0 });
  const furniturePointerLockRequestRef = useRef<(() => void) | null>(null);
  const [isPlacementOpen, setIsPlacementOpen] = useState(initialSimulationMode === "furniture");
  // hero 패널 접기 — 우상단 "가구 편집" 버튼으로 여닫고, 도면을 가리지 않도록 기본은 닫아 둔다.
  const [isHeroPanelOpen, setIsHeroPanelOpen] = useState(initialSimulationMode === "furniture");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [furnitureCategoryFilter, setFurnitureCategoryFilter] = useState("전체");
  const [furnitureLimit, setFurnitureLimit] = useState(30);
  const [furnitureCatalog, setFurnitureCatalog] = useState<FurnitureCatalogItem[]>(FURNITURE_CATALOG);
  const [placedFurnitures, setPlacedFurnitures] = useState<PlacedFurniture[]>([]);
  const [pendingFurniture, setPendingFurniture] = useState<PlacedFurniture | null>(null);
  const [furniturePlacementFeedback, setFurniturePlacementFeedback] = useState<Pick<FurniturePlacementResult, "reason" | "valid"> & { mode: FurniturePlacementAttachment["mode"] } | null>(null);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [tenantFurnitures, setTenantFurnitures] = useState<TenantFurniture[]>([]);
  const [hasSavedFurnitureLayout, setHasSavedFurnitureLayout] = useState(false);
  const [saveMessage, setSaveMessage] = useState("가구 배치 편집을 열어 옵션 위치를 확인할 수 있습니다.");
  // 가구 드래그 이동 — 좌클릭을 누른 채 끌면 커서를 따라오고, 떼면 그 자리에 멈춘다(확정은 ✓).
  const [isFurnitureDragging, setIsFurnitureDragging] = useState(false);
  // 카탈로그에서 새로 고른 가구가 아니라, 이미 배치된 가구를 다시 집어든 상태인지.
  const [isPendingFurnitureEditing, setIsPendingFurnitureEditing] = useState(false);
  // 배치된 가구를 다시 집어들 때(재편집) 취소하면 되돌릴 원래 상태 + 원본 분류(source) 보존용.
  const pendingFurnitureOriginRef = useRef<PlacedFurniture | null>(null);
  // 내 가구 신규 배치의 원본 source 보존용. finalizeFurnitureDraft의 RESIDENT_DESIGN 덮어쓰기를 막는다.
  const pendingTenantFurnitureSourceRef = useRef<TenantFurniture["source"] | null>(null);
  const pendingFurniturePlacementRef = useRef<FurniturePlacementResult | null>(null);
  // 집고 있는 가구가 사용자 위치를 한 번이라도 받았는지 — 포인터 기반 배치의 호환 상태에도 사용한다.
  const pendingFurniturePlacedOnceRef = useRef(false);
  const lastFurniturePlacementHitRef = useRef<FurniturePlacementHit | null>(null);
  // 기존 포인터 기반 배치를 위한 마지막 바닥점 호환 캐시.
  const lastFurniturePlacementPointRef = useRef<{ x: number; z: number } | null>(null);
  const furnitureCategoryTabsRef = useRef<HTMLDivElement>(null);
  const [furnitureCategoryScroll, setFurnitureCategoryScroll] = useState({ left: 0, max: 0 });
  const furnitureCategoryCounts = useMemo(
    () =>
      furnitureCatalog.reduce<Record<string, number>>((counts, item) => {
        const category = furnitureCategoryLabel(item);
        counts[category] = (counts[category] ?? 0) + 1;
        return counts;
      }, {}),
    [furnitureCatalog]
  );
  const furnitureCategoryFilters = useMemo(() => listFurnitureCategoryFilters(furnitureCatalog), [furnitureCatalog]);
  const filteredCatalog = useMemo(() => {
    const normalizedQuery = catalogQuery.trim().toLowerCase();
    const catalog = furnitureCatalog.filter((item) => {
      const matchesCategory = furnitureCategoryFilter === "전체" || furnitureCategoryLabel(item) === furnitureCategoryFilter;
      const matchesQuery = !normalizedQuery || catalogSearchText(item).includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });

    return catalog;
  }, [catalogQuery, furnitureCatalog, furnitureCategoryFilter]);
  const visibleFurnitureCatalog = useMemo(() => filteredCatalog.slice(0, furnitureLimit), [filteredCatalog, furnitureLimit]);
  const selectedFurniture = pendingFurniture ?? placedFurnitures.find((furniture) => furniture.id === selectedFurnitureId) ?? null;

  useEffect(() => {
    if (!isPlacementOpen) return;
    const tabList = furnitureCategoryTabsRef.current;
    if (!tabList) return;

    const syncScroll = () => {
      const max = Math.max(0, Math.round(tabList.scrollWidth - tabList.clientWidth));
      const left = Math.max(0, Math.min(max, Math.round(tabList.scrollLeft)));
      setFurnitureCategoryScroll((current) => (current.left === left && current.max === max ? current : { left, max }));
    };

    syncScroll();
    const resizeObserver = new ResizeObserver(syncScroll);
    resizeObserver.observe(tabList);
    Array.from(tabList.children).forEach((child) => resizeObserver.observe(child));

    return () => resizeObserver.disconnect();
  }, [furnitureCategoryFilters, isPlacementOpen]);

  useEffect(() => {
    let isActive = true;

    async function loadFurnitureCatalog() {
      try {
        const datasetItems = await loadGlbDatasetCatalog();
        if (!isActive || !datasetItems.length) return;
        setFurnitureCatalog(datasetItems);
      } catch {
        // The bundled GLB catalog is unavailable only in fallback environments.
        // Keep the existing basic catalog usable in that case.
      }
    }

    void loadFurnitureCatalog();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    try {
      const savedFurnitures = experience === "owner" ? null : readSavedFurnitures(listingId);
      setPlacedFurnitures(
        ((savedFurnitures ?? floorPlan.furnitures) as unknown as PlacedFurniture[]).map((furniture) =>
          normalizeMitunetListingFurniture(furniture, floorPlan.mitunet)
        )
      );
      setHasSavedFurnitureLayout(savedFurnitures !== null);
      setSaveMessage(savedFurnitures ? "저장된 가구 배치를 불러왔습니다." : "가구 배치 편집을 열어 옵션 위치를 확인할 수 있습니다.");
    } catch {
      setPlacedFurnitures(floorPlan.furnitures as unknown as PlacedFurniture[]);
      // 손상된 값도 사용자가 버튼으로 지울 수 있어야 하므로 복원 동작은 열어 둔다.
      setHasSavedFurnitureLayout(true);
      setSaveMessage("저장된 가구 배치를 불러오지 못해 원래 배치를 표시합니다.");
    }
    pendingFurnitureOriginRef.current = null;
    pendingTenantFurnitureSourceRef.current = null;
    setPendingFurniture(null);
    setIsPendingFurnitureEditing(false);
    setSelectedFurnitureId(null);
    setFurnitureInteractionMode("explore");
  }, [experience, floorPlan, listingId]);

  useEffect(() => {
    let cancelled = false;

    fetchTenantFurniture()
      .then((furnitures) => {
        // RoomPlan 스캔은 방 안 물체를 감지하는 즉시 meshUrl 없이 행을 만든다. Object Capture로
        // 실물을 찍어 변환까지 끝난(meshJobState === "DONE") 것만 배치 가능한 실물 모델이 있다 —
        // 그 전 단계 항목을 그대로 두면 회색 박스만 수십 개 나열된다.
        if (!cancelled) setTenantFurnitures(furnitures.filter((furniture) => furniture.meshJobState === "DONE"));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setTenantFurnitures([]);
        if (reason instanceof TenantFurnitureApiError && reason.status === 401) return;
        setSaveMessage("내 가구를 불러오지 못했습니다. 기본 가구는 계속 이용할 수 있습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    setIsPendingFurnitureEditing(false);
    setPlacedFurnitures((currentFurnitures) => [...currentFurnitures, original]);
    return true;
  }

  function normalizedScenePoint(point: { x: number; z: number }) {
    return point;
  }

  function handleFurnitureCategoryScroll() {
    const tabList = furnitureCategoryTabsRef.current;
    if (!tabList) return;
    const max = Math.max(0, Math.round(tabList.scrollWidth - tabList.clientWidth));
    const left = Math.max(0, Math.min(max, Math.round(tabList.scrollLeft)));
    setFurnitureCategoryScroll((current) => (current.left === left && current.max === max ? current : { left, max }));
  }

  function handleFurnitureCategoryScrollChange(event: FormEvent<HTMLInputElement>) {
    const tabList = furnitureCategoryTabsRef.current;
    if (!tabList) return;
    const left = Number(event.currentTarget.value);
    tabList.scrollLeft = left;
    setFurnitureCategoryScroll((current) => ({ ...current, left }));
  }

  function openFurnitureEditor() {
    setIsHeroPanelOpen(true);
    setIsPlacementOpen(true);
    setFurnitureLimit(30);
  }

  function openFurnitureSelection() {
    setFurnitureInteractionMode("select");
    openFurnitureEditor();
  }

  function closeFurnitureSelection() {
    setFurnitureInteractionMode("explore");
  }

  function rememberFurniturePlacementPoint(point: { x: number; z: number }) {
    lastFurniturePlacementPointRef.current = point;
  }

  function rememberFurniturePlacementHit(hit: FurniturePlacementHit) {
    lastFurniturePlacementHitRef.current = hit;
    if (hit.kind === "floor") rememberFurniturePlacementPoint(hit.point);
  }

  function updateFurniturePlacementFeedback(placement: FurniturePlacementResult | null) {
    const next = placement
      ? { mode: placement.attachment.mode, reason: placement.reason, valid: placement.valid }
      : null;
    setFurniturePlacementFeedback((current) => (
      current?.mode === next?.mode && current?.reason === next?.reason && current?.valid === next?.valid ? current : next
    ));
  }

  function closeFurnitureEditor() {
    setIsPlacementOpen(false);
    if (variant === "hero") setIsHeroPanelOpen(false);
  }

  function collapseHeroPanel() {
    setIsHeroPanelOpen(false);
  }

  useEffect(() => {
    if (simulationOpen === undefined) return;
    walkMoveInputRef.current = { forward: 0, strafe: 0 };
    setSelectedFurnitureId(null);
    setIsFurnitureDragging(false);
    setFurnitureInteractionMode("explore");
    setFurniturePlacementFeedback(null);
    pendingFurniturePlacementRef.current = null;
    lastFurniturePlacementHitRef.current = null;
    lastFurniturePlacementPointRef.current = null;

    if (simulationOpen) {
      if (pendingFurniture) cancelPendingFurniturePlacement();
      setSimulationMode(initialSimulationMode);
      if (initialSimulationMode === "furniture") openFurnitureEditor();
      else closeFurnitureEditor();
      return;
    }

    if (pendingFurniture) cancelPendingFurniturePlacement();
    closeFurnitureEditor();
  }, [simulationOpen]);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(query.matches || navigator.maxTouchPoints > 0);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const handleWalkJoystickChange = useCallback((vector: TourJoystickVector | null) => {
    walkMoveInputRef.current = vector ?? { forward: 0, strafe: 0 };
  }, []);

  function handleFurnitureSelect(item: FurnitureCatalogItem) {
    // 재편집 중이던 가구가 있으면 원위치로 되돌려 놓고 새 가구를 집는다.
    restorePendingFurnitureOrigin();
    pendingTenantFurnitureSourceRef.current = null;
    setIsPendingFurnitureEditing(false);
    const draft =
      floorPlan.mitunet
        ? createMitunetFloorFurnitureDraft(item, resolveMitunetFurnitureSceneScale(floorPlan.mitunet))
        : createFurnitureModel(item);
    startCatalogFurnitureCarry(draft);
    setSaveMessage(`${item.name}을 선택했습니다. 3D 바닥을 눌러 위치를 잡고 끌어서 옮기세요.`);
  }

  function handleTenantFurnitureSelect(furniture: TenantFurniture) {
    const item = tenantFurnitureCatalogItem(furniture);
    restorePendingFurnitureOrigin();
    pendingTenantFurnitureSourceRef.current = furniture.source;
    const draft = {
      ...(floorPlan.mitunet
        ? createMitunetFloorFurnitureDraft(item, resolveMitunetFurnitureSceneScale(floorPlan.mitunet))
        : createFurnitureModel(item)),
      sizeMm: furniture.sizeMm,
      source: furniture.source
    };
    startCatalogFurnitureCarry(draft);
    setSaveMessage(`${item.name}을 선택했습니다. 3D 바닥을 눌러 위치를 잡고 끌어서 옮기세요.`);
  }

  function startCatalogFurnitureCarry(draft: PlacedFurniture) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const placementHit = lastFurniturePlacementHitRef.current;
    const placement = placementHit
      ? resolveFurniturePlacement({ draft, hit: placementHit, placed: placedFurnitures, walls: wallsData })
      : null;
    const nextDraft = placement?.valid ? placement.furniture : draft;
    pendingFurniturePlacementRef.current = placement;
    updateFurniturePlacementFeedback(placement);
    pendingFurniturePlacedOnceRef.current = placement?.valid === true;
    setPendingFurniture(nextDraft);
    setSelectedFurnitureId(null);
    setIsPlacementOpen(true);
    setFurnitureInteractionMode("carry");
    furniturePointerLockRequestRef.current?.();
  }

  function placePendingFurnitureAtHit(hit: FurniturePlacementHit) {
    if (!pendingFurniture) return;
    rememberFurniturePlacementHit(hit);
    const placement = resolveFurniturePlacement({ draft: pendingFurniture, hit, placed: placedFurnitures, walls: wallsData });
    pendingFurniturePlacementRef.current = placement;
    updateFurniturePlacementFeedback(placement);
    if (!placement.valid) {
      setSaveMessage(placement.reason ?? "이 위치에는 배치할 수 없습니다.");
      return;
    }
    pendingFurniturePlacedOnceRef.current = true;
    if (!sameFurnitureTransform(pendingFurniture, placement.furniture)) setPendingFurniture(placement.furniture);
    setSaveMessage(`${placement.furniture.name} 위치를 잡았습니다. Q로 배치를 확정하세요.`);
  }

  function placePendingFurniture(point: { x: number; z: number }) {
    placePendingFurnitureAtHit({ kind: "floor", point: { ...normalizedScenePoint(point), y: 0 } });
  }

  function clearSelectedFurniture() {
    if (!selectedFurnitureId || pendingFurniture) return;
    setSelectedFurnitureId(null);
    setSaveMessage("가구 선택을 해제했습니다.");
  }

  function handleFloorPointerDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) return;
    if (!pendingFurniture) {
      clearSelectedFurniture();
      return;
    }
    event.stopPropagation();
    placePendingFurniture(event.point);
    setIsFurnitureDragging(true);
  }

  function handleFloorPointerMove(event: ThreeEvent<PointerEvent>) {
    if (!isFurnitureDragging || !pendingFurniture) return;
    placePendingFurniture(event.point);
  }

  function handleWallPointerDown(_wall: WheretoputWall3D, event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) return;
    if (!pendingFurniture) {
      clearSelectedFurniture();
      return;
    }
    event.stopPropagation();
    placePendingFurniture(event.point);
    setIsFurnitureDragging(true);
  }

  function handleScenePointerMissed() {
    clearSelectedFurniture();
  }

  function handleFurniturePointerDown(furniture: PlacedFurniture, event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (pendingFurniture) {
      placePendingFurniture(event.point);
      setIsFurnitureDragging(true);
      return;
    }

    setSelectedFurnitureId(furniture.id);
    setIsFurnitureDragging(false);
    setSaveMessage(`${furniture.name} 선택됨 — 위 아이콘으로 이동, 회전 또는 삭제하세요.`);
  }

  function confirmPendingFurniturePlacement() {
    if (!pendingFurniture) return;
    if (!pendingFurniturePlacementRef.current?.valid) {
      setSaveMessage(pendingFurniturePlacementRef.current?.reason ?? "초록색 조준선이 보이는 위치에서 Q를 눌러주세요.");
      return;
    }
    // 재편집이면 원본 분류(source)를 보존한다 — 임대인 옵션 가구가 세입자 배치로 둔갑하지 않게.
    const origin = pendingFurnitureOriginRef.current;
    const tenantFurnitureSource = pendingTenantFurnitureSourceRef.current;
    pendingFurnitureOriginRef.current = null;
    pendingTenantFurnitureSourceRef.current = null;
    setIsPendingFurnitureEditing(false);
    const finalized = finalizeFurnitureDraft(pendingFurniture, "resident");
    const nextFurniture = origin
      ? { ...finalized, source: origin.source }
      : tenantFurnitureSource
        ? { ...finalized, source: tenantFurnitureSource }
        : finalized;
    setPlacedFurnitures((currentFurnitures) => {
      const withMovedChildren = origin
        ? moveAttachedFurniture({ afterSupport: nextFurniture, beforeSupport: origin, furniture: currentFurnitures })
        : currentFurnitures;
      return [...withMovedChildren, nextFurniture];
    });
    setPendingFurniture(null);
    pendingFurniturePlacementRef.current = null;
    setFurniturePlacementFeedback(null);
    setSelectedFurnitureId(nextFurniture.id);
    setFurnitureInteractionMode("explore");
    setSaveMessage(`${nextFurniture.name} 배치를 확정했습니다.`);
  }

  function confirmPendingFurnitureFromShortcut() {
    if (!pendingFurniturePlacementRef.current?.valid) {
      setSaveMessage(pendingFurniturePlacementRef.current?.reason ?? "초록색 조준선이 보이는 위치에서 Q를 눌러주세요.");
      return;
    }
    confirmPendingFurniturePlacement();
  }

  function cancelPendingFurniturePlacement() {
    if (!pendingFurniture) return;
    const targetName = pendingFurniture.name;
    const restored = restorePendingFurnitureOrigin();
    pendingTenantFurnitureSourceRef.current = null;
    setPendingFurniture(null);
    pendingFurniturePlacementRef.current = null;
    setFurniturePlacementFeedback(null);
    setIsPendingFurnitureEditing(false);
    setSelectedFurnitureId(null);
    setFurnitureInteractionMode("explore");
    setSaveMessage(restored ? `${targetName} 원래 자리로 되돌렸습니다.` : `${targetName} 배치를 취소했습니다.`);
  }

  function selectSimulationMode(nextMode: SimulationMode) {
    if (nextMode !== "furniture" && pendingFurniture) cancelPendingFurniturePlacement();
    walkMoveInputRef.current = { forward: 0, strafe: 0 };
    setSelectedFurnitureId(null);
    setIsFurnitureDragging(false);
    setFurnitureInteractionMode("explore");
    setSimulationMode(nextMode);

    if (nextMode === "furniture") openFurnitureEditor();
    else closeFurnitureEditor();
  }

  function deletePendingFurniture() {
    if (!pendingFurniture) return;
    if (hasAttachedFurniture(pendingFurniture.id, placedFurnitures)) {
      setSaveMessage("위에 놓인 가구를 먼저 제거하세요");
      return;
    }
    const targetName = pendingFurniture.name;
    pendingFurnitureOriginRef.current = null;
    pendingTenantFurnitureSourceRef.current = null;
    setIsPendingFurnitureEditing(false);
    setPendingFurniture(null);
    pendingFurniturePlacementRef.current = null;
    setFurniturePlacementFeedback(null);
    setSelectedFurnitureId(null);
    setFurnitureInteractionMode("explore");
    setSaveMessage(`${targetName}을 삭제했습니다.`);
  }

  function removePendingFurnitureFromShortcut() {
    if (!pendingFurniture) return;
    if (!isPendingFurnitureEditing) {
      cancelPendingFurniturePlacement();
      return;
    }
    deletePendingFurniture();
  }

  function rotatePendingFurniture(direction: -1 | 1) {
    if (!pendingFurniture) return;
    const rotated = rotateFurnitureForPlacement(pendingFurniture, direction);
    const hit = lastFurniturePlacementHitRef.current;
    if (hit) {
      const placement = resolveFurniturePlacement({ draft: rotated, hit, placed: placedFurnitures, walls: wallsData });
      pendingFurniturePlacementRef.current = placement;
      updateFurniturePlacementFeedback(placement);
      setPendingFurniture(placement.valid ? placement.furniture : rotated);
    } else {
      setPendingFurniture(rotated);
    }
    setSaveMessage(`집고 있는 가구를 ${direction === -1 ? "왼쪽" : "오른쪽"}으로 90도 회전했습니다.`);
  }

  function beginFurnitureMoveById(furnitureId: string) {
    const furniture = placedFurnitures.find((item) => item.id === furnitureId);
    if (!furniture) return;

    pendingFurnitureOriginRef.current = furniture;
    pendingTenantFurnitureSourceRef.current = null;
    pendingFurniturePlacedOnceRef.current = true;
    setIsPendingFurnitureEditing(true);
    setPlacedFurnitures((currentFurnitures) => currentFurnitures.filter((item) => item.id !== furniture.id));
    setPendingFurniture(reopenFurnitureDraft(furniture));
    pendingFurniturePlacementRef.current = null;
    setFurniturePlacementFeedback(null);
    setSelectedFurnitureId(null);
    setIsFurnitureDragging(false);
    setFurnitureInteractionMode("carry");
    setSaveMessage(`${furniture.name} 이동 중 — 바닥을 눌러 위치를 잡고 ✓로 확정하세요.`);
    furniturePointerLockRequestRef.current?.();
  }

  function beginSelectedFurnitureMove() {
    if (!selectedFurnitureId) return;
    beginFurnitureMoveById(selectedFurnitureId);
  }

  function rotateSelectedFurniture(direction: -1 | 1) {
    if (!selectedFurnitureId) return;
    const furniture = placedFurnitures.find((item) => item.id === selectedFurnitureId);
    if (!furniture) return;

    const rotated = rotateFurnitureQuarterTurn(furniture, direction);
    setPlacedFurnitures((currentFurnitures) => {
      const withoutSupport = currentFurnitures.filter((item) => item.id !== furniture.id);
      return [...moveAttachedFurniture({ afterSupport: rotated, beforeSupport: furniture, furniture: withoutSupport }), rotated];
    });
    setSaveMessage(`${furniture.name} ${direction === -1 ? "왼쪽" : "오른쪽"}으로 90도 회전했습니다.`);
  }

  function deleteSelectedFurniture() {
    if (!selectedFurnitureId) return;
    const furniture = placedFurnitures.find((item) => item.id === selectedFurnitureId);
    if (!furniture) return;
    if (hasAttachedFurniture(furniture.id, placedFurnitures)) {
      setSaveMessage("위에 놓인 가구를 먼저 제거하세요");
      return;
    }

    setPlacedFurnitures((currentFurnitures) => currentFurnitures.filter((item) => item.id !== furniture.id));
    setSelectedFurnitureId(null);
    setSaveMessage(`${furniture.name}을(를) 삭제했습니다.`);
  }

  function saveFurnitureLayout() {
    if (experience === "owner") {
      onOwnerFurnitureSave?.(serializeFurnitureLayout(placedFurnitures));
      setSaveMessage("등록용 가구 배치를 저장했습니다.");
      return;
    }
    let payload: string;

    try {
      payload = JSON.stringify({
        savedAt: Date.now(),
        furnitures: serializeFurnitureLayout(placedFurnitures)
      });
      window.localStorage.setItem(listingTourFurnitureStorageKey(listingId), payload);
      setHasSavedFurnitureLayout(true);
      setSaveMessage("이 브라우저에 가구 배치를 저장했습니다. 1인칭 투어에도 반영돼요.");
    } catch {
      setSaveMessage("저장 공간 문제로 가구 배치를 저장하지 못했습니다.");
      return;
    }
  }

  function resetFurnitureLayout() {
    // dev(origin/dev)도 같은 되돌리기를 독립 구현했다. 키는 이쪽(listingId 기반)을 쓴다 —
    // 도면 지문 키는 비슷한 도면끼리 충돌해 매물 간 가구가 새는 원인이었다(229936e4).
    // dev의 setIsPendingFurnitureEditing(false)는 편집 상태가 되돌린 뒤에도 남지 않게 함께 살린다.
    try {
      window.localStorage.removeItem(listingTourFurnitureStorageKey(listingId));
      pendingFurnitureOriginRef.current = null;
      pendingTenantFurnitureSourceRef.current = null;
      pendingFurniturePlacedOnceRef.current = false;
      setIsPendingFurnitureEditing(false);
      setPlacedFurnitures(floorPlan.furnitures as unknown as PlacedFurniture[]);
      setPendingFurniture(null);
      setSelectedFurnitureId(null);
      setFurnitureInteractionMode("explore");
      setHasSavedFurnitureLayout(false);
      setSaveMessage("임대인이 놓은 원래 배치로 되돌렸습니다.");
    } catch {
      setSaveMessage("저장된 가구 배치를 지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <div
      className={
        variant === "hero"
          ? `listing-tour-room3d hero-stage${isHeroPanelOpen ? " hero-panel-open" : ""}`
          : "listing-tour-room3d"
      }
    >
      <RoomlogThreeFloorPlanView
        controlMode={simulationOpen && simulationMode === "walk" ? "walk" : "orbit"}
        controlsEnabled={!isFurnitureDragging}
        frameloop="always"
        furnitureData={placedFurnitures}
        furnitureFirstPersonEnabled={simulationOpen && simulationMode === "furniture" && !isCoarsePointer}
        furnitureInteractionMode={furnitureInteractionMode}
        furniturePlacementFeedback={furniturePlacementFeedback}
        furniturePointerLockRequestRef={furniturePointerLockRequestRef}
        hideHint
        mitunetPlan={floorPlan.mitunet}
        moveInputRef={walkMoveInputRef}
        orbitMinDistance={1.6}
        fitDistanceScale={0.9}
        listingPreview
        onFloorPointerDown={handleFloorPointerDown}
        onFloorPointerMove={handleFloorPointerMove}
        onFurnitureCancel={cancelPendingFurniturePlacement}
        onFurnitureCloseSelect={closeFurnitureSelection}
        onFurnitureConfirm={confirmPendingFurnitureFromShortcut}
        onFurnitureLatestPlacementPoint={rememberFurniturePlacementPoint}
        onFurnitureLatestPlacementHit={rememberFurniturePlacementHit}
        onFurnitureOpenSelect={openFurnitureSelection}
        onFurniturePickupAimed={beginFurnitureMoveById}
        onFurniturePlacementPoint={placePendingFurniture}
        onFurniturePlacementHit={placePendingFurnitureAtHit}
        onFurnitureRemove={removePendingFurnitureFromShortcut}
        onFurnitureRotateLeft={() => rotatePendingFurniture(-1)}
        onFurnitureRotateRight={() => rotatePendingFurniture(1)}
        onFurniturePointerDown={handleFurniturePointerDown}
        onScenePointerMissed={handleScenePointerMissed}
        onPendingCancel={cancelPendingFurniturePlacement}
        onPendingConfirm={confirmPendingFurniturePlacement}
        pendingFurnitureCanBeDeleted={isPendingFurnitureEditing}
        previewFit
        onPendingDelete={deletePendingFurniture}
        onPendingRotate={rotatePendingFurniture}
        onSelectedDelete={deleteSelectedFurniture}
        onSelectedMove={beginSelectedFurnitureMove}
        onSelectedRotateLeft={() => rotateSelectedFurniture(-1)}
        onSelectedRotateRight={() => rotateSelectedFurniture(1)}
        onWallPointerDown={handleWallPointerDown}
        pendingFurniture={pendingFurniture}
        selectedFurnitureId={selectedFurnitureId}
        selectedWallId={null}
        wallsData={wallsData}
      />

      {variant === "hero" && simulationOpen ? (
        <div aria-label="3D 시뮬레이션 모드" className="listing-tour-simulation-modes" role="tablist">
          <button
            aria-selected={simulationMode === (experience === "owner" ? "overview" : "walk")}
            className={simulationMode === (experience === "owner" ? "overview" : "walk") ? "active" : ""}
            onClick={() => selectSimulationMode(experience === "owner" ? "overview" : "walk")}
            role="tab"
            type="button"
          >
            {experience === "owner" ? "전체보기" : "워킹뷰"}
          </button>
          <button
            aria-selected={simulationMode === "furniture"}
            className={simulationMode === "furniture" ? "active" : ""}
            onClick={() => selectSimulationMode("furniture")}
            role="tab"
            type="button"
          >
            가구 배치
          </button>
        </div>
      ) : null}

      {simulationOpen && simulationMode === "walk" && isCoarsePointer ? (
        <TourJoystick onChange={handleWalkJoystickChange} />
      ) : null}

      {variant === "hero" && simulationOpen && simulationMode === "furniture" && !isHeroPanelOpen ? (
        <button
          aria-label="가구 목록 열기"
          className="hero-furniture-reopen"
          type="button"
          onClick={openFurnitureEditor}
        >
          가구 목록 열기
        </button>
      ) : null}

      {variant !== "hero" || (simulationOpen && simulationMode === "furniture" && isHeroPanelOpen) ? (
      <section className={variant === "hero" ? "listing-tour-furniture hero-furniture-drawer" : "listing-tour-furniture"} aria-label="3D 가구 배치">
        <div className="listing-tour-furniture-head">
          <div>
            <strong>
              가구 배치
              {variant === "hero" ? <em className="hero-furniture-count">{placedFurnitures.length}</em> : null}
            </strong>
            {variant !== "hero" ? <span>{saveMessage}</span> : null}
          </div>
          <button
            type="button"
            onClick={isPlacementOpen ? (variant === "hero" ? collapseHeroPanel : closeFurnitureEditor) : openFurnitureEditor}
          >
            {isPlacementOpen ? (variant === "hero" ? "접기" : "닫기") : "가구 편집"}
          </button>
        </div>

        {variant === "hero" && selectedFurniture ? (
          <div className="hero-furniture-selected-summary">
            <span className="hero-furniture-dot" style={{ backgroundColor: selectedFurniture.color }} aria-hidden="true" />
            <span>{selectedFurniture.name}</span>
          </div>
        ) : null}

        {isPlacementOpen ? (
          <div className="listing-tour-furniture-body">
            {tenantFurnitures.length > 0 ? (
              <section className="listing-tour-furniture-body" aria-label="내 가구">
                <div className="listing-tour-furniture-head">
                  <div>
                    <strong>내 가구</strong>
                    <span>등록한 가구를 이 방에 놓아보세요.</span>
                  </div>
                </div>
                <div className="listing-tour-furniture-grid">
                  {tenantFurnitures.map((furniture) => {
                    const item = tenantFurnitureCatalogItem(furniture);

                    return (
                      <button
                        className={pendingFurniture?.furniture_id === item.furniture_id ? "active" : ""}
                        key={item.furniture_id}
                        onClick={() => handleTenantFurnitureSelect(furniture)}
                        type="button"
                      >
                        <span
                          className="listing-tour-furniture-thumb"
                          style={{ backgroundColor: "var(--surface-container-high)" }}
                          aria-hidden="true"
                        >
                          {TENANT_FURNITURE_CATEGORY_ICONS[furniture.category] ?? "◇"}
                        </span>
                        <strong>{item.name}</strong>
                        <small>{furniture.sizeMm.width} × {furniture.sizeMm.depth} mm</small>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
            <div className="listing-tour-furniture-search">
              <input
                aria-label="가구 검색"
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="침대, 책상, 의자 검색"
                type="search"
                value={catalogQuery}
              />
            </div>
            <div
              aria-label="가구 카테고리"
              className="listing-tour-furniture-category-tabs"
              onScroll={handleFurnitureCategoryScroll}
              ref={furnitureCategoryTabsRef}
              role="tablist"
            >
              {furnitureCategoryFilters.map((category) => (
                <button
                  aria-selected={furnitureCategoryFilter === category}
                  className={furnitureCategoryFilter === category ? "active" : ""}
                  key={category}
                  onClick={() => setFurnitureCategoryFilter(category)}
                  role="tab"
                  type="button"
                >
                  {category}
                  <small>{category === "전체" ? furnitureCatalog.length : furnitureCategoryCounts[category] ?? 0}</small>
                </button>
              ))}
            </div>
            {variant !== "hero" && furnitureCategoryScroll.max > 0 ? (
              <input
                aria-label="가구 카테고리 가로 스크롤"
                className="listing-tour-furniture-category-scrollbar"
                max={furnitureCategoryScroll.max}
                min={0}
                onInput={handleFurnitureCategoryScrollChange}
                step={1}
                type="range"
                value={furnitureCategoryScroll.left}
              />
            ) : null}
            <div className="hero-furniture-catalog-scroll">
            <div className="listing-tour-furniture-grid">
              {visibleFurnitureCatalog.map((item) => {
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
            {visibleFurnitureCatalog.length < filteredCatalog.length ? (
              <button className="listing-tour-furniture-more" onClick={() => setFurnitureLimit((limit) => limit + 30)} type="button">
                가구 더 보기 ({visibleFurnitureCatalog.length}/{filteredCatalog.length})
              </button>
            ) : null}
            </div>
            {variant !== "hero" ? <p className="listing-tour-furniture-hint">
              가구를 놓거나 배치된 가구를 클릭해 끌어서 옮기고, 가구 위 버튼으로 ✓확정·⟳회전·✕취소·🗑삭제하세요.
            </p> : null}
            <div className="listing-tour-furniture-actions">
              <button onClick={saveFurnitureLayout} type="button">
                {experience === "owner" ? "3D 도면 저장하기" : "저장"}
              </button>
              <button disabled={!hasSavedFurnitureLayout} onClick={resetFurnitureLayout} type="button">
                원래 배치로 되돌리기
              </button>
            </div>
          </div>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}
