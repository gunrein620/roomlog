import { listManagerTicketRows } from "@/lib/ticket-manager-api";
import { ComplaintDashboard } from "./ComplaintDashboard";
import { ManagerDefectDashboard } from "./ManagerDefectDashboard";

type SearchParams = Promise<{ type?: string }>;

// 대시보드는 실제 접수 티켓만 보여준다 — 더미 행 혼합 제거(세입자 신규 요청과 직결).
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { type } = await searchParams;
  const initialTemplate = type === "complaint" || type === "defect" ? type : "all";
  const rows = await listManagerTicketRows();

  if (initialTemplate === "all") return <ComplaintDashboard rows={rows} />;

  return <ManagerDefectDashboard rows={rows} initialTemplate={initialTemplate} key={initialTemplate} />;
}
