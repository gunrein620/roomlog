import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  VendorJobRecord,
  VendorPerf,
  VendorProfile,
  VendorStatus,
  VendorTrade,
} from "@roomlog/types";
import { VENDOR_PERF_MIN_N } from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { MANAGER_VENDOR_MGMT_ROUTES } from "@/lib/vendor-mgmt-nav";
import { stripScreenId } from "@/lib/screen-id";

export const tradeLabel: Record<VendorTrade, string> = {
  plumbing: "배관·누수",
  electrical: "전기",
  hvac: "냉난방",
  appliance: "가전",
  locksmith: "도어락·잠금",
  waterproofing: "방수",
  cleaning: "청소",
  general: "종합",
  other: "기타",
};

export const statusLabel: Record<VendorStatus, string> = {
  active: "활성",
  inactive: "비활성",
  closed: "폐업",
};

export const tradeOptions = Object.keys(tradeLabel) as VendorTrade[];

export const mutedStyle: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: 1.5,
};

export const grid2Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "var(--space-md)",
};

export const grid3Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "var(--space-md)",
};

export function ManagerVendorMgmtShell({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return <ManagerAppShell title={title} context="관리 중인 집 · 업체">{children}</ManagerAppShell>;
}

export function PageStack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "var(--space-lg)" }}>{children}</div>;
}

export function ScreenHeader({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "var(--space-lg)",
        flexWrap: "wrap",
      }}
    >
      <div>
        {stripScreenId(eyebrow) ? <Badge emphasis>{stripScreenId(eyebrow)}</Badge> : null}
        <h1 style={{ margin: "var(--space-sm) 0 0", fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
          {title}
        </h1>
        {desc ? <p style={{ ...mutedStyle, margin: "var(--space-xs) 0 0", maxWidth: 760 }}>{desc}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
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

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const variants: Record<typeof variant, CSSProperties> = {
    primary: { background: "var(--primary)", color: "var(--on-primary)", border: "none" },
    secondary: { background: "transparent", color: "var(--primary)", border: "1.5px solid var(--primary)" },
    ghost: { background: "transparent", color: "var(--on-surface-variant)", border: "1px solid var(--border)" },
  };

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
        textDecoration: "none",
        fontWeight: 800,
        whiteSpace: "nowrap",
        ...variants[variant],
      }}
    >
      {children}
    </Link>
  );
}

export function Trades({ trades }: { trades: VendorTrade[] }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
      {trades.map((trade) => (
        <Badge key={trade}>{tradeLabel[trade]}</Badge>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: VendorStatus }) {
  return <Badge emphasis={status !== "active"}>{statusLabel[status]}</Badge>;
}

export function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        minHeight: 44,
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--space-md)",
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        fontSize: "var(--fs-caption)",
      }}
    >
      <span style={{ color: "var(--on-surface-variant)" }}>{label}</span>
      <span style={{ fontWeight: 800, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function MetricCard({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <Card style={{ minHeight: 112 }}>
      <div style={{ ...mutedStyle, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: "var(--space-sm)", fontSize: "var(--fs-title)", fontWeight: 900 }}>{value}</div>
      {note ? <div style={{ ...mutedStyle, marginTop: "var(--space-xs)" }}>{note}</div> : null}
    </Card>
  );
}

export function NoticeCard({ title, children, emphasis }: { title: string; children: ReactNode; emphasis?: boolean }) {
  return (
    <Card
      style={{
        display: "grid",
        gap: "var(--space-sm)",
        background: emphasis ? "var(--surface-container-high)" : "var(--surface-container-lowest)",
        border: emphasis ? "1.5px solid var(--primary)" : "1px solid var(--border)",
      }}
    >
      <div style={{ fontWeight: 850 }}>{title}</div>
      <div style={mutedStyle}>{children}</div>
    </Card>
  );
}

export function formatDate(iso?: string): string {
  if (!iso) return "사용 이력 없음";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function won(amount?: number): string {
  if (amount == null) return "견적 없음";
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function maskedUnit(job: VendorJobRecord): string {
  if (!job.unitId) return "호실 없음";
  return job.unitMasked ? "***호" : `${job.unitId.slice(0, -1)}*호`;
}

export function vendorHref(screen: "M-VEND-01" | "M-VEND-02" | "M-VEND-03", vendorId: string): string {
  return `${MANAGER_VENDOR_MGMT_ROUTES[screen]}?id=${encodeURIComponent(vendorId)}`;
}

export function perfSummary(perf?: VendorPerf): string {
  if (!perf || !perf.ratingVisible || perf.satisfactionAvg == null) {
    return `거래 ${perf?.completedCount ?? 0}건`;
  }
  return `만족도 ${perf.satisfactionAvg.toFixed(1)} / 5`;
}

export function RatingGuard({ perf }: { perf?: VendorPerf }) {
  if (!perf) return <span>거래 0건</span>;
  if (!perf.ratingVisible || perf.satisfactionAvg == null) {
    return <span>거래 {perf.completedCount}건</span>;
  }
  return <span>{perf.satisfactionAvg.toFixed(1)} / 5</span>;
}

export function VendorRows({ vendors }: { vendors: VendorProfile[] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--surface-container-lowest)" }}>
        <thead>
          <tr style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textAlign: "left" }}>
            <th style={thStyle}>업체</th>
            <th style={thStyle}>담당 분야</th>
            <th style={thStyle}>거래</th>
            <th style={thStyle}>최근 사용</th>
            <th style={thStyle}>상태</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => (
            <tr key={vendor.id} style={{ minHeight: "var(--list-item-min)", borderTop: "1px solid var(--border)" }}>
              <td style={tdStyle}>
                <Link
                  href={vendorHref("M-VEND-01", vendor.id)}
                  style={{ color: "var(--on-surface)", textDecoration: "none", fontWeight: 850 }}
                >
                  {vendor.name}
                </Link>
                <div style={{ display: "flex", gap: "var(--space-xs)", marginTop: "var(--space-xs)", flexWrap: "wrap" }}>
                  {vendor.isNew ? <Badge emphasis>신규</Badge> : null}
                  <Badge>{vendor.source === "auto" ? "자동 누적" : "직접 추가"}</Badge>
                </div>
              </td>
              <td style={tdStyle}><Trades trades={vendor.trades} /></td>
              <td style={tdStyle}>거래 {vendor.dealCount}건</td>
              <td style={tdStyle}>{formatDate(vendor.lastUsedAt)}</td>
              <td style={tdStyle}><StatusBadge status={vendor.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JobRows({ jobs }: { jobs: VendorJobRecord[] }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {jobs.map((job) => (
        <Card key={job.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: "var(--space-md)", alignItems: "center" }}>
          <div style={{ fontWeight: 850 }}>{formatDate(job.completedAt)}</div>
          <div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <Badge>{maskedUnit(job)}</Badge>
              <Badge>{job.ticketId}</Badge>
              <Badge>{job.vendorJobId}</Badge>
            </div>
            <div style={{ ...mutedStyle, marginTop: "var(--space-xs)" }}>
              응답 {job.responseHours ?? "-"}시간 · {won(job.quoteAmount)} · {job.rated ? `만족도 ${job.satisfaction}` : "미평가"}
            </div>
          </div>
          <span style={{ ...mutedStyle, textAlign: "right" }}>점선 연결</span>
        </Card>
      ))}
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: "var(--space-md)",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "var(--space-md)",
  verticalAlign: "middle",
  minHeight: "var(--list-item-min)",
  fontSize: "var(--fs-caption)",
};

export const minNLabel = `min_n ${VENDOR_PERF_MIN_N}`;
