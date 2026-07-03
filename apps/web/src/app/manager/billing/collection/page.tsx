import { getManagerCollection } from "@/lib/billing-manager-api";
import {
  BillingShell,
  DepositTable,
  Grid,
  MetricCard,
  PageStack,
  Section,
  TextButtonLink,
  percent,
  routes,
  won,
} from "../_components";

export default async function Page() {
  const summary = await getManagerCollection();

  return (
    <BillingShell title="수금 현황" active={routes.collection}>
      <PageStack>
        <Grid columns={4}>
          <MetricCard label="수금률" value={percent(summary.collectionRate)} note="확정 수납 기준" />
          <MetricCard label="확정 수납" value={won(summary.collectedAmount)} note="확인중·orphan 제외" />
          <MetricCard label="미납" value={won(summary.unpaidAmount)} note="확정 기준 잔액" />
          <MetricCard label="공실 손실" value={won(summary.vacancyLoss)} note="재무 표기 분리" />
        </Grid>

        <Grid columns={2}>
          <MetricCard label="확인중 금액" value={won(summary.confirmingAmount)} note="납부 신고 큐, 확정 수납 제외" />
          <MetricCard label="orphan 금액" value={won(summary.orphanAmount)} note="미연결 실제 입금, 미납 판정 제외" />
        </Grid>

        <Section
          title="최근 입금"
          action={<TextButtonLink href={routes.matching}>입금 매칭 확인</TextButtonLink>}
        >
          <DepositTable deposits={summary.recentDeposits} emptyText="최근 입금이 없습니다." />
        </Section>
      </PageStack>
    </BillingShell>
  );
}
