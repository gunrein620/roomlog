import {
  getManagerContractDashboard,
  type ManagerContractRow,
} from "@/lib/contract-manager-api";
import { ContractShell, PageStack } from "../_components";
import { ContractDashboardClient } from "./ContractDashboardClient";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ focus?: string; registered?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { focus, registered } = await searchParams;
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
        <ContractDashboardClient
          counts={dashboard.counts}
          rows={sortedRows}
          focusedContractId={focus}
          showRegistrationAlert={registered === "1"}
        />
      </PageStack>
    </ContractShell>
  );
}
