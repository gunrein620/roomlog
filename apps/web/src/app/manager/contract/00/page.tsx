import {
  getManagerContractDashboard,
  type ManagerContractRow,
} from "@/lib/contract-manager-api";
import {
  ContractShell,
  Grid,
  MetricCard,
  PageStack,
} from "../_components";
import { ContractDashboardClient } from "./ContractDashboardClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const dashboard = await getManagerContractDashboard();
  const sortedRows = [...dashboard.rows].sort((a, b) => {
    const score = (row: ManagerContractRow) =>
      Number(row.slaOverdue) * 4 +
      Number(row.needsCheckCount > 0) * 3 +
      Number(row.contract.review === "pending") * 2;

    return score(b) - score(a) || a.daysToExpire - b.daysToExpire;
  });

  return (
    <ContractShell id="M-DOC-00" title="계약서 검토·확정 대시보드">
      <PageStack>
        <Grid columns={4}>
          <MetricCard label="검토 대기" value={`${dashboard.counts.pending}건`} note="임차인·관리자 업로드 유입" />
          <MetricCard label="확인 필요" value={`${dashboard.counts.needsCheck}개`} note="OCR 원문 대조 필요" />
          <MetricCard label="검토 필요" value={`${dashboard.counts.slaOverdue}건`} note="장기 미확정 계약 표시" />
          <MetricCard label="미등록 호실" value={`${dashboard.counts.unregistered}호`} note="수동값 또는 초대 필요" />
        </Grid>

        <ContractDashboardClient counts={dashboard.counts} rows={sortedRows} />
      </PageStack>
    </ContractShell>
  );
}
