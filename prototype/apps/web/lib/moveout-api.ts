import type {
  MoveoutChecklistItem,
  Dispute,
  MoveoutRecordItem,
  MoveoutSummary,
  SettlementEstimate,
} from "@roomlog/types";
import {
  DEMO_MOVEOUT,
  DEMO_MOVEOUT_CHECKLIST,
  DEMO_MOVEOUT_DISPUTES,
  DEMO_MOVEOUT_ID,
  DEMO_MOVEOUT_RECORDS,
  DEMO_MOVEOUT_SETTLEMENT,
} from "./demo-moveout";

// 룸로그 API 클라이언트 (퇴실 T-OUT 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백 → 빌드/프리렌더 안 막힘.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function getMoveout(id: string): Promise<MoveoutSummary> {
  return tryFetch(`/moveouts/${id}`, DEMO_MOVEOUT);
}

export function listMoveouts(): Promise<MoveoutSummary[]> {
  return tryFetch("/moveouts", [DEMO_MOVEOUT]);
}

export function getRecords(id: string): Promise<MoveoutRecordItem[]> {
  return tryFetch(`/moveouts/${id}/records`, DEMO_MOVEOUT_RECORDS);
}

export function getChecklist(id: string): Promise<MoveoutChecklistItem[]> {
  return tryFetch(`/moveouts/${id}/checklist`, DEMO_MOVEOUT_CHECKLIST);
}

export function getSettlement(id: string): Promise<SettlementEstimate> {
  return tryFetch(`/moveouts/${id}/settlement`, DEMO_MOVEOUT_SETTLEMENT);
}

export function getDisputes(id: string): Promise<Dispute[]> {
  return tryFetch(`/moveouts/${id}/disputes`, DEMO_MOVEOUT_DISPUTES);
}

export { DEMO_MOVEOUT_ID };
