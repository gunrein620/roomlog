"use client";

// 조립 셸 — Canvas 안에 SplatScene+TourCamera, 밖에 프리셋 버튼 바를 둔다.
// 각 조각(SplatScene/TourCamera)은 병렬 에이전트가 채워넣는다.

import { Canvas } from "@react-three/fiber";
import { Armchair, Camera, Check, ChevronDown, RotateCcw, RotateCw, Trash2, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SplatScene } from "./splat-scene";
import { TourJoystick, type TourJoystickVector } from "./tour-joystick";
import type { TourCameraPose, TourMoveInput } from "./tour-camera";
import { SplatDropzone } from "./splat-dropzone";
import { listingTourFurnitureStorageKey, loadViewerFurnitureFromBrowser, type SplatFurnitureState } from "./splat-furniture";
import { SplatFurnitureLayer } from "./splat-furniture-layer";
import {
  beginTourFurnitureDraft,
  cancelTourFurnitureDraft,
  clampTourFurniturePoint,
  confirmTourFurnitureDraft,
  createTourFurnitureSavePayload,
  deleteTourFurnitureDraft,
  reopenTourFurnitureDraft,
  rotateTourFurnitureDraft,
  type TourFurnitureBounds,
  type TourFurnitureDraft
} from "./splat-furniture-editor";
import { SplatPlanWalls } from "./splat-plan-walls";
import {
  loadPlanWallsFromBrowser,
  resolveViewerPlanWalls,
  wallsToPlanBounds,
  type PlanBounds
} from "./splat-plan-shape";
import { resolveWallReplace } from "./splat-walls";
import { TourCamera } from "./tour-camera";
import { SPLAT_CLIP_ROOM } from "./splat-clip";
import { getSplatAsset, resolveAssetFileUrl, updateSplatAssetSpawnView } from "@/lib/splat-asset-api";
import { resolveTourSpawnView } from "./tour-spawn-view";
import { FURNITURE_CATALOG, loadGlbDatasetCatalog } from "../floor-plan-3d/furniture-placement";
import type { FurnitureCatalogItem, PlacedFurniture } from "../floor-plan-3d/room-model/types";
import type { SpawnView, SplatTransform } from "./tour-types";
import type { TenantFurniture } from "@roomlog/types/tenant-furniture";
import FurnitureCatalogPanel, {
  tenantFurnitureCatalogItem,
  useTenantFurnitureCatalog,
  type FurnitureSourceTab
} from "../_components/FurnitureCatalogPanel";

// cap2_sharp.spz: 자체 캡처앱(capture-ios) 촬영본의 샤픈 산출 SPZ(756K 가우시안). 배치는 같은
// basename의 cap2_sharp.tuning.json이 담당한다 — auto fit(폰 캡처는 미터 스케일 미보정이라 native
// 원점을 못 믿어 bbox 자동 센터링·스케일), rotX 0(이 캡처는 이미 Y-up이라 기본 180° 플립을 끈다),
// rotY 180(방을 yaw 180° 돌려세움). 축·각도 미세조정은 리빌드 없이 ?splatFit/?splatRotX/?splatRotY로 덮어쓴다.
const SPLAT_SRC = "/samples/cap2_sharp.spz";

// 투어가 열릴 때의 초기 시점(방 안쪽 소파 구역). 프리셋 버튼(현관/방중앙/창가)과 별개이며,
// cap2_sharp 배치에서 실측한 카메라 포즈다(라이브 컨트롤에서 getPosition/getTarget으로 캡처).
// 자산별 spawnView(SplatAsset.spawnView)가 없을 때의 폴백 — 샘플 splat(자산 없이 여는 경우)은
// 항상 이 값을 쓴다. 소유자가 저장한 값이 있으면 그게 이 상수를 대신한다(resolveTourSpawnView).
const SPAWN_VIEW: SpawnView = {
  position: [-0.304, 1.45, -0.731],
  target: [0.22, 0.477, -2.505]
};

export default function TourViewer({ isOwner = false }: { isOwner?: boolean } = {}) {
  const objectUrlRef = useRef<string | null>(null);
  const [src, setSrc] = useState(SPLAT_SRC);
  const [acceptedFileName, setAcceptedFileName] = useState("");
  // 스폰은 프리셋이 아니라 SPAWN_VIEW가 담당 — 시작 시엔 어떤 프리셋도 활성 아님(빈 문자열).
  const [activeId, setActiveId] = useState("");
  // ?asset= 자산 id — 로드 후 "현재 시점을 기본으로 저장" 호출 대상. 자산 없이 연 샘플 투어면 null.
  const [assetId, setAssetId] = useState<string | null>(null);
  // 투어 진입 스폰 시점. null이면 아직 결정 전(자산 조회 대기) — TourCamera는 null을 스냅 보류로
  // 해석한다(spawnAppliedRef가 평생 1회만 적용하므로, 결정 전에 폴백을 먼저 넣으면 나중에 온
  // 실제 값으로 덮어쓰지 못한다). 자산이 없으면 즉시 SPAWN_VIEW로, 있으면 응답을 기다린다.
  const [spawnView, setSpawnView] = useState<SpawnView | null>(null);
  const [spawnSaveStatus, setSpawnSaveStatus] = useState<string | null>(null);
  // 버튼 클릭 시점에 읽을 최신 카메라 pose. TourCamera가 매 프레임 갱신하지만 ref라 리렌더는 없다.
  const currentPoseRef = useRef<TourCameraPose | null>(null);
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
  const [showFurniture, setShowFurniture] = useState(true);
  const [isFurnitureCatalogOpen, setIsFurnitureCatalogOpen] = useState(false);
  const [furnitureCatalog, setFurnitureCatalog] = useState<FurnitureCatalogItem[]>(FURNITURE_CATALOG);
  const [furnitureCatalogStatus, setFurnitureCatalogStatus] = useState("가구 카탈로그를 불러오는 중입니다.");
  const [furnitureCategory, setFurnitureCategory] = useState("전체");
  const [furnitureQuery, setFurnitureQuery] = useState("");
  // ListingTourRoom3D와 통일한 가구 패널(FurnitureCatalogPanel)의 소스 탭 — 투어는 항상 "등록
  // 가구" 탭으로 시작한다(owner 전용 흐름이 아니라 방문자 뷰가 기본이라).
  const [furnitureSourceTab, setFurnitureSourceTab] = useState<FurnitureSourceTab>("catalog");
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
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
  // 브라우저 도면은 서버 자산 벽이 없을 때만 쓰는 폴백이다. lazy 초기화(localStorage는 동기):
  // 마운트 후 effect로 채우면 SplatScene의 planWallsKey가
  // null→값으로 바뀌며 splat 자산을 통째로 두 번 로드한다(적대검증 실측).
  const [browserPlanWallsState] = useState(() =>
    typeof window === "undefined" ? null : loadPlanWallsFromBrowser()
  );
  // undefined/null/잘못된 JSON은 모두 브라우저 폴백으로 해석한다. 서버 JSON도 아래 resolver에서
  // 형태 검증을 통과해야만 실제 벽으로 채택된다.
  const [serverPlanWallsPayload, setServerPlanWallsPayload] = useState<unknown>(null);
  // RoomPlan(iOS) 캡처 도면(SplatAsset.captureFloorPlan) — splat과 같은 ARSession이라 정합 없이
  // 최우선으로 채택한다(resolveViewerPlanWalls 1순위). 마찬가지로 미검증 JSON.
  const [serverCaptureFloorPlan, setServerCaptureFloorPlan] = useState<unknown>(null);
  // 가구 배치 저장 키의 매물 신원. null이면 이 자산은 매물에 연결돼 있지 않다.
  const [assetListingId, setAssetListingId] = useState<string | null>(null);
  const planWallsState = useMemo(
    () => resolveViewerPlanWalls(serverCaptureFloorPlan, serverPlanWallsPayload, browserPlanWallsState),
    [browserPlanWallsState, serverCaptureFloorPlan, serverPlanWallsPayload]
  );
  const planWalls = planWallsState.walls;
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
  // 내 가구 로딩·필터(meshJobState==="DONE")·401 무음 처리는 FurnitureCatalogPanel과 공유하는
  // 훅으로 옮겼다(ListingTourRoom3D도 동일 로직을 쓰던 것을 중복 없이 합침).
  const tenantFurnitures = useTenantFurnitureCatalog(setFurnitureCatalogStatus);

  // 조이스틱 → 아날로그 이동 ref. null(놓음)이면 정지(0,0). setState가 아니라 ref 갱신이라
  // 매 프레임 리렌더가 없다 — TourCamera의 RAF 루프가 값을 직접 읽는다.
  const handleJoystickChange = useCallback((vector: TourJoystickVector | null) => {
    moveInputRef.current = vector ?? { forward: 0, strafe: 0 };
  }, []);

  // "현재 시점 저장" 버튼이 클릭 시점에 읽을 최신 pose를 ref에만 담는다(매 프레임 호출돼도 리렌더 없음).
  const handlePoseChange = useCallback((pose: TourCameraPose) => {
    currentPoseRef.current = pose;
  }, []);

  async function handleSaveSpawnView() {
    if (!assetId) return;
    const pose = currentPoseRef.current;
    if (!pose) {
      setSpawnSaveStatus("아직 카메라 위치를 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setSpawnSaveStatus("저장 중…");
    try {
      const updated = await updateSplatAssetSpawnView(assetId, pose);
      setSpawnView(resolveTourSpawnView(updated.spawnView, SPAWN_VIEW));
      setSpawnSaveStatus("현재 시점을 이 매물의 기본 시점으로 저장했습니다.");
    } catch (error) {
      console.warn("[splat-tour] spawn-view 저장 실패", error);
      setSpawnSaveStatus("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  function applyLoadedFurniture(state: SplatFurnitureState) {
    setFurnitureState(state);
    setFurnitureDraft({ placed: state.furnitures, pending: null, original: null });
    setSelectedFurnitureId(null);
  }

  function persistFurnitureLayout(furnitures: PlacedFurniture[]) {
    setFurnitureState({ furnitures, source: "listing-tour" });
    // 매물별 키로 저장한다. 예전엔 매물 구분 없는 전역 키를 썼는데, 그러면 매물 A에서 놓은
    // 가구가 매물 B의 투어에도 떴다(f3f4c40c에서 매물 상세·투어 읽기 경로를 이 키로 통일).
    if (!assetListingId) {
      // 매물 연결이 없으면 저장할 신원이 없다. 전역 키로 폴백하면 그게 곧 위 누출이므로,
      // 화면에는 반영하되 저장은 하지 않고 그 사실을 알린다(조용히 성공한 척하지 않는다).
      setFurnitureCatalogStatus("이 자산은 매물 연결이 없어 배치를 저장할 수 없습니다. 화면에만 반영됩니다.");
      return;
    }
    try {
      window.localStorage.setItem(
        listingTourFurnitureStorageKey(assetListingId),
        createTourFurnitureSavePayload(furnitures)
      );
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

  function handleTenantFurnitureSelect(furniture: TenantFurniture) {
    const restored = cancelTourFurnitureDraft(furnitureDraft);
    const item = tenantFurnitureCatalogItem(furniture);
    const nextDraft = beginTourFurnitureDraft(item, restored.placed);
    setFurnitureDraft({
      ...nextDraft,
      // splat-furniture-layer가 GLB 실측 스케일을 furniture.sizeMm에서 직접 읽는다 — item.length에도
      // 같은 값이 들어가지만 sizeMm 없이는 스케일 계산이 0으로 빠진다(레이어 쪽 폴백 규약).
      pending: nextDraft.pending ? { ...nextDraft.pending, sizeMm: furniture.sizeMm, source: furniture.source } : nextDraft.pending
    });
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

  // 터치/coarse pointer 감지(마운트 후). 하이브리드 기기 대응으로 maxTouchPoints도 함께 본다.
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(query.matches || navigator.maxTouchPoints > 0);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Canvas 최초 정적 카메라 위치 — TourCamera가 spawnView(state)로 스냅하기 전까지의 임시값이라
  // 항상 폴백 상수를 쓴다(로딩 오버레이 뒤에 가려지므로 자산별 값과 달라도 보이지 않는다).
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
    // 서버 벽도 해당 자산에 귀속된 형상이므로 로컬 파일로 바꾸면 브라우저 도면 폴백으로 되돌린다.
    setServerPlanWallsPayload(null);
    setServerCaptureFloorPlan(null);
    setShowPlanWalls(resolveWallReplace(window.location.search, false));
  }, []);

  // ?asset=<id> — 저장된 SplatAsset(fileUrl+정합 transform)을 불러 투어를 연다.
  // "정합 저장 → 투어 링크 공유"의 뷰어 쪽 진입로. 실패 시 기본 샘플로 폴백.
  useEffect(() => {
    const assetId = new URLSearchParams(window.location.search).get("asset");
    setAssetId(assetId);
    if (!assetId) {
      // 자산 연결이 없는 샘플 투어 — 결정할 것이 없으니 즉시 폴백 상수로 스폰을 확정한다.
      setSpawnView(SPAWN_VIEW);
      return;
    }

    let cancelled = false;
    getSplatAsset(assetId)
      .then((asset) => {
        if (cancelled) return;
        // 공개 자산에 동봉된 벽을 최우선으로 채택한다. 미검증 API JSON은 resolver가 다시 거른다.
        setServerPlanWallsPayload(asset.walls);
        // RoomPlan 캡처 도면은 splat과 좌표계가 같아 resolver 1순위로 채택된다(정합 불필요).
        setServerCaptureFloorPlan(asset.captureFloorPlan);
        // 가구 배치 저장 키를 매물별로 가르기 위해 자산의 매물 연결을 붙든다.
        setAssetListingId(asset.listingId);
        // 저장된 스폰 시점(있으면)을 검증해 채택 — 무효/없음이면 폴백. 자산 상태(PROCESSING/FAILED)와
        // 무관하게 여기서 확정해둔다(재시도 후 같은 컴포넌트가 살아남아도 스냅 대상이 이미 준비돼 있게).
        setSpawnView(resolveTourSpawnView(asset.spawnView, SPAWN_VIEW));
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
        setSpawnView(SPAWN_VIEW);
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

  // "현재 시점 저장" 결과 배너 자동 소멸 — furnitureCatalogStatus와 달리 이건 일회성 토스트다.
  useEffect(() => {
    if (!spawnSaveStatus) return;
    const timer = window.setTimeout(() => setSpawnSaveStatus(null), 3200);
    return () => window.clearTimeout(timer);
  }, [spawnSaveStatus]);

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
          source: planWallsState.source,
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

          .tour-spawn-save-banner {
            position: absolute;
            z-index: 6;
            bottom: 66px;
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

          .tour-hint {
            position: absolute;
            z-index: 2;
            top: 18px;
            left: 18px;
            max-width: calc(100% - 36px);
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
            top: 0;
            right: 0;
            bottom: 0;
            left: auto;
            display: grid;
            width: min(420px, calc(100% - 24px));
            /* FurnitureCatalogPanel은 Fragment라 DOM엔 자기 자식(소스탭 + 탭 패널)이 그대로 펼쳐져
               붙는다 — 트랙 순서: 헤드·상태문구·소스탭·(스크롤 늘어나는)탭 패널·배치목록·안내/액션. */
            grid-template-rows: auto auto auto minmax(0, 1fr) minmax(0, auto) auto auto;
            gap: 12px;
            overflow: hidden;
            padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
            border: 1px solid var(--line);
            border-top: 0;
            border-right: 0;
            border-bottom: 0;
            border-radius: 0;
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
          .tour-furniture-action {
            border: 1px solid var(--line);
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            color: var(--ink);
            cursor: pointer;
            font: inherit;
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

          .tour-furniture-close:hover,
          .tour-furniture-action:hover {
            border-color: var(--blue);
            color: var(--blue);
          }

          /* 검색·카테고리·카탈로그 그리드는 FurnitureCatalogPanel(listing-tour-furniture-*, globals.css)로
             옮겼다 — 이 파일엔 "배치된 가구" 목록 스크롤바 색상만 남는다. */
          .tour-furniture-placed {
            scrollbar-color: var(--tour-scrollbar-thumb) var(--tour-scrollbar-track);
            scrollbar-width: thin;
          }

          .tour-furniture-placed::-webkit-scrollbar {
            width: 10px;
          }

          .tour-furniture-placed::-webkit-scrollbar-track {
            background: var(--tour-scrollbar-track);
          }

          .tour-furniture-placed::-webkit-scrollbar-thumb {
            border: 2px solid var(--tour-scrollbar-track);
            border-radius: 999px;
            background: var(--tour-scrollbar-thumb);
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
            transition: right 200ms ease;
          }

          /* 가구 드로어가 우측 풀하이트로 도킹되면 겹치므로 드로어 폭만큼 밀어낸다. */
          .tour-dropzone-dock.is-furniture-open {
            right: calc(min(420px, calc(100% - 24px)) + 16px);
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

            .tour-hint {
              top: 12px;
              left: 10px;
              max-width: calc(100% - 20px);
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

            /* 좁은 세로 화면에서는 우측 풀하이트 도킹 대신 기존 하단 시트로 되돌린다 —
               데스크톱 규칙(top/right/border 0)과 충돌하지 않도록 전부 명시적으로 재정의. */
            .tour-furniture-drawer {
              top: auto;
              right: auto;
              bottom: 68px;
              left: 10px;
              width: calc(100% - 20px);
              max-height: min(560px, calc(100% - 86px));
              padding: 13px;
              border: 1px solid var(--line);
              border-radius: 16px;
            }

            .tour-dropzone-dock {
              right: 10px;
              bottom: 66px;
              max-width: calc(100% - 20px);
            }

            .tour-dropzone-dock.is-furniture-open {
              right: 10px;
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
          // 캡처 도면(RoomPlan)이 벽 출처일 때 splat 배치도 native(항등)로 맞춘다. 캡처 자산은
          // 정합 transform이 영원히 없어서(같은 ARSession = 정합 불필요가 설계) 기본 "auto" fit이
          // splat을 bbox 기준으로 임의 축소·재중앙화해버리는데, 미니맵·걷기 경계·가구는 전부
          // ARKit 실측 좌표(planBounds)를 쓰므로 좌표계가 갈라진다 — register/page.tsx가
          // defaultFitMode="native"를 쓰는 것과 같은 이유. URL ?fit= 명시는 여전히 이긴다.
          defaultFitMode={planWallsState.source === "capture" ? "native" : undefined}
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
          onPoseChange={isOwner ? handlePoseChange : undefined}
          presets={[]}
          spawnView={spawnView}
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

      {isFurnitureCatalogOpen ? (
        <aside aria-label="가구 카탈로그" className="tour-furniture-drawer">
          <div className="tour-furniture-drawer-head">
            <h2>가구 카탈로그</h2>
            <button className="tour-furniture-close" onClick={closeFurnitureCatalog} type="button">
              닫기
            </button>
          </div>
          <p className="tour-furniture-status" role="status">{furnitureCatalogStatus}</p>
          <FurnitureCatalogPanel
            activeFurnitureId={furnitureDraft.pending?.furniture_id ?? null}
            categoryFilter={furnitureCategory}
            catalogItems={furnitureCatalog}
            onCategoryChange={setFurnitureCategory}
            onSearchChange={setFurnitureQuery}
            onSelectCatalogItem={handleFurnitureCatalogSelect}
            onSelectTenantFurniture={handleTenantFurnitureSelect}
            onSourceTabChange={setFurnitureSourceTab}
            searchQuery={furnitureQuery}
            sourceTab={furnitureSourceTab}
            tenantFurnitures={tenantFurnitures}
          />
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

      <div className={`tour-dropzone-dock${isFurnitureCatalogOpen ? " is-furniture-open" : ""}`}>
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

      {spawnSaveStatus ? (
        <p className="tour-spawn-save-banner" role="status">
          {spawnSaveStatus}
        </p>
      ) : null}

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
        {/* 자산 소유자에게만 노출 — 서버(page.tsx)가 판정한 isOwner를 그대로 신뢰한다.
            비소유자가 URL을 조작해 눌러도 서버 소유권 검사(assertAssetOwner)가 막는다. */}
        {isOwner && assetId ? (
          <button className="tour-walk-toggle" onClick={handleSaveSpawnView} type="button">
            <Camera aria-hidden size={16} strokeWidth={2.4} />
            <span>현재 시점을 기본으로 저장</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
