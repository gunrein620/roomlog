import { createReport, getBill, type CreatePaymentReportInput } from "@/lib/payment-api";
import { PaymentReportForm } from "./PaymentReportForm";

// T-PAY-02 · 납부 신고
// 서버 page가 현재 청구를 BFF로 읽고, 신고 POST는 server action으로 쿠키 인증을 유지한다.

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const bill = await getBill(id);

  async function reportAction(dto: CreatePaymentReportInput) {
    "use server";
    return createReport(bill.id, dto);
  }

  return <PaymentReportForm bill={bill} reportAction={reportAction} />;
}
