import { Button, Card } from "@roomlog/ui";
import { getManagerDashboard } from "@/lib/billing-manager-api";
import {
  BillingShell,
  Grid,
  GuardBanner,
  MetricCard,
  PageStack,
  Section,
  TextButtonLink,
  routes,
  won,
} from "../_components";

export default async function Page({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  const { bills } = await getManagerDashboard();
  const bill = bills.find((item) => item.billId === billId) ?? bills[0];
  const isNew = billId === "new";
  const guardBlocked = bill.status === "confirming";

  return (
    <BillingShell title={isNew ? "월 청구서 생성" : "청구서 상세"} active={routes.dashboard}>
      <PageStack>
        <Section
          title={isNew ? "2026-08 정기 청구 초안" : `${bill.unitId}호 · ${bill.tenantName}`}
          action={<TextButtonLink href={routes.dashboard} variant="secondary">목록으로</TextButtonLink>}
        >
          <Grid columns={4}>
            <MetricCard label="청구월" value={isNew ? "2026-08" : bill.billingMonth} />
            <MetricCard label="청구액" value={isNew ? "초안" : won(bill.totalAmount)} />
            <MetricCard label="확정 수납" value={won(isNew ? 0 : bill.paidAmount)} />
            <MetricCard label="기한" value={isNew ? "2026-08-10" : bill.dueDate} />
          </Grid>
        </Section>

        <GuardBanner blocked={guardBlocked} hasConfirming={guardBlocked} hasOrphan={false} />

        <Grid columns={2}>
          <Card>
            <h2 style={{ margin: 0, fontSize: "var(--fs-title)" }}>항목·계좌 편집</h2>
            <div style={{ marginTop: "var(--space-md)", display: "grid", gap: "var(--space-sm)" }}>
              {[
                ["월 임대료", won(isNew ? 650000 : Math.max(bill.totalAmount - 80000, 0))],
                ["관리비", won(isNew ? 70000 : 70000)],
                ["수도·전기 정산", won(isNew ? 0 : Math.max(bill.totalAmount - 720000, 0))],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "var(--space-md)", color: "var(--on-surface-variant)" }}>
              하나은행 123-456789-0000 · 예금주 룸로그관리
            </div>
          </Card>

          <Card>
            <h2 style={{ margin: 0, fontSize: "var(--fs-title)" }}>AI 안내문 초안</h2>
            <div
              style={{
                marginTop: "var(--space-md)",
                minHeight: 160,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-md)",
                lineHeight: "var(--lh-body)",
                color: "var(--on-surface-variant)",
              }}
            >
              {bill.tenantName}님, {isNew ? "2026년 8월" : bill.billingMonth} 청구서를 확인해 주세요.
              금액과 계좌를 확인한 뒤 납부 또는 납부 신고를 진행할 수 있습니다.
            </div>
          </Card>
        </Grid>

        <Section title="상태 이력·감사로그">
          <Card style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
            작성 → 관리인 수정 → 승인 대기 → 발송. 정정·취소는 이 화면에서 사유와 함께 기록됩니다.
          </Card>
        </Section>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)" }}>
          <Button variant="secondary">정정·취소 기록</Button>
          <Button variant="secondary">상태 변경</Button>
          <Button>관리인 승인 후 청구서 발송</Button>
        </div>
      </PageStack>
    </BillingShell>
  );
}
