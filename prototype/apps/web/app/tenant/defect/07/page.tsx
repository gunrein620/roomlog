import Link from "next/link";
import { Card } from "@roomlog/ui";
import { routeFor } from "@/lib/nav";
import { DEMO_TICKET_ID, getRepair, getTicket } from "@/lib/api";

// T-DEF-07 · 수리비 결제 — 수리 완료 후 결제. '결제하기' 라벨은 이 화면 단독(08은 '결제 단계로').

const primaryLinkStyle = {
  height: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  width: "100%",
  boxSizing: "border-box",
} as const;

const sectionLabelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: "var(--space-sm)",
} as const;

function formatDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default async function Page() {
  const [ticket, repair] = await Promise.all([getTicket(DEMO_TICKET_ID), getRepair(DEMO_TICKET_ID)]);

  return (
    <>
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-md) var(--page-margin)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link
          href={routeFor("T-DEF-08")}
          style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: "var(--fs-header)", fontWeight: "var(--fw-header)" }}>수리비 결제</div>
        <div style={{ width: 34 }} />
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--page-margin)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-lg)",
        }}
      >
        <Card style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <span
            style={{
              width: 26,
              height: 26,
              flex: "none",
              border: "1.5px solid var(--primary)",
              borderRadius: "var(--radius-full)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            ✓
          </span>
          <span style={{ fontSize: "var(--fs-body)" }}>
            수리 완료 · {ticket.title} · {formatDate(repair.scheduledAt)}
          </span>
        </Card>

        <div>
          <div style={sectionLabelStyle}>결제 금액</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            {(repair.quoteItems ?? []).map((item) => (
              <div
                key={item.label}
                style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}
              >
                <span>{item.label}</span>
                <span>{item.amount.toLocaleString()}</span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "var(--fs-subtitle)",
                fontWeight: 700,
                borderTop: "1px dashed var(--border)",
                paddingTop: "var(--space-sm)",
              }}
            >
              <span>결제 금액</span>
              <span>{(repair.quoteAmount ?? 0).toLocaleString()}원</span>
            </div>
          </Card>
        </div>

        <div>
          <div style={sectionLabelStyle}>결제 수단</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-md)",
                border: "1.5px solid var(--primary)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-md)",
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  flex: "none",
                  border: "1.5px solid var(--primary)",
                  borderRadius: "var(--radius-full)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "var(--radius-full)", background: "var(--primary)" }} />
              </span>
              <span style={{ fontSize: "var(--fs-body)", fontWeight: 600 }}>간편결제</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-md)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-md)",
              }}
            >
              <span style={{ width: 16, height: 16, flex: "none", border: "1.5px solid var(--outline-variant)", borderRadius: "var(--radius-full)" }} />
              <span style={{ fontSize: "var(--fs-body)", color: "var(--on-surface-variant)" }}>카드</span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", borderTop: "1px dashed var(--border)", paddingTop: "var(--space-md)" }}>
          환불·취소 정책 · 작업 완료 후 결제 건은 환불 규정에 따라 처리돼요.
        </div>
      </div>

      <div
        style={{
          flex: "none",
          padding: "var(--space-md) var(--page-margin)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
        }}
      >
        <Link href={routeFor("T-DEF-10")} style={primaryLinkStyle}>
          결제하기
        </Link>
      </div>
    </>
  );
}
