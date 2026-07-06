import Link from "next/link";
import type { BillStatus } from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import { getBill } from "@/lib/payment-api";

// T-PAY-01 · 청구 상세
// 항목 분해 + 계좌·기한 + 청구 상태(정정 이력). primary=납부하기(→02). 관리비 세부·과거는 미룸.

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

const sectionLabel = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 7,
} as const;

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function withBillId(route: string, billId?: string): string {
  return billId ? `${route}?id=${encodeURIComponent(billId)}` : route;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const bill = await getBill(id);

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
        <div style={{ fontSize: 14, fontWeight: 700 }}>{bill.billingMonth} 청구 상세</div>
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
        {/* ④ 청구 상태 + 정정 이력 */}
        <section>
          <div style={sectionLabel}>청구 상태</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Badge emphasis style={{ alignSelf: "flex-start" }}>
              {STATUS_LABEL[bill.status]}
            </Badge>
            {bill.correctionHistory && bill.correctionHistory.length > 0 && (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 16,
                  fontSize: 12,
                  color: "var(--on-surface-variant)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {bill.correctionHistory.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* ① 항목 분해 */}
        <section>
          <div style={sectionLabel}>청구 항목</div>
          <Card style={{ padding: 0 }}>
            {bill.items.map((item, i) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderBottom: i < bill.items.length - 1 ? "1px solid var(--border)" : "none",
                  fontSize: 14,
                }}
              >
                <span style={{ color: "var(--on-surface-variant)" }}>{item.label}</span>
                <span style={{ fontWeight: 600 }}>{won(item.amount)}</span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderTop: "1.5px solid var(--border)",
                fontSize: 15,
                fontWeight: 800,
              }}
            >
              <span>합계</span>
              <span>{won(bill.totalAmount)}</span>
            </div>
          </Card>
        </section>

        {/* ② 계좌·예금주 · ③ 기한 */}
        <section>
          <div style={sectionLabel}>납부 정보</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Row label="입금 계좌" value={`${bill.account.bankName} ${bill.account.accountNumber}`} />
            <Row label="예금주" value={bill.account.accountHolder} />
            <Row label="납부 기한" value={bill.dueDate.slice(0, 10)} />
          </Card>
        </section>

        {/* ⑤ 번역 토글 (인-스크린 · 셸 정적 표시) */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            fontSize: 12,
            color: "var(--on-surface-variant)",
          }}
        >
          🌐 다른 언어로 보기
        </div>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <Link
          href={withBillId(PAYMENT_ROUTES["T-PAY-02"], bill.id)}
          style={{ textDecoration: "none", display: "block" }}
        >
          <Button fullWidth>납부하기</Button>
        </Link>
      </footer>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
      <span style={{ color: "var(--on-surface-variant)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
