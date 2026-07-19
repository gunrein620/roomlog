"use client";

// 내놓은 집(임대인) 등록 폼 — 사진 업로드, 3D 도면 연결, 매물 등록.
// 역할 흐름 분리(3단계)로 HomeApp에서 추출(동작 불변).
import type { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Box, Camera, CheckCircle2, CircleAlert, Search, Video, X } from "lucide-react";
import { naverMapScriptUrl } from "@/app/_components/NaverMapPreview";
import type { ListingFloorPlan3D } from "@/app/_components/ListingTourRoom3D";
import type { PlacedFurniture, WheretoputWall3D } from "@/app/floor-plan-3d/room-model/types";

// 등록 요약의 3D 프리뷰 — Three.js라 클라이언트에서만(ssr:false) 읽기 전용으로 렌더한다.
const FloorPlan3DPreview = dynamic(
  () => import("@/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView").then((mod) => mod.RoomlogThreeFloorPlanView),
  { ssr: false, loading: () => <div className="summary-media-loading">3D 도면 불러오는 중…</div> }
);
import {
  OWNER_DRAFT_STORAGE_KEY,
  emptyOwnerForm,
  initialOwnerListings,
  parseOwnerDraft,
  saveOwnerDraft
} from "@/lib/owner-draft";
import { listSplatAssetsByListing, requeueSplatAsset } from "@/lib/splat-asset-api";
import { startTourUpload } from "@/lib/tour-upload-store";
import { pickListingSplatAsset } from "@/lib/owner-tour-assets";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { SPLAT_ASSET_UPDATED_EVENT, type SplatAssetStatus } from "@roomlog/types";
import { listingRoomTypes, optionItems } from "@/lib/listing-catalog";
import { clearOwnerPhotos, loadOwnerPhotos, saveOwnerPhotos } from "@/lib/owner-photo-store";
import {
  buildRoomlogMitunetEditorPath,
  normalizeMitunetPayload,
  parseMitunetProjectJson
} from "@/lib/mitunet-floor-plan";

// 지도/지오코딩 스크립트를 필요할 때 1회만 로드한다(등록 폼은 NaverMapPreview가 없는 화면이라 자체 로드 필요).
let naverMapsLoadPromise: Promise<boolean> | null = null;
function loadNaverMaps(): Promise<boolean> {
  if (typeof window === "undefined" || !naverMapScriptUrl) return Promise.resolve(false);
  if (window.naver?.maps?.Service) return Promise.resolve(true);
  if (naverMapsLoadPromise) return naverMapsLoadPromise;
  naverMapsLoadPromise = new Promise((resolvePromise) => {
    const existing = document.getElementById("naver-map-loader") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolvePromise(Boolean(window.naver?.maps)), { once: true });
      existing.addEventListener("error", () => resolvePromise(false), { once: true });
      if (window.naver?.maps) resolvePromise(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "naver-map-loader";
    script.src = naverMapScriptUrl;
    script.async = true;
    script.onload = () => resolvePromise(Boolean(window.naver?.maps));
    script.onerror = () => {
      naverMapsLoadPromise = null;
      resolvePromise(false);
    };
    document.head.appendChild(script);
  });
  return naverMapsLoadPromise;
}

type KakaoPostcodeData = {
  address: string;
  roadAddress: string;
  jibunAddress: string;
  userSelectedType: "R" | "J";
  zonecode: string;
};

type KakaoPostcodeOptions = {
  oncomplete: (data: KakaoPostcodeData) => void;
  width?: string;
  height?: string;
};

type KakaoPostcodeInstance = {
  embed: (element: HTMLElement) => void;
};

type KakaoPostcodeLoadState = "idle" | "loading" | "ready" | "error";

declare global {
  interface Window {
    daum?: {
      Postcode?: new (options: KakaoPostcodeOptions) => KakaoPostcodeInstance;
    };
  }
}

const kakaoPostcodeScriptUrl = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
let kakaoPostcodeLoadPromise: Promise<boolean> | null = null;

function loadKakaoPostcode(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.daum?.Postcode) return Promise.resolve(true);
  if (kakaoPostcodeLoadPromise) return kakaoPostcodeLoadPromise;

  kakaoPostcodeLoadPromise = new Promise((resolvePromise) => {
    let settled = false;
    const finish = (isReady: boolean) => {
      if (settled) return;
      settled = true;
      if (!isReady) kakaoPostcodeLoadPromise = null;
      resolvePromise(isReady);
    };
    const existing = document.getElementById("kakao-postcode-loader") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => finish(Boolean(window.daum?.Postcode)), { once: true });
      existing.addEventListener("error", () => finish(false), { once: true });
      window.setTimeout(() => finish(Boolean(window.daum?.Postcode)), 10000);
      return;
    }

    const script = document.createElement("script");
    script.id = "kakao-postcode-loader";
    script.src = kakaoPostcodeScriptUrl;
    script.async = true;
    script.onload = () => finish(Boolean(window.daum?.Postcode));
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });

  return kakaoPostcodeLoadPromise;
}

function selectedKakaoAddress(data: KakaoPostcodeData): string {
  const selectedAddress =
    data.userSelectedType === "R"
      ? data.roadAddress || data.address || data.jibunAddress
      : data.jibunAddress || data.address || data.roadAddress;
  return selectedAddress.trim();
}

// 주소 문자열을 좌표로 변환한다. 실패(미활성/무결과)면 null — 호출측은 좌표 없이 진행한다.
async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const ready = await loadNaverMaps();
  const service = window.naver?.maps?.Service;
  if (!ready || !service) return null;
  return new Promise((resolvePromise) => {
    try {
      service.geocode({ query: trimmed }, (status, response) => {
        if (status !== service.Status.OK) {
          resolvePromise(null);
          return;
        }
        const first = response?.v2?.addresses?.[0];
        const lat = Number(first?.y);
        const lng = Number(first?.x);
        if (!first || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          resolvePromise(null);
          return;
        }
        resolvePromise({ lat, lng });
      });
    } catch {
      resolvePromise(null);
    }
  });
}

// 도면 에디터가 남긴 3D 스냅샷 키 — RoomlogFloorPlanEditor의 LISTING_FLOOR_PLAN_STORAGE_KEY와 동일해야 한다.
const LISTING_FLOOR_PLAN_STORAGE_KEY = "roomlogListingFloorPlan3D";

/** 에디터가 저장한 3D 도면 스냅샷을 읽는다(없거나 벽 0개면 null). */
function readListingFloorPlanSnapshot(): ListingFloorPlan3D | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LISTING_FLOOR_PLAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListingFloorPlan3D;
    if (!parsed || !Array.isArray(parsed.walls3D)) return null;
    const mitunet = normalizeMitunetPayload(parsed.mitunet);
    if (parsed.walls3D.length === 0 && !mitunet) return null;
    return {
      walls3D: parsed.walls3D,
      furnitures: Array.isArray(parsed.furnitures) ? parsed.furnitures : [],
      name: parsed.name,
      ...(mitunet ? { mitunet } : {})
    };
  } catch {
    return null;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toPositiveNumber(value: unknown): number | null {
  const numberValue = toFiniteNumber(value);
  return numberValue !== null && numberValue > 0 ? numberValue : null;
}

function toNumberTuple3(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const numbers = value.map(toFiniteNumber);
  if (numbers.some((numberValue) => numberValue === null)) return null;
  return numbers as [number, number, number];
}

function normalizeUploadedFloorPlanWall(value: unknown, index: number): ListingFloorPlan3D["walls3D"][number] | null {
  if (!isObjectRecord(value) || !isObjectRecord(value.dimensions)) return null;

  const width = toPositiveNumber(value.dimensions.width);
  const height = toPositiveNumber(value.dimensions.height);
  const depth = toPositiveNumber(value.dimensions.depth);
  const position = toNumberTuple3(value.position);
  const rotation = toNumberTuple3(value.rotation);
  if (width === null || height === null || depth === null || !position || !rotation) return null;

  const syntheticId = `up-${index}`;
  const id = typeof value.id === "string" || typeof value.id === "number" ? String(value.id) : syntheticId;
  const wallId =
    typeof value.wall_id === "string" || typeof value.wall_id === "number"
      ? value.wall_id
      : syntheticId;

  return {
    id: id || syntheticId,
    wall_id: wallId || syntheticId,
    dimensions: { width, height, depth },
    position,
    rotation
  };
}

function normalizeUploadedFloorPlanFurniture(
  value: unknown,
  index: number
): ListingFloorPlan3D["furnitures"][number] | null {
  if (!isObjectRecord(value)) return null;

  const length = toNumberTuple3(value.length);
  const position = toNumberTuple3(value.position);
  const rotation = toNumberTuple3(value.rotation);
  const scale = toPositiveNumber(value.scale);
  if (!length || !position || !rotation || scale === null) return null;

  const syntheticId = `up-f-${index}`;
  const id = typeof value.id === "string" || typeof value.id === "number" ? String(value.id) : syntheticId;
  const furnitureId =
    typeof value.furniture_id === "string" || typeof value.furniture_id === "number"
      ? String(value.furniture_id)
      : syntheticId;
  const name = typeof value.name === "string" && value.name.trim() ? value.name : "가구";
  const color = typeof value.color === "string" && value.color.trim() ? value.color : "lightgray";
  const modelUrl = typeof value.modelUrl === "string" && value.modelUrl.trim() ? value.modelUrl : undefined;
  const width = isObjectRecord(value.sizeMm) ? toPositiveNumber(value.sizeMm.width) : null;
  const depth = isObjectRecord(value.sizeMm) ? toPositiveNumber(value.sizeMm.depth) : null;
  const height = isObjectRecord(value.sizeMm) ? toPositiveNumber(value.sizeMm.height) : null;

  return {
    id: id || syntheticId,
    furniture_id: furnitureId || syntheticId,
    name,
    color,
    length,
    modelUrl,
    position,
    rotation,
    scale,
    sizeMm: width !== null && depth !== null ? { width, depth, ...(height !== null ? { height } : {}) } : undefined
  };
}

function parseUploadedFloorPlanJson(value: unknown): { snapshot: ListingFloorPlan3D; wallCount: number } | { error: string } {
  let wallsSource: unknown;
  let furnituresSource: unknown;
  let nameSource: unknown;

  if (Array.isArray(value)) {
    wallsSource = value;
  } else if (isObjectRecord(value)) {
    if (Array.isArray(value.walls3D)) {
      wallsSource = value.walls3D;
      furnituresSource = value.furnitures;
      nameSource = value.name;
    } else if (isObjectRecord(value.room3d) && Array.isArray(value.room3d.walls)) {
      wallsSource = value.room3d.walls;
      furnituresSource = value.room3d.furnitures;
      nameSource = value.room3d.name ?? value.name;
    } else if (Array.isArray(value.walls)) {
      wallsSource = value.walls;
      furnituresSource = value.furnitures;
      nameSource = value.name;
    }
  }

  if (!Array.isArray(wallsSource)) return { error: "도면 JSON에서 벽 배열을 찾지 못했습니다." };

  const walls3D = wallsSource
    .map((wall, index) => normalizeUploadedFloorPlanWall(wall, index))
    .filter((wall): wall is ListingFloorPlan3D["walls3D"][number] => Boolean(wall));

  if (walls3D.length === 0) return { error: "이 JSON에서 유효한 벽을 못 찾았습니다." };

  const furnitures = Array.isArray(furnituresSource)
    ? furnituresSource
        .map((furniture, index) => normalizeUploadedFloorPlanFurniture(furniture, index))
        .filter((furniture): furniture is ListingFloorPlan3D["furnitures"][number] => Boolean(furniture))
    : [];

  return {
    snapshot: {
      name: typeof nameSource === "string" ? nameSource : undefined,
      walls3D,
      furnitures
    },
    wallCount: walls3D.length
  };
}

function writeListingFloorPlanSnapshot(snapshot: ListingFloorPlan3D) {
  const storageSnapshot = {
    name: snapshot.name,
    savedAt: Date.now(),
    walls3D: snapshot.walls3D.map((wall) => ({
      id: String(wall.id),
      wall_id: wall.wall_id,
      dimensions: wall.dimensions,
      position: wall.position,
      rotation: wall.rotation
    })),
    furnitures: snapshot.furnitures,
    mitunet: snapshot.mitunet
  };
  window.localStorage.setItem(LISTING_FLOOR_PLAN_STORAGE_KEY, JSON.stringify(storageSnapshot));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("ko-KR")}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function LandlordMyPage({ onGoHome }: { onGoHome?: () => void } = {}) {
  // 입력 칸은 빈 값으로 시작(예시는 placeholder가 담당). 새로고침 유실은 localStorage draft로 방지.
  const [ownerForm, setOwnerForm] = useState(emptyOwnerForm);
  const [photoCount, setPhotoCount] = useState(0);
  // 선택한 실제 파일(등록 시 업로드) — 초안 저장 대상은 아니다(파일은 직렬화 불가).
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  // 선택 즉시 보이는 미리보기 URL — photoFiles가 바뀌면 이전 objectURL은 회수한다.
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  // IndexedDB에서 사진 복원이 끝났는지 — 복원 전에 저장 효과가 돌면 저장분을 지워버리는 경쟁을 막는다.
  const [arePhotosRestored, setArePhotosRestored] = useState(false);
  // 등록 요약 사진 캐러셀의 현재 인덱스, 3D 도면 스냅샷.
  const [photoIndex, setPhotoIndex] = useState(0);
  const [floorPlan3D, setFloorPlan3D] = useState<ListingFloorPlan3D | null>(null);
  const [tourSourceFile, setTourSourceFile] = useState<File | null>(null);
  const tourSourceInputRef = useRef<HTMLInputElement | null>(null);
  const previewPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const previewWasDraggedRef = useRef(false);
  // 사진/영상 패널이 드래그오버 중인지 — 패널 스코프 로컬 상태(문서 전역 드롭 동작은 건드리지 않는다).
  const [isPhotoDragOver, setIsPhotoDragOver] = useState(false);
  const [isTourDragOver, setIsTourDragOver] = useState(false);
  // 편집 모드: /sell?listingId=... 로 진입하면(주로 벨의 "제작 실패" 알림) 그 매물의 3D 재작업을 노출한다.
  const searchParams = useSearchParams();
  const editListingId = searchParams.get("listingId");
  // 편집 대상 매물의 대표 3D 자산(id + 상태). FAILED면 재큐잉 UI, PROCESSING이면 제작 중 표시.
  const [editTourAsset, setEditTourAsset] = useState<{ id: string; status: SplatAssetStatus } | null>(null);
  const [isRequeuing, setIsRequeuing] = useState(false);
  useEffect(() => {
    const urls = photoFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photoFiles]);
  // 사진이 줄면 캐러셀 인덱스가 범위를 벗어나지 않게 클램프.
  useEffect(() => {
    setPhotoIndex((index) => (photoPreviewUrls.length === 0 ? 0 : Math.min(index, photoPreviewUrls.length - 1)));
  }, [photoPreviewUrls.length]);
  const removePhotoAt = (index: number) => {
    const next = photoFiles.filter((_, i) => i !== index);
    setPhotoFiles(next);
    setPhotoCount(next.length);
  };
  // 사진 추가 — 파일 인풋 onChange와 패널 드롭이 공유하는 병합·중복제거 로직.
  const addPhotoFiles = (incoming: File[]) => {
    const added = incoming.filter((file) => file.type.startsWith("image/"));
    if (added.length === 0) return;
    const fileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;
    const seen = new Set(photoFiles.map(fileKey));
    const merged = [...photoFiles, ...added.filter((file) => !seen.has(fileKey(file)))];
    setPhotoFiles(merged);
    setPhotoCount(merged.length);
    setRegistrationStatus("작성 중");
  };
  const handlePhotoInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const added = event.target.files ? Array.from(event.target.files) : [];
    // 같은 파일을 다시 고를 수 있도록 인풋 값을 비운다(초기화 안 하면 동일 파일 재선택이 안 먹는다).
    event.target.value = "";
    addPhotoFiles(added);
  };
  const handlePhotoDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsPhotoDragOver(true);
  };
  const handlePhotoDragLeave = () => setIsPhotoDragOver(false);
  const handlePhotoDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsPhotoDragOver(false);
    addPhotoFiles(Array.from(event.dataTransfer.files ?? []));
  };
  // 영상/스플랫은 단일 파일 — video/* MIME이거나 .spz·.zip 확장자(둘 다 표준 video MIME이 없어 이름으로 판별).
  const isAcceptableTourFile = (file: File) => file.type.startsWith("video/") || /\.(zip|spz)$/i.test(file.name);
  const handleTourDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsTourDragOver(true);
  };
  const handleTourDragLeave = () => setIsTourDragOver(false);
  const handleTourDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsTourDragOver(false);
    const file = Array.from(event.dataTransfer.files ?? []).find(isAcceptableTourFile);
    if (!file) return;
    setTourSourceFile(file);
    setRegistrationStatus("작성 중");
  };
  const handleFloorPlanJsonUpload = (file: File | undefined) => {
    if (!file) return;

    void file.text().then((text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setOwnerToast("도면 JSON을 읽지 못했습니다. 파일 내용을 확인해 주세요.");
        return;
      }

      const mitunet = parseMitunetProjectJson(parsed);
      if (mitunet) {
        const snapshot: ListingFloorPlan3D = {
          name: mitunet.name,
          walls3D: [],
          furnitures: [],
          mitunet
        };
        try {
          writeListingFloorPlanSnapshot(snapshot);
          setFloorPlan3D(snapshot);
          setHas3DRoom(true);
          setRegistrationStatus("작성 중");
          setOwnerToast("MitUNet 3D 도면을 연결했습니다.");
        } catch {
          setOwnerToast("도면을 브라우저에 저장하지 못했습니다. 파일 용량을 확인해 주세요.");
        }
        return;
      }

      const result = parseUploadedFloorPlanJson(parsed);
      if ("error" in result) {
        setOwnerToast(result.error);
        return;
      }

      try {
        writeListingFloorPlanSnapshot(result.snapshot);
        setHas3DRoom(true);
        setRegistrationStatus("작성 중");
        setOwnerToast(`도면 벽 ${result.wallCount}개 연결됨 — 등록하면 상세에서 3D로 보입니다`);
      } catch {
        setOwnerToast("도면을 이 브라우저에 저장하지 못했습니다. 파일 용량을 확인해 주세요.");
      }
    }).catch(() => {
      setOwnerToast("도면 JSON을 읽지 못했습니다. 파일 내용을 확인해 주세요.");
    });
  };
  // 도면 JSON 드롭 — 가시 UI 없는 개발자 전용 숨은 기능이라 dragover에서도 시각 피드백을 넣지 않는다
  // (무신호가 의도). preventDefault만 해서 drop이 실제로 발생하게 한다.
  const handleFloorPlanJsonDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
  };
  const handleFloorPlanJsonDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files ?? []).find(
      (candidate) => candidate.type === "application/json" || /\.json$/i.test(candidate.name)
    );
    handleFloorPlanJsonUpload(file);
  };
  // 주소 지오코딩 결과 — 등록 페이로드의 lat/lng로 실린다(실패/미활성 시 null).
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [has3DRoom, setHas3DRoom] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState("작성 중");
  const [myListings, setMyListings] = useState(initialOwnerListings);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [ownerToast, setOwnerToast] = useState("");
  // 등록 결과 팝업 — 성공/실패를 모달로 알린다. 성공 확인 시 홈 피드로 이동(onGoHome).
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSubmittingListing, setIsSubmittingListing] = useState(false);
  const isSubmittingListingRef = useRef(false);
  const postcodeEmbedRef = useRef<HTMLDivElement | null>(null);
  const [isPostcodeSearchOpen, setIsPostcodeSearchOpen] = useState(false);
  const [postcodeLoadState, setPostcodeLoadState] = useState<KakaoPostcodeLoadState>("idle");
  const updateOwnerForm = (key: Exclude<keyof typeof ownerForm, "options">, value: string) => {
    setOwnerForm((current) => ({ ...current, [key]: value }));
    setRegistrationStatus("작성 중");
  };
  const toggleOwnerOption = (option: string) => {
    setOwnerForm((current) => ({
      ...current,
      options: current.options.includes(option)
        ? current.options.filter((item) => item !== option)
        : [...current.options, option]
    }));
    setRegistrationStatus("작성 중");
  };

  useEffect(() => {
    if (!isPostcodeSearchOpen) return;

    let cancelled = false;
    setPostcodeLoadState("loading");

    void loadKakaoPostcode().then((isReady) => {
      if (cancelled) return;
      const target = postcodeEmbedRef.current;
      const Postcode = window.daum?.Postcode;
      if (!isReady || !target || !Postcode) {
        setPostcodeLoadState("error");
        return;
      }

      target.innerHTML = "";
      const postcode = new Postcode({
        width: "100%",
        height: "100%",
        oncomplete: (data) => {
          const address = selectedKakaoAddress(data);
          if (!address) {
            setOwnerToast("선택한 주소를 읽지 못했습니다. 다시 검색해 주세요.");
            return;
          }
          updateOwnerForm("address", address);
          setOwnerToast(data.zonecode ? `우편번호 ${data.zonecode} 주소가 입력되었습니다.` : "주소가 입력되었습니다.");
          setIsPostcodeSearchOpen(false);
        }
      });
      postcode.embed(target);
      setPostcodeLoadState("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [isPostcodeSearchOpen]);

  useEffect(() => {
    if (!isPostcodeSearchOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPostcodeSearchOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPostcodeSearchOpen]);

  useEffect(() => {
    if (!ownerToast) return;
    const timer = window.setTimeout(() => setOwnerToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [ownerToast]);

  // 3D 투어 상태(정합 필요/제작 중/실패)는 상단 네비 벨(TourActionBell)이 단일 소스로 알린다.
  // 예전 하단 "3D 투어 진행 상태" 섹션과 그 집계·소켓 구독은 벨로 대체되어 제거됐다.
  // 다만 편집 모드(?listingId=)에서는 그 매물의 대표 자산만 별도로 구독해 재큐잉 UI에 반영한다.
  useEffect(() => {
    if (!editListingId) {
      setEditTourAsset(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const assets = await listSplatAssetsByListing(editListingId);
        if (cancelled) return;
        const picked = pickListingSplatAsset(assets);
        setEditTourAsset(picked ? { id: picked.assetId, status: picked.status } : null);
      } catch {
        if (!cancelled) setEditTourAsset(null);
      }
    };
    void load();
    // 재구성 완료/실패를 소켓으로 받으면 재조회한다(페이로드 식별자만 신뢰, 상태는 REST로 확정 — 벨과 동일 규약).
    const socket = getRealtimeSocket();
    const onAssetUpdated = () => {
      void load();
    };
    socket.on(SPLAT_ASSET_UPDATED_EVENT, onAssetUpdated);
    return () => {
      cancelled = true;
      socket.off(SPLAT_ASSET_UPDATED_EVENT, onAssetUpdated);
    };
  }, [editListingId]);

  const editTourFileInputRef = useRef<HTMLInputElement | null>(null);

  // 저장된 원본으로 원클릭 재시도. 서버가 status=PROCESSING으로 되돌리며, 응답으로 즉시 반영한다.
  const handleRequeueSameSource = async () => {
    if (!editTourAsset || isRequeuing) return;
    setIsRequeuing(true);
    try {
      const updated = await requeueSplatAsset(editTourAsset.id);
      setEditTourAsset({ id: updated.id, status: updated.status });
      setOwnerToast("3D 투어 재제작이 접수됐습니다. 완료되면 상단 알림으로 알려드릴게요.");
    } catch {
      setOwnerToast("재제작 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsRequeuing(false);
    }
  };

  // 다른 파일로 원본을 교체 후 재시도(멀티파트). accept는 STEP 03 업로드 입력과 동일.
  const handleRequeueWithFile = async (file: File | undefined) => {
    if (!file || !editTourAsset || isRequeuing) return;
    setIsRequeuing(true);
    try {
      const updated = await requeueSplatAsset(editTourAsset.id, file);
      setEditTourAsset({ id: updated.id, status: updated.status });
      setOwnerToast("새 파일로 3D 투어 재제작이 접수됐습니다. 완료되면 알려드릴게요.");
    } catch {
      setOwnerToast("파일 재접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsRequeuing(false);
    }
  };

  // 결과 팝업 닫기 — 실패면 폼에 남아 재시도(작성 내용은 draft로 보존), 성공이면 홈 피드로 보낸다.
  const closeSubmitResult = () => {
    const wasSuccess = submitResult?.ok === true;
    setSubmitResult(null);
    if (wasSuccess) onGoHome?.();
  };

  useEffect(() => {
    if (!submitResult) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSubmitResult();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // closeSubmitResult는 submitResult가 바뀔 때마다 이 효과와 함께 재생성된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitResult]);

  // 주소 입력을 디바운스로 지오코딩 — 상세 지도에 실제 매물 좌표를 찍기 위함.
  useEffect(() => {
    const address = ownerForm.address?.trim();
    if (!address) {
      setGeoCoords(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void geocodeAddress(address).then((coords) => {
        if (!cancelled) setGeoCoords(coords);
      });
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ownerForm.address]);

  // 복원: 반드시 마운트 후에만 localStorage 접근 — SSR 초기 렌더와의 hydration 불일치 방지 (QA 8).
  useEffect(() => {
    const draft = parseOwnerDraft(window.localStorage.getItem(OWNER_DRAFT_STORAGE_KEY));

    if (draft) {
      setOwnerForm(draft.ownerForm);
      // photoCount는 실제 복원된 File 개수로 아래에서 맞춘다(파일 없이 "N장"만 남는 불일치 방지).
      setHas3DRoom(draft.has3DRoom);
      setRegistrationStatus(draft.registrationStatus);
      setMyListings(draft.myListings);
      setDraftSavedAt(draft.savedAt);
    }

    // 도면 에디터에서 실제로 3D를 만들고 돌아왔는지는 스냅샷 존재로 판단한다(클릭만으론 연결로 치지 않음).
    const bootSnapshot = readListingFloorPlanSnapshot();
    if (bootSnapshot) {
      setHas3DRoom(true);
      setFloorPlan3D(bootSnapshot);
    }

    // 사진(File)은 IndexedDB에서 복원 — 3D 도면 에디터 왕복(전체 새로고침) 후에도 유지된다.
    void loadOwnerPhotos().then((files) => {
      if (files.length > 0) {
        setPhotoFiles(files);
        setPhotoCount(files.length);
      }
      setArePhotosRestored(true);
    });

    setIsDraftLoaded(true);
  }, []);

  const openMitunetEditor = () => {
    const requestId = window.crypto.randomUUID();
    const editorPath = buildRoomlogMitunetEditorPath(window.location.origin, requestId);
    const savedAt = saveOwnerDraft(window.localStorage, {
      ownerForm,
      photoCount,
      has3DRoom,
      registrationStatus: "작성 중",
      myListings
    });
    setDraftSavedAt(savedAt);
    setRegistrationStatus("작성 중");
    void (async () => {
      if (photoFiles.length > 0) await saveOwnerPhotos(photoFiles);
      window.location.href = editorPath;
    })();
  };

  function handlePreviewCardPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!floorPlan3D) return;
    previewPointerStartRef.current = { x: event.clientX, y: event.clientY };
    previewWasDraggedRef.current = false;
  }

  function handlePreviewCardPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = previewPointerStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) previewWasDraggedRef.current = true;
  }

  function handlePreviewCardClick() {
    if (!floorPlan3D) return;
    if (previewWasDraggedRef.current) {
      previewWasDraggedRef.current = false;
      return;
    }
    openMitunetEditor();
  }

  // 에디터 탭에서 3D를 만들고 이 탭으로 돌아오면 "3D방 연결" 상태를 즉시 반영한다.
  useEffect(() => {
    const syncFloorPlanConnection = () => {
      if (document.visibilityState !== "visible") return;
      const snapshot = readListingFloorPlanSnapshot();
      if (snapshot) {
        setHas3DRoom(true);
        setFloorPlan3D(snapshot);
      }
    };
    window.addEventListener("visibilitychange", syncFloorPlanConnection);
    window.addEventListener("focus", syncFloorPlanConnection);
    return () => {
      window.removeEventListener("visibilitychange", syncFloorPlanConnection);
      window.removeEventListener("focus", syncFloorPlanConnection);
    };
  }, []);

  // 사진 선택이 바뀌면 IndexedDB에 반영 — 도면 에디터로 갔다가 돌아와도 사진이 남게.
  // 최초 복원이 끝난 뒤에만 저장한다(복원 전 빈 배열로 저장분을 덮어쓰지 않도록).
  useEffect(() => {
    if (!arePhotosRestored) return;
    if (photoFiles.length > 0) void saveOwnerPhotos(photoFiles);
    else void clearOwnerPhotos();
  }, [arePhotosRestored, photoFiles]);

  // 저장: 복원이 끝난 뒤부터 변경마다 versioned draft로 기록. 등록 제출로 생긴 myListings도 함께 유지된다.
  useEffect(() => {
    if (!isDraftLoaded) return;

    const savedAt = saveOwnerDraft(window.localStorage, { ownerForm, photoCount, has3DRoom, registrationStatus, myListings });
    setDraftSavedAt(savedAt);
  }, [isDraftLoaded, ownerForm, photoCount, has3DRoom, registrationStatus, myListings]);
  const submitOwnerListing = () => {
    // state는 리렌더 이후에야 반영되므로, 연타가 재렌더보다 빠르면 state 체크만으론 막지 못한다 — ref로 즉시 잠근다.
    if (isSubmittingListingRef.current) {
      return;
    }

    if (!ownerForm.title.trim()) {
      setOwnerToast("매물명을 입력해야 등록할 수 있습니다.");
      return;
    }

    isSubmittingListingRef.current = true;
    setIsSubmittingListing(true);
    // 등록은 서버(/api/trade/listings)로 보낸다 — 다른 계정의 홈 피드에 실제로 노출되고,
    // 문의가 오면 "받은 문의" 채팅으로 이어진다.
    void (async () => {
      try {
        // 1) 사진이 있으면 먼저 업로드해 공개 URL을 확보한다(멀티파트 프록시).
        let images: string[] = [];
        if (photoFiles.length > 0) {
          const form = new FormData();
          photoFiles.forEach((file) => form.append("files", file));
          const uploadRes = await fetch("/api/trade/uploads", { method: "POST", body: form });
          if (uploadRes.status === 401) {
            setSubmitResult({ ok: false, message: "매물을 등록하려면 WOOZU 계정 로그인이 필요합니다." });
            return;
          }
          if (uploadRes.ok) {
            const uploaded = (await uploadRes.json()) as { images?: string[] };
            images = Array.isArray(uploaded.images) ? uploaded.images : [];
          } else {
            setSubmitResult({ ok: false, message: "사진 업로드에 실패했습니다. 사진 없이 등록하거나 잠시 후 다시 시도해 주세요." });
            return;
          }
        }

        // 2) 매물 등록 — 사진 URL과 지오코딩 좌표를 함께 저장한다.
        const detailAddress = ownerForm.detailAddress.trim();
        const listingAddress = ownerForm.address.trim();
        const listingCoords = geoCoords ?? await geocodeAddress(listingAddress);
        if (!geoCoords && listingCoords) setGeoCoords(listingCoords);
        const payload: Record<string, unknown> = {
          title: ownerForm.title,
          roomType: ownerForm.roomType || "원룸",
          tradeType: ownerForm.tradeType,
          depositManwon: Number(ownerForm.tradeType === "전세" ? ownerForm.jeonse : ownerForm.deposit) || 0,
          monthlyRentManwon: Number(ownerForm.monthly) || 0,
          location: listingAddress || "위치 미입력",
          detailAddress,
          buildingName: ownerForm.buildingName.trim(),
          // 면적/층/관리비는 전용 필드로 보낸다 — 상세 스펙 항목("확인 중")에 실제 값이 뜨게.
          exclusiveAreaM2: Number(ownerForm.area) || undefined,
          floorInfo: ownerForm.floor.trim() || undefined,
          maintenanceFeeManwon: Number(ownerForm.maintenance) || undefined,
          description: ownerForm.moveIn ? `입주 가능일 ${ownerForm.moveIn}` : "",
          lat: listingCoords?.lat,
          lng: listingCoords?.lng,
          options: ownerForm.options
        };
        payload.images = images;
        // 3D방 연결 상태이고 에디터 스냅샷이 있으면 매물에 도면을 실어 보낸다 → 상세 "3D 보기"에서 실제 렌더.
        const floorPlanSnapshot = has3DRoom ? readListingFloorPlanSnapshot() : null;
        if (floorPlanSnapshot) payload.floorPlan = floorPlanSnapshot;

        const response = await fetch("/api/trade/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.status === 401) {
          setSubmitResult({ ok: false, message: "매물을 등록하려면 WOOZU 계정 로그인이 필요합니다." });
          return;
        }
        if (!response.ok) {
          setSubmitResult({ ok: false, message: "매물 등록에 실패했습니다. 잠시 후 다시 시도해 주세요." });
          return;
        }

        const savedListing = (await response.json().catch(() => null)) as { id?: string } | null;

        // 매물은 이미 저장됐다. 3D 투어 파일(수십~수백 MB)은 여기서 기다리지 않고
        // 전역 스토어의 백그라운드 업로드로 넘긴다 — 상단 진행바가 진행률을 보여주고,
        // 완료되면 자산이 생겨 TourActionBell이 이어받는다(실패는 진행바 에러 + 벨 FAILED로 커버).
        let splatIntakeNote = "";
        if (savedListing?.id && tourSourceFile) {
          startTourUpload({
            listingId: savedListing.id,
            title: ownerForm.title,
            address: [ownerForm.address, detailAddress].filter(Boolean).join(" "),
            file: tourSourceFile
          });
          splatIntakeNote = "3D 투어 업로드는 백그라운드에서 계속됩니다 — 상단 진행바에서 확인할 수 있어요.";
        }

        // 등록 성공 → 작성 칸·첨부·3D 상태를 초기화해 다음 매물에 이전 내용이 남지 않게 한다.
        // (파일 참조는 백그라운드 업로드 스토어가 붙잡으므로 여기서 비워도 전송은 계속된다.)
        setOwnerForm(emptyOwnerForm);
        setPhotoFiles([]);
        setPhotoCount(0);
        setTourSourceFile(null);
        if (tourSourceInputRef.current) tourSourceInputRef.current.value = "";
        setHas3DRoom(false);
        setGeoCoords(null);
        void clearOwnerPhotos();
        if (typeof window !== "undefined") window.localStorage.removeItem(LISTING_FLOOR_PLAN_STORAGE_KEY);
        setRegistrationStatus("노출중");
        const listingSuccessMessage = "매물이 등록됐습니다. 지금부터 홈 피드에 노출되고, 문의가 오면 채팅으로 이어집니다.";
        // 등록 성공과 투어 접수 결과를 하나의 팝업 메시지로 합친다.
        setSubmitResult({
          ok: true,
          message: splatIntakeNote ? `${listingSuccessMessage} ${splatIntakeNote}` : listingSuccessMessage
        });
      } catch {
        setSubmitResult({ ok: false, message: "매물 등록에 실패했습니다. 네트워크를 확인해 주세요." });
      } finally {
        isSubmittingListingRef.current = false;
        setIsSubmittingListing(false);
      }
    })();
  };
  const ownerPriceLabel = ownerForm.tradeType === "전세"
    ? `전세 ${ownerForm.jeonse || "0"}만원`
    : `${ownerForm.tradeType} ${ownerForm.deposit || "0"}/${ownerForm.monthly || "0"}`;

  return (
    <section className="screen owner-screen" id="my-page" aria-labelledby="owner-registration-title">
      {ownerToast ? <p className="mypage-toast" role="status">{ownerToast}</p> : null}

      <form className="owner-form" id="owner-registration-form">
        {editListingId ? (
          <section className="owner-card" aria-label="3D 재작업">
            <div className="form-heading">
              <div>
                <span>3D 재작업</span>
                <h3>이 매물의 3D 투어</h3>
              </div>
            </div>

            {editTourAsset && editTourAsset.status === "FAILED" ? (
              <>
                <p role="status">
                  <CircleAlert size={16} aria-hidden="true" /> 지난 3D 투어 제작이 실패했습니다. 저장된 원본으로 다시 시도하거나, 다른 파일로 올려 재제작할 수 있어요.
                </p>
                <div className="summary-media-actions">
                  <button
                    type="button"
                    className="summary-media-btn"
                    onClick={() => void handleRequeueSameSource()}
                    disabled={isRequeuing}
                    aria-busy={isRequeuing}
                  >
                    {isRequeuing ? <span className="btn-spinner" aria-hidden="true" /> : <Video size={16} strokeWidth={2.2} aria-hidden="true" />}
                    다시 시도
                  </button>
                  <label className="summary-media-btn summary-media-btn--ghost">
                    <Video size={16} strokeWidth={2.2} aria-hidden="true" />
                    다른 파일로 올리기
                    <input
                      ref={editTourFileInputRef}
                      type="file"
                      accept="video/*,.spz,.zip"
                      aria-label="다른 파일로 3D 재제작"
                      disabled={isRequeuing}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void handleRequeueWithFile(file);
                      }}
                    />
                  </label>
                </div>
              </>
            ) : editTourAsset && editTourAsset.status === "PROCESSING" ? (
              <p role="status">
                <span className="btn-spinner" aria-hidden="true" /> 3D 투어를 제작하는 중입니다. 완료되면 상단 알림으로 알려드릴게요.
              </p>
            ) : editTourAsset ? (
              <p role="status">이 매물의 3D 투어는 재작업이 필요하지 않습니다.</p>
            ) : (
              <p role="status">이 매물에 접수된 3D 투어 자산이 없습니다.</p>
            )}

            {/* TODO(kjw): 매물 메타데이터(제목·가격·주소·사진) 수정은 이 폼의 create(POST) 흐름과 충돌해 이번엔 보류.
                아래 폼은 새 매물 등록용이며, 이 화면의 목적은 위 3D 재작업이다. 전체 편집은 관리 화면으로 유도한다. */}
            <a className="summary-media-btn summary-media-btn--ghost" href="/manager/listing">
              매물 정보(제목·가격·사진) 전체 수정은 관리 화면에서 →
            </a>
          </section>
        ) : null}

        {/* 두 레인 — 왼쪽 2/3 폼, 오른쪽 1/3 첨부(사진·3D·영상). 900px 이하에서는 세로 스택(owner-lanes CSS). */}
        <div className="owner-lanes">
          <section className="owner-card owner-lane-form">
            <div className="form-heading">
              <div>
                <h3 id="owner-registration-title" className="owner-form-title">매물등록</h3>
              </div>
            </div>

            {/* 1열 기본 — 짝을 이루는 필드(전용면적|층수, 보증금|월세)만 owner-step1-pair로 묶는다.
                owner-group-caption으로 필드 묶음의 의미를 나눈다. */}
            <div className="owner-step1-fields">
              <span className="owner-group-caption">기본 정보</span>
              <label>
                매물명
                <input value={ownerForm.title} onChange={(event) => updateOwnerForm("title", event.target.value)} placeholder="예: 방배 루미에르 402호" />
              </label>
              <label className="owner-w-md">
                건물명 (선택)
                <input
                  value={ownerForm.buildingName}
                  onChange={(event) => updateOwnerForm("buildingName", event.target.value)}
                  placeholder="예: 방배 루미에르"
                />
              </label>

              <span className="owner-group-caption">위치</span>
              <label>
                주소
                <div className="owner-address-row">
                  <input value={ownerForm.address} onChange={(event) => updateOwnerForm("address", event.target.value)} placeholder="도로명 또는 지번 주소" />
                  <button className="owner-address-search-button" type="button" onClick={() => setIsPostcodeSearchOpen(true)}>
                    <Search aria-hidden="true" size={16} />
                    주소 검색
                  </button>
                </div>
              </label>
              <label className="owner-w-md">
                세부주소 (선택)
                <input
                  value={ownerForm.detailAddress}
                  onChange={(event) => updateOwnerForm("detailAddress", event.target.value)}
                  placeholder="예: 402호, A동 1203호"
                />
              </label>

              <span className="owner-group-caption">공간</span>
              <label className="owner-w-md">
                매물유형
                {/* 홈 카테고리(원룸·투룸 등)와 같은 목록 — 등록값이 카테고리 필터·카운트에 그대로 잡힌다 */}
                <select value={ownerForm.roomType} onChange={(event) => updateOwnerForm("roomType", event.target.value)}>
                  {listingRoomTypes.map((roomType) => (
                    <option key={roomType}>{roomType}</option>
                  ))}
                </select>
              </label>
              <div className="owner-step1-pair">
                <label>
                  전용면적
                  <div className="owner-input-suffix">
                    <input inputMode="decimal" value={ownerForm.area} onChange={(event) => updateOwnerForm("area", event.target.value)} placeholder="예: 24.5" />
                    <span aria-hidden="true">m²</span>
                  </div>
                </label>
                <label>
                  층수 (선택)
                  <input value={ownerForm.floor} onChange={(event) => updateOwnerForm("floor", event.target.value)} placeholder="예: 4층 / 16층" />
                </label>
              </div>

              <span className="owner-group-caption">거래 조건</span>
              <label className="owner-w-md">
                거래유형
                <select value={ownerForm.tradeType} onChange={(event) => updateOwnerForm("tradeType", event.target.value)}>
                  <option>월세</option>
                  <option>반전세</option>
                  <option>전세</option>
                  <option>매매</option>
                </select>
              </label>

              {/* 가격 필드 — 거래유형에 따라 표시만 분기(제출 페이로드는 submitOwnerListing 그대로,
                  숨긴 필드의 상태값도 유지된다). 매매는 전용 가격 필드가 없고 submitOwnerListing이
                  deposit 값을 그대로 매매가로 보내므로, deposit 인풋을 "매매가" 라벨로 재사용한다. */}
              {ownerForm.tradeType === "전세" ? (
                <label className="owner-w-sm">
                  전세금
                  <div className="owner-input-suffix">
                    <input inputMode="numeric" value={ownerForm.jeonse} onChange={(event) => updateOwnerForm("jeonse", event.target.value)} placeholder="예: 30000" />
                    <span aria-hidden="true">만원</span>
                  </div>
                </label>
              ) : ownerForm.tradeType === "매매" ? (
                <label className="owner-w-sm">
                  매매가
                  <div className="owner-input-suffix">
                    <input inputMode="numeric" value={ownerForm.deposit} onChange={(event) => updateOwnerForm("deposit", event.target.value)} placeholder="예: 50000" />
                    <span aria-hidden="true">만원</span>
                  </div>
                </label>
              ) : (
                <div className="owner-step1-pair">
                  <label>
                    보증금
                    <div className="owner-input-suffix">
                      <input inputMode="numeric" value={ownerForm.deposit} onChange={(event) => updateOwnerForm("deposit", event.target.value)} placeholder="예: 1000" />
                      <span aria-hidden="true">만원</span>
                    </div>
                  </label>
                  <label>
                    월세
                    <div className="owner-input-suffix">
                      <input inputMode="numeric" value={ownerForm.monthly} onChange={(event) => updateOwnerForm("monthly", event.target.value)} placeholder="예: 50" />
                      <span aria-hidden="true">만원</span>
                    </div>
                  </label>
                </div>
              )}
              <label className="owner-w-sm">
                관리비 (선택)
                <div className="owner-input-suffix">
                  <input inputMode="numeric" value={ownerForm.maintenance} onChange={(event) => updateOwnerForm("maintenance", event.target.value)} placeholder="예: 5" />
                  <span aria-hidden="true">만원</span>
                </div>
              </label>
              <label className="owner-w-sm">
                입주가능일 (선택)
                {/* QA: 자유 텍스트 대신 달력에서 선택 — 기존 초안의 비날짜 값("즉시" 등)은 빈 값으로 보이지만 지우지 않는다 */}
                <input
                  type="date"
                  value={ownerForm.moveIn}
                  onChange={(event) => updateOwnerForm("moveIn", event.target.value)}
                  aria-label="입주가능일 달력 선택"
                />
              </label>

              {/* 옵션 — 여기서 고른 항목이 매물 상세의 "옵션 정보"에 그대로 노출된다 */}
              <span className="owner-group-caption">옵션 (선택)</span>
              <div className="owner-option-chip-grid" role="group" aria-label="옵션 선택">
                {optionItems.map((option) => {
                  const selected = ownerForm.options.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      className={selected ? "selected" : undefined}
                      aria-pressed={selected}
                      onClick={() => toggleOwnerOption(option)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="owner-card owner-lane-attach" aria-label="사진·3D 자료">
            <div className="form-heading">
              <div>
                <h3>사진·3D 자료</h3>
              </div>
            </div>

            {/* 폼 레인의 owner-group-caption을 재사용 — 첫 캡션(사진)은 :first-child가 아니라서
                (form-heading이 먼저 온다) --first modifier로 border/margin을 따로 리셋한다. */}
            <span className="owner-group-caption owner-group-caption--first">사진</span>
            {/* 사진 패널 — 빈 상태는 패널 자체가 클릭+드롭 액션존(label이 hidden input을 감싼다).
                사진이 있으면 미리보기(prev/next/count)+썸네일 그리드로 바뀌고, 이때만 "사진 추가" 버튼이 뜬다.
                드롭은 상태와 무관하게 항상 동작(있어도 병합) — 핸들러가 패널 자체에 붙어 있다. */}
            <div className="summary-media-col">
              <figure
                className={`summary-media-card summary-media-photos${photoPreviewUrls.length > 0 ? "" : " is-empty"}${isPhotoDragOver ? " is-dragover" : ""}`}
                aria-label="등록한 사진 미리보기"
                onDragOver={handlePhotoDragOver}
                onDragLeave={handlePhotoDragLeave}
                onDrop={handlePhotoDrop}
              >
                {photoPreviewUrls.length > 0 ? (
                  <>
                    {/* objectURL 미리보기 — next/image 최적화 대상이 아니라 일반 img를 쓴다 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreviewUrls[Math.min(photoIndex, photoPreviewUrls.length - 1)]}
                      alt={`매물 사진 ${Math.min(photoIndex, photoPreviewUrls.length - 1) + 1}`}
                    />
                    {photoPreviewUrls.length > 1 ? (
                      <>
                        <button
                          type="button"
                          className="summary-media-nav prev"
                          aria-label="이전 사진"
                          onClick={() => setPhotoIndex((index) => (index - 1 + photoPreviewUrls.length) % photoPreviewUrls.length)}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="summary-media-nav next"
                          aria-label="다음 사진"
                          onClick={() => setPhotoIndex((index) => (index + 1) % photoPreviewUrls.length)}
                        >
                          ›
                        </button>
                        <span className="summary-media-count">
                          {Math.min(photoIndex, photoPreviewUrls.length - 1) + 1} / {photoPreviewUrls.length}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <label className="summary-media-empty summary-media-drop-trigger">
                    <Camera size={22} aria-hidden="true" />
                    <span>사진을 끌어다 놓거나 눌러서 올려요</span>
                    <input type="file" multiple accept="image/*" aria-label="사진 업로드" onChange={handlePhotoInputChange} />
                  </label>
                )}
              </figure>

              {photoPreviewUrls.length > 0 ? (
                <div className="upload-preview-grid" aria-label="선택한 사진 미리보기">
                  {photoPreviewUrls.map((url, index) => (
                    <figure key={url}>
                      {/* objectURL 미리보기 — next/image 최적화 대상이 아니라 일반 img를 쓴다 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`선택한 사진 ${index + 1}`} />
                      {index === 0 ? <figcaption>대표 사진</figcaption> : null}
                      <button type="button" aria-label={`사진 ${index + 1} 빼기`} onClick={() => removePhotoAt(index)}>
                        ×
                      </button>
                    </figure>
                  ))}
                </div>
              ) : null}

              {/* 사진이 있을 때만, 목록 아래에서 — 패널이 이미 빈 상태의 업로드 버튼 역할을 하므로 중복 노출하지 않는다 */}
              {photoCount > 0 ? (
                <label className="summary-media-btn">
                  <Camera size={16} strokeWidth={2.2} aria-hidden="true" />
                  {`사진 추가 (${photoCount}장)`}
                  <input type="file" multiple accept="image/*" aria-label="사진 업로드" onChange={handlePhotoInputChange} />
                </label>
              ) : null}
            </div>

            <span className="owner-group-caption">3D 도면</span>
            {/* 3D 패널 — 빈 박스 클릭 자체가 "3D 도면 만들기"(내부 MitUNet 에디터로 같은 탭 이동).
                도면 있는 상태는 오빗 프리뷰라 박스를 클릭요소로 못 감싸서(드래그=카메라 조작),
                박스 아래 작은 "다시 열기" 텍스트 버튼으로 에디터 재진입 경로만 남긴다.
                도면 JSON은 카드 숨은 드롭으로만 지원(개발자용, dragover 시각 피드백은 일부러 없음). */}
            <div className="summary-media-col">
              <div
                className={`summary-media-card summary-media-3d${floorPlan3D ? " is-listing-preview" : " is-empty"}`}
                aria-label="3D 도면 미리보기"
                onClick={floorPlan3D ? handlePreviewCardClick : undefined}
                onDragOver={handleFloorPlanJsonDragOver}
                onDrop={handleFloorPlanJsonDrop}
                onKeyDown={(event) => {
                  if (!floorPlan3D || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  openMitunetEditor();
                }}
                onPointerDown={handlePreviewCardPointerDown}
                onPointerMove={handlePreviewCardPointerMove}
                role={floorPlan3D ? "button" : undefined}
                tabIndex={floorPlan3D ? 0 : undefined}
              >
                {floorPlan3D ? (
                  <FloorPlan3DPreview
                    controlsEnabled
                    fitDistanceScale={0.9}
                    frameloop="always"
                    furnitureData={floorPlan3D.furnitures as unknown as PlacedFurniture[]}
                    hideHint
                    listingPreview
                    mitunetPlan={floorPlan3D.mitunet}
                    pendingFurniture={null}
                    previewFit
                    selectedFurnitureId={null}
                    selectedWallId={null}
                    wallsData={floorPlan3D.walls3D as unknown as WheretoputWall3D[]}
                    onFloorPointerDown={() => {}}
                    onFurniturePointerDown={() => {}}
                    onWallPointerDown={() => {}}
                  />
                ) : (
                  // 빈 박스 = 진입 버튼. openMitunetEditor가 폼 draft(localStorage)·사진(IndexedDB)을
                  // 저장하고 같은 탭에서 내부 MitUNet 에디터로 이동하므로 새 탭이 필요 없다.
                  <button type="button" className="summary-media-empty" onClick={openMitunetEditor}>
                    <Box size={22} aria-hidden="true" />
                    <span>눌러서 3D 도면을 만들어요 ↗</span>
                  </button>
                )}
              </div>

              {/* floorPlan3D 기준(has3DRoom이 아니라) — 박스가 실제로 프리뷰를 그리고 있을 때만 재진입 버튼을 보여줘야
                  "복원 시 has3DRoom은 true인데 스냅샷이 없어 박스는 빈 상태"인 경우 버튼·빈 상태 안내가 동시에 뜨는 걸 막는다. */}
              {floorPlan3D ? (
                <button
                  type="button"
                  className="summary-media-json-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    openMitunetEditor();
                  }}
                >
                  <Box size={13} strokeWidth={2.2} aria-hidden="true" />
                  다시 열기 ↗
                </button>
              ) : null}
            </div>

            <span className="owner-group-caption">투어 영상</span>
            {/* 영상/스플랫 패널 — upload-tile 문법을 버리고 사진 패널과 같은 카드 문법(클릭+드롭)으로 통일.
                단일 파일이라 드롭 시 첫 유효 파일만 받는다(isAcceptableTourFile). */}
            <div className="summary-media-col" id="owner-tour-intake">
              <label
                className={`summary-media-card summary-media-tour${tourSourceFile ? "" : " is-empty"}${isTourDragOver ? " is-dragover" : ""}`}
                aria-label="영상 또는 스플랫 파일 업로드"
                onDragOver={handleTourDragOver}
                onDragLeave={handleTourDragLeave}
                onDrop={handleTourDrop}
              >
                {tourSourceFile ? (
                  <div className="summary-media-tour-selected">
                    <Video size={20} strokeWidth={2.2} aria-hidden="true" />
                    <span className="summary-media-tour-name">
                      {tourSourceFile.name} · {formatFileSize(tourSourceFile.size)}
                    </span>
                    <span className="summary-media-tour-cta">변경</span>
                  </div>
                ) : (
                  <div className="summary-media-empty">
                    <Video size={22} aria-hidden="true" />
                    <span>3D 투어용 영상·캡처 파일을 끌어다 놓거나 눌러서 올려요</span>
                    <small className="summary-media-hint">zip(권장)·영상은 제작 접수(수 시간 소요) · .spz는 바로 정합</small>
                  </div>
                )}
                <input
                  ref={tourSourceInputRef}
                  type="file"
                  accept="video/*,.spz,.zip"
                  aria-label="영상 또는 스플랫 파일 업로드"
                  onChange={(event) => {
                    setTourSourceFile(event.currentTarget.files?.[0] ?? null);
                    event.currentTarget.value = "";
                    setRegistrationStatus("작성 중");
                  }}
                />
              </label>
            </div>
          </aside>
        </div>

        <p className="owner-submit-note">등록하면 즉시 매물이 노출되고, 문의는 채팅으로 바로 도착합니다.</p>
        <button className="submit-listing" type="button" onClick={submitOwnerListing} disabled={isSubmittingListing} aria-busy={isSubmittingListing}>
          {isSubmittingListing ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              등록 처리 중…
            </>
          ) : (
            "매물 등록하기"
          )}
        </button>
      </form>

      {isPostcodeSearchOpen ? (
        <div className="postcode-sheet-backdrop" role="presentation" onClick={() => setIsPostcodeSearchOpen(false)}>
          <section
            className="postcode-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="postcode-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>주소 검색</span>
                <h2 id="postcode-sheet-title">도로명·지번 주소 찾기</h2>
              </div>
              <button type="button" aria-label="주소 검색 닫기" onClick={() => setIsPostcodeSearchOpen(false)}>
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <div className="postcode-search-frame">
              <div className="postcode-search-embed" ref={postcodeEmbedRef} />
              {postcodeLoadState === "loading" ? (
                <p className="postcode-search-status">주소 검색창을 불러오는 중입니다.</p>
              ) : null}
              {postcodeLoadState === "error" ? (
                <p className="postcode-search-status error">주소 검색창을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {submitResult ? (
        <div className="listing-result-backdrop" role="presentation" onClick={closeSubmitResult}>
          <section
            className={`listing-result-dialog ${submitResult.ok ? "is-success" : "is-error"}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="listing-result-title"
            aria-describedby="listing-result-desc"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="listing-result-icon" aria-hidden="true">
              {submitResult.ok ? <CheckCircle2 size={30} strokeWidth={2.2} /> : <CircleAlert size={30} strokeWidth={2.2} />}
            </span>
            <h2 id="listing-result-title">{submitResult.ok ? "매물 등록 완료" : "매물 등록 실패"}</h2>
            <p id="listing-result-desc">{submitResult.message}</p>
            <button type="button" onClick={closeSubmitResult}>
              {submitResult.ok ? "홈 피드에서 확인하기" : "닫기"}
            </button>
          </section>
        </div>
      ) : null}
    </section>
  );
}
