import type {
  DefectAnalysis,
  ManagerQueueSummary,
  RepairJob,
  Ticket,
  TicketDisposition,
  TicketStatus
} from "@roomlog/types";
import { serverFetch } from "./server-api";
import {
  toManagerTicket,
  toManagerAnalysis,
  toManagerRepair,
  computeQueueSummary,
  type TeamManagerTicket
} from "./manager-mapping";
import {
  MANAGER_DEMO_TICKET_ID,
  managerDemoAnalysis,
  managerDemoRepair,
  managerDemoTicket
} from "./ticket-manager-demo";

// 관리인 티켓 API 클라이언트 — 팀 실 백엔드(GET /manager/tickets)에 쿠키 인증으로 연결.
// [레퍼런스 패턴 복제] 서버 컴포넌트 전용(serverFetch가 httpOnly 쿠키→Bearer forward).
// 목록/요약은 실집계(빈 목록은 [], 위조 금지). 상세는 활성 티켓 매핑, 없을 때만 데모+경고.

async function listTeamTickets(filter?: string): Promise<TeamManagerTicket[]> {
  const query = filter ? `?filter=${encodeURIComponent(filter)}` : "";
  return serverFetch<TeamManagerTicket[]>(`/manager/tickets${query}`);
}

async function activeTeamTicket(): Promise<TeamManagerTicket | null> {
  try {
    const list = await listTeamTickets();
    return list[0] ?? null;
  } catch (error) {
    console.error("[manager/api] /manager/tickets 조회 실패:", error);
    return null;
  }
}

export async function listManagerTickets(filter?: string): Promise<Ticket[]> {
  try {
    return (await listTeamTickets(filter)).map(toManagerTicket);
  } catch (error) {
    console.error("[manager/api] listManagerTickets 실패 → 빈 목록:", error);
    return [];
  }
}

export async function getManagerQueueSummary(): Promise<ManagerQueueSummary> {
  try {
    const list = await listTeamTickets();
    return computeQueueSummary(list.map(toManagerTicket), list.map(toManagerRepair));
  } catch (error) {
    console.error("[manager/api] 큐 요약 실패 → 0:", error);
    return { today: 0, urgent: 0, awaitingReview: 0, awaitingPayment: 0, onHold: 0, total: 0 };
  }
}

export async function getManagerTicket(id: string = MANAGER_DEMO_TICKET_ID): Promise<Ticket> {
  const t = await activeTeamTicket();
  if (t) return toManagerTicket(t);
  console.warn("[manager/api] 활성 티켓 없음 → 데모 폴백");
  return managerDemoTicket(id);
}

export async function getManagerAnalysis(
  ticketId: string = MANAGER_DEMO_TICKET_ID
): Promise<DefectAnalysis> {
  const t = await activeTeamTicket();
  const mapped = t && toManagerAnalysis(t);
  if (mapped) return mapped;
  console.warn("[manager/api] 실제 분석 없음 → 데모 폴백");
  return managerDemoAnalysis(ticketId);
}

export async function getManagerRepair(
  ticketId: string = MANAGER_DEMO_TICKET_ID
): Promise<RepairJob> {
  const t = await activeTeamTicket();
  const mapped = t && toManagerRepair(t);
  if (mapped) return mapped;
  console.warn("[manager/api] 실제 수리 없음(미배정/취소) → 데모 폴백");
  return managerDemoRepair(ticketId);
}

// 관리인 mutation — 팀 PATCH /manager/tickets/:id. 서버 액션/서버 컴포넌트에서 호출.
// NOTE(follow-up): 화면 TicketStatus(lowercase 6)→팀 TicketStatus(UPPERCASE 11) 역매핑은
// 손실적이라(예: processing↔5종) 별도 정합 필요. 현재 대시 화면은 상태 변경을 배선하지 않음.
export async function updateManagerTicket(
  id: string,
  patch: { category?: string; priority?: number; responsibilityHint?: string; status?: string; note?: string }
): Promise<TeamManagerTicket> {
  return serverFetch<TeamManagerTicket>(`/manager/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export { MANAGER_DEMO_TICKET_ID };
export type { TicketStatus, TicketDisposition };
