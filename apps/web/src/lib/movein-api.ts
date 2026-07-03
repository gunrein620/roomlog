import type {
  ChecklistItem,
  ItemRecord,
  MoveinPhoto,
  MoveinRecord,
} from "@roomlog/types";
import {
  DEMO_CHECKLIST,
  DEMO_ITEM_RECORDS,
  DEMO_LEASE_ID,
  DEMO_MOVEIN,
} from "./demo-movein";

// 룸로그 API 클라이언트 (입주기록 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백 → 빌드/프리렌더 안 막힘.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback; // api 미기동 시 데모 폴백
  }
}

export function getMovein(leaseId: string): Promise<MoveinRecord> {
  return tryFetch(`/moveins/${leaseId}`, DEMO_MOVEIN);
}

export function getChecklist(leaseId: string): Promise<ChecklistItem[]> {
  return tryFetch(`/moveins/${leaseId}/checklist`, DEMO_CHECKLIST);
}

export function getItemRecords(leaseId: string): Promise<ItemRecord[]> {
  return tryFetch(`/moveins/${leaseId}/items`, DEMO_ITEM_RECORDS);
}

export function getItemRecord(leaseId: string, itemId: string): Promise<ItemRecord | undefined> {
  return tryFetch(
    `/moveins/${leaseId}/items/${itemId}`,
    DEMO_ITEM_RECORDS.find((record) => record.itemId === itemId),
  );
}

export type { MoveinPhoto };
export { DEMO_LEASE_ID };
