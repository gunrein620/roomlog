import { getManagerRepair, listManagerTickets } from "@/lib/ticket-manager-api";
import { ManagerDefectDashboard } from "./ManagerDefectDashboard";
import { MANAGER_DEFECT_DASHBOARD_DEMO_ROWS } from "./manager-defect-dashboard-demo";

type SearchParams = Promise<{ type?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { type } = await searchParams;
  const initialTemplate = type === "complaint" || type === "defect" ? type : "all";
  const tickets = await listManagerTickets();
  const repairs = await Promise.all(tickets.map((ticket) => getManagerRepair(ticket.id)));
  const liveRows = tickets.map((ticket, index) => ({
    ticket,
    repair: repairs[index],
  }));
  const rows = [...liveRows, ...MANAGER_DEFECT_DASHBOARD_DEMO_ROWS];

  return <ManagerDefectDashboard rows={rows} initialTemplate={initialTemplate} key={initialTemplate} />;
}
