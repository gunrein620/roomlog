import { headers } from "next/headers";
import { listManagerTicketRows } from "@/lib/ticket-manager-api";
import { ComplaintDashboard } from "./ComplaintDashboard";
import { appendLocalTicketDemoRows } from "./local-ticket-demo";
import { ManagerDefectDashboard } from "./ManagerDefectDashboard";
import { resolveTicketDashboardView } from "./ticket-dashboard-view";

type SearchParams = Promise<{ type?: string; view?: string }>;

// 실데이터가 항상 먼저 오며, loopback 요청에서만 Git 비추적 로컬 파일의 행을 덧붙인다.
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const dashboardView = resolveTicketDashboardView(await searchParams);
  const requestHeaders = await headers();
  const realRows = await listManagerTicketRows();
  const rows = await appendLocalTicketDemoRows(realRows, requestHeaders.get("host"));

  if (dashboardView === "dashboard") return <ComplaintDashboard rows={rows} />;

  const initialTemplate = dashboardView === "management" ? "all" : dashboardView;
  return <ManagerDefectDashboard rows={rows} initialTemplate={initialTemplate} key={initialTemplate} />;
}
