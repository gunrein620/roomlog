import { notFound, redirect } from "next/navigation";
import type { Bill, TenantBillingOverview } from "@roomlog/types";
import {
  DEMO_BILL_ID,
  createBillPaymentOrder,
  createReport,
  getBillForMutation,
  getTenantBillingOverview,
  tenantBillSummaryForId,
  type CreateBillPaymentOrderInput,
  type CreatePaymentReportInput,
} from "@/lib/payment-api";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import { ApiError } from "@/lib/server-api";
import { PaymentReportForm } from "./PaymentReportForm";

function withBillId(route: string, billId: string): string {
  return `${route}?id=${encodeURIComponent(billId)}`;
}

// T-PAY-02 · 납부 신고
// 서버 page가 현재 청구를 BFF로 읽고, 신고 POST는 server action으로 쿠키 인증을 유지한다.

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  let bill: Bill;
  let overview: TenantBillingOverview;

  try {
    [bill, overview] = await Promise.all([
      getBillForMutation(id),
      getTenantBillingOverview(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const requestedBillId = id?.trim();
  const summaryBillId =
    requestedBillId && requestedBillId !== DEMO_BILL_ID ? requestedBillId : bill.id;
  const summary = tenantBillSummaryForId(overview, summaryBillId);
  const remainingAmount = summary?.remainingAmount ?? Math.max(0, bill.totalAmount - bill.paidAmount);

  if (bill.status === "paid" || remainingAmount <= 0) {
    redirect(PAYMENT_ROUTES["T-PAY-03"]);
  }

  if (summary?.canPay !== true) {
    redirect(withBillId(PAYMENT_ROUTES["T-PAY-01"], bill.id));
  }

  async function reportAction(dto: CreatePaymentReportInput) {
    "use server";
    return createReport(bill.id, dto);
  }

  async function paymentOrderAction(dto: CreateBillPaymentOrderInput) {
    "use server";
    return createBillPaymentOrder(bill.id, dto);
  }

  return (
    <PaymentReportForm
      bill={bill}
      reportAction={reportAction}
      paymentOrderAction={paymentOrderAction}
    />
  );
}
