import { headers } from "next/headers";
import { listManagerTicketRows } from "@/lib/ticket-manager-api";
import { listManagerVendors } from "@/lib/vendor-mgmt-api";
import { ComplaintDashboard } from "./ComplaintDashboard";
import { appendLocalTicketDemoRows } from "./local-ticket-demo";
import { ManagerDefectDashboard } from "./ManagerDefectDashboard";
import { TicketDashboardAutoRefresh } from "./TicketDashboardAutoRefresh";
import { resolveTicketDashboardView } from "./ticket-dashboard-view";

type SearchParams = Promise<{ type?: string; view?: string }>;

// 실데이터가 항상 먼저 오며, loopback 요청에서만 Git 비추적 로컬 파일의 행을 덧붙인다.
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const dashboardView = resolveTicketDashboardView(await searchParams);
  const requestHeaders = await headers();
  const [realRows, vendorResult] = await Promise.all([
    listManagerTicketRows(),
    listManagerVendors(),
  ]);
  const rows = await appendLocalTicketDemoRows(realRows, requestHeaders.get("host"));

  if (dashboardView === "dashboard") {
    return (
      <>
        <TicketDashboardAutoRefresh />
        <ComplaintDashboard rows={rows} />
      </>
    );
  }

  const initialTemplate = dashboardView === "management" ? "all" : dashboardView;
  return (
    <>
      {dashboardView === "management" ? (
        <TicketDashboardAutoRefresh />
      ) : null}
      <ManagerDefectDashboard
        rows={rows}
        vendors={vendorResult.data}
        vendorSelectionDisabled={vendorResult.source === "DEMO"}
        initialTemplate={initialTemplate}
        key={initialTemplate}
      />
    </>
  );
}
