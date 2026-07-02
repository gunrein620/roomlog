import { getManagerDashboard } from "@/lib/billing-manager-api";
import {
  BillTable,
  BillingShell,
  Grid,
  MetricCard,
  PageStack,
  Section,
  TextButtonLink,
  routes,
} from "./_components";

export default async function Page() {
  const { summary, bills } = await getManagerDashboard();
  const prioritized = [...bills].sort((a, b) => {
    const weight = (status: string) => (status === "overdue" ? 0 : status === "confirming" ? 1 : status === "draft" ? 2 : 3);
    return weight(a.status) - weight(b.status);
  });

  return (
    <BillingShell title="청구 관리" active={routes.dashboard}>
      <PageStack>
        <Grid columns={4}>
          <MetricCard label="전체 청구" value={summary.total} note="이번 기간 청구서" />
          <MetricCard label="확인 필요" value={summary.confirmNeeded} note="신고·불일치·orphan" />
          <MetricCard label="대기" value={summary.pending} note="발송완료·수납대기" />
          <MetricCard label="연체" value={summary.overdue} note="가드 통과분만" />
        </Grid>

        <Section
          title="청구 목록"
          action={
            <div style={{ display: "flex", gap: "var(--space-sm)" }}>
              <TextButtonLink href={routes.collection} variant="secondary">
                수금 현황
              </TextButtonLink>
              <TextButtonLink href={routes.overdue} variant="secondary">
                연체 관리
              </TextButtonLink>
              <TextButtonLink href={routes.bill("new")}>월 청구서 생성</TextButtonLink>
            </div>
          }
        >
          <BillTable bills={prioritized} />
        </Section>

        <Section title="승인 게이트">
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-md)",
              background: "var(--surface-container-lowest)",
              color: "var(--on-surface-variant)",
              lineHeight: "var(--lh-body)",
            }}
          >
            청구서는 초안 생성 후 관리인이 상세 화면에서 금액·계좌·안내문을 확인하고 승인해야 발송됩니다.
            일괄 독촉은 제공하지 않으며, 독촉은 각 청구서의 M-BILL-05 흐름에서만 작성합니다.
          </div>
        </Section>
      </PageStack>
    </BillingShell>
  );
}
