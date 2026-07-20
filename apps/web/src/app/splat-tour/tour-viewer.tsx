"use client";

// 조립 셸 — Canvas 안에 SplatScene+TourCamera, 밖에 TourMinimap과 프리셋 버튼 바를 둔다.
// 각 조각(SplatScene/TourCamera/TourMinimap)은 병렬 에이전트가 채워넣는다.

import { Canvas } from "@react-three/fiber";
import { Armchair, Check, ChevronDown, ChevronLeft, ChevronRight, RotateCcw, RotateCw, Trash2, UploadCloud, X } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SplatScene } from "./splat-scene";
import { TourJoystick, type TourJoystickVector } from "./tour-joystick";
import type { TourMoveInput } from "./tour-camera";
import { SplatDropzone } from "./splat-dropzone";
import { LISTING_TOUR_FURNITURE_LATEST_KEY, loadViewerFurnitureFromBrowser, type SplatFurnitureState } from "./splat-furniture";
import { SplatFurnitureLayer } from "./splat-furniture-layer";
import {
  beginTourFurnitureDraft,
  cancelTourFurnitureDraft,
  clampTourFurniturePoint,
  confirmTourFurnitureDraft,
  createTourFurnitureSavePayload,
  deleteTourFurnitureDraft,
  filterTourFurnitureCatalog,
  reopenTourFurnitureDraft,
  rotateTourFurnitureDraft,
  type TourFurnitureBounds,
  type TourFurnitureDraft
} from "./splat-furniture-editor";
import { SplatPlanWalls } from "./splat-plan-walls";
import { loadPlanWallsFromBrowser, wallsToPlanBounds, type PlanBounds } from "./splat-plan-shape";
import { resolveWallReplace } from "./splat-walls";
import { TourCamera } from "./tour-camera";
import { TourMinimap } from "./tour-minimap";
import { SPLAT_CLIP_ROOM } from "./splat-clip";
import { getSplatAsset, resolveAssetFileUrl } from "@/lib/splat-asset-api";
import {
  FURNITURE_CATALOG,
  furnitureCategoryLabel,
  furnitureImageUrl,
  listFurnitureCategoryFilters,
  loadGlbDatasetCatalog
} from "../floor-plan-3d/furniture-placement";
import type { FurnitureCatalogItem, PlacedFurniture } from "../floor-plan-3d/room-model/types";
import type { SplatTransform } from "./tour-types";

// cap2_sharp.spz: 자체 캡처앱(capture-ios) 촬영본의 샤픈 산출 SPZ(756K 가우시안). 배치는 같은
// basename의 cap2_sharp.tuning.json이 담당한다 — auto fit(폰 캡처는 미터 스케일 미보정이라 native
// 원점을 못 믿어 bbox 자동 센터링·스케일), rotX 0(이 캡처는 이미 Y-up이라 기본 180° 플립을 끈다),
// rotY 180(방을 yaw 180° 돌려세움). 축·각도 미세조정은 리빌드 없이 ?splatFit/?splatRotX/?splatRotY로 덮어쓴다.
const SPLAT_SRC = "/samples/cap2_sharp.spz";

// 투어가 열릴 때의 초기 시점(방 안쪽 소파 구역). 프리셋 버튼(현관/방중앙/창가)과 별개이며,
// cap2_sharp 배치에서 실측한 카메라 포즈다(라이브 컨트롤에서 getPosition/getTarget으로 캡처).
const SPAWN_VIEW: { position: [number, number, number]; target: [number, number, number] } = {
  position: [-0.304, 1.45, -0.731],
  target: [0.22, 0.477, -2.505]
};

function clamp01to100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

// 월드(splat 배치) 바닥좌표 → 미니맵 정규화(%) 좌표. 실 도면 벽이 있으면 그 bbox(bounds)를
// 기준으로 매핑하고, 없으면 데모의 원점 중심 고정 배치(SPLAT_CLIP_ROOM)로 매핑한다.
function worldToMinimapPercent(x: number, z: number, bounds: PlanBounds | null): { x: number; y: number } {
  if (bounds && bounds.width > 0 && bounds.depth > 0) {
    return {
      x: clamp01to100(((x - bounds.minX) / bounds.width) * 100),
      y: clamp01to100(((z - bounds.minZ) / bounds.depth) * 100)
    };
  }

  return {
    x: clamp01to100(((x + SPLAT_CLIP_ROOM.width / 2) / SPLAT_CLIP_ROOM.width) * 100),
    y: clamp01to100(((z + SPLAT_CLIP_ROOM.depth / 2) / SPLAT_CLIP_ROOM.depth) * 100)
  };
}

export default function TourViewer() {
  const objectUrlRef = useRef<string | null>(null);
  const [src, setSrc] = useState(SPLAT_SRC);
  const [acceptedFileName, setAcceptedFileName] = useState("");
  // 스폰은 프리셋이 아니라 SPAWN_VIEW가 담당 — 시작 시엔 어떤 프리셋도 활성 아님(빈 문자열).
  const [activeId, setActiveId] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingVisible, setIsLoadingVisible] = useState(true);
  const [showHint, setShowHint] = useState(true);
  const [isDropzoneOpen, setIsDropzoneOpen] = useState(false);
  // 이동 입력 방식 분기: coarse pointer(터치)면 화면 조이스틱, fine pointer면 WASD. 마운트 후
  // matchMedia로 판정(SSR 안전 — 초기값 false, effect에서 갱신).
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  // 조이스틱 아날로그 이동 입력. TourCamera가 매 프레임 ref.current를 읽어 WASD와 합산하므로
  // state가 아닌 ref로 들고 리렌더 없이 갱신한다(놓으면 0,0).
  const moveInputRef = useRef<TourMoveInput>({ forward: 0, strafe: 0 });
  const [minimapPosition, setMinimapPosition] = useState<{ x: number; y: number } | null>(null);
  const [showFurniture, setShowFurniture] = useState(true);
  const [isFurnitureCatalogOpen, setIsFurnitureCatalogOpen] = useState(false);
  const [furnitureCatalog, setFurnitureCatalog] = useState<FurnitureCatalogItem[]>(FURNITURE_CATALOG);
  const [furnitureCatalogStatus, setFurnitureCatalogStatus] = useState("가구 카탈로그를 불러오는 중입니다.");
  const [furnitureCategory, setFurnitureCategory] = useState("전체");
  const [furnitureQuery, setFurnitureQuery] = useState("");
  const [furnitureLimit, setFurnitureLimit] = useState(30);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const furnitureCategoryTabsRef = useRef<HTMLDivElement>(null);
  const [furnitureCategoryScroll, setFurnitureCategoryScroll] = useState({ left: 0, max: 0 });
  const [furnitureState, setFurnitureState] = useState<SplatFurnitureState>({
    furnitures: [],
    source: "none"
  });
  const [furnitureDraft, setFurnitureDraft] = useState<TourFurnitureDraft>({
    placed: [],
    pending: null,
    original: null
  });
  // 저장된 정합 결과(SplatAsset.transform). 있으면 SplatScene이 auto-fit 대신 절대 배치를 쓴다.
  const [assetTransform, setAssetTransform] = useState<SplatTransform | null>(null);
  // ?asset= 자산의 상태 안내. PROCESSING/FAILED면 샘플로 조용히 폴백하지 않고 안내 패널을,
  // 조회 자체 실패면 샘플을 유지하되 배너로 알린다. null = 안내 없음(정상 로드).
  const [assetNotice, setAssetNotice] = useState<"processing" | "failed" | "load-error" | null>(null);
  // 도면 벽 대체 렌더 게이트. 씬의 벽 클립 게이트(splat-scene wallReplace: URL splatWalls >
  // 정합 transform 유무)와 같은 규칙이어야 한다 — 어긋나면 "splat만 지워지고 벽은 안 그려지는"
  // 구멍이 생긴다(적대검증 실측). URL 명시가 최우선, 아니면 transform 있을 때만 켠다.
  const [showPlanWalls, setShowPlanWalls] = useState(
    () => typeof window !== "undefined" && resolveWallReplace(window.location.search, false)
  );
  // 실 FloorPlan.walls(localStorage) — 있으면 플레이스홀더 4면 대신 실제 벽 형상을 쓴다.
  // lazy 초기화(localStorage는 동기): 마운트 후 effect로 채우면 SplatScene의 planWallsKey가
  // null→값으로 바뀌며 splat 자산을 통째로 두 번 로드한다(적대검증 실측).
  const [planWallsState] = useState(() =>
    typeof window === "undefined" ? null : loadPlanWallsFromBrowser()
  );
  const planWalls = planWallsState?.walls ?? null;
  const planBounds = useMemo<PlanBounds | null>(
    () => (planWalls && planWalls.length > 0 ? wallsToPlanBounds(planWalls) : null),
    [planWalls]
  );
  const furnitureBounds = useMemo<TourFurnitureBounds>(() => {
    if (planBounds && planBounds.width > 0 && planBounds.depth > 0) {
      return {
        minX: planBounds.minX,
        maxX: planBounds.maxX,
        minZ: planBounds.minZ,
        maxZ: planBounds.maxZ
      };
    }

    return {
      minX: -SPLAT_CLIP_ROOM.width / 2,
      maxX: SPLAT_CLIP_ROOM.width / 2,
      minZ: -SPLAT_CLIP_ROOM.depth / 2,
      maxZ: SPLAT_CLIP_ROOM.depth / 2
    };
  }, [planBounds]);
  const furnitureCategories = useMemo(() => listFurnitureCategoryFilters(furnitureCatalog), [furnitureCatalog]);
  const furnitureCategoryCounts = useMemo(
    () =>
      furnitureCatalog.reduce<Record<string, number>>((counts, item) => {
        const category = furnitureCategoryLabel(item);
        counts[category] = (counts[category] ?? 0) + 1;
        return counts;
      }, {}),
    [furnitureCatalog]
  );
  const filteredFurnitureCatalog = useMemo(
    () => filterTourFurnitureCatalog(furnitureCatalog, furnitureCategory, furnitureQuery),
    [furnitureCatalog, furnitureCategory, furnitureQuery]
  );
  const visibleFurnitureCatalog = useMemo(
    () => filteredFurnitureCatalog.slice(0, furnitureLimit),
    [filteredFurnitureCatalog, furnitureLimit]
  );

  const syncFurnitureCategoryScroll = useCallback(() => {
    const tabList = furnitureCategoryTabsRef.current;
    if (!tabList) return;
    const max = Math.max(0, Math.round(tabList.scrollWidth - tabList.clientWidth));
    const left = Math.max(0, Math.min(max, Math.round(tabList.scrollLeft)));
    setFurnitureCategoryScroll((current) => (current.left === left && current.max === max ? current : { left, max }));
  }, []);

  useEffect(() => {
    if (!isFurnitureCatalogOpen) return;
    const tabList = furnitureCategoryTabsRef.current;
    if (!tabList) return;

    syncFurnitureCategoryScroll();
    const resizeObserver = new ResizeObserver(syncFurnitureCategoryScroll);
    resizeObserver.observe(tabList);
    Array.from(tabList.children).forEach((child) => resizeObserver.observe(child));

    return () => resizeObserver.disconnect();
  }, [furnitureCategories, isFurnitureCatalogOpen, syncFurnitureCategoryScroll]);

  const handleCameraMove = useCallback(
    (position: [number, number, number]) => {
      setMinimapPosition(worldToMinimapPercent(position[0], position[2], planBounds));
    },
    [planBounds]
  );

  // 조이스틱 → 아날로그 이동 ref. null(놓음)이면 정지(0,0). setState가 아니라 ref 갱신이라
  // 매 프레임 리렌더가 없다 — TourCamera의 RAF 루프가 값을 직접 읽는다.
  const handleJoystickChange = useCallback((vector: TourJoystickVector | null) => {
    moveInputRef.current = vector ?? { forward: 0, strafe: 0 };
  }, []);

  function handleFurnitureCategoryScroll() {
    syncFurnitureCategoryScroll();
  }

  function handleFurnitureCategoryScrollInput(event: FormEvent<HTMLInputElement>) {
    const tabList = furnitureCategoryTabsRef.current;
    if (!tabList) return;
    tabList.scrollLeft = Number(event.currentTarget.value);
    syncFurnitureCategoryScroll();
  }

  function moveFurnitureCategoryScroll(direction: -1 | 1) {
    const tabList = furnitureCategoryTabsRef.current;
    if (!tabList) return;
    const max = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
    tabList.scrollLeft = Math.max(0, Math.min(max, tabList.scrollLeft + direction * 180));
    syncFurnitureCategoryScroll();
  }

  function applyLoadedFurniture(state: SplatFurnitureState) {
    setFurnitureState(state);
    setFurnitureDraft({ placed: state.furnitures, pending: null, original: null });
    setSelectedFurnitureId(null);
  }

  function persistFurnitureLayout(furnitures: PlacedFurniture[]) {
    setFurnitureState({ furnitures, source: "listing-tour" });
    try {
      window.localStorage.setItem(LISTING_TOUR_FURNITURE_LATEST_KEY, createTourFurnitureSavePayload(furnitures));
      setFurnitureCatalogStatus("이 브라우저에 가구 배치를 저장했습니다.");
    } catch {
      setFurnitureCatalogStatus("가구 배치는 화면에 반영됐지만 브라우저 저장에 실패했습니다.");
    }
  }

  function handleFurnitureCatalogSelect(item: FurnitureCatalogItem) {
    const restored = cancelTourFurnitureDraft(furnitureDraft);
    const nextDraft = beginTourFurnitureDraft(item, restored.placed);
    setFurnitureDraft(nextDraft);
    setSelectedFurnitureId(null);
    setShowFurniture(true);
    setFurnitureCatalogStatus(`${item.name}을(를) 선택했습니다. 방 바닥을 클릭해 위치를 정하세요.`);
  }

  function handleFurnitureFloorPointerDown(point: { x: number; z: number }) {
    if (!furnitureDraft.pending) return;
    setFurnitureDraft((current) =>
      current.pending
        ? { ...current, pending: clampTourFurniturePoint(current.pending, point, furnitureBounds) }
        : current
    );
  }

  function handleFurniturePointerDown(furniture: PlacedFurniture) {
    if (furnitureDraft.pending) return;
    const nextDraft = reopenTourFurnitureDraft(furnitureDraft, furniture.id);
    setFurnitureDraft(nextDraft);
    setSelectedFurnitureId(furniture.id);
    setShowFurniture(true);
    setFurnitureCatalogStatus(`${furniture.name}을(를) 선택했습니다. 바닥을 클릭해 옮기거나 아래에서 확정하세요.`);
  }

  function handleFurnitureDraftConfirm() {
    const nextDraft = confirmTourFurnitureDraft(furnitureDraft);
    setFurnitureDraft(nextDraft);
    setSelectedFurnitureId(null);
    persistFurnitureLayout(nextDraft.placed);
  }

  function handleFurnitureDraftCancel() {
    const nextDraft = cancelTourFurnitureDraft(furnitureDraft);
    setFurnitureDraft(nextDraft);
    setSelectedFurnitureId(null);
    setFurnitureCatalogStatus("가구 배치를 취소했습니다.");
  }

  function handleFurnitureDraftRotate(direction: -1 | 1) {
    setFurnitureDraft((current) => rotateTourFurnitureDraft(current, direction));
  }

  function handleFurnitureDraftDelete() {
    const nextDraft = deleteTourFurnitureDraft(furnitureDraft);
    setFurnitureDraft(nextDraft);
    setSelectedFurnitureId(null);
    persistFurnitureLayout(nextDraft.placed);
  }

  function closeFurnitureCatalog() {
    setFurnitureDraft((current) => cancelTourFurnitureDraft(current));
    setSelectedFurnitureId(null);
    setIsFurnitureCatalogOpen(false);
  }

  useEffect(() => {
    let active = true;

    void loadGlbDatasetCatalog()
      .then((items) => {
        if (!active || items.length === 0) return;
        setFurnitureCatalog(items);
        setFurnitureCatalogStatus(`${items.length}개 가구를 불러왔습니다.`);
      })
      .catch(() => {
        if (!active) return;
        setFurnitureCatalogStatus("기본 가구 카탈로그를 표시합니다.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setFurnitureLimit(30);
  }, [furnitureCategory, furnitureQuery]);

  // 터치/coarse pointer 감지(마운트 후). 하이브리드 기기 대응으로 maxTouchPoints도 함께 본다.
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(query.matches || navigator.maxTouchPoints > 0);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const initialCamera: [number, number, number] = SPAWN_VIEW.position;

  const handleAcceptSplat = useCallback((url: string, fileName: string) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    objectUrlRef.current = url;
    setSrc(url);
    setAcceptedFileName(fileName);
    setIsLoaded(false);
    setIsLoadingVisible(true);
    setShowHint(true);
    // 정합값은 asset의 파일에 대한 배치라, 다른 파일을 드롭하면 무의미 — 해제한다.
    setAssetTransform(null);
    setShowPlanWalls(resolveWallReplace(window.location.search, false));
  }, []);

  // ?asset=<id> — 저장된 SplatAsset(fileUrl+정합 transform)을 불러 투어를 연다.
  // "정합 저장 → 투어 링크 공유"의 뷰어 쪽 진입로. 실패 시 기본 샘플로 폴백.
  useEffect(() => {
    const assetId = new URLSearchParams(window.location.search).get("asset");
    if (!assetId) return;

    let cancelled = false;
    getSplatAsset(assetId)
      .then((asset) => {
        if (cancelled) return;
        // PROCESSING: 아직 spz가 없다(fileUrl 빈 문자열). 예전엔 여기서 샘플로 조용히 폴백됐지만,
        // 그 은폐를 걷어내고 "제작 중" 안내를 전면에 띄운다.
        if (asset.status === "PROCESSING") {
          setAssetNotice("processing");
          console.info("[splat-tour] asset " + JSON.stringify({ id: asset.id, status: asset.status }));
          return;
        }
        // FAILED: 재업로드 유도. 구체 사유(jobError)는 화면에 노출하지 않고 콘솔에만 남긴다.
        if (asset.status === "FAILED") {
          setAssetNotice("failed");
          console.warn(
            "[splat-tour] asset FAILED",
            JSON.stringify({ id: asset.id, jobError: (asset as { jobError?: string | null }).jobError ?? null })
          );
          return;
        }
        setAssetNotice(null);
        if (asset.fileUrl) {
          setSrc(resolveAssetFileUrl(asset.fileUrl));
          setIsLoaded(false);
          setIsLoadingVisible(true);
        }
        const transform = asset.status === "REGISTERED" ? asset.transform : null;
        setAssetTransform(transform);
        // 벽 패널도 기본 OFF(2026-07-07 결정, splat-scene의 클립 기본값과 일치) — ?splatWalls=1로 옵트인.
        setShowPlanWalls(resolveWallReplace(window.location.search, false));
        // 서버 동봉 가구를 우선순위대로 재해석한다. REGISTERED+유효 furnitures면 서버가 이기고,
        // 아니면 마운트 때 채운 로컬/데모가 유지된다. ?furniture=0은 resolveViewerFurniture가 존중.
        const furniture = loadViewerFurnitureFromBrowser(asset);
        applyLoadedFurniture(furniture);
        console.info(
          "[splat-tour] asset " +
            JSON.stringify({
              id: asset.id,
              status: asset.status,
              hasTransform: asset.transform !== null,
              fileUrl: asset.fileUrl,
              furnitureSource: furniture.source,
              furnitureCount: furniture.furnitures.length
            })
        );
      })
      .catch((error) => {
        if (cancelled) return;
        // 조회 자체 실패 — 샘플 폴백은 유지하되 배너로 사용자에게 알린다.
        setAssetNotice("load-error");
        console.warn("[splat-tour] asset load failed — 기본 샘플로 폴백", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const loadingTimer = window.setTimeout(() => setIsLoadingVisible(false), 420);
    const hintTimer = window.setTimeout(() => setShowHint(false), 4200);

    return () => {
      window.clearTimeout(loadingTimer);
      window.clearTimeout(hintTimer);
    };
  }, [isLoaded]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // 마운트 즉시 로컬/데모/off로 채운다. ?asset= 서버 가구는 자산 조회 후 아래 effect가 덮어쓴다.
    const state = loadViewerFurnitureFromBrowser(null);
    applyLoadedFurniture(state);
    console.info("[splat-tour] furniture " + JSON.stringify({ source: state.source, count: state.furnitures.length }));
  }, []);

  useEffect(() => {
    console.info(
      "[splat-tour] plan-walls " +
        JSON.stringify({
          source: planWallsState?.source ?? "none",
          count: planWalls?.length ?? 0,
          bounds: planBounds
        })
    );
  }, [planWallsState, planWalls, planBounds]);

  return (
    <div className="tour-viewer-shell">
      <style>
        {`
          .tour-viewer-shell {
            position: relative;
            width: 100%;
            height: calc(100dvh - 96px);
            min-height: 480px;
            overflow: hidden;
            border-radius: 12px;
            background: var(--canvas);
          }

          .tour-loading-overlay {
            position: absolute;
            z-index: 4;
            inset: 0;
            display: grid;
            place-items: center;
            background: color-mix(in srgb, var(--canvas) 94%, transparent);
            color: var(--muted);
            opacity: 1;
            pointer-events: auto;
            transition: opacity 420ms ease;
          }

          .tour-loading-overlay.is-loaded {
            opacity: 0;
            pointer-events: none;
          }

          .tour-loading-panel {
            display: grid;
            justify-items: center;
            gap: 12px;
            padding: 18px 22px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            box-shadow: var(--shadow);
            backdrop-filter: blur(12px);
          }

          .tour-loading-spinner {
            width: 28px;
            height: 28px;
            border: 3px solid var(--blue-soft);
            border-top-color: var(--blue);
            border-radius: 999px;
            animation: tour-spin 860ms linear infinite;
          }

          .tour-loading-panel p {
            margin: 0;
            color: var(--ink);
            font-size: 14px;
            font-weight: 800;
          }

          .tour-asset-notice {
            z-index: 6;
          }

          .tour-asset-refresh {
            min-height: 38px;
            padding: 9px 18px;
            border: 1px solid var(--blue);
            border-radius: 999px;
            background: var(--blue);
            color: var(--paper);
            cursor: pointer;
            font-size: 14px;
            font-weight: 800;
            line-height: 1;
            transition: background 160ms ease;
          }

          .tour-asset-refresh:hover {
            background: var(--blue-dark);
          }

          .tour-asset-refresh:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
          }

          .tour-asset-banner {
            position: absolute;
            z-index: 6;
            top: 16px;
            left: 50%;
            max-width: calc(100% - 32px);
            transform: translateX(-50%);
            overflow: hidden;
            border: 1px solid var(--line);
            border-radius: 999px;
            padding: 8px 16px;
            background: color-mix(in srgb, var(--paper) 92%, transparent);
            box-shadow: var(--shadow);
            color: var(--ink);
            font-size: 13px;
            font-weight: 800;
            line-height: 1.2;
            text-overflow: ellipsis;
            white-space: nowrap;
            backdrop-filter: blur(12px);
          }

          .tour-minimap-dock {
            position: absolute;
            z-index: 2;
            top: 16px;
            right: 16px;
          }

          .tour-hint {
            position: absolute;
            z-index: 2;
            top: 18px;
            left: 18px;
            max-width: min(420px, calc(100% - 184px));
            overflow: hidden;
            margin: 0;
            border: 1px solid var(--line);
            border-radius: 999px;
            padding: 8px 12px;
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            box-shadow: var(--shadow);
            color: var(--ink);
            font-size: 13px;
            font-weight: 800;
            line-height: 1.2;
            text-overflow: ellipsis;
            white-space: nowrap;
            backdrop-filter: blur(12px);
            opacity: 1;
            transform: translateY(0);
            transition:
              opacity 240ms ease,
              transform 240ms ease;
          }

          .tour-hint.is-hidden {
            opacity: 0;
            pointer-events: none;
            transform: translateY(-6px);
          }

          .tour-preset-bar {
            position: absolute;
            z-index: 3;
            bottom: 16px;
            left: 50%;
            display: flex;
            max-width: calc(100% - 32px);
            transform: translateX(-50%);
            gap: 8px;
            overflow-x: auto;
            padding: 8px;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            box-shadow: var(--shadow);
            backdrop-filter: blur(12px);
            scrollbar-width: none;
          }

          .tour-preset-bar::-webkit-scrollbar {
            display: none;
          }

          .tour-preset-button {
            flex: 0 0 auto;
            min-height: 38px;
            padding: 9px 16px;
            border: 1px solid transparent;
            border-radius: 999px;
            background: transparent;
            color: var(--ink);
            cursor: pointer;
            font-size: 14px;
            font-weight: 800;
            line-height: 1;
            white-space: nowrap;
            transition:
              background 160ms ease,
              border-color 160ms ease,
              color 160ms ease,
              transform 160ms ease;
          }

          .tour-preset-button:hover {
            background: var(--blue-soft);
            color: var(--blue);
          }

          .tour-preset-button:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
          }

          .tour-preset-button.is-active {
            border-color: var(--blue);
            background: var(--blue);
            color: var(--paper);
            transform: translateY(-1px);
          }

          .tour-preset-button.is-active:hover {
            background: var(--blue);
            color: var(--paper);
          }

          .tour-preset-divider {
            flex: 0 0 auto;
            width: 1px;
            min-height: 24px;
            margin: 7px 2px;
            background: var(--line);
          }

          .tour-walk-toggle {
            display: inline-flex;
            flex: 0 0 auto;
            align-items: center;
            justify-content: center;
            gap: 7px;
            min-height: 38px;
            padding: 9px 15px;
            border: 1px solid transparent;
            border-radius: 999px;
            background: transparent;
            color: var(--ink);
            cursor: pointer;
            font-size: 14px;
            font-weight: 800;
            line-height: 1;
            white-space: nowrap;
            transition:
              background 160ms ease,
              border-color 160ms ease,
              color 160ms ease,
              transform 160ms ease;
          }

          .tour-walk-toggle:hover {
            background: var(--blue-soft);
            color: var(--blue);
          }

          .tour-walk-toggle:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
          }

          .tour-walk-toggle.is-active {
            border-color: var(--blue);
            background: var(--blue-soft);
            color: var(--blue);
            transform: translateY(-1px);
          }

          .tour-furniture-drawer {
            --tour-scrollbar-track: #d8d8d8;
            --tour-scrollbar-thumb: #8a8a8a;
            position: absolute;
            z-index: 6;
            bottom: 78px;
            left: 16px;
            display: grid;
            width: min(390px, calc(100% - 32px));
            height: min(620px, calc(100% - 110px));
            grid-template-rows: auto auto auto auto minmax(0, 1fr) auto minmax(0, auto) auto auto;
            gap: 12px;
            overflow: hidden;
            padding: 16px;
            border: 1px solid var(--line);
            border-radius: 16px;
            background: color-mix(in srgb, var(--paper) 94%, transparent);
            box-shadow: var(--shadow);
            backdrop-filter: blur(16px);
          }

          .tour-furniture-drawer-head,
          .tour-furniture-drawer-actions,
          .tour-furniture-placed-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }

          .tour-furniture-drawer h2,
          .tour-furniture-drawer p {
            margin: 0;
          }

          .tour-furniture-drawer h2 {
            color: var(--ink);
            font-size: 17px;
          }

          .tour-furniture-status,
          .tour-furniture-help {
            color: var(--muted);
            font-size: 12px;
            font-weight: 700;
            line-height: 1.45;
          }

          .tour-furniture-close,
          .tour-furniture-action,
          .tour-furniture-category,
          .tour-furniture-more,
          .tour-furniture-item {
            border: 1px solid var(--line);
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            color: var(--ink);
            cursor: pointer;
            font: inherit;
          }

          .tour-furniture-close,
          .tour-furniture-action,
          .tour-furniture-more {
            border-radius: 999px;
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 800;
          }

          .tour-furniture-action.primary {
            border-color: var(--blue);
            background: var(--blue);
            color: var(--paper);
          }

          .tour-furniture-search {
            width: 100%;
            min-height: 40px;
            box-sizing: border-box;
            border: 1px solid var(--line);
            border-radius: 10px;
            padding: 9px 11px;
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            color: var(--ink);
            font: inherit;
          }

          .tour-furniture-category-scroll-area {
            display: grid;
            gap: 4px;
            min-width: 0;
          }

          .tour-furniture-categories {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            min-width: 0;
            padding-bottom: 0;
            scrollbar-width: none;
          }

          .tour-furniture-categories::-webkit-scrollbar {
            display: none;
          }

          .tour-furniture-category-scrollbar {
            display: grid;
            grid-template-columns: 28px minmax(0, 1fr) 28px;
            align-items: center;
            gap: 6px;
            min-height: 30px;
            padding: 3px 0;
            border-top: 1px solid var(--tour-scrollbar-track);
          }

          .tour-furniture-category-scroll-button {
            display: grid;
            width: 28px;
            height: 24px;
            place-items: center;
            border: 1px solid var(--tour-scrollbar-track);
            border-radius: 7px;
            background: var(--paper);
            color: var(--tour-scrollbar-thumb);
            cursor: pointer;
          }

          .tour-furniture-category-scroll-button:hover {
            border-color: var(--tour-scrollbar-thumb);
            background: #f1f1f1;
          }

          .tour-furniture-category-scroll-range {
            width: 100%;
            height: 14px;
            margin: 0;
            appearance: none;
            background: transparent;
            cursor: pointer;
          }

          .tour-furniture-category-scroll-range::-webkit-slider-runnable-track {
            height: 8px;
            border-radius: 999px;
            background: var(--tour-scrollbar-track);
            box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
          }

          .tour-furniture-category-scroll-range::-webkit-slider-thumb {
            width: 44px;
            height: 14px;
            margin-top: -3px;
            border: 0;
            border-radius: 999px;
            appearance: none;
            background: var(--tour-scrollbar-thumb);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
          }

          .tour-furniture-category-scroll-range::-moz-range-track {
            height: 8px;
            border-radius: 999px;
            background: var(--tour-scrollbar-track);
            box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
          }

          .tour-furniture-category-scroll-range::-moz-range-thumb {
            width: 44px;
            height: 14px;
            border: 0;
            border-radius: 999px;
            background: var(--tour-scrollbar-thumb);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
          }

          .tour-furniture-category {
            flex: 0 0 auto;
            border-radius: 999px;
            padding: 7px 10px;
            font-size: 12px;
            font-weight: 800;
          }

          .tour-furniture-category.is-active {
            border-color: var(--blue);
            background: var(--blue-soft);
            color: var(--blue);
          }

          .tour-furniture-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-auto-rows: 58px;
            gap: 8px;
            min-height: 0;
            overflow: auto;
            padding-right: 2px;
          }

          .tour-furniture-grid,
          .tour-furniture-placed {
            scrollbar-color: var(--tour-scrollbar-thumb) var(--tour-scrollbar-track);
            scrollbar-width: thin;
          }

          .tour-furniture-grid::-webkit-scrollbar,
          .tour-furniture-placed::-webkit-scrollbar {
            width: 10px;
          }

          .tour-furniture-grid::-webkit-scrollbar-track,
          .tour-furniture-placed::-webkit-scrollbar-track {
            background: var(--tour-scrollbar-track);
          }

          .tour-furniture-grid::-webkit-scrollbar-thumb,
          .tour-furniture-placed::-webkit-scrollbar-thumb {
            border: 2px solid var(--tour-scrollbar-track);
            border-radius: 999px;
            background: var(--tour-scrollbar-thumb);
          }

          .tour-furniture-item {
            display: grid;
            grid-template-columns: 42px minmax(0, 1fr);
            align-items: center;
            gap: 8px;
            min-width: 0;
            overflow: hidden;
            border-radius: 10px;
            padding: 7px;
            text-align: left;
          }

          .tour-furniture-item:hover,
          .tour-furniture-more:hover,
          .tour-furniture-close:hover,
          .tour-furniture-action:hover {
            border-color: var(--blue);
            color: var(--blue);
          }

          .tour-furniture-thumb {
            display: grid;
            width: 42px;
            height: 42px;
            overflow: hidden;
            border-radius: 8px;
            place-items: center;
          }

          .tour-furniture-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .tour-furniture-copy {
            min-width: 0;
            overflow: hidden;
          }

          .tour-furniture-item strong,
          .tour-furniture-item small {
            display: block;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .tour-furniture-item strong {
            font-size: 12px;
          }

          .tour-furniture-item small {
            margin-top: 3px;
            color: var(--muted);
            font-size: 10px;
          }

          .tour-furniture-placement-actions {
            justify-self: center;
            margin-top: 2px;
          }

          .tour-furniture-placed {
            display: grid;
            max-height: 96px;
            gap: 6px;
            overflow-y: auto;
          }

          .tour-furniture-placed h3 {
            margin: 0;
            color: var(--ink);
            font-size: 13px;
          }

          .tour-furniture-placed-row {
            border-radius: 8px;
            padding: 6px 8px;
            background: color-mix(in srgb, var(--canvas) 62%, transparent);
          }

          .tour-furniture-placed-row button {
            overflow: hidden;
            border: 0;
            padding: 0;
            background: transparent;
            color: var(--ink);
            cursor: pointer;
            font: inherit;
            font-size: 12px;
            font-weight: 800;
            text-align: left;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .tour-furniture-placed-row button.is-selected {
            color: var(--blue);
          }

          .tour-dropzone-dock {
            position: absolute;
            z-index: 5;
            right: 16px;
            bottom: 76px;
            display: grid;
            justify-items: end;
            gap: 8px;
            max-width: calc(100% - 32px);
          }

          .tour-dropzone-toggle {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 38px;
            max-width: min(280px, calc(100vw - 32px));
            padding: 9px 12px;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: color-mix(in srgb, var(--paper) 90%, transparent);
            box-shadow: var(--shadow);
            color: var(--ink);
            cursor: pointer;
            font-size: 13px;
            font-weight: 800;
            line-height: 1;
            backdrop-filter: blur(12px);
            transition:
              background 160ms ease,
              border-color 160ms ease,
              color 160ms ease,
              transform 160ms ease;
          }

          .tour-dropzone-toggle:hover {
            border-color: var(--blue);
            background: var(--blue-soft);
            color: var(--blue);
          }

          .tour-dropzone-toggle:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
          }

          .tour-dropzone-toggle span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .tour-dropzone-toggle svg:last-child {
            transition: transform 160ms ease;
          }

          .tour-dropzone-toggle.is-open svg:last-child {
            transform: rotate(180deg);
          }

          .tour-dropzone-panel {
            padding: 10px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            box-shadow: var(--shadow);
            backdrop-filter: blur(12px);
          }

          @keyframes tour-spin {
            to {
              transform: rotate(360deg);
            }
          }

          @media (max-width: 560px) and (orientation: portrait) {
            .tour-viewer-shell {
              height: calc(100dvh - 96px);
              min-height: 480px;
              border-radius: 8px;
            }

            .tour-minimap-dock {
              top: 10px;
              right: 10px;
            }

            .tour-hint {
              top: 12px;
              left: 10px;
              max-width: calc(100% - 148px);
              padding: 7px 10px;
              font-size: 12px;
            }

            .tour-preset-bar {
              bottom: max(12px, env(safe-area-inset-bottom));
              max-width: calc(100% - 20px);
              gap: 6px;
              padding: 7px;
            }

            .tour-preset-button {
              min-height: 36px;
              padding: 8px 12px;
              font-size: 13px;
            }

            .tour-preset-divider {
              min-height: 22px;
              margin: 7px 0;
            }

            .tour-walk-toggle {
              min-height: 36px;
              padding: 8px 11px;
              font-size: 13px;
            }

            .tour-furniture-drawer {
              bottom: 68px;
              left: 10px;
              width: calc(100% - 20px);
              max-height: min(560px, calc(100% - 86px));
              padding: 13px;
            }

            .tour-dropzone-dock {
              right: 10px;
              bottom: 66px;
              max-width: calc(100% - 20px);
            }

            .tour-dropzone-toggle {
              max-width: min(260px, calc(100vw - 20px));
              font-size: 12px;
            }
          }
        `}
      </style>
      <Canvas camera={{ fov: 60, position: initialCamera }} shadows>
        <ambientLight intensity={0.85} />
        <directionalLight castShadow intensity={1.1} position={[3, 6, 4]} />
        <SplatScene
          key={src}
          onLoaded={() => setIsLoaded(true)}
          planWalls={planWalls}
          src={src}
          transform={assetTransform}
        />
        {showPlanWalls ? <SplatPlanWalls walls={planWalls ?? undefined} /> : null}
        {/* 가구 레이어는 도면 좌표 그대로 월드에 놓인다(월드=도면 프레임). */}
        {showFurniture && (furnitureDraft.placed.length > 0 || furnitureDraft.pending) ? (
          <SplatFurnitureLayer
            bounds={furnitureBounds}
            furnitures={furnitureDraft.placed}
            onFloorPointerDown={handleFurnitureFloorPointerDown}
            onFurniturePointerDown={handleFurniturePointerDown}
            pendingFurniture={furnitureDraft.pending}
          />
        ) : null}
        <TourCamera
          activeId={activeId}
          moveInputRef={moveInputRef}
          onArrive={setActiveId}
          onCameraMove={handleCameraMove}
          presets={[]}
          spawnView={SPAWN_VIEW}
          walkBounds={planBounds}
        />
      </Canvas>

      {isLoadingVisible ? (
        <div
          aria-live="polite"
          className={`tour-loading-overlay${isLoaded ? " is-loaded" : ""}`}
        >
          <div className="tour-loading-panel">
            <span aria-hidden className="tour-loading-spinner" />
            <p>3D 공간 불러오는 중…</p>
          </div>
        </div>
      ) : null}

      {assetNotice === "load-error" ? (
        <div className="tour-asset-banner" role="status">
          자산을 불러오지 못해 샘플을 표시 중입니다
        </div>
      ) : null}

      {assetNotice === "processing" || assetNotice === "failed" ? (
        <div aria-live="polite" className="tour-loading-overlay tour-asset-notice">
          <div className="tour-loading-panel">
            {assetNotice === "processing" ? (
              <>
                <p>3D 투어 제작 중 — 수 시간 걸릴 수 있어요</p>
                <button type="button" className="tour-asset-refresh" onClick={() => window.location.reload()}>
                  새로고침
                </button>
              </>
            ) : (
              <p>3D 제작에 실패했어요 — 파일을 다시 업로드해 주세요</p>
            )}
          </div>
        </div>
      ) : null}

      <p className={`tour-hint${isLoaded && showHint ? "" : " is-hidden"}`}>
        {isCoarsePointer ? "조이스틱으로 이동 · 드래그로 둘러보기" : "WASD로 이동 · 드래그로 둘러보기"}
      </p>

      {isCoarsePointer ? <TourJoystick onChange={handleJoystickChange} /> : null}

      <div className="tour-minimap-dock">
        <TourMinimap
          activeId={activeId}
          livePosition={minimapPosition}
          onSelect={setActiveId}
          presets={[]}
        />
      </div>

      {isFurnitureCatalogOpen ? (
        <aside aria-label="가구 카탈로그" className="tour-furniture-drawer">
          <div className="tour-furniture-drawer-head">
            <h2>가구 카탈로그</h2>
            <button className="tour-furniture-close" onClick={closeFurnitureCatalog} type="button">
              닫기
            </button>
          </div>
          <p className="tour-furniture-status" role="status">{furnitureCatalogStatus}</p>
          <input
            aria-label="가구 검색"
            className="tour-furniture-search"
            onChange={(event) => setFurnitureQuery(event.target.value)}
            placeholder="침대, 책상, 의자 검색"
            type="search"
            value={furnitureQuery}
          />
          <div className="tour-furniture-category-scroll-area">
            <div
              aria-label="가구 카테고리"
              className="tour-furniture-categories"
              onScroll={handleFurnitureCategoryScroll}
              ref={furnitureCategoryTabsRef}
              role="tablist"
            >
              {furnitureCategories.map((category) => (
                <button
                  aria-selected={furnitureCategory === category}
                  className={`tour-furniture-category${furnitureCategory === category ? " is-active" : ""}`}
                  key={category}
                  onClick={() => setFurnitureCategory(category)}
                  role="tab"
                  type="button"
                >
                  {category} {category === "전체" ? furnitureCatalog.length : furnitureCategoryCounts[category] ?? 0}
                </button>
              ))}
            </div>
            {furnitureCategoryScroll.max > 0 ? (
              <div className="tour-furniture-category-scrollbar">
                <button
                  aria-label="카테고리 왼쪽으로 이동"
                  className="tour-furniture-category-scroll-button"
                  onClick={() => moveFurnitureCategoryScroll(-1)}
                  type="button"
                >
                  <ChevronLeft aria-hidden size={15} strokeWidth={2.5} />
                </button>
                <input
                  aria-label="가구 카테고리 가로 스크롤"
                  className="tour-furniture-category-scroll-range"
                  max={furnitureCategoryScroll.max}
                  min={0}
                  onInput={handleFurnitureCategoryScrollInput}
                  step={1}
                  type="range"
                  value={furnitureCategoryScroll.left}
                />
                <button
                  aria-label="카테고리 오른쪽으로 이동"
                  className="tour-furniture-category-scroll-button"
                  onClick={() => moveFurnitureCategoryScroll(1)}
                  type="button"
                >
                  <ChevronRight aria-hidden size={15} strokeWidth={2.5} />
                </button>
              </div>
            ) : null}
          </div>
          <div className="tour-furniture-grid">
            {visibleFurnitureCatalog.map((item) => {
              const imageUrl = furnitureImageUrl(item);
              return (
                <button className="tour-furniture-item" key={item.furniture_id} onClick={() => handleFurnitureCatalogSelect(item)} type="button">
                  <span className="tour-furniture-thumb" style={{ backgroundColor: item.color }}>
                    {imageUrl ? (
                      <img
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                        src={imageUrl}
                      />
                    ) : null}
                  </span>
                  <span className="tour-furniture-copy">
                    <strong>{item.name}</strong>
                    <small>{item.brand}</small>
                  </span>
                </button>
              );
            })}
            {visibleFurnitureCatalog.length === 0 ? <p className="tour-furniture-help">검색 결과가 없습니다.</p> : null}
          </div>
          {visibleFurnitureCatalog.length < filteredFurnitureCatalog.length ? (
            <button className="tour-furniture-more" onClick={() => setFurnitureLimit((limit) => limit + 30)} type="button">
              가구 더 보기 ({visibleFurnitureCatalog.length}/{filteredFurnitureCatalog.length})
            </button>
          ) : null}
          <div className="tour-furniture-placed">
            <h3>배치된 가구 {furnitureDraft.placed.length}</h3>
            {furnitureDraft.placed.map((furniture) => (
              <div className="tour-furniture-placed-row" key={furniture.id}>
                <button
                  className={selectedFurnitureId === furniture.id ? "is-selected" : ""}
                  onClick={() => handleFurniturePointerDown(furniture)}
                  type="button"
                >
                  {furniture.name}
                </button>
              </div>
            ))}
            {furnitureDraft.placed.length === 0 ? <p className="tour-furniture-help">아직 배치된 가구가 없습니다.</p> : null}
          </div>
          {furnitureDraft.pending ? (
            <>
              <p className="tour-furniture-help">{furnitureDraft.pending.name}을(를) 바닥 클릭으로 옮긴 뒤 확정하세요.</p>
              <div className="floor-plan-pending-actions tour-furniture-placement-actions">
                <button aria-label="배치 취소" className="is-cancel" onClick={handleFurnitureDraftCancel} title="배치 취소" type="button">
                  <X aria-hidden="true" />
                </button>
                <button aria-label="왼쪽으로 90도 회전" onClick={() => handleFurnitureDraftRotate(-1)} title="왼쪽으로 90도 회전" type="button">
                  <RotateCcw aria-hidden="true" />
                </button>
                <button aria-label="오른쪽으로 90도 회전" onClick={() => handleFurnitureDraftRotate(1)} title="오른쪽으로 90도 회전" type="button">
                  <RotateCw aria-hidden="true" />
                </button>
                {furnitureDraft.original ? (
                  <button aria-label="가구 삭제" className="is-delete" onClick={handleFurnitureDraftDelete} title="가구 삭제" type="button">
                    <Trash2 aria-hidden="true" />
                  </button>
                ) : null}
                <button aria-label="배치완료" className="is-confirm" onClick={handleFurnitureDraftConfirm} title="배치완료" type="button">
                  <Check aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            <p className="tour-furniture-help">가구를 선택한 뒤 방 바닥을 클릭해 배치하세요. 배치된 가구를 누르면 다시 편집할 수 있습니다.</p>
          )}
        </aside>
      ) : null}

      <div className="tour-dropzone-dock">
        <button
          aria-expanded={isDropzoneOpen}
          className={`tour-dropzone-toggle${isDropzoneOpen ? " is-open" : ""}`}
          onClick={() => setIsDropzoneOpen((current) => !current)}
          type="button"
        >
          <UploadCloud aria-hidden size={16} strokeWidth={2.4} />
          <span>{acceptedFileName || "내 스캔 검사·미리보기"}</span>
          <ChevronDown aria-hidden size={15} strokeWidth={2.6} />
        </button>
        {isDropzoneOpen ? (
          <div className="tour-dropzone-panel">
            <SplatDropzone onAccept={handleAcceptSplat} />
          </div>
        ) : null}
      </div>

      <div role="group" aria-label="3D 투어 옵션" className="tour-preset-bar">
        <button
          aria-expanded={isFurnitureCatalogOpen}
          aria-pressed={showFurniture}
          className={`tour-walk-toggle${showFurniture ? " is-active" : ""}`}
          onClick={() => setIsFurnitureCatalogOpen(true)}
          type="button"
        >
          <Armchair aria-hidden size={16} strokeWidth={2.4} />
          <span>가구</span>
        </button>
      </div>
    </div>
  );
}
