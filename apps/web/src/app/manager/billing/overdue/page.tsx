import { getManagerOverdue } from "@/lib/billing-manager-api";
import {
  BillingShell,
  Grid,
  MetricCard,
  OverdueTable,
  PageStack,
  Section,
  routes,
  won,
} from "../_components";

export default async function Page() {
  const data = await getManagerOverdue();
  const activeTotal = data.activeCases.reduce((sum, item) => sum + item.unpaidAmount, 0);
  const waitingTotal = data.waitingCases.reduce((sum, item) => sum + item.unpaidAmount, 0);

  return (
    <BillingShell title="연체 관리" active={routes.overdue}>
      <PageStack>
        <Grid columns={3}>
          <MetricCard label="총 미수금" value={won(activeTotal)} note="확인중·orphan 자동 제외" />
          <MetricCard label="연체 세대" value={`${data.activeCases.length}건`} note="관리인 단계 triage 대상" />
          <MetricCard label="확인 대기" value={won(waitingTotal)} note="M-BILL-03 처리 전 보류" />
        </Grid>

        <Section title="연체 세대 목록">
          <OverdueTable cases={data.activeCases} />
        </Section>

        <Section title="확인 대기">
          <OverdueTable cases={data.waitingCases} waiting />
        </Section>
      </PageStack>
    </BillingShell>
  );
}
