import { listManagerTicketRows } from "@/lib/ticket-manager-api";
import { ComplaintDashboard } from "./ComplaintDashboard";
import { ManagerDefectDashboard } from "./ManagerDefectDashboard";
import { resolveTicketDashboardView } from "./ticket-dashboard-view";

type SearchParams = Promise<{ type?: string; view?: string }>;

// 대시보드는 실제 접수 티켓만 보여준다 — 더미 행 혼합 제거(세입자 신규 요청과 직결).
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const dashboardView = resolveTicketDashboardView(await searchParams);
  const rows = await listManagerTicketRows();

  if (dashboardView === "dashboard") return <ComplaintDashboard rows={rows} />;

  const initialTemplate = dashboardView === "management" ? "all" : dashboardView;
  return <ManagerDefectDashboard rows={rows} initialTemplate={initialTemplate} key={initialTemplate} />;
}
