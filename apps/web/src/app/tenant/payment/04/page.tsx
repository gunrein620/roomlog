import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import { getMaintenance } from "@/lib/payment-api";

// T-PAY-04 · 관리비 사용 내역
// 관리비 사용처 항목별 투명 공개 + 영수증 유무. 관리자 미입력(available=false)이면 빈 상태.
// (00에서 미입력 시 진입 자체가 비활성 — 여기선 방어적 빈 상태.)

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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const maintenance = await getMaintenance(id);
  const hasData = maintenance.available && maintenance.items.length > 0;

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
        <div style={{ fontSize: 14, fontWeight: 700 }}>{maintenance.billingMonth} 관리비 내역</div>
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
        {hasData ? (
          <section>
            <div style={sectionLabel}>항목별 사용 내역</div>
            <Card style={{ padding: 0 }}>
              {maintenance.items.map((item, i) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderBottom:
                      i < maintenance.items.length - 1 ? "1px solid var(--border)" : "none",
                    fontSize: 14,
                  }}
                >
                  <span style={{ color: "var(--on-surface-variant)" }}>{item.label}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{won(item.amount)}</span>
                    {item.receiptAvailable ? (
                      <Badge>영수증</Badge>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>—</span>
                    )}
                  </span>
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
                <span>{won(maintenance.totalAmount)}</span>
              </div>
            </Card>
          </section>
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              textAlign: "center",
              padding: "40px 16px",
              border: "1.5px dashed var(--outline-variant)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--on-surface-variant)" }}>
              관리비 내역이 아직 없어요
            </div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              관리자가 사용 내역을 입력하면 여기에 표시돼요.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
