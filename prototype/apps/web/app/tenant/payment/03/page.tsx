import Link from "next/link";
import type { BillStatus } from "@roomlog/types";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import { listBills } from "@/lib/payment-api";
import { RecordList, type RecordRow } from "./RecordList";

// T-PAY-03 · 납부/청구 기록
// 과거 내역 기간별 조회 + 증빙. 기간 필터·영수증은 인-스크린(RecordList). 항목 → 01.

const STATUS_LABEL: Record<BillStatus, string> = {
  draft: "작성 중",
  sent: "납부예정",
  confirming: "확인 중",
  partially_paid: "일부 납부",
  paid: "완료",
  overdue: "연체",
  corrected: "정정됨",
  canceled: "취소됨",
};

export default async function Page() {
  const bills = await listBills();
  const records: RecordRow[] = [...bills]
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))
    .map((b) => ({
      billId: b.id,
      billingMonth: b.billingMonth,
      totalAmount: b.totalAmount,
      statusLabel: STATUS_LABEL[b.status],
      paid: b.status === "paid",
    }));

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href={PAYMENT_ROUTES["T-PAY-00"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>납부 기록</div>
        <div style={{ width: 34 }} />
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <RecordList records={records} />
      </div>
    </>
  );
}
