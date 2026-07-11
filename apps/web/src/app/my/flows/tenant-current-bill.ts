import type { TenantBillingOverview, TenantBillSummary } from "@roomlog/types";

export interface TenantBillingCurrentCardModel {
  id: string;
  billingMonth: string;
  totalAmount: number;
  rentAmount: number;
  maintenanceAmount: number;
  stateLabel: string;
  actionLabel: string;
  actionHref: string;
}

export interface TenantBillingUpcomingCardModel {
  id: string;
  billingMonth: string;
  monthLabel: string;
  amountLabel: string;
  availabilityLabel: string;
  actionHref: string;
}

export interface TenantBillingCardModel {
  current: TenantBillingCurrentCardModel | null;
  upcoming: TenantBillingUpcomingCardModel | null;
  previousUnpaidLabel: string | null;
}

export function tenantBillingCardModel(
  overview: TenantBillingOverview,
): TenantBillingCardModel {
  return {
    current: overview.current ? currentCard(overview.current) : null,
    upcoming: overview.upcoming ? upcomingCard(overview.upcoming) : null,
    previousUnpaidLabel: overview.previousUnpaid.length > 0
      ? `이전 미납 ${overview.previousUnpaid.length}건`
      : null,
  };
}

function currentCard(summary: TenantBillSummary): TenantBillingCurrentCardModel {
  const { bill } = summary;
  const isPaid = bill.status === "paid" || summary.remainingAmount <= 0;
  const action = isPaid
    ? { label: "영수증 보기", href: "/tenant/payment/03" }
    : summary.canPay
      ? { label: "즉시 납부하기", href: `/tenant/payment/02?id=${encodeURIComponent(bill.id)}` }
      : { label: "청구 상세 보기", href: `/tenant/payment/01?id=${encodeURIComponent(bill.id)}` };

  return {
    id: bill.id,
    billingMonth: bill.billingMonth,
    totalAmount: bill.totalAmount,
    rentAmount: itemAmount(summary, "rent"),
    maintenanceAmount: itemAmount(summary, "maintenance"),
    stateLabel: currentStateLabel(summary),
    actionLabel: action.label,
    actionHref: action.href,
  };
}

function upcomingCard(summary: TenantBillSummary): TenantBillingUpcomingCardModel {
  const { bill } = summary;
  return {
    id: bill.id,
    billingMonth: bill.billingMonth,
    monthLabel: billingMonthLabel(bill.billingMonth),
    amountLabel: `${bill.totalAmount.toLocaleString("ko-KR")} KRW`,
    availabilityLabel: paymentDateLabel(bill.dueDate),
    actionHref: `/tenant/payment/01?id=${encodeURIComponent(bill.id)}`,
  };
}

function itemAmount(
  summary: TenantBillSummary,
  kind: "rent" | "maintenance",
): number {
  return summary.bill.items
    .filter((item) => item.kind === kind)
    .reduce((sum, item) => sum + item.amount, 0);
}

function currentStateLabel(summary: TenantBillSummary): string {
  if (summary.bill.status === "paid" || summary.remainingAmount <= 0) {
    return "납부 완료";
  }
  if (summary.bill.status === "confirming") {
    return "납부 확인 중";
  }

  const unpaidItemCount = summary.bill.items.filter(
    (item) => item.amount - (item.paidAmount ?? 0) > 0,
  ).length;
  if (summary.canPay && unpaidItemCount > 0) {
    return `${unpaidItemCount}개 항목 납부 대기`;
  }
  return summary.canPay ? "납부 대기" : "납부 예정";
}

function billingMonthLabel(billingMonth: string): string {
  const month = Number(billingMonth.slice(5, 7));
  return Number.isInteger(month) && month >= 1 && month <= 12
    ? `${month}월`
    : billingMonth;
}

function paymentDateLabel(dueDate: string): string {
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return "결제 예정";

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return month && day ? `${month}월 ${day}일 결제 예정` : "결제 예정";
}
