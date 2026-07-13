import {
  getManagerContractDashboard,
  type ManagerContractRow,
} from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import {
  Card,
  ContractShell,
  Grid,
  LinkButton,
  MetricCard,
  PageStack,
  Section,
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
          <MetricCard label="SLA 초과" value={`${dashboard.counts.slaOverdue}건`} note="장기 미확정 계약 표시" />
          <MetricCard label="미등록 호실" value={`${dashboard.counts.unregistered}호`} note="수동값 또는 초대 필요" />
        </Grid>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-02"]}>계약서 등록</LinkButton>
        </div>

        <ContractDashboardClient counts={dashboard.counts} rows={sortedRows} />

        <Section
          title="보관·삭제 처리"
          action={
            <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-05"]} variant="secondary">
              삭제 큐 열기
            </LinkButton>
          }
        >
          <Card style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
            삭제 요청은 완료, 제한 보관, 삭제 불가를 분리해 임차인에게 정직하게 고지합니다.
            법정 보관과 정산 예외는 처리 게이트에서 다시 확인합니다.
          </Card>
        </Section>
      </PageStack>
    </ContractShell>
  );
}
