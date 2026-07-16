// 찜한 매물 저장소 — SPA와 상세 라우트가 같은 localStorage 키를 읽고 써서
// 라우트를 오가도 찜 상태가 유지된다. (기존엔 SPA 메모리 state뿐이라 새로고침에 소실)
const STORAGE_KEY = "woozuSavedListingNos";

/** 저장된 찜 목록을 읽는다 — 없거나 깨졌으면 defaults(현재 모든 호출부가 빈 배열). */
export function loadSavedListingNos(defaults: string[]): string[] {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaults;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return defaults;
  }
}

export function persistSavedListingNos(listingNos: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(listingNos));
  } catch {
    // 저장 실패는 치명적이지 않다 — 메모리 상태로 계속 동작
  }
}

export function toggleSavedListingNo(current: string[], listingNo: string): string[] {
  const next = current.includes(listingNo)
    ? current.filter((item) => item !== listingNo)
    : [...current, listingNo];
  persistSavedListingNos(next);
  return next;
}
