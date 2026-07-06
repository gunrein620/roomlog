import { redirect } from "next/navigation";
import { Button, Card } from "@roomlog/ui";
import type { Deposit, ManagerBillRow } from "@roomlog/types";
import {
  confirmManagerPaymentReport,
  getManagerDashboard,
  getManagerDeposits,
  matchManagerDeposit,
  type ManagerDepositsData,
} from "@/lib/billing-manager-api";
import {
  BillTable,
  BillingShell,
  DepositTable,
  PageStack,
  Section,
  formFieldStyle,
  routes,
} from "../_components";

async function confirmReportAction(formData: FormData) {
  "use server";

  const billId = String(formData.get("billId") ?? "");
  const reportId = String(formData.get("reportId") ?? "");
  if (billId && reportId) await confirmManagerPaymentReport(billId, reportId);
  redirect(routes.matching);
}

async function matchDepositAction(formData: FormData) {
  "use server";

  const depositId = String(formData.get("depositId") ?? "");
  const billId = String(formData.get("billId") ?? "");
  if (depositId && billId) await matchManagerDeposit(depositId, billId);
  redirect(routes.matching);
}

export default async function Page() {
  const [data, dashboard] = await Promise.all([getManagerDeposits(), getManagerDashboard()]);
  const billCandidates = dashboard.bills;

  return (
    <BillingShell title="입금 매칭·확인 필요" active={routes.matching}>
      <PageStack>
        <Section
          title="납부 신고 큐"
          action={<Button variant="secondary" disabled>신고별 확정 처리</Button>}
        >
          <BillTable
            bills={data.paymentReports}
            renderAction={(bill) => <ReportConfirmForm bill={bill} />}
          />
        </Section>

        <Section
          title="실제 입금 매칭"
          action={<Button disabled>행에서 매칭 확정</Button>}
        >
          <DepositTable
            deposits={data.deposits}
            emptyText="매칭할 실제 입금이 없습니다."
            renderAction={(deposit) => <DepositMatchForm deposit={deposit} bills={billCandidates} />}
          />
        </Section>

        <Section
          title="orphan 입금 큐"
          action={<Button variant="secondary" disabled>후보 선택 후 연결</Button>}
        >
          <DepositTable
            deposits={data.orphanDeposits}
            emptyText="미해소 orphan 입금이 없습니다."
            renderAction={(deposit) => <DepositMatchForm deposit={deposit} bills={billCandidates} />}
          />
        </Section>

        <Section
          title="불일치·확인 요청"
          action={<Button variant="secondary" disabled>확인 후 처리</Button>}
        >
          <DepositTable
            deposits={data.mismatchDeposits}
            emptyText="불일치 입금이 없습니다."
            renderAction={(deposit) => <DepositMatchForm deposit={deposit} bills={billCandidates} />}
          />
        </Section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-md)" }}>
          <Card>
            <h2 style={{ margin: 0, fontSize: "var(--fs-title)" }}>환불·과오납 처리</h2>
            <p style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
              초과·이중 납부는 납부완료로 흡수하지 않고 환불 또는 이월 surface에서 별도 처리합니다.
            </p>
            <Button variant="secondary">환불·과오납 처리</Button>
          </Card>
          <Card>
            <h2 style={{ margin: 0, fontSize: "var(--fs-title)" }}>분쟁 종료</h2>
            <p style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
              매칭 입금이 영구히 확인되지 않는 주장은 관리자 수동 처리로 보류를 종료합니다.
            </p>
            <Button variant="secondary">분쟁 종료(수동 처리)</Button>
          </Card>
        </div>
      </PageStack>
    </BillingShell>
  );
}

function ReportConfirmForm({ bill }: { bill: ManagerDepositsData["paymentReports"][number] }) {
  if (!bill.reportId) {
    return (
      <Button type="button" variant="secondary" disabled>
        reportId 필요
      </Button>
    );
  }

  return (
    <form action={confirmReportAction}>
      <input type="hidden" name="billId" value={bill.billId} />
      <input type="hidden" name="reportId" value={bill.reportId} />
      <Button type="submit">신고 확정</Button>
    </form>
  );
}

function DepositMatchForm({ deposit, bills }: { deposit: Deposit; bills: ManagerBillRow[] }) {
  if (deposit.matchStatus === "matched") {
    return (
      <Button type="button" variant="secondary" disabled>
        확정됨
      </Button>
    );
  }

  const defaultBillId = preferredBillId(deposit, bills);
  const disabled = !defaultBillId;

  return (
    <form
      action={matchDepositAction}
      style={{ display: "flex", gap: "var(--space-sm)", justifyContent: "flex-end", flexWrap: "wrap" }}
    >
      <input type="hidden" name="depositId" value={deposit.id} />
      <select
        name="billId"
        defaultValue={defaultBillId}
        disabled={disabled}
        style={{ ...formFieldStyle, minWidth: 180 }}
        aria-label={`${deposit.depositorName} 입금 매칭 청구서`}
      >
        {bills.map((bill) => (
          <option key={bill.billId} value={bill.billId}>
            {bill.unitId}호 · {bill.billingMonth}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={disabled}>
        매칭 확정
      </Button>
    </form>
  );
}

function preferredBillId(deposit: Deposit, bills: ManagerBillRow[]): string {
  if (deposit.matchedBillId && bills.some((bill) => bill.billId === deposit.matchedBillId)) {
    return deposit.matchedBillId;
  }
  if (deposit.guessedUnitId) {
    const guessed = bills.find((bill) => bill.unitId === deposit.guessedUnitId);
    if (guessed) return guessed.billId;
  }
  return bills.find((bill) => bill.status !== "paid")?.billId ?? bills[0]?.billId ?? "";
}
