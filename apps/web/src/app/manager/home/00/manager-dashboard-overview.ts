import { MANAGER_TICKET_ROUTES } from "../../../../lib/ticket-manager-nav";
import type { ManagerTicketRow } from "./ManagerHomeTabs";

export function selectManagerCurrentTickets(
  tickets: readonly ManagerTicketRow[],
): ManagerTicketRow[] {
  return [
    ...tickets.filter((ticket) => ticket.urgent),
    ...tickets.filter((ticket) => !ticket.urgent),
  ].slice(0, 3);
}

export function managerDashboardTicketHref(ticketId: string): string {
  const search = new URLSearchParams({ id: ticketId }).toString();
  return `${MANAGER_TICKET_ROUTES["M-DASH-01"]}?${search}`;
}
