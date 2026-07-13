import { Button, Card } from "@roomlog/ui";
import type { BillStatus } from "@roomlog/types";
import { getManagerBill } from "@/lib/billing-manager-api";
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
import { publishBillAction } from "./actions";

type Params = Promise<{ billId: string }>;
type SearchParams = Promise<{ id?: string; published?: string; publishError?: string }>;

const billStatusLabel: Record<BillStatus, string> = {
  draft: "초안",
  sent: "수납 대기",
  confirming: "납부 확인 중",
  partially_paid: "일부 수납",
  paid: "수납 완료",
  overdue: "연체",
  corrected: "정정",
  canceled: "취소",
};

export default async function Page({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ billId }, { id, published, publishError }] = await Promise.all([params, searchParams]);
  const targetBillId = id || billId;
  const bill = await getManagerBill(targetBillId);
  const isNew = targetBillId === "new";
  const guardBlocked = bill.status === "confirming";

  return (
    <BillingShell title={isNew ? "월 청구서 생성" : "청구서 상세"} active={routes.dashboard}>
      <PageStack>
        <Section
          title={isNew ? `${bill.billingMonth} 정기 청구 초안` : `${bill.unitId}호 · ${bill.billingMonth}`}
          action={<TextButtonLink href={routes.dashboard} variant="secondary">목록으로</TextButtonLink>}
        >
          <Grid columns={4}>
            <MetricCard label="청구월" value={bill.billingMonth} />
            <MetricCard label="청구액" value={isNew ? "초안" : won(bill.totalAmount)} />
            <MetricCard label="확정 수납" value={won(bill.paidAmount)} />
            <MetricCard label="기한" value={bill.dueDate} />
          </Grid>
        </Section>

        {published === "1" ? (
          <Card
            role="status"
            style={{ background: "var(--success-container)", color: "var(--success)" }}
          >
            청구가 확정됐습니다. 결제일 한 달 전부터 세입자에게 공개되고 납부할 수 있습니다.
          </Card>
        ) : null}

        {publishError ? (
          <Card
            role="alert"
            style={{ background: "var(--error-container)", color: "var(--error)" }}
          >
            {publishError}
          </Card>
        ) : null}

        <GuardBanner blocked={guardBlocked} hasConfirming={guardBlocked} hasOrphan={false} />

        <Grid columns={2}>
          <Card>
            <h2 style={{ margin: 0, fontSize: "var(--fs-title)" }}>항목·계좌 편집</h2>
            <div style={{ marginTop: "var(--space-md)", display: "grid", gap: "var(--space-sm)" }}>
              {bill.items.map((item) => (
                <div key={`${item.label}-${item.amount}`} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  <span>{item.label}</span>
                  <strong>{won(item.amount)}</strong>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "var(--space-md)", color: "var(--on-surface-variant)" }}>
              {bill.account.bankName} {bill.account.accountNumber} · 예금주 {bill.account.accountHolder}
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
              {bill.unitId}호 {bill.billingMonth} 청구서를 확인해 주세요.
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
          {bill.status === "draft" ? (
            <form action={publishBillAction} style={{ display: "contents" }}>
              <input type="hidden" name="billId" value={bill.id} />
              <Button type="submit">청구 확정</Button>
            </form>
          ) : (
            <span style={{ alignSelf: "center", color: "var(--on-surface-variant)" }}>
              현재 상태: {billStatusLabel[bill.status]}
            </span>
          )}
        </div>
      </PageStack>
    </BillingShell>
  );
}
