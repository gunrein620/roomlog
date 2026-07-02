import Link from "next/link";
import type { DefectAnalysis, RepairJob, Ticket } from "@roomlog/types";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import { ROUTES, type VendorRoute } from "@/lib/vendor-nav";

export const DEMO_EXPIRES_AT = "2026-07-04 18:00";
export const REQUESTER = "성수 ○○관리사무소";

export const primaryLinkStyle = {
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

export const secondaryLinkStyle = {
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

export const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

export const mutedStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  lineHeight: 1.55,
} as const;

export function ScreenHeader({
  title,
  ticketId,
  backTo,
}: {
  title: string;
  ticketId?: string;
  backTo?: string;
}) {
  return (
    <header
      style={{
        flex: "none",
        padding: "12px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      {backTo ? (
        <Link href={backTo} style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}>
          ‹ 뒤로
        </Link>
      ) : (
        <div style={{ width: 34 }} />
      )}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        {ticketId && <div style={{ ...mutedStyle, marginTop: 2 }}>건 ID {ticketId}</div>}
      </div>
      <div style={{ width: 34 }} />
    </header>
  );
}

export function Body({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        flex: 1,
        overflow: "auto",
        padding: "16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {children}
    </main>
  );
}

export function Footer({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </footer>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={href} style={variant === "primary" ? primaryLinkStyle : secondaryLinkStyle}>
      {children}
    </Link>
  );
}

export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {steps.map((step, index) => (
        <div
          key={step}
          title={step}
          style={{
            flex: 1,
            height: 8,
            borderRadius: "var(--radius-full)",
            background: index <= current ? "var(--primary)" : "var(--outline-variant)",
          }}
        />
      ))}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
      <span style={{ color: "var(--on-surface-variant)" }}>{label}</span>
      <span style={{ fontWeight: 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function TrustBadges() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <Badge emphasis>정식 요청</Badge>
      <Badge>사진 메타데이터 제거</Badge>
      <Badge>PII 마스킹</Badge>
    </div>
  );
}

export function ContactThread() {
  return (
    <details
      style={{
        border: "1px dashed var(--outline-variant)",
        borderRadius: "var(--radius-md)",
        padding: 12,
      }}
    >
      <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>관리자에게 문의</summary>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Input placeholder="개인 연락처·상세주소 없이 질문 입력" />
        <Button fullWidth variant="secondary">문의 보내기</Button>
        <p style={mutedStyle}>문의와 답변은 관리자 검수·마스킹 후 건 ID에 귀속됩니다.</p>
      </div>
    </details>
  );
}

export function PhotoPreview() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {["누수 부위", "바닥 고임"].map((label) => (
        <div
          key={label}
          style={{
            aspectRatio: "1 / 1",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-container)",
            display: "flex",
            alignItems: "end",
            padding: 8,
            boxSizing: "border-box",
          }}
        >
          <Badge>{label}</Badge>
        </div>
      ))}
    </div>
  );
}

export function TicketSummary({
  ticket,
  analysis,
}: {
  ticket: Ticket;
  analysis: DefectAnalysis;
}) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{ticket.title}</div>
        <Badge emphasis>긴급도 {ticket.urgency}</Badge>
      </div>
      <p style={{ ...mutedStyle, margin: 0 }}>{ticket.description}</p>
      <InfoRow label="예상 문제" value={analysis.problemCandidates[0] ?? "확인 필요"} />
      <InfoRow label="방문 가능" value="평일 오전·주말 협의" />
      <InfoRow label="대략 위치" value={ticket.location} />
    </Card>
  );
}

export function QuoteSummary({ repair }: { repair: RepairJob }) {
  const quoteTypeLabel = repair.quoteType === "visit" ? "방문 견적" : repair.quoteType === "decline" ? "견적 불가" : "숫자 견적";
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <InfoRow label="회신 유형" value={quoteTypeLabel} />
      <InfoRow label="견적" value={repair.quoteAmount ? `${repair.quoteAmount.toLocaleString()}원` : "현장 확인 필요"} />
      <InfoRow label="방문 가능" value={formatVisitTime(repair.scheduledAt)} />
      {repair.quoteNote && <p style={{ ...mutedStyle, margin: 0 }}>{repair.quoteNote}</p>}
    </Card>
  );
}

export function formatVisitTime(iso?: string) {
  if (!iso) return "일정 미정";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours() < 12 ? "오전" : "오후"} ${d.getHours() % 12 || 12}:00`;
}

export function routes() {
  return ROUTES;
}
