"use client";

// 내놓은 집(임대인) 마이페이지 — 매물 등록/수정, 사진 업로드, 3D 도면 연결, 받은 문의 채팅.
// 역할 흐름 분리(3단계)로 HomeApp에서 추출(동작 불변).
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { naverMapScriptUrl } from "@/app/_components/NaverMapPreview";
import { TradeChatCenter } from "@/app/_components/TradeChatCenter";
import type { ListingFloorPlan3D } from "@/app/_components/ListingTourRoom3D";
import {
  isRemotePhoto,
  tradePriceLabel,
  TRADE_LISTING_NO_PREFIX,
  type TradeListing
} from "@/lib/listing-catalog";
import {
  OWNER_DRAFT_STORAGE_KEY,
  emptyOwnerForm,
  formatDraftSavedAt,
  initialOwnerListings,
  parseOwnerDraft,
  serializeOwnerDraft
} from "@/lib/owner-draft";
import { intakeSplatAsset, listSplatAssetsByListing, type SplatAsset } from "@/lib/splat-asset-api";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  DEMO_COST_QUEUE_SUMMARY,
  DEMO_COSTS,
  DEMO_DISCLOSURE_SETTING,
  DEMO_MONTHLY_SUMMARY,
  DEMO_RECEIPTS
} from "@/lib/demo-cost";
import {
  DEMO_VENDOR_DUPLICATE_CANDIDATES,
  DEMO_VENDOR_JOBS,
  DEMO_VENDOR_PERF,
  DEMO_VENDORS
} from "@/lib/demo-vendor-mgmt";
import { MyFlowBar, type MyFlow } from "./my-shared";

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

const ownerExposureItems = [
  { label: "전달 범위", value: "반경 5km", caption: "인근 중개사 12곳" },
  { label: "예상 검수", value: "2시간", caption: "사진 등록 후 요청" },
  { label: "노출 배지", value: "3D 투어", caption: "3D방 연결 시 표시" }
];

const ownerReviewItems = [
  { label: "기본정보", caption: "주소와 가격 확인" },
  { label: "사진자료", caption: "대표 사진 3장 권장" },
  { label: "3D방", caption: "투어 자료 연결" },
  { label: "중개전달", caption: "반경 5km 우선" }
];

const ownerCostTypeLabels: Record<string, string> = {
  repair: "수리비",
  maintenance: "관리비",
  common: "공용비",
  other: "기타"
};

const ownerCostStatusLabels: Record<string, string> = {
  draft: "검토 대기",
  confirmed: "확정",
  amended: "정정",
  void: "무효"
};

const ownerCostReviewLabels: Record<string, string> = {
  ocr_low_confidence: "OCR 저신뢰",
  classification_unclear: "분류 확인",
  unit_unmatched: "호실 확인"
};

const ownerVendorTradeLabels: Record<string, string> = {
  plumbing: "배관·누수",
  electrical: "전기",
  hvac: "냉난방",
  appliance: "가전",
  locksmith: "도어락",
  waterproofing: "방수",
  cleaning: "청소",
  general: "종합",
  other: "기타"
};

const ownerVendorStatusLabels: Record<string, string> = {
  active: "활성",
  inactive: "비활성",
  closed: "폐업"
};

const formatWon = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

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

export default function LandlordMyPage({ onSelectFlow, onGoHome }: { onSelectFlow: (flow: MyFlow) => void; onGoHome: () => void }) {
  // 입력 칸은 빈 값으로 시작(예시는 placeholder가 담당). 새로고침 유실은 localStorage draft로 방지.
  const [ownerForm, setOwnerForm] = useState(emptyOwnerForm);
  const [photoCount, setPhotoCount] = useState(0);
  // 선택한 실제 파일(등록 시 업로드) — 초안 저장 대상은 아니다(파일은 직렬화 불가).
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  // 선택 즉시 보이는 미리보기 URL — photoFiles가 바뀌면 이전 objectURL은 회수한다.
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [tourSourceFile, setTourSourceFile] = useState<File | null>(null);
  const tourSourceInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const urls = photoFiles.map((file) => URL.createObjectURL(file));
    setPhotoPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photoFiles]);
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
  const [isSubmittingListing, setIsSubmittingListing] = useState(false);
  const isSubmittingListingRef = useRef(false);
  const [activeOwnerPanel, setActiveOwnerPanel] = useState("dashboard");
  // 기능 메뉴는 기본 접힘 — 등록 플로우가 주인공이고, 필요할 때만 상단 "메뉴"로 연다.
  const [isOwnerSidebarOpen, setIsOwnerSidebarOpen] = useState(false);
  const [isCostReviewCleared, setIsCostReviewCleared] = useState(false);
  const [isDisclosureAcknowledged, setIsDisclosureAcknowledged] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState(DEMO_VENDORS[0]?.id ?? "");
  const [isDuplicateResolved, setIsDuplicateResolved] = useState(false);
  const updateOwnerForm = (key: keyof typeof ownerForm, value: string) => {
    setOwnerForm((current) => ({ ...current, [key]: value }));
    setRegistrationStatus("작성 중");
  };

  // 내가 서버에 등록한 실제 매물 — 수정/내리기의 대상. null = 아직 조회 전.
  const [serverListings, setServerListings] = useState<TradeListing[] | null>(null);
  const [latestSplatAssetByListing, setLatestSplatAssetByListing] = useState<Record<string, SplatAsset | null>>({});
  // 수정 모드: 등록 폼을 재사용해 이 id의 매물을 PATCH 한다.
  const [editingListingId, setEditingListingId] = useState<string | null>(null);

  const loadMyServerListings = async () => {
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      // 비로그인 → null(데모 폴백 유지). 로그인 → 실제 배열(0개면 빈 상태). 이 구분이 삭제/수정 진실을 결정한다.
      if (!meRes.ok) {
        setServerListings(null);
        return;
      }
      const me = (await meRes.json()) as { userId?: string };
      if (!me.userId) {
        setServerListings(null);
        return;
      }
      const res = await fetch("/api/trade/listings", { cache: "no-store" });
      if (!res.ok) return;
      const all = (await res.json()) as TradeListing[];
      setServerListings(all.filter((listing) => listing.ownerId === me.userId));
    } catch {
      // 네트워크 일시 오류 — 다음 갱신에서 복구
    }
  };

  useEffect(() => {
    void loadMyServerListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회 조회
  }, []);

  useEffect(() => {
    if (serverListings === null || serverListings.length === 0) {
      setLatestSplatAssetByListing({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      serverListings.map(async (listing) => {
        try {
          const assets = await listSplatAssetsByListing(listing.id);
          return [listing.id, assets[0] ?? null] as const;
        } catch {
          return [listing.id, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setLatestSplatAssetByListing(Object.fromEntries(entries) as Record<string, SplatAsset | null>);
    });

    return () => {
      cancelled = true;
    };
  }, [serverListings]);

  /** 수정 시작 — 매물 값을 등록 폼에 채우고 폼으로 스크롤한다. */
  const startEditListing = (listing: TradeListing) => {
    setEditingListingId(listing.id);
    setOwnerForm((current) => ({
      ...current,
      title: listing.title,
      address: listing.location === "위치 미입력" ? "" : listing.location,
      tradeType: listing.tradeType,
      deposit: listing.tradeType === "전세" ? current.deposit : String(listing.depositManwon || ""),
      jeonse: listing.tradeType === "전세" ? String(listing.depositManwon || "") : current.jeonse,
      monthly: String(listing.monthlyRentManwon || "")
    }));
    setOwnerToast(`'${listing.title}' 수정 중 — 아래 폼을 고친 뒤 저장을 누르세요.`);
    continueOwnerRegistration();
  };

  const cancelEditListing = () => {
    setEditingListingId(null);
    setOwnerToast("수정을 취소했습니다.");
  };

  /** 매물 내리기 — 홈 피드에서 즉시 사라진다(문의 대화 기록은 유지). */
  const deleteServerListing = async (listing: TradeListing) => {
    if (!window.confirm(`'${listing.title}' 매물을 내릴까요? 홈 피드에서 바로 사라집니다.`)) return;
    try {
      const res = await fetch(`/api/trade/listings/${listing.id}`, { method: "DELETE" });
      if (!res.ok) {
        setOwnerToast("매물 내리기에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (editingListingId === listing.id) setEditingListingId(null);
      setOwnerToast(`'${listing.title}' 매물을 내렸습니다.`);
      void loadMyServerListings();
    } catch {
      setOwnerToast("매물 내리기에 실패했습니다. 네트워크를 확인해 주세요.");
    }
  };

  const renderSplatTourChip = (listingId: string) => {
    const asset = latestSplatAssetByListing[listingId];
    if (!asset) return null;

    const chipStyle: CSSProperties = {
      minHeight: 30,
      padding: "0 10px",
      borderRadius: 999,
      border: "1px solid var(--line)",
      background: "var(--surface)",
      color: "var(--ink)",
      fontSize: "0.72rem",
      fontWeight: 900,
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center"
    };

    if (asset.status === "UPLOADED") {
      return (
        <Link href={`/splat-tour/register?asset=${encodeURIComponent(asset.id)}`} style={chipStyle}>
          정합하기
        </Link>
      );
    }
    if (asset.status === "REGISTERED") {
      return (
        <Link href={`/splat-tour?asset=${encodeURIComponent(asset.id)}`} style={chipStyle}>
          3D 투어 보기
        </Link>
      );
    }
    if (asset.status === "FAILED") return <em>3D 투어 제작 실패</em>;
    return <em>3D 투어 제작 중</em>;
  };

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
      setPhotoCount(draft.photoCount);
      setHas3DRoom(draft.has3DRoom);
      setRegistrationStatus(draft.registrationStatus);
      setMyListings(draft.myListings);
      setDraftSavedAt(draft.savedAt);
    }

    // 도면 에디터에서 실제로 3D를 만들고 돌아왔는지는 스냅샷 존재로 판단한다(클릭만으론 연결로 치지 않음).
    if (readListingFloorPlanSnapshot()) setHas3DRoom(true);

    setIsDraftLoaded(true);
  }, []);

  // 에디터 탭에서 3D를 만들고 이 탭으로 돌아오면 "3D방 연결" 상태를 즉시 반영한다.
  useEffect(() => {
    const syncFloorPlanConnection = () => {
      if (document.visibilityState === "visible" && readListingFloorPlanSnapshot()) setHas3DRoom(true);
    };
    window.addEventListener("visibilitychange", syncFloorPlanConnection);
    window.addEventListener("focus", syncFloorPlanConnection);
    return () => {
      window.removeEventListener("visibilitychange", syncFloorPlanConnection);
      window.removeEventListener("focus", syncFloorPlanConnection);
    };
  }, []);

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
            setOwnerToast("매물을 등록하려면 WOOZU 계정 로그인이 필요합니다.");
            return;
          }
          if (uploadRes.ok) {
            const uploaded = (await uploadRes.json()) as { images?: string[] };
            images = Array.isArray(uploaded.images) ? uploaded.images : [];
          } else {
            setOwnerToast("사진 업로드에 실패했습니다. 사진 없이 등록하거나 잠시 후 다시 시도해 주세요.");
            return;
          }
        }

        // 2) 등록 또는 수정 — 사진 URL과 지오코딩 좌표를 함께 저장한다.
        //    수정(PATCH)일 때 새 사진이 없으면 images를 보내지 않아 기존 사진을 유지한다.
        const isEditing = Boolean(editingListingId);
        const payload: Record<string, unknown> = {
          title: ownerForm.title,
          roomType: "원룸",
          tradeType: ownerForm.tradeType,
          depositManwon: Number(ownerForm.tradeType === "전세" ? ownerForm.jeonse : ownerForm.deposit) || 0,
          monthlyRentManwon: Number(ownerForm.monthly) || 0,
          location: ownerForm.address || "위치 미입력",
          description: [
            ownerForm.area ? `전용 ${ownerForm.area}m²` : "",
            ownerForm.floor ? `${ownerForm.floor}층` : "",
            ownerForm.moveIn ? `입주 ${ownerForm.moveIn}` : ""
          ].filter(Boolean).join(" · "),
          lat: geoCoords?.lat,
          lng: geoCoords?.lng
        };
        if (!isEditing || images.length > 0) payload.images = images;
        // 3D방 연결 상태이고 에디터 스냅샷이 있으면 매물에 도면을 실어 보낸다 → 상세 "3D 보기"에서 실제 렌더.
        const floorPlanSnapshot = has3DRoom ? readListingFloorPlanSnapshot() : null;
        if (floorPlanSnapshot) payload.floorPlan = floorPlanSnapshot;

        const response = await fetch(
          isEditing ? `/api/trade/listings/${editingListingId}` : "/api/trade/listings",
          {
            method: isEditing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }
        );

        if (response.status === 401) {
          setOwnerToast("매물을 등록하려면 WOOZU 계정 로그인이 필요합니다.");
          return;
        }
        if (!response.ok) {
          setOwnerToast(isEditing ? "매물 수정에 실패했습니다. 잠시 후 다시 시도해 주세요." : "매물 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }

        // 서버가 돌려준 매물을 즉시 목록에 반영 — 뒤의 재조회가 늦거나 캐시돼도 "내 매물"에 바로 보인다.
        const savedListing = (await response.json().catch(() => null)) as TradeListing | null;
        if (savedListing?.id) {
          setServerListings((current) => {
            const base = current ?? [];
            return isEditing
              ? base.map((item) => (item.id === savedListing.id ? savedListing : item))
              : [savedListing, ...base.filter((item) => item.id !== savedListing.id)];
          });
        }

        let splatIntakeToast = "";
        let shouldClearTourSourceFile = true;
        if (savedListing?.id && tourSourceFile) {
          const latestAsset = latestSplatAssetByListing[savedListing.id] ?? null;
          const shouldIntakeSplat = !isEditing || !latestAsset || latestAsset.status === "FAILED";

          if (shouldIntakeSplat) {
            try {
              const asset = await intakeSplatAsset({
                listingId: savedListing.id,
                title: ownerForm.title,
                address: ownerForm.address,
                file: tourSourceFile
              });
              setLatestSplatAssetByListing((current) => ({ ...current, [savedListing.id]: asset }));
              splatIntakeToast =
                asset.status === "UPLOADED"
                  ? "스플랫 접수 완료 — 정합 대기"
                  : "3D 투어 제작이 접수됐습니다";
            } catch {
              shouldClearTourSourceFile = false;
              splatIntakeToast = "매물은 저장됐지만 3D 투어 접수에 실패했습니다. 매물 수정에서 같은 파일로 다시 접수할 수 있습니다.";
            }
          } else {
            splatIntakeToast = "이미 3D 자산이 있는 매물입니다 — 기존 자산을 유지합니다";
          }
        }

        // 등록/수정 성공 → 작성 칸·첨부·3D 상태를 초기화해 다음 매물에 이전 내용이 남지 않게 한다.
        //   (로컬 그림자 목록은 만들지 않는다 — 내 매물은 항상 서버 진실(serverListings)만 보여준다.)
        setOwnerForm(emptyOwnerForm);
        setPhotoFiles([]);
        setPhotoCount(0);
        if (shouldClearTourSourceFile) {
          setTourSourceFile(null);
          if (tourSourceInputRef.current) tourSourceInputRef.current.value = "";
        }
        setHas3DRoom(false);
        setGeoCoords(null);
        if (typeof window !== "undefined") window.localStorage.removeItem(LISTING_FLOOR_PLAN_STORAGE_KEY);
        setRegistrationStatus("노출중");
        const listingSuccessToast = isEditing
          ? "매물이 수정됐습니다. 내 매물과 홈 피드에 바로 반영됩니다."
          : "매물이 등록됐습니다. 지금부터 홈 피드에 노출되고, 문의가 오면 여기 채팅으로 이어집니다.";
        // 등록 성공과 투어 접수 결과가 연속으로 덮어쓰기 되지 않게 하나의 토스트로 합친다.
        if (isEditing) {
          setEditingListingId(null);
        }
        setOwnerToast(splatIntakeToast ? `${listingSuccessToast} ${splatIntakeToast}` : listingSuccessToast);
        await loadMyServerListings();
      } catch {
        setOwnerToast("매물 등록에 실패했습니다. 네트워크를 확인해 주세요.");
      } finally {
        isSubmittingListingRef.current = false;
        setIsSubmittingListing(false);
      }
    })();
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };
  const continueOwnerRegistration = () => {
    const scrollToOwnerForm = () => {
      const form = document.getElementById("owner-registration-form");

      if (!form) {
        return;
      }

      window.scrollTo({
        top: form.getBoundingClientRect().top + window.scrollY - 12,
        left: 0,
        behavior: "auto"
      });
    };

    scrollToOwnerForm();
    requestAnimationFrame(scrollToOwnerForm);
    window.setTimeout(scrollToOwnerForm, 160);
    window.setTimeout(scrollToOwnerForm, 360);
  };
  const ownerPriceLabel = ownerForm.tradeType === "전세"
    ? `전세 ${ownerForm.jeonse || "0"}만원`
    : `${ownerForm.tradeType} ${ownerForm.deposit || "0"}/${ownerForm.monthly || "0"}`;
  const ownerCompletionRate = photoCount >= 3 && has3DRoom ? 92 : 68;
  const confirmedOwnerCosts = DEMO_COSTS.filter((cost) => cost.status === "confirmed" || cost.status === "amended");
  const ownerCostReviewItems = DEMO_COSTS.filter((cost) => cost.status === "draft" && cost.reviewReason);
  const ownerPendingCostReviews = isCostReviewCleared ? 0 : DEMO_COST_QUEUE_SUMMARY.total;
  const ownerPrivateDisclosureCount = isDisclosureAcknowledged ? 0 : DEMO_DISCLOSURE_SETTING.hiddenCount;
  const ownerReceiptEvidenceCount = DEMO_RECEIPTS.filter((receipt) => receipt.hasEvidence).length;
  const selectedVendor = DEMO_VENDORS.find((vendor) => vendor.id === selectedVendorId) ?? DEMO_VENDORS[0];
  const selectedVendorPerf = selectedVendor
    ? DEMO_VENDOR_PERF.find((perf) => perf.vendorId === selectedVendor.id)
    : undefined;
  const selectedVendorJobs = selectedVendor
    ? DEMO_VENDOR_JOBS.filter((job) => job.vendorId === selectedVendor.id)
    : [];
  const ownerOpenDuplicateCount = isDuplicateResolved ? 0 : DEMO_VENDOR_DUPLICATE_CANDIDATES.length;
  const ownerVendorRatingLabel = selectedVendorPerf?.ratingVisible && selectedVendorPerf.satisfactionAvg
    ? `${selectedVendorPerf.satisfactionAvg.toFixed(1)}점`
    : `거래 ${selectedVendorPerf?.completedCount ?? selectedVendor?.dealCount ?? 0}건`;
  const ownerDashboardTabs = [
    { id: "dashboard", label: "대시보드", note: "현재 페이지" },
    { id: "contract-dashboard", label: "검토 대시보드", note: "계약" },
    { id: "contract-ocr", label: "OCR 검토", note: "계약" },
    { id: "contract-register", label: "계약서 등록", note: "계약" },
    { id: "contract-timeline", label: "호실·타임라인", note: "계약" },
    { id: "contract-invite", label: "임차인 초대", note: "계약" },
    { id: "contract-storage", label: "보관·삭제", note: "계약" },
    { id: "cost-ledger", label: "원장/큐", note: "비용" },
    { id: "cost-receipt", label: "영수증 첨부", note: "비용" },
    { id: "cost-ocr", label: "OCR 검토", note: "비용" },
    { id: "cost-detail", label: "비용 상세", note: "비용" },
    { id: "cost-disclosure", label: "공개 관리", note: "비용" },
    { id: "vendor-address", label: "주소록", note: "업체" },
    { id: "vendor-detail", label: "상세", note: "업체" },
    { id: "vendor-performance", label: "성과", note: "업체" },
    { id: "vendor-edit", label: "등록/편집", note: "업체" }
  ];
  const activeOwnerTab = ownerDashboardTabs.find((tab) => tab.id === activeOwnerPanel) ?? ownerDashboardTabs[0];
  const activeOwnerDomain = activeOwnerPanel.split("-")[0];
  const ownerContractStats = [
    { label: "검토 대기", value: "2건", note: "임차인·관리자 업로드 유입" },
    { label: "확인 필요", value: "3개", note: "OCR 원문 대조 필요" },
    { label: "SLA 초과", value: "1건", note: "장기 미확정 출구 표시" }
  ];
  const ownerContractRows = [
    { status: "검토 전 참고문", title: "연남 스테이 302호 · Alex Kim", caption: "계약일 2026년 3월 1일 · 확인필요 3" },
    { status: "미등록 호실", title: "성수 하우스 405호 · Linh Tran", caption: "관리자 수동값 · 확인필요 0" }
  ];

  return (
    <section className="screen owner-screen" id="my-page" aria-labelledby="owner-title">
      <MyFlowBar
        activeFlow="listing"
        onSelectFlow={onSelectFlow}
        menuSlot={
          <button
            className="owner-sidebar-toggle"
            type="button"
            aria-expanded={isOwnerSidebarOpen}
            title={isOwnerSidebarOpen ? "기능 메뉴 접기" : "기능 메뉴 펼치기"}
            onClick={() => setIsOwnerSidebarOpen((open) => !open)}
          >
            {isOwnerSidebarOpen
              ? <PanelLeftClose size={16} strokeWidth={2.4} aria-hidden="true" />
              : <PanelLeftOpen size={16} strokeWidth={2.4} aria-hidden="true" />}
            <strong>메뉴</strong>
          </button>
        }
      />

      <div className={`owner-dashboard-layout${isOwnerSidebarOpen ? "" : " sidebar-collapsed"}`}>
        {isOwnerSidebarOpen ? (
          <nav className="owner-dashboard-sidebar" aria-label="집주인 대시보드 기능 탭">
            {ownerDashboardTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-current={tab.id === activeOwnerPanel ? "page" : undefined}
                onClick={() => setActiveOwnerPanel(tab.id)}
              >
                <span>{tab.note}</span>
                <strong>{tab.label}</strong>
              </button>
            ))}
          </nav>
        ) : null}

        <div className="owner-dashboard-content">
          {activeOwnerPanel === "dashboard" ? (
            <>
      <div className="owner-hero" id="owner-dashboard-top">
        <div>
          <p className="brand-kicker">매물 관리</p>
          <h2 id="owner-title">집주인 마이페이지</h2>
          <p>사진, 가격, 3D 방 자료를 한 번에 정리해 매물 등록을 진행합니다.</p>
        </div>
        <button className="mypage-main-button" type="button" onClick={onGoHome}>
          메인으로
        </button>
      </div>

      {ownerToast ? <p className="mypage-toast" role="status">{ownerToast}</p> : null}

      <section className="owner-status-board" aria-label="등록 매물 현황">
        <article>
          <span>등록 상태</span>
          <strong>{registrationStatus}</strong>
          <p>사진 {photoCount}장 · 3D방 {has3DRoom ? "연결됨" : "미등록"}</p>
        </article>
        <article>
          <span>검수 상태</span>
          <strong>
            {registrationStatus === "검수 대기"
              ? "실매물 확인 요청"
              : registrationStatus === "노출중"
                ? "확인 완료 · 노출중"
                : "실매물 확인 전"}
          </strong>
          <p>{ownerForm.address} · {ownerPriceLabel}</p>
        </article>
      </section>

      <section className="owner-my-listings" aria-label="내 등록 매물">
        <div className="owner-my-listings-head">
          <strong>내 매물 {serverListings ? serverListings.length : myListings.length}개</strong>
          <span>수정·내리기는 즉시 반영</span>
        </div>
        {serverListings !== null ? (
          // 로그인 상태 — 서버 진실만 보여준다. 삭제하면 여기서 즉시·영구히 사라진다(데모 폴백으로 되살아나지 않음).
          serverListings.length > 0 ? (
            serverListings.map((listing) => (
              <article key={listing.id}>
                <div>
                  <strong>{listing.title}{editingListingId === listing.id ? " · 수정 중" : ""}</strong>
                  <small>{tradePriceLabel(listing)} · {listing.location}</small>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                  {renderSplatTourChip(listing.id)}
                  <em className={listing.status === "노출중" ? "live" : ""}>{listing.status}</em>
                  <button
                    type="button"
                    onClick={() => (editingListingId === listing.id ? cancelEditListing() : startEditListing(listing))}
                    style={{ minHeight: 30, padding: "0 10px", borderRadius: 999, border: "1px solid var(--line)", background: "#ffffff", color: "var(--ink)", fontSize: "0.72rem", fontWeight: 900 }}
                  >
                    {editingListingId === listing.id ? "수정 취소" : "수정"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteServerListing(listing)}
                    style={{ minHeight: 30, padding: "0 10px", borderRadius: 999, border: "1px solid #f1c8c8", background: "#fff6f6", color: "#c03535", fontSize: "0.72rem", fontWeight: 900 }}
                  >
                    내리기
                  </button>
                </div>
              </article>
            ))
          ) : (
            <article className="owner-my-listings-empty">
              <div>
                <strong>아직 등록한 매물이 없어요</strong>
                <small>위에서 매물을 등록하면 여기서 수정·내리기를 할 수 있어요.</small>
              </div>
            </article>
          )
        ) : (
          // 비로그인/첫 방문 — 데모 쇼케이스 목록(관리 불가)
          myListings.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <small>{item.price} · {item.caption}</small>
              </div>
              <em className={item.status === "노출중" ? "live" : ""}>{item.status}</em>
            </article>
          ))
        )}
      </section>

      {/* 내 매물로 들어온 구매 문의 — 문의센터(구매자 쪽)와 같은 스레드를 집주인 시점에서 본다 */}
      <section aria-label="받은 문의 채팅" style={{ marginTop: 16 }}>
        <div className="section-title no-margin" style={{ marginBottom: 10 }}>
          <div>
            <h2 style={{ fontSize: "1.08rem" }}>받은 문의</h2>
            <p>내 매물에 온 문의가 채팅으로 쌓입니다. 답장하면 상대 문의센터에 바로 보입니다.</p>
          </div>
        </div>
        <TradeChatCenter
          roleFilter="owner"
          emptyText="아직 받은 문의가 없습니다. 매물이 노출되면 여기로 문의가 들어옵니다."
        />
      </section>

      <section className="owner-preview-card" aria-label="등록 매물 미리보기">
        <div>
          <span>등록 미리보기</span>
          <h3>{ownerForm.title}</h3>
          <p>{ownerForm.address}</p>
        </div>
        <div className="owner-preview-actions">
          <strong>{ownerPriceLabel}</strong>
          <button type="button" onClick={continueOwnerRegistration}>입력 계속하기</button>
        </div>
      </section>

      <section className="domain-test-card landlord-domain-test-card" aria-labelledby="landlord-roomlog-title">
        <div className="domain-test-heading">
          <span>내 룸로그</span>
          <h3 id="landlord-roomlog-title">이 집을 룸로그로 관리하기</h3>
          <p>세입자가 연결되면 같은 계정에서 계약·비용·메시지·하자를 관리 콘솔로 이어서 처리합니다.</p>
        </div>
        <div className="domain-test-link-grid">
          <Link className="domain-test-link primary" href="/manager/home/00">
            관리 콘솔 홈
          </Link>
          <Link className="domain-test-link" href="/manager/contract/00">
            계약 관리
          </Link>
          <Link className="domain-test-link" href="/manager/ticket/dash/00">
            하자·티켓
          </Link>
          <Link className="domain-test-link" href="/manager/cost/00">
            비용 정산
          </Link>
          <Link className="domain-test-link" href="/manager/messaging/00">
            메시지
          </Link>
          <Link className="domain-test-link" href="/manager/moveout/00">
            퇴실 관리
          </Link>
        </div>
        <small className="domain-test-note">이 계정에 관리 중인 집이 연결되면 이어집니다.</small>
      </section>

      <section className="owner-exposure-card" aria-label="집 내놓기 전달 범위">
        <div className="owner-exposure-head">
          <div>
            <span>집 내놓기 전달 범위</span>
            <h3>검수 후 주변 중개사에게 매물 정보를 보냅니다</h3>
          </div>
          <strong>{ownerCompletionRate}% 완성</strong>
        </div>
        <div className="owner-exposure-grid">
          {ownerExposureItems.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.caption}</small>
            </article>
          ))}
        </div>
        <p className="owner-exposure-note">
          사진 3장 이상과 3D방 자료를 연결하면 확인매물·3D 투어 배지가 함께 노출됩니다.
        </p>
      </section>

      <section className="owner-readiness-card" aria-label="검수 준비 체크리스트">
        <div className="owner-readiness-head">
          <div>
            <span>검수 준비 체크리스트</span>
            <h3>등록 완료 전에 빠진 항목을 확인하세요</h3>
          </div>
          <strong>{ownerCompletionRate}%</strong>
        </div>
        <div className="owner-readiness-list">
          {ownerReviewItems.map((item, index) => {
            const done = index === 0 || (index === 1 && photoCount >= 3) || (index === 2 && has3DRoom);

            return (
              <article className={done ? "done" : ""} key={item.label}>
                <span>{item.label}</span>
                <strong>{done ? "완료" : "필요"}</strong>
                <p>{item.caption}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="owner-progress-card" aria-label="매물 등록 단계">
        <div>
          <span className="progress-dot done" />
          <strong>기본 정보</strong>
          <em>완료</em>
        </div>
        <div>
          <span className="progress-dot done" />
          <strong>사진 업로드</strong>
          <em>검수중</em>
        </div>
        <div>
          <span className="progress-dot" />
          <strong>3D방 연결</strong>
          <em>{has3DRoom ? "연결 완료" : "등록 전"}</em>
        </div>
      </section>

            </>
          ) : null}

          {activeOwnerPanel !== "dashboard" ? (
            <>
              <div className="owner-panel-heading">
                <span>{activeOwnerTab.note}</span>
                <h2>{activeOwnerTab.label}</h2>
                <p>집주인 대시보드 안에서 관리 기능을 확인합니다.</p>
              </div>
      <section className="owner-ops-grid" aria-label="집주인 운영 기능">
        {activeOwnerDomain === "contract" ? (
        <article id="kan-133-contract" className="owner-ops-card owner-contract-card">
          <div className="owner-ops-head">
            <div>
              <span>계약 관리</span>
              <h3>계약서 검토와 임차인 초대</h3>
            </div>
            <strong>관리 대기</strong>
          </div>

          <div className="owner-ops-metrics" aria-label="계약 관리 요약">
            {ownerContractStats.map((stat) => (
              <article key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <small>{stat.note}</small>
              </article>
            ))}
          </div>

          <div className="owner-contract-list" aria-label="계약 검토 목록">
            {ownerContractRows.map((row) => (
              <div key={row.title}>
                <span>{row.status}</span>
                <strong>{row.title}</strong>
                <small>{row.caption}</small>
              </div>
            ))}
          </div>

          <div className="owner-disclosure-strip" aria-label="계약 관리 원칙">
            <div>
              <span>원칙 게이트</span>
              <strong>OCR 원문 대조 후 확정</strong>
              <small>계약 확정·삭제·초대는 기록을 남기고 현재 대시보드에서 상태를 관리합니다.</small>
            </div>
            <button
              type="button"
              onClick={() => setOwnerToast("계약 검토 항목을 확인했습니다. 실제 확정은 계약 원칙 게이트를 통과해야 합니다.")}
            >
              검토 확인
            </button>
          </div>
        </article>
        ) : null}

        {activeOwnerDomain === "cost" ? (
        <article id="kan-135-cost" className="owner-ops-card owner-cost-card">
          <div className="owner-ops-head">
            <div>
              <span>비용 정산</span>
              <h3>비용 원장과 영수증 검토</h3>
            </div>
            <strong>{DEMO_MONTHLY_SUMMARY.month}</strong>
          </div>

          <div className="owner-ops-metrics" aria-label="비용 정산 요약">
            <article>
              <span>이번 달 지출</span>
              <strong>{formatWon(DEMO_MONTHLY_SUMMARY.totalAmount)}</strong>
            </article>
            <article>
              <span>확정 비용</span>
              <strong>{DEMO_MONTHLY_SUMMARY.confirmedCount}건</strong>
            </article>
            <article>
              <span>검토 대기</span>
              <strong>{ownerPendingCostReviews}건</strong>
            </article>
            <article>
              <span>영수증 증빙</span>
              <strong>{ownerReceiptEvidenceCount}건</strong>
            </article>
          </div>

          <div className="owner-cost-breakdown" aria-label="비용 유형별 집계">
            {Object.entries(DEMO_MONTHLY_SUMMARY.byType).map(([type, amount]) => (
              <div key={type}>
                <span>{ownerCostTypeLabels[type]}</span>
                <strong>{formatWon(amount)}</strong>
              </div>
            ))}
          </div>

          <div className="owner-review-panel">
            <div className="owner-panel-head">
              <div>
                <span>영수증 검토 큐</span>
                <strong>{ownerPendingCostReviews > 0 ? "확인 필요" : "정리됨"}</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCostReviewCleared(true);
                  setOwnerToast("비용 검토 큐를 정리했습니다. 미검증 확정 항목은 원장에 꼬리표로 남습니다.");
                }}
              >
                검토 완료 처리
              </button>
            </div>
            <div className="owner-review-list">
              {(ownerPendingCostReviews > 0 ? ownerCostReviewItems : []).map((cost) => (
                <div key={cost.id}>
                  <span>{ownerCostReviewLabels[cost.reviewReason ?? ""] ?? "검토"}</span>
                  <strong>{cost.item}</strong>
                  <small>{formatWon(cost.amount)} · {cost.scope === "unit" ? `${cost.unitId ?? "호실 미정"}호` : "건물"}</small>
                </div>
              ))}
              {ownerPendingCostReviews === 0 ? (
                <div className="owner-empty-row">
                  <strong>대기 중인 영수증 검토가 없습니다.</strong>
                  <small>새 영수증이나 OCR 저신뢰 항목이 생기면 여기에 표시됩니다.</small>
                </div>
              ) : null}
            </div>
          </div>

          <div className="owner-ledger-list" aria-label="비용 원장 최근 항목">
            {confirmedOwnerCosts.slice(0, 4).map((cost) => (
              <div key={cost.id}>
                <div>
                  <strong>{cost.item}</strong>
                  <small>{ownerCostTypeLabels[cost.type]} · {cost.scope === "unit" ? `${cost.unitId ?? "호실 미정"}호` : "건물 기록"}</small>
                </div>
                <span>{formatWon(cost.amount)}</span>
                <em>{ownerCostStatusLabels[cost.status]}</em>
              </div>
            ))}
          </div>

          <div className="owner-disclosure-strip" aria-label="관리비 공개 설정">
            <div>
              <span>관리비 공개 설정</span>
              <strong>{ownerPrivateDisclosureCount > 0 ? `숨김 ${ownerPrivateDisclosureCount}건` : "공개 상태 확인"}</strong>
              <small>비공개 항목은 임차인 화면에 숨김 건수로 표시됩니다.</small>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsDisclosureAcknowledged(true);
                setOwnerToast("관리비 공개 상태를 확인했습니다.");
              }}
            >
              공개 상태 확인
            </button>
          </div>
        </article>
        ) : null}

        {activeOwnerDomain === "vendor" ? (
        <article id="kan-136-vendor" className="owner-ops-card owner-vendor-card">
          <div className="owner-ops-head">
            <div>
              <span>업체 관리</span>
              <h3>업체 주소록과 성과 게이트</h3>
            </div>
            <strong>{ownerOpenDuplicateCount > 0 ? `중복 ${ownerOpenDuplicateCount}` : "중복 없음"}</strong>
          </div>

          <div className="owner-ops-metrics" aria-label="업체 관리 요약">
            <article>
              <span>등록 업체</span>
              <strong>{DEMO_VENDORS.length}곳</strong>
            </article>
            <article>
              <span>신규 배지</span>
              <strong>{DEMO_VENDORS.filter((vendor) => vendor.isNew).length}곳</strong>
            </article>
            <article>
              <span>최근 완료</span>
              <strong>{DEMO_VENDOR_JOBS.length}건</strong>
            </article>
            <article>
              <span>성과 표시</span>
              <strong>{ownerVendorRatingLabel}</strong>
            </article>
          </div>

          <div className="owner-vendor-list" aria-label="업체 주소록">
            {DEMO_VENDORS.slice(0, 4).map((vendor) => (
              <button
                className={selectedVendor?.id === vendor.id ? "active" : ""}
                key={vendor.id}
                type="button"
                onClick={() => setSelectedVendorId(vendor.id)}
              >
                <span>
                  <strong>{vendor.name}</strong>
                  {vendor.isNew ? <em>신규</em> : null}
                </span>
                <small>{vendor.trades.map((trade) => ownerVendorTradeLabels[trade]).join(" · ")}</small>
              </button>
            ))}
          </div>

          {selectedVendor ? (
            <div className="owner-vendor-detail" aria-label="선택 업체 상세">
              <div className="owner-vendor-title-row">
                <div>
                  <span>{ownerVendorStatusLabels[selectedVendor.status]}</span>
                  <strong>{selectedVendor.name}</strong>
                  <small>{selectedVendor.contactPerson ?? "담당자 미등록"} · {selectedVendor.phone ?? "연락처 확인 필요"}</small>
                </div>
                <em>{selectedVendor.source === "auto" ? "자동 누적" : "직접 추가"}</em>
              </div>

              <div className="owner-perf-gate">
                <div>
                  <span>성과 게이트</span>
                  <strong>
                    {selectedVendorPerf?.ratingVisible
                      ? `표본 ${selectedVendorPerf.sampleN}/${selectedVendorPerf.minN} 통과`
                      : `표본 ${selectedVendorPerf?.sampleN ?? 0}/${selectedVendorPerf?.minN ?? 5} 미달`}
                  </strong>
                  <small>
                    {selectedVendorPerf?.aiCommentEnabled
                      ? selectedVendorPerf.aiComment?.summary
                      : "소표본 업체는 별점 수치와 AI 코멘트를 숨깁니다."}
                  </small>
                </div>
                <div>
                  <span>응답 중앙값</span>
                  <strong>{selectedVendorPerf?.responseMedianHours ? `${selectedVendorPerf.responseMedianHours}시간` : "참고 불가"}</strong>
                  <small>커버리지 {Math.round((selectedVendorPerf?.coverageRatio ?? 0) * 100)}%</small>
                </div>
              </div>

              <div className="owner-vendor-jobs" aria-label="최근 완료 수리">
                {selectedVendorJobs.slice(0, 3).map((job) => (
                  <div key={job.id}>
                    <span>{job.unitMasked ? "***호" : `${job.unitId ?? "호실 미정"}호`}</span>
                    <strong>{job.quoteAmount ? formatWon(job.quoteAmount) : "견적 없음"}</strong>
                    <small>{new Date(job.completedAt).toLocaleDateString("ko-KR")} 완료</small>
                  </div>
                ))}
                {selectedVendorJobs.length === 0 ? (
                  <div className="owner-empty-row">
                    <strong>완료 수리 이력이 아직 없습니다.</strong>
                    <small>배정과 완료가 쌓이면 성과가 자동 계산됩니다.</small>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="owner-duplicate-strip" aria-label="업체 중복 후보">
            <div>
              <span>신규·중복 업체 게이트</span>
              <strong>{ownerOpenDuplicateCount > 0 ? `${ownerOpenDuplicateCount}건 확인 필요` : "처리 완료"}</strong>
              <small>신규 업체는 격리하지 않고 배지만 표시합니다.</small>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsDuplicateResolved(true);
                setOwnerToast("업체 중복 후보를 확인했습니다.");
              }}
            >
              중복 후보 확인
            </button>
          </div>
        </article>
        ) : null}
      </section>

            </>
          ) : null}

          {activeOwnerPanel === "dashboard" ? (
            <>
      <form className="owner-form" id="owner-registration-form">
        <section className="owner-card">
          <div className="form-heading">
            <div>
              <span>STEP 01</span>
              <h3>내 집 등록</h3>
            </div>
            <strong>임대인 전용</strong>
          </div>

          {draftSavedAt ? (
            <small className="owner-draft-status" role="status">
              임시저장됨 · {formatDraftSavedAt(draftSavedAt)} — 새로고침해도 작성 내용이 유지됩니다.
            </small>
          ) : null}

          <label>
            매물명
            <input value={ownerForm.title} onChange={(event) => updateOwnerForm("title", event.target.value)} placeholder="예: 방배 루미에르 402호" />
          </label>

          <label>
            주소
            <input value={ownerForm.address} onChange={(event) => updateOwnerForm("address", event.target.value)} placeholder="도로명 또는 지번 주소" />
          </label>

          <div className="form-grid">
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
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => updateOwnerForm("moveIn", event.target.value)}
                aria-label="입주가능일 달력 선택"
              />
            </label>
          </div>

          <div className="form-grid">
            <label>
              보증금
              <input inputMode="numeric" value={ownerForm.deposit} onChange={(event) => updateOwnerForm("deposit", event.target.value)} placeholder="만원 단위" />
            </label>
            <label>
              월세
              <input inputMode="numeric" value={ownerForm.monthly} onChange={(event) => updateOwnerForm("monthly", event.target.value)} placeholder="만원 단위" />
            </label>
          </div>

          <div className="form-grid">
            <label>
              전세금
              <input inputMode="numeric" value={ownerForm.jeonse} onChange={(event) => updateOwnerForm("jeonse", event.target.value)} placeholder="전세일 때 입력" />
            </label>
            <label>
              관리비
              <input inputMode="numeric" value={ownerForm.maintenance} onChange={(event) => updateOwnerForm("maintenance", event.target.value)} placeholder="만원 단위" />
            </label>
          </div>

          <div className="form-grid">
            <label>
              전용면적
              <input inputMode="decimal" value={ownerForm.area} onChange={(event) => updateOwnerForm("area", event.target.value)} placeholder="m²" />
            </label>
            <label>
              층수
              <input value={ownerForm.floor} onChange={(event) => updateOwnerForm("floor", event.target.value)} placeholder="예: 4층 / 16층" />
            </label>
          </div>
        </section>

        <section className="owner-card">
          <div className="form-heading">
            <div>
              <span>STEP 02</span>
              <h3>사진과 3D방 자료</h3>
            </div>
          </div>

          <label className="upload-zone">
            <strong>사진 업로드</strong>
            <span>대표 사진, 거실, 주방, 욕실 이미지를 순서대로 등록합니다. 현재 {photoCount}장 선택</span>
            <input
              type="file"
              multiple
              accept="image/*"
              aria-label="사진 업로드"
              onChange={(event) => {
                const files = event.target.files ? Array.from(event.target.files) : [];
                setPhotoFiles(files);
                setPhotoCount(files.length);
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

          {/* 새 탭으로 연다 — 같은 탭 이동은 폼을 언마운트시켜 선택한 사진(File, 직렬화 불가)이 날아간다.
              에디터에서 저장 후 이 탭으로 돌아오면 위 focus/visibilitychange 동기화가 자동 연결한다. */}
          <a
            className={has3DRoom ? "upload-3d-button floor-plan-link active" : "upload-3d-button floor-plan-link"}
            href="/floor-plan-3d"
            target="_blank"
            rel="noopener"
            onClick={() => setRegistrationStatus("작성 중")}
          >
            <strong>3D 도면 만들기</strong>
            <span>
              {has3DRoom
                ? "3D 도면이 연결됐어요. 등록하면 상세 페이지에서 3D로 보여집니다."
                : "도면을 만들고 저장하면 자동으로 연결돼요. 실측 도면 3D 편집이 새 탭에서 열려 작성 중인 사진·입력이 그대로 유지됩니다."}
            </span>
          </a>

          <label className="upload-zone">
            <strong>도면 JSON 업로드</strong>
            <span>3D 도면 만들기에서 내려받은 JSON이나 walls3D/walls 배열을 바로 연결합니다.</span>
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

          <label className="upload-zone">
            <strong>영상/스플랫 접수</strong>
            <span>영상은 등록 후 3D 투어 제작이 접수됩니다(수 시간 소요). 스캔앱 .spz 파일이면 바로 정합 단계로 갑니다.</span>
            <input
              ref={tourSourceInputRef}
              type="file"
              accept="video/*,.spz"
              aria-label="영상 또는 스플랫 파일 업로드"
              onChange={(event) => {
                setTourSourceFile(event.currentTarget.files?.[0] ?? null);
                setRegistrationStatus("작성 중");
              }}
            />
          </label>

          {tourSourceFile ? (
            <p
              style={{
                margin: 0,
                color: "var(--muted)",
                fontSize: "0.8rem",
                fontWeight: 800
              }}
            >
              선택됨: {tourSourceFile.name} · {formatFileSize(tourSourceFile.size)}
            </p>
          ) : null}
        </section>

        <section className="owner-submit-summary" aria-label="검수 요청 요약">
          <div>
            <span>검수 요청 요약</span>
            <h3>{ownerForm.title || "매물명을 입력해주세요"}</h3>
            <p>
              {ownerPriceLabel} · 관리비 {ownerForm.maintenance || "0"}만원 · {ownerForm.area || "-"}m² ·{" "}
              {ownerForm.floor || "층수 미입력"}
            </p>
          </div>
          <div className="owner-submit-grid">
            <span>
              <b>{photoCount}장</b>
              사진
            </span>
            <span>
              <b>{has3DRoom ? "연결" : "대기"}</b>
              3D방
            </span>
            <span>
              <b>2시간</b>
              예상 검수
            </span>
          </div>
          <p>검수 요청 후 주변 중개사 12곳에 매물 정보가 전달되고, 확인매물 여부가 표시됩니다.</p>
        </section>

        <button className="submit-listing" type="button" onClick={submitOwnerListing} disabled={isSubmittingListing} aria-busy={isSubmittingListing}>
          {isSubmittingListing ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              {editingListingId ? "수정 저장 중…" : "등록 처리 중…"}
            </>
          ) : editingListingId ? (
            "수정 내용 저장"
          ) : (
            "매물 등록하기"
          )}
        </button>
      </form>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
