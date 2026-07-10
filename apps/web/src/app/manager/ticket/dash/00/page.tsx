import { getManagerRepair, listManagerTickets } from "@/lib/ticket-manager-api";
import { ManagerDefectDashboard } from "./ManagerDefectDashboard";

export default async function Page() {
  const tickets = await listManagerTickets();
  const repairs = await Promise.all(tickets.map((ticket) => getManagerRepair(ticket.id)));
  const rows = tickets.map((ticket, index) => ({
    ticket,
    repair: repairs[index],
  }));

  return <ManagerDefectDashboard rows={rows} />;
}
