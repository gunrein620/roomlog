import Link from "next/link";
import type { ReactNode } from "react";
import type {
  ChatAnswer,
  ChatMessage,
  FaqQuestion,
  Report,
  ReportKpi,
  ReportNextAction,
  ReportSource,
  ReportStatus,
} from "@roomlog/types";
import { Badge, Button, Card, ManagerShell } from "@roomlog/ui";
import { actionHref, MANAGER_REPORT_ROUTES, reportHref, sourceHref } from "@/lib/report-nav";
import { stripScreenId } from "@/lib/screen-id";

const navItems = [
  ["허브", MANAGER_REPORT_ROUTES["M-RPT-00"]],
  ["새 생성", MANAGER_REPORT_ROUTES["M-RPT-01"]],
  ["상세", MANAGER_REPORT_ROUTES["M-RPT-02"]],
  ["임대인 보고", MANAGER_REPORT_ROUTES["M-RPT-03"]],
  ["챗봇", MANAGER_REPORT_ROUTES["M-RPT-04"]],
  ["빠른 조회", MANAGER_REPORT_ROUTES["M-RPT-05"]],
] as const;

export function ReportShell({ children }: { children: ReactNode }) {
  return (
    <ManagerShell title="운영 보고" context="관리 중인 집 · 임대인 보고" nav={<ReportNav />}>
      {children}
    </ManagerShell>
  );
}

function ReportNav() {
  return (
    <nav aria-label="관리 리포트 화면" style={{ display: "grid", gap: "var(--space-sm)" }}>
      {navItems.map(([label, href]) => (
        <Link key={href} href={href} style={navLinkStyle}>
          {label}
        </Link>
      ))}
      <div style={navNoteStyle}>
        챗봇 답변은 조회와 초안 제안까지만 제공합니다. 독촉·공지 발송은 원본 행 대조 후 각 발송 화면에서 확정합니다.
      </div>
    </nav>
  );
}

export function PageStack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "var(--space-lg)" }}>{children}</div>;
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-lg)", alignItems: "flex-start" }}>
      <div>
        {stripScreenId(eyebrow) ? <div style={captionStyle}>{stripScreenId(eyebrow)}</div> : null}
        <h1 style={{ margin: "4px 0 0", fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>{title}</h1>
        {subtitle ? <p style={mutedTextStyle}>{subtitle}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "flex-end" }}>{actions}</div> : null}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const primary = variant === "primary";
  const secondary = variant === "secondary";
  return (
    <Link
      href={href}
      style={{
        minHeight: "var(--touch-target)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 var(--space-lg)",
        borderRadius: "var(--radius-btn)",
        border: secondary ? "1.5px solid var(--primary)" : "none",
        background: primary ? "var(--primary)" : "transparent",
        color: primary ? "var(--on-primary)" : "var(--primary)",
        textDecoration: "none",
        fontSize: "var(--fs-body)",
        fontWeight: 800,
      }}
    >
      {children}
    </Link>
  );
}

export function Grid({ children, min = 240 }: { children: ReactNode; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: "var(--space-md)" }}>
      {children}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: "var(--space-md)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MetricCard({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <Card style={{ minHeight: 118, display: "grid", gap: "var(--space-sm)" }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ fontSize: "var(--fs-title)", fontWeight: 850 }}>{value}</div>
      <div style={mutedSmallStyle}>{note}</div>
    </Card>
  );
}

export function ReportTable({ reports }: { reports: Report[] }) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {["기간", "범위", "기준시점", "보고 상태", "수신자", ""].map((head) => (
              <th key={head} style={thStyle}>{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id}>
              <td style={tdStyle}>{report.periodLabel}</td>
              <td style={tdStyle}>{scopeText(report)}</td>
              <td style={tdStyle}>{formatDateTime(report.snapshotAt)}</td>
              <td style={tdStyle}><StatusBadge status={report.status} /></td>
              <td style={tdStyle}>{report.recipient?.name ?? "미지정"}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                <Link href={reportHref("M-RPT-02", report.id)} style={inlineLinkStyle}>상세</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  return <Badge emphasis={status === "draft"}>{status === "delivered" ? "임대인 전달됨" : "초안"}</Badge>;
}

export function TrustNotice({ children }: { children: ReactNode }) {
  return (
    <Card style={{ background: "var(--surface-container-high)", border: "1.5px solid var(--primary)" }}>
      <div style={{ fontWeight: 850, marginBottom: "var(--space-xs)" }}>AI 정리 스냅샷</div>
      <div style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>{children}</div>
    </Card>
  );
}

export function KpiRow({ kpis }: { kpis?: ReportKpi[] }) {
  if (!kpis?.length) return null;
  return (
    <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
      {kpis.map((kpi) => (
        <Badge key={`${kpi.label}-${kpi.value}`}>{kpi.label} {kpi.value} · {sourceKindLabel[kpi.formulaSource]}</Badge>
      ))}
    </div>
  );
}

export function SourceLink({ source }: { source: ReportSource }) {
  return (
    <Link href={sourceHref(source)} style={sourceLinkStyle}>
      <Badge emphasis>{source.label}</Badge>
      <span>{source.drilldownScreenId} 원천 행</span>
    </Link>
  );
}

export function NextActionList({ actions }: { actions: ReportNextAction[] }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {actions.map((action) => (
        <Card key={action.label} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-md)", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 850 }}>{action.label}</div>
            <div style={mutedSmallStyle}>
              메시징 초안으로 연결하고, 발송 전 원본 행을 대조합니다.
            </div>
          </div>
          <LinkButton href={actionHref(action)} variant="secondary">초안 열기</LinkButton>
        </Card>
      ))}
    </div>
  );
}

export function ChatTranscript({ messages }: { messages: ChatMessage[] }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-md)" }}>
      {messages.map((message) => (
        <div key={message.id} style={{ display: "grid", justifyItems: message.role === "user" ? "end" : "start" }}>
          {message.role === "user" ? (
            <div style={userBubbleStyle}>{message.text}</div>
          ) : message.answer ? (
            <AnswerCard answer={message.answer} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AnswerCard({ answer }: { answer: ChatAnswer }) {
  return (
    <Card style={{ width: "min(760px, 100%)", display: "grid", gap: "var(--space-md)" }}>
      <div>
        <div style={captionStyle}>해석 질의</div>
        <div style={{ fontWeight: 850 }}>{answer.interpretedQuery}</div>
        {answer.disambiguation ? <div style={mutedSmallStyle}>{answer.disambiguation}</div> : null}
      </div>
      <Badge emphasis>{answer.basis === "realtime_billing" ? "금액성 · 실시간 M-BILL 산식" : "비금전 · 저장 분석 기준"}</Badge>
      {answer.unknownReason ? (
        <div style={{ lineHeight: "var(--lh-body)" }}>{answer.unknownReason}</div>
      ) : (
        <div style={{ lineHeight: "var(--lh-body)" }}>{answer.answer}</div>
      )}
      <KpiRow kpis={answer.kpis} />
      {answer.sources.length ? (
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          {answer.sources.map((source) => <SourceLink key={`${source.drilldownScreenId}-${source.label}`} source={source} />)}
        </div>
      ) : null}
      {answer.draft ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-md)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-md)" }}>
          <div style={mutedSmallStyle}>발송 버튼이 아닙니다. 원천 세트에서 대상·기간·금액 대조 후 확정합니다.</div>
          <LinkButton href={actionHref(answer.draft)} variant="secondary">초안 확인</LinkButton>
        </div>
      ) : null}
    </Card>
  );
}

export function FaqButtons({ faq }: { faq: FaqQuestion[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-sm)" }}>
      {faq.map((item) => (
        <Button key={item.id} variant="secondary" style={{ justifyContent: "flex-start" }}>{item.label}</Button>
      ))}
    </div>
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function scopeText(report: Report): string {
  const units = report.scope.unitIds?.length ? ` · ${report.scope.unitIds.join(", ")}호` : "";
  return `${report.scope.buildingName}${units}`;
}

const sourceKindLabel = {
  billing: "M-BILL",
  complaint: "M-DASH",
  cost: "M-COST",
  unit: "호실 원장",
  metric: "M-HOME",
  contract: "M-DOC",
  moveout: "M-OUT",
  messaging: "M-MSG",
} satisfies Record<ReportKpi["formulaSource"], string>;

const navLinkStyle = {
  minHeight: 42,
  display: "flex",
  alignItems: "center",
  padding: "0 var(--space-md)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  textDecoration: "none",
  fontWeight: 800,
} as const;
const navNoteStyle = { marginTop: "var(--space-md)", padding: "var(--space-md)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" } as const;
const captionStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", fontWeight: 800 } as const;
const mutedTextStyle = { margin: "var(--space-xs) 0 0", color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" } as const;
const mutedSmallStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" } as const;
const tableWrapStyle = { overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-container-lowest)" } as const;
const tableStyle = { width: "100%", borderCollapse: "collapse" } as const;
const thStyle = { textAlign: "left", padding: "12px 14px", fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } as const;
const tdStyle = { padding: "14px", borderBottom: "1px solid var(--border)", fontSize: "var(--fs-body)", verticalAlign: "middle" } as const;
const inlineLinkStyle = { color: "var(--primary)", textDecoration: "none", fontWeight: 800 } as const;
const sourceLinkStyle = { display: "inline-flex", alignItems: "center", gap: "var(--space-xs)", color: "var(--primary)", textDecoration: "none", fontSize: "var(--fs-caption)", fontWeight: 800 } as const;
const userBubbleStyle = { maxWidth: 560, padding: "12px 16px", borderRadius: "var(--radius-md)", background: "var(--primary)", color: "var(--on-primary)", fontWeight: 750 } as const;
