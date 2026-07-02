import type {
  DefectAnalysis,
  ManagerQueueSummary,
  RepairJob,
  Ticket,
  TicketDisposition,
  TicketStatus,
} from "@roomlog/types";
import {
  MANAGER_DEMO_TICKETS,
  MANAGER_DEMO_TICKET_ID,
  managerDemoAnalysis,
  managerDemoRepair,
  managerDemoSummary,
  managerDemoTicket,
} from "./ticket-manager-demo";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function tryFetch<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function listManagerTickets(filter?: string): Promise<Ticket[]> {
  const query = filter ? `?filter=${encodeURIComponent(filter)}` : "";
  return tryFetch(`/tickets${query}`, MANAGER_DEMO_TICKETS);
}

export function getManagerQueueSummary(): Promise<ManagerQueueSummary> {
  return tryFetch("/tickets/summary", managerDemoSummary());
}

export function getManagerTicket(id: string = MANAGER_DEMO_TICKET_ID): Promise<Ticket> {
  return tryFetch(`/tickets/${id}`, managerDemoTicket(id));
}

export function getManagerAnalysis(ticketId: string = MANAGER_DEMO_TICKET_ID): Promise<DefectAnalysis> {
  return tryFetch(`/tickets/${ticketId}/analysis`, managerDemoAnalysis(ticketId));
}

export function getManagerRepair(ticketId: string = MANAGER_DEMO_TICKET_ID): Promise<RepairJob> {
  return tryFetch(`/tickets/${ticketId}/repair`, managerDemoRepair(ticketId));
}

export function updateManagerTicketStatus(
  id: string,
  status: TicketStatus,
): Promise<Ticket> {
  return tryFetch(`/tickets/${id}/status`, { ...managerDemoTicket(id), status }, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function updateManagerTicketDisposition(
  id: string,
  disposition: TicketDisposition,
): Promise<Ticket> {
  return tryFetch(`/tickets/${id}/disposition`, { ...managerDemoTicket(id), disposition }, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ disposition }),
  });
}

export { MANAGER_DEMO_TICKET_ID };
