import Link from "next/link";
import { Button, Card } from "@roomlog/ui";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import { getBill } from "@/lib/payment-api";

// T-PAY-05 · 연체(납부) 안내
// 연체를 존엄하게 알리고 납부·상담으로 잇는다. 단계 라벨(경미/주의/심각)은 관리인 전용 → 비노출.
// primary=납부하기(→02) · 분할·사정 상담/문의(시스템/크로스=채팅, 이번 슬라이스 밖).
// 원칙: 확인중·orphan 있는 건은 애초에 여기 안 뜬다(낸 사람 독촉 차단, A4·A5).

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
  const remaining = bill.totalAmount - bill.paidAmount;
  const daysPast = Math.floor(
    (new Date().getTime() - new Date(bill.dueDate).getTime()) / 86_400_000,
  );

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
        <div style={{ fontSize: 14, fontWeight: 700 }}>납부 안내</div>
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
        {/* ① 미납 금액·기한 경과 사실 (담백하게) */}
        <section>
          <div style={sectionLabel}>미납 안내</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>
                {bill.billingMonth} 미납 금액
              </span>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{won(remaining)}</span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--on-surface-variant)",
                borderTop: "1px dashed var(--border)",
                paddingTop: 8,
              }}
            >
              납부 기한 {bill.dueDate.slice(0, 10)}
              {daysPast > 0 ? ` · ${daysPast}일 경과` : " 기준"}
            </div>
          </Card>
        </section>

        {/* ② 해결지향 안내 — 단계 라벨(경미/주의/심각) 비노출 */}
        <section>
          <div style={sectionLabel}>이렇게 해결할 수 있어요</div>
          <Card style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.7 }}>
            지금 바로 납부하거나, 사정이 어렵다면 <b>분할 납부·사정 상담</b>을 요청할 수 있어요.
            함께 방법을 찾을 수 있으니 편하게 알려 주세요.
          </Card>
        </section>

        {/* ③ 번역 (인-스크린 · 셸 정적 표시) */}
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

      {/* Footer: 납부하기(primary) · 분할·사정 상담 · 보조 문의 */}
      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Link
          href={withBillId(PAYMENT_ROUTES["T-PAY-02"], bill.id)}
          style={{ textDecoration: "none", display: "block" }}
        >
          <Button fullWidth>납부하기</Button>
        </Link>
        {/* 시스템/크로스(채팅) — 이번 슬라이스 밖 */}
        <Button fullWidth variant="secondary">
          분할·사정 상담
        </Button>
        <Button fullWidth variant="ghost">
          문의하기
        </Button>
      </footer>
    </>
  );
}
