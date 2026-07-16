"use client";

// 내놓은 집(임대인) 등록 폼 — 사진 업로드, 3D 도면 연결, 매물 등록.
// 역할 흐름 분리(3단계)로 HomeApp에서 추출(동작 불변).
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Box, Braces, Camera, CheckCircle2, CircleAlert, Search, Video, X } from "lucide-react";
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
  formatDraftSavedAt,
  initialOwnerListings,
  parseOwnerDraft,
  serializeOwnerDraft
} from "@/lib/owner-draft";
import { intakeSplatAsset } from "@/lib/splat-asset-api";
import { listingRoomTypes, optionItems } from "@/lib/listing-catalog";
import { clearOwnerPhotos, loadOwnerPhotos, saveOwnerPhotos } from "@/lib/owner-photo-store";

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
    if (!parsed || !Array.isArray(parsed.walls3D) || parsed.walls3D.length === 0) return null;
    return { walls3D: parsed.walls3D, furnitures: Array.isArray(parsed.furnitures) ? parsed.furnitures : [], name: parsed.name };
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
    furnitures: snapshot.furnitures
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

    const savedAt = new Date().toISOString();
    window.localStorage.setItem(
      OWNER_DRAFT_STORAGE_KEY,
      serializeOwnerDraft({ ownerForm, photoCount, has3DRoom, registrationStatus, myListings }, savedAt)
    );
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
          description: [
            ownerForm.area ? `전용 ${ownerForm.area}m²` : "",
            ownerForm.floor ? `${ownerForm.floor}층` : "",
            ownerForm.moveIn ? `입주 ${ownerForm.moveIn}` : ""
          ].filter(Boolean).join(" · "),
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

        let splatIntakeNote = "";
        let shouldClearTourSourceFile = true;
        if (savedListing?.id && tourSourceFile) {
          try {
            const asset = await intakeSplatAsset({
              listingId: savedListing.id,
              title: ownerForm.title,
              address: [ownerForm.address, detailAddress].filter(Boolean).join(" "),
              file: tourSourceFile
            });
            splatIntakeNote =
              asset.status === "UPLOADED"
                ? "스플랫 접수 완료 — 정합 대기"
                : "3D 투어 제작이 접수됐습니다";
          } catch {
            shouldClearTourSourceFile = false;
            splatIntakeNote = "매물은 저장됐지만 3D 투어 접수에 실패했습니다. 파일을 다시 선택해 재시도해 주세요.";
          }
        }

        // 등록 성공 → 작성 칸·첨부·3D 상태를 초기화해 다음 매물에 이전 내용이 남지 않게 한다.
        setOwnerForm(emptyOwnerForm);
        setPhotoFiles([]);
        setPhotoCount(0);
        if (shouldClearTourSourceFile) {
          setTourSourceFile(null);
          if (tourSourceInputRef.current) tourSourceInputRef.current.value = "";
        }
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
        <section className="owner-card">
          <div className="form-heading">
            <div>
              <span>STEP 01</span>
              <h3 id="owner-registration-title">내 집 등록</h3>
            </div>
            <strong>임대인 전용</strong>
          </div>

          {draftSavedAt ? (
            <small className="owner-draft-status" role="status">
              임시저장됨 · {formatDraftSavedAt(draftSavedAt)} — 새로고침해도 작성 내용이 유지됩니다.
            </small>
          ) : null}

          {/* 넓은 폭을 활용해 필드를 여러 열로 흘려 세로 높이를 줄인다(데스크톱 3열 / 모바일 2열) */}
          <div className="owner-step1-fields">
            {/* 매물명 · 건물명은 한 행에서 반반(1:1)으로 — 건물명은 관리 화면의 건물별 보기 기준 */}
            <div className="owner-step1-addr-row">
              <label>
                매물명
                <input value={ownerForm.title} onChange={(event) => updateOwnerForm("title", event.target.value)} placeholder="예: 방배 루미에르 402호" />
              </label>

              <label>
                건물명
                <input
                  value={ownerForm.buildingName}
                  onChange={(event) => updateOwnerForm("buildingName", event.target.value)}
                  placeholder="예: 방배 루미에르 (선택)"
                />
              </label>
            </div>

            {/* 주소 · 세부주소는 한 행에서 반반(1:1)으로 */}
            <div className="owner-step1-addr-row">
              <label>
                주소
                <div className="owner-address-row">
                  <button className="owner-address-search-button" type="button" onClick={() => setIsPostcodeSearchOpen(true)}>
                    <Search aria-hidden="true" size={16} />
                    주소 검색
                  </button>
                  <input value={ownerForm.address} onChange={(event) => updateOwnerForm("address", event.target.value)} placeholder="도로명 또는 지번 주소" />
                </div>
              </label>

              <label>
                세부주소
                <input
                  value={ownerForm.detailAddress}
                  onChange={(event) => updateOwnerForm("detailAddress", event.target.value)}
                  placeholder="예: 402호, A동 1203호"
                />
              </label>
            </div>

            <label>
              매물유형
              {/* 홈 카테고리(원룸·투룸 등)와 같은 목록 — 등록값이 카테고리 필터·카운트에 그대로 잡힌다 */}
              <select value={ownerForm.roomType} onChange={(event) => updateOwnerForm("roomType", event.target.value)}>
                {listingRoomTypes.map((roomType) => (
                  <option key={roomType}>{roomType}</option>
                ))}
              </select>
            </label>
            <label>
              거래유형
              <select value={ownerForm.tradeType} onChange={(event) => updateOwnerForm("tradeType", event.target.value)}>
                <option>월세</option>
                <option>전세</option>
                <option>반전세</option>
              </select>
            </label>
            <label>
              입주가능일
              {/* QA: 자유 텍스트 대신 달력에서 선택 — 기존 초안의 비날짜 값("즉시" 등)은 빈 값으로 보이지만 지우지 않는다 */}
              <input
                type="date"
                value={ownerForm.moveIn}
                onChange={(event) => updateOwnerForm("moveIn", event.target.value)}
                aria-label="입주가능일 달력 선택"
              />
            </label>

            <label>
              보증금
              <input inputMode="numeric" value={ownerForm.deposit} onChange={(event) => updateOwnerForm("deposit", event.target.value)} placeholder="만원 단위" />
            </label>
            <label>
              월세
              <input inputMode="numeric" value={ownerForm.monthly} onChange={(event) => updateOwnerForm("monthly", event.target.value)} placeholder="만원 단위" />
            </label>

            <label>
              전세금
              <input inputMode="numeric" value={ownerForm.jeonse} onChange={(event) => updateOwnerForm("jeonse", event.target.value)} placeholder="전세일 때 입력" />
            </label>
            <label>
              관리비
              <input inputMode="numeric" value={ownerForm.maintenance} onChange={(event) => updateOwnerForm("maintenance", event.target.value)} placeholder="만원 단위" />
            </label>

            <label>
              전용면적
              <input inputMode="decimal" value={ownerForm.area} onChange={(event) => updateOwnerForm("area", event.target.value)} placeholder="m²" />
            </label>
            <label>
              층수
              <input value={ownerForm.floor} onChange={(event) => updateOwnerForm("floor", event.target.value)} placeholder="예: 4층 / 16층" />
            </label>

            {/* 옵션 — 여기서 고른 항목이 매물 상세의 "옵션 정보"에 그대로 노출된다 */}
            <div className="owner-step1-wide owner-option-field">
              <span className="owner-option-label">옵션 (선택)</span>
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
          </div>
        </section>

        <section className="owner-card owner-submit-summary" aria-label="사진과 3D방 자료">
          <div className="form-heading">
            <div>
              <span>STEP 02</span>
              <h3>사진과 3D방 자료</h3>
            </div>
          </div>

          <div className="owner-summary-media">
            <div className="summary-media-col">
              <figure className="summary-media-card summary-media-photos" aria-label="등록한 사진 미리보기">
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
                  <div className="summary-media-empty">
                    <Camera size={22} aria-hidden="true" />
                    <span>사진을 추가하면 여기에서 넘겨볼 수 있어요</span>
                  </div>
                )}
              </figure>

              {/* 미리보기 바로 아래에서 사진을 추가한다 */}
              <label className="summary-media-btn">
                <Camera size={16} strokeWidth={2.2} aria-hidden="true" />
                {photoCount > 0 ? `사진 추가 (${photoCount}장)` : "사진 업로드"}
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  aria-label="사진 업로드"
                  onChange={(event) => {
                    const added = event.target.files ? Array.from(event.target.files) : [];
                    // 같은 파일을 다시 고를 수 있도록 인풋 값을 비운다(초기화 안 하면 동일 파일 재선택이 안 먹는다).
                    event.target.value = "";
                    if (added.length === 0) return;
                    // 기존 선택에 덧붙인다 — 다시 고를 때 이전 사진이 사라지지 않도록. 동일 파일은 중복 제거.
                    const fileKey = (file: File) => `${file.name}-${file.size}-${file.lastModified}`;
                    const seen = new Set(photoFiles.map(fileKey));
                    const merged = [...photoFiles, ...added.filter((file) => !seen.has(fileKey(file)))];
                    setPhotoFiles(merged);
                    setPhotoCount(merged.length);
                    setRegistrationStatus("작성 중");
                  }}
                />
              </label>

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
            </div>

            <div className="summary-media-col">
              <div className="summary-media-card summary-media-3d" aria-label="3D 도면 미리보기">
                {floorPlan3D ? (
                  <FloorPlan3DPreview
                    controlsEnabled
                    frameloop="always"
                    furnitureData={floorPlan3D.furnitures as unknown as PlacedFurniture[]}
                    hideHint
                    pendingFurniture={null}
                    selectedFurnitureId={null}
                    selectedWallId={null}
                    wallsData={floorPlan3D.walls3D as unknown as WheretoputWall3D[]}
                    onFloorPointerDown={() => {}}
                    onFurniturePointerDown={() => {}}
                    onWallPointerDown={() => {}}
                  />
                ) : (
                  <div className="summary-media-empty">
                    <Box size={22} aria-hidden="true" />
                    <span>3D 도면을 만들면 여기에서 돌려볼 수 있어요</span>
                  </div>
                )}
              </div>

              {/* 미리보기 아래 2개 버튼 — 도면 만들기(에디터로 이동) / 도면 JSON 업로드 */}
              <div className="summary-media-actions">
                {/* 새 탭으로 연다 — 같은 탭 이동은 폼을 언마운트시켜 선택한 사진(File, 직렬화 불가)이 날아간다.
                    에디터에서 저장 후 이 탭으로 돌아오면 focus/visibilitychange 동기화가 자동 연결한다. */}
                <a
                  className="summary-media-btn"
                  href="/floor-plan-3d"
                  target="_blank"
                  rel="noopener"
                  onClick={() => setRegistrationStatus("작성 중")}
                >
                  <Box size={16} strokeWidth={2.2} aria-hidden="true" />
                  {has3DRoom ? "다시 열기 ↗" : "3D 도면 만들기 ↗"}
                </a>
                <label className="summary-media-btn summary-media-btn--ghost">
                  <Braces size={16} strokeWidth={2.2} aria-hidden="true" />
                  도면 JSON 업로드
                  <input
                    type="file"
                    accept=".json,application/json"
                    aria-label="도면 JSON 업로드"
                    onChange={(event) => {
                      handleFloorPlanJsonUpload(event.currentTarget.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
          <p>등록하면 즉시 매물이 노출되고, 문의는 채팅으로 바로 도착합니다.</p>
        </section>

        <section className="owner-card" id="owner-tour-intake">
          <div className="form-heading">
            <div>
              <span>STEP 03</span>
              <h3>영상·스플랫 접수</h3>
            </div>
          </div>

          <div className="upload-tile-list">
            <label className={tourSourceFile ? "upload-tile is-connected" : "upload-tile"}>
              <span className="upload-tile-icon" aria-hidden="true">
                <Video size={20} strokeWidth={2.2} />
              </span>
              <span className="upload-tile-main">
                <strong>영상/스플랫 접수</strong>
                <span className="upload-tile-desc">캡처앱 zip(권장)이나 영상은 등록 후 3D 투어 제작이 접수됩니다(수 시간 소요). 스캔앱 .spz 파일이면 바로 정합 단계로 갑니다.</span>
                <span className="upload-tile-status">
                  {tourSourceFile ? `${tourSourceFile.name} · ${formatFileSize(tourSourceFile.size)}` : "선택된 파일 없음"}
                </span>
              </span>
              <span className="upload-tile-cta">{tourSourceFile ? "변경" : "파일 선택"}</span>
              <input
                ref={tourSourceInputRef}
                type="file"
                accept="video/*,.spz,.zip"
                aria-label="영상 또는 스플랫 파일 업로드"
                onChange={(event) => {
                  setTourSourceFile(event.currentTarget.files?.[0] ?? null);
                  setRegistrationStatus("작성 중");
                }}
              />
            </label>
          </div>
        </section>

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
