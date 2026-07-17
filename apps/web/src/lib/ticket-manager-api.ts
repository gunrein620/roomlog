import type {
  DefectAnalysis,
  ManagerQueueSummary,
  ManagerReplyDraftInput,
  ManagerReplyDraftResult,
  ManagerTicketReplyInput,
  DecideTicketResponsibilityInput,
  RepairJob,
  Ticket,
  TicketAiFeedback,
  TicketResponsibilityDecision,
} from "@roomlog/types";
import { ApiError, ApiPayloadError, serverFetch } from "./server-api";
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
import { managerDefectDashboardDemoRecord } from "./manager-defect-dashboard-demo";

// 관리인 티켓 API 클라이언트 — 팀 실 백엔드(GET /manager/tickets)에 쿠키 인증으로 연결.
// [레퍼런스 패턴 복제] 서버 컴포넌트 전용(serverFetch가 httpOnly 쿠키→Bearer forward).
// 목록/요약은 실집계(빈 목록은 [], 위조 금지). 상세는 활성 티켓 매핑, 없을 때만 데모+경고.

async function listTeamTickets(filter?: string): Promise<TeamManagerTicket[]> {
  const query = filter ? `?filter=${encodeURIComponent(filter)}` : "";
  return serverFetch<TeamManagerTicket[]>(`/manager/tickets${query}`);
}

export type ManagerTicketDetail = {
  ticket: Ticket;
  analysis: DefectAnalysis | null;
  repair: RepairJob | null;
  attachmentUrls: string[];
  aiFeedback: TicketAiFeedback[];
  responsibilityDecision?: TicketResponsibilityDecision;
};

type ManagerTicketDetailLoaders = {
  byId: (id: string) => Promise<TeamManagerTicket | null>;
  list: () => Promise<TeamManagerTicket[]>;
};

export async function managerTicketByIdOrNull(
  id: string,
  fetchTicket: (path: string) => Promise<TeamManagerTicket> = (path) =>
    serverFetch<TeamManagerTicket>(path),
): Promise<TeamManagerTicket | null> {
  try {
    return await fetchTicket(`/manager/tickets/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

function toManagerTicketDetail(ticket: TeamManagerTicket): ManagerTicketDetail {
  const mappedTicket = toManagerTicket(ticket);
  return {
    ticket: mappedTicket,
    analysis: toManagerAnalysis(ticket),
    repair: toManagerRepair(ticket),
    attachmentUrls: managerTicketAttachmentUrls(ticket),
    aiFeedback: ticket.aiFeedback ?? [],
    responsibilityDecision: mappedTicket.responsibilityDecision,
  };
}

export async function getManagerTicketDetail(
  id?: string,
  loaders: ManagerTicketDetailLoaders = {
    byId: managerTicketByIdOrNull,
    list: () => listTeamTickets(),
  },
): Promise<ManagerTicketDetail | null> {
  if (id) {
    const ticket = await loaders.byId(id);
    return ticket ? toManagerTicketDetail(ticket) : null;
  }

  const [ticket] = await loaders.list();
  return ticket ? toManagerTicketDetail(ticket) : null;
}

export function managerTicketAttachmentUrls(ticket: TeamManagerTicket): string[] {
  return Array.from(
    new Set(
      (ticket.messages ?? [])
        .flatMap((message) => message.attachmentUrls ?? [])
        .map((url) => url.trim())
        .filter(Boolean)
    )
  );
}

async function activeTeamTicket(): Promise<TeamManagerTicket | null> {
  try {
    const list = await listTeamTickets();
    return list[0] ?? null;
  } catch (error) {
    if (error instanceof ApiPayloadError) throw error;
    console.error("[manager/api] /manager/tickets 조회 실패:", error);
    return null;
  }
}

async function teamTicketById(id: string): Promise<TeamManagerTicket | null> {
  try {
    return await serverFetch<TeamManagerTicket>(`/manager/tickets/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiPayloadError) throw error;
    console.error(`[manager/api] /manager/tickets/${id} 조회 실패:`, error);
    return null;
  }
}

async function selectedTeamTicket(id: string): Promise<TeamManagerTicket | null> {
  if (!id || id === MANAGER_DEMO_TICKET_ID) {
    return activeTeamTicket();
  }

  return (await teamTicketById(id)) ?? (await activeTeamTicket());
}

export async function listManagerTickets(filter?: string): Promise<Ticket[]> {
  try {
    return (await listTeamTickets(filter)).map(toManagerTicket);
  } catch (error) {
    if (error instanceof ApiPayloadError) throw error;
    console.error("[manager/api] listManagerTickets 실패 → 빈 목록:", error);
    return [];
  }
}

// 대시보드용 목록 — 티켓+수리를 목록 1회 조회로 함께 매핑한다(티켓별 재조회 N+1 제거).
// getManagerRepair와 달리 데모 폴백이 없다: 수리 미배정이면 undefined(작업자 "미배정" 표시).
// 실제 접수 건에 가짜 업체/금액을 섞지 않기 위한 분리다(위조 금지).
export async function listManagerTicketRows(
  loadTickets: () => Promise<TeamManagerTicket[]> = listTeamTickets,
): Promise<
  { ticket: Ticket; repair?: RepairJob; buildingName?: string; attachmentUrls: string[] }[]
> {
  return (await loadTickets()).map((t) => ({
    ticket: toManagerTicket(t),
    repair: toManagerRepair(t) ?? undefined,
    // 팀 응답의 room.buildingName을 그대로 실어 대시보드 "건물/호실"이 "—"로 비지 않게 한다.
    buildingName: t.room?.buildingName?.trim() || undefined,
    attachmentUrls: managerTicketAttachmentUrls(t)
  }));
}

export async function getManagerQueueSummary(): Promise<ManagerQueueSummary> {
  try {
    const list = await listTeamTickets();
    return computeQueueSummary(list.map(toManagerTicket), list.map(toManagerRepair));
  } catch (error) {
    if (error instanceof ApiPayloadError) throw error;
    console.error("[manager/api] 큐 요약 실패 → 0:", error);
    return { today: 0, urgent: 0, awaitingReview: 0, awaitingPayment: 0, onHold: 0, total: 0 };
  }
}

export async function getManagerTicket(id: string = MANAGER_DEMO_TICKET_ID): Promise<Ticket> {
  const demo = managerDefectDashboardDemoRecord(id);
  if (demo) return demo.ticket;

  const t = await selectedTeamTicket(id);
  if (t) return toManagerTicket(t);
  console.warn("[manager/api] 활성 티켓 없음 → 데모 폴백");
  return managerDemoTicket(id);
}

export async function getManagerAnalysis(
  ticketId: string = MANAGER_DEMO_TICKET_ID
): Promise<DefectAnalysis> {
  const demo = managerDefectDashboardDemoRecord(ticketId);
  if (demo) return demo.analysis;

  const t = await selectedTeamTicket(ticketId);
  const mapped = t && toManagerAnalysis(t);
  if (mapped) return mapped;
  console.warn("[manager/api] 실제 분석 없음 → 데모 폴백");
  return managerDemoAnalysis(ticketId);
}

export function getManagerRepair(): Promise<RepairJob>;
export function getManagerRepair(ticketId: string): Promise<RepairJob | null>;
export async function getManagerRepair(ticketId?: string): Promise<RepairJob | null> {
  const selectedId = ticketId ?? MANAGER_DEMO_TICKET_ID;
  const demo = managerDefectDashboardDemoRecord(selectedId);
  if (demo) return demo.repair;
  if (selectedId === MANAGER_DEMO_TICKET_ID) return managerDemoRepair(selectedId);

  try {
    const ticket = await serverFetch<TeamManagerTicket>(
      `/manager/tickets/${encodeURIComponent(selectedId)}`,
    );
    return toManagerRepair(ticket);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function draftManagerTicketReply(
  ticketId: string,
  input: ManagerReplyDraftInput = {},
): Promise<ManagerReplyDraftResult> {
  return serverFetch<ManagerReplyDraftResult>(
    `/manager/tickets/${encodeURIComponent(ticketId)}/reply-draft`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function sendManagerTicketReply(
  ticketId: string,
  input: ManagerTicketReplyInput,
): Promise<unknown> {
  return serverFetch(
    `/manager/tickets/${encodeURIComponent(ticketId)}/replies`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function decideManagerTicketResponsibility(
  ticketId: string,
  input: DecideTicketResponsibilityInput,
): Promise<TeamManagerTicket> {
  return serverFetch<TeamManagerTicket>(
    `/manager/tickets/${encodeURIComponent(ticketId)}/responsibility-decision`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

// 관리인 mutation(상태/책임/긴급도 변경)은 화면 TicketStatus(lowercase 6)→팀 UPPERCASE(11)
// 역매핑이 손실적이라 별도 정합이 필요하고, 현재 대시 화면이 배선하지 않으므로 여기서 제공하지 않는다.
// (섣부른 raw PATCH는 백엔드 enum 필드를 오염시킬 수 있음 — follow-up에서 안전한 액션으로 추가.)

export { MANAGER_DEMO_TICKET_ID };
