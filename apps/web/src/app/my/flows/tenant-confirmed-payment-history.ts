import type {
  TenantPaymentHistory,
  TenantPaymentHistoryEvent,
} from "@roomlog/types";

export type ConfirmedPaymentLog = {
  id: string;
  billId: string;
  billingMonth: string;
  activityDate: string;
  amount: number;
  methodLabel: string;
};

const METHOD_LABEL: Record<TenantPaymentHistoryEvent["type"], string> = {
  toss: "Toss 결제",
  deposit: "계좌 입금",
  report: "납부 신고",
  bill_due: "납부 기한",
};

export function confirmedPaymentLogs(
  history: TenantPaymentHistory,
): ConfirmedPaymentLog[] {
  return history.records
    .flatMap((record) =>
      record.payments
        .filter((payment) => payment.status === "confirmed")
        .map((payment) => ({
          id: `${record.billId}:${payment.id}`,
          billId: record.billId,
          billingMonth: record.billingMonth,
          activityDate: payment.activityDate,
          amount: payment.amount,
          methodLabel: METHOD_LABEL[payment.type],
        })),
    )
    .sort(
      (left, right) =>
        Date.parse(right.activityDate) - Date.parse(left.activityDate) ||
        right.id.localeCompare(left.id),
    );
}
