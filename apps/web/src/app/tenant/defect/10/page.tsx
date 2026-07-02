import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { routeFor } from "@/lib/nav";
import { DEMO_TICKET_ID, getTicket } from "@/lib/api";

// T-DEF-10 · 처리 완료 — 임차인책임(결제완료)·임대인책임(관리자처리완료) 두 종료를 한 화면으로 합류.

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

const secondaryLinkStyle = {
  height: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  background: "transparent",
  color: "var(--primary)",
  border: "1.5px solid var(--primary)",
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  width: "100%",
  boxSizing: "border-box",
} as const;

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function Page() {
  const ticket = await getTicket(DEMO_TICKET_ID);

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "var(--space-md) var(--page-margin)",
          borderBottom: "1px solid var(--border)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "var(--fs-header)", fontWeight: "var(--fw-header)" }}>처리 완료</div>
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-md)", padding: "var(--space-sm) 0" }}>
          <span
            style={{
              width: 52,
              height: 52,
              border: "1.5px solid var(--primary)",
              borderRadius: "var(--radius-full)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            ✓
          </span>
          <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 700 }}>처리가 완료되었어요</div>
        </div>

        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
          <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>{ticket.title} · 처리 완료</div>
          <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
            처리 일자 · {formatDate(ticket.updatedAt)}
          </div>
        </Card>

        <Link
          href={routeFor("T-DEF-11")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--card-padding)",
            textDecoration: "none",
            color: "var(--on-surface-variant)",
            fontSize: "var(--fs-body)",
          }}
        >
          <span>전·후 사진 / 기록 보기</span>
          <span>›</span>
        </Link>

        <div>
          <div
            style={{
              fontSize: "var(--fs-caption)",
              color: "var(--on-surface-variant)",
              fontWeight: 700,
              letterSpacing: "0.04em",
              marginBottom: "var(--space-sm)",
            }}
          >
            처리에 만족하셨나요?
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)" }}>
            <Badge style={{ flex: 1, justifyContent: "center", padding: "var(--space-md)" }}>별로예요</Badge>
            <Badge style={{ flex: 1, justifyContent: "center", padding: "var(--space-md)" }}>보통</Badge>
            <Badge emphasis style={{ flex: 1, justifyContent: "center", padding: "var(--space-md)", fontWeight: 700 }}>
              좋아요
            </Badge>
          </div>
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
        <Link href={routeFor("T-DEF-00")} style={primaryLinkStyle}>
          완료 확인
        </Link>
        <Link href={routeFor("T-DEF-11")} style={secondaryLinkStyle}>
          재요청
        </Link>
      </div>
    </>
  );
}
