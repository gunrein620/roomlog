import type { Ticket, DefectAnalysis, RepairJob } from "@roomlog/types";
import { DEMO_TICKET, DEMO_ANALYSIS, DEMO_REPAIR } from "./demo-ticket";

// 룸로그 API 클라이언트 (하자 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백 → 빌드/프리렌더 안 막힘.
// 실제 walking skeleton 검증은 api 기동 상태에서 live fetch로 확인한다.
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

export function getTicket(id: string): Promise<Ticket> {
  return tryFetch(`/tickets/${id}`, DEMO_TICKET);
}
export function getAnalysis(ticketId: string): Promise<DefectAnalysis> {
  return tryFetch(`/tickets/${ticketId}/analysis`, DEMO_ANALYSIS);
}
export function getRepair(ticketId: string): Promise<RepairJob> {
  return tryFetch(`/tickets/${ticketId}/repair`, DEMO_REPAIR);
}
export function listTickets(): Promise<Ticket[]> {
  return tryFetch(`/tickets`, [DEMO_TICKET]);
}

/** 현재 데모 티켓 id (셸 슬라이스는 단일 티켓 흐름) */
export const DEMO_TICKET_ID = DEMO_TICKET.id;
