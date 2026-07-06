// 집주인 매물 등록 임시저장(draft) — 실 DB 연결 전까지 localStorage 기반 versioned draft.
// 새로고침해도 ownerForm/사진 수/3D 연결/등록 상태/내 매물 목록이 유지된다. (QA 8)
// 주의: 복원은 반드시 마운트 후(useEffect)에만 — SSR 초기 렌더와의 hydration 불일치 방지.

export const OWNER_DRAFT_STORAGE_KEY = "woozu.owner-listing-draft.v1";
const OWNER_DRAFT_VERSION = 1 as const;

export type OwnerFormValues = {
  title: string;
  address: string;
  tradeType: string;
  moveIn: string;
  deposit: string;
  monthly: string;
  jeonse: string;
  maintenance: string;
  area: string;
  floor: string;
};

export type OwnerListing = {
  id: number;
  title: string;
  price: string;
  status: string;
  caption: string;
};

export type OwnerListingDraft = {
  version: typeof OWNER_DRAFT_VERSION;
  savedAt: string;
  ownerForm: OwnerFormValues;
  photoCount: number;
  has3DRoom: boolean;
  registrationStatus: string;
  myListings: OwnerListing[];
};

// 사용자 입력 칸은 빈 값으로 시작한다 — 실제 값처럼 보이는 사전 입력 금지(QA 수정 희망사항).
// 예시는 각 input의 placeholder가 담당한다. tradeType만 select 기본 선택값.
export const emptyOwnerForm: OwnerFormValues = {
  title: "",
  address: "",
  tradeType: "월세",
  moveIn: "",
  deposit: "",
  monthly: "",
  jeonse: "",
  maintenance: "",
  area: "",
  floor: ""
};

// 데모 매물은 안정된 고정 id를 쓴다 — 사용자가 추가한 매물(Date.now() 기반)과 절대 겹치지 않는다.
export const initialOwnerListings: OwnerListing[] = [
  { id: 1, title: "방배 루미에르 302호", price: "월세 1000/125", status: "노출중", caption: "조회 128 · 문의 6건" }
];

const ownerFormKeys: Array<keyof OwnerFormValues> = [
  "title",
  "address",
  "tradeType",
  "moveIn",
  "deposit",
  "monthly",
  "jeonse",
  "maintenance",
  "area",
  "floor"
];

export function serializeOwnerDraft(
  state: Omit<OwnerListingDraft, "version" | "savedAt">,
  savedAt = new Date().toISOString()
): string {
  return JSON.stringify({ version: OWNER_DRAFT_VERSION, savedAt, ...state } satisfies OwnerListingDraft);
}

/** 버전 불일치·깨진 JSON·형태 불일치는 전부 null — 초기값으로 폴백한다(fail-safe). */
export function parseOwnerDraft(raw: string | null): OwnerListingDraft | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const draft = parsed as Partial<OwnerListingDraft>;

  if (draft.version !== OWNER_DRAFT_VERSION) return null;
  if (typeof draft.savedAt !== "string") return null;
  if (typeof draft.photoCount !== "number" || typeof draft.has3DRoom !== "boolean") return null;
  if (typeof draft.registrationStatus !== "string") return null;

  const form = draft.ownerForm;
  if (typeof form !== "object" || form === null) return null;
  if (!ownerFormKeys.every((key) => typeof (form as Record<string, unknown>)[key] === "string")) {
    return null;
  }

  if (!Array.isArray(draft.myListings)) return null;
  const listings = draft.myListings.filter(
    (item): item is OwnerListing =>
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "number" &&
      typeof item.title === "string" &&
      typeof item.price === "string" &&
      typeof item.status === "string" &&
      typeof item.caption === "string"
  );
  // id 중복 제거 — 같은 매물이 새로고침마다 늘어나는 회귀 방지.
  const seen = new Set<number>();
  const dedupedListings = listings.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return {
    version: OWNER_DRAFT_VERSION,
    savedAt: draft.savedAt,
    ownerForm: form as OwnerFormValues,
    photoCount: draft.photoCount,
    has3DRoom: draft.has3DRoom,
    registrationStatus: draft.registrationStatus,
    myListings: dedupedListings
  };
}

/** "임시저장됨 · 오후 3:42" 표시용 시각 포맷. 파싱 불가 시 빈 문자열. */
export function formatDraftSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}
