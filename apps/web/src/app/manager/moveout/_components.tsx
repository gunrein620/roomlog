import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  DeductionCandidate,
  Dispute,
  DisputeStatus,
  MoveoutManagerRow,
  MoveoutRecordItem,
  MoveoutRecordSource,
  ReportAuditEntry,
  ReviewGateBlockReason,
  SettlementStatus,
  WearAdjustmentAction,
  WearVerdict,
} from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { MANAGER_MOVEOUT_ROUTES, withManagerMoveoutId } from "@/lib/moveout-manager-nav";

export const DISCLAIMER = "참고자료이며 최종 정산은 관리자 확인 후 확정됩니다";

export const statusLabel: Record<SettlementStatus, string> = {
  estimate: "예상",
  reviewing: "검토중",
  review_done: "검토완료",
  re_review: "재검토",
};

export const disputeStatusLabel: Record<DisputeStatus, string> = {
  received: "접수",
  reviewing: "검토중",
  answered: "관리자 응답",
  confirmed: "임차인 확인",
  re_disputed: "재이의",
  resolved: "해소",
};

export const sourceLabel: Record<MoveoutRecordSource, string> = {
  movein_photo: "입주전 사진",
  defect: "하자",
  repair: "수리",
  payment: "납부",
  chat: "채팅",
  contract: "계약서",
};

export const wearLabel: Record<WearVerdict, string> = {
  aging_likely: "노후·마모 가능",
  damage_possible: "훼손 추정",
  unclear: "확인 필요",
};

export const actionLabel: Record<WearAdjustmentAction, string> = {
  keep: "유지",
  adjust: "조정",
  reinforce: "근거 보강",
};

export const blockReasonLabel: Record<ReviewGateBlockReason, string> = {
  contract_unconfirmed: "계약 미확정",
  unresolved_dispute: "미해소 이의",
  needs_confirmation: "확인 필요 항목 잔존",
  no_movein_evidence: "입주전 비교 근거 없음",
};

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
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-lg)", marginBottom: "var(--space-lg)" }}>
      <div>
        <Badge emphasis>{eyebrow}</Badge>
        <h1 style={{ margin: "var(--space-sm) 0 0", fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
          {title}
        </h1>
        {desc ? (
          <p style={{ margin: "var(--space-xs) 0 0", color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
            {desc}
          </p>
        ) : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "flex-start", flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}

export function PageStack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "var(--space-lg)" }}>{children}</div>;
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

export function NoticeBanner({ children = DISCLAIMER }: { children?: ReactNode }) {
  return (
    <Card style={{ background: "var(--surface-container-high)", border: "1.5px solid var(--primary)", fontWeight: 800 }}>
      {children}
    </Card>
  );
}

export function MetricCard({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <Card style={{ minHeight: 112 }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ marginTop: "var(--space-sm)", fontSize: "var(--fs-title)", fontWeight: 850 }}>{value}</div>
      {note ? <div style={{ marginTop: "var(--space-xs)", ...mutedSmallStyle }}>{note}</div> : null}
    </Card>
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
  const style: CSSProperties = {
    minHeight: "var(--touch-target)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 16px",
    borderRadius: "var(--radius-btn)",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: "var(--fs-body)",
    whiteSpace: "nowrap",
  };
  const variants: Record<typeof variant, CSSProperties> = {
    primary: { background: "var(--primary)", color: "var(--on-primary)", border: "none" },
    secondary: { background: "transparent", color: "var(--primary)", border: "1.5px solid var(--primary)" },
    ghost: { background: "transparent", color: "var(--on-surface-variant)", border: "1px solid var(--border)" },
  };

  return (
    <Link href={href} style={{ ...style, ...variants[variant] }}>
      {children}
    </Link>
  );
}

export function DisabledButton({ children }: { children: ReactNode }) {
  return (
    <Button disabled variant="secondary" style={{ opacity: 0.55, cursor: "not-allowed" }}>
      {children}
    </Button>
  );
}

export function StatusBadge({ status }: { status: SettlementStatus }) {
  return <Badge emphasis={status === "reviewing" || status === "re_review"}>{statusLabel[status]}</Badge>;
}

export function DisputeBadge({ status }: { status: DisputeStatus }) {
  return <Badge emphasis={status !== "resolved" && status !== "confirmed"}>{disputeStatusLabel[status]}</Badge>;
}

export function ManagerRowsTable({ rows }: { rows: MoveoutManagerRow[] }) {
  const sortedRows = [...rows].sort((a, b) => Number(b.slaBreached) - Number(a.slaBreached) || b.openDisputeCount - a.openDisputeCount || Number(b.expiringSoon) - Number(a.expiringSoon));
  return (
    <TableShell minWidth={980}>
      <thead>
        <tr>
          {["호실", "임차인", "종료일", "D-day", "검토 단계", "이의", "SLA 초과", ""].map((head) => (
            <th key={head} style={thStyle}>{head}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row) => (
          <tr key={row.summaryId}>
            <td style={tdStyle}>
              <div style={{ fontWeight: 850 }}>{row.unitId}호</div>
              {!row.contractConfirmed ? <div style={mutedSmallStyle}>계약 미확정 · 검토 진입 차단</div> : null}
            </td>
            <td style={tdStyle}>{row.tenantName}</td>
            <td style={tdStyle}>{row.leaseEndDate ? formatDate(row.leaseEndDate) : "계약 확인 필요"}</td>
            <td style={tdStyle}>{row.daysRemaining === undefined ? "-" : `D-${row.daysRemaining}`}</td>
            <td style={tdStyle}><StatusBadge status={row.settlementStatus} /></td>
            <td style={tdStyle}>
              {row.openDisputeCount > 0 ? (
                <Link href={withManagerMoveoutId(MANAGER_MOVEOUT_ROUTES["M-OUT-03"], row.summaryId)} style={linkStyle}>
                  이의 처리 {row.openDisputeCount}건
                </Link>
              ) : "없음"}
            </td>
            <td style={tdStyle}><Badge emphasis={row.slaBreached}>{row.slaBreached ? "초과" : "정상"}</Badge></td>
            <td style={{ ...tdStyle, textAlign: "right" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                <Link href={withManagerMoveoutId(MANAGER_MOVEOUT_ROUTES["M-OUT-01"], row.summaryId)} style={linkStyle}>
                  기록
                </Link>
                <Link href={withManagerMoveoutId(MANAGER_MOVEOUT_ROUTES["M-OUT-02"], row.summaryId)} style={linkStyle}>
                  정산
                </Link>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

export function RecordRows({ records }: { records: MoveoutRecordItem[] }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {records.map((record) => (
        <Card key={record.id} style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", flexWrap: "wrap" }}>
            <div>
              <Badge>{sourceLabel[record.source]}</Badge>
              <div style={{ marginTop: "var(--space-xs)", fontWeight: 850 }}>{record.title}</div>
            </div>
            <Badge emphasis={record.moveinComparisonAvailable}>{record.moveinComparisonAvailable ? "입주전 비교 가능" : "비교 근거 없음"}</Badge>
          </div>
          <div style={mutedSmallStyle}>{record.description}</div>
          <RecordDetailSections record={record} />
        </Card>
      ))}
    </div>
  );
}

export function RecordDetailSections({ record }: { record: MoveoutRecordItem }) {
  if (!record.detailSections?.length) {
    return null;
  }

  return (
    <details>
      <summary style={summaryButtonStyle}>상세정보 보기</summary>
      <div style={detailPanelStyle}>
        {record.detailSections.map((section) => (
          <div key={section.label} style={detailSectionStyle}>
            <div style={captionStyle}>{section.label}</div>
            <div style={{ display: "grid", gap: "var(--space-xs)" }}>
              {section.items.map((item) => (
                <div key={`${section.label}-${item.label}`} style={detailRowStyle}>
                  <span style={{ fontWeight: 850 }}>{item.label}</span>
                  <span style={mutedSmallStyle}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

export function TriageRows({ records, audit }: { records: MoveoutRecordItem[]; audit: ReportAuditEntry[] }) {
  const triage = records.filter((record) => record.wearVerdict);
  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {triage.map((record) => {
        const log = audit.find((entry) => entry.recordItemId === record.id);
        return (
          <Card key={record.id} style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", flexWrap: "wrap" }}>
              <div>
                <Badge emphasis>{wearLabel[record.wearVerdict!]}</Badge>
                <div style={{ marginTop: "var(--space-xs)", fontWeight: 850 }}>{record.title}</div>
              </div>
              <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
                <Badge>유지</Badge>
                <Badge>조정</Badge>
                <Badge>근거 보강</Badge>
              </div>
            </div>
            <div style={mutedSmallStyle}>
              {record.wearNote ?? "노후/마모와 훼손을 구분해 신중히 검토합니다."} 근거와 임차인 통지 없이는 수정할 수 없습니다.
            </div>
            {log ? (
              <div style={rowStyle}>
                <div>
                  <div style={{ fontWeight: 850 }}>감사로그 · {actionLabel[log.action]}</div>
                  <div style={mutedSmallStyle}>{log.evidenceNote}</div>
                </div>
                <Badge emphasis={log.tenantNotified}>임차인 통지</Badge>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

export function DeductionRows({ deductions }: { deductions: DeductionCandidate[] }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {deductions.map((deduction) => (
        <Card key={deduction.id} style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 850 }}>{deduction.label}</div>
              <div style={mutedSmallStyle}>{sourceLabel[deduction.source]} · {deduction.evidenceNote}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 850 }}>{wonRange(deduction.estimatedMin, deduction.estimatedMax)}</div>
              <Badge emphasis={deduction.needsConfirmation}>{deduction.needsConfirmation ? "확인 필요" : "확인 해소"}</Badge>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-sm)" }}>
            <InputLike label="하한 조정" value={won(deduction.estimatedMin)} />
            <InputLike label="상한 조정" value={won(deduction.estimatedMax)} />
            <InputLike label="확인 필요" value={deduction.needsConfirmation ? "해소 전" : "해소"} />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function DisputeQueue({ disputes }: { disputes: Dispute[] }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {disputes.map((dispute) => (
        <Card key={dispute.id} style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 850 }}>{dispute.targetLabel}</div>
              <div style={mutedSmallStyle}>{dispute.reason}</div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
              <DisputeBadge status={dispute.status} />
              <Badge emphasis={dispute.slaBreached}>{dispute.slaBreached ? "SLA 경과" : `SLA ${formatDate(dispute.slaDeadline)}`}</Badge>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function InputLike({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ padding: "var(--space-sm) var(--space-md)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-container-lowest)" }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ marginTop: "var(--space-xs)", fontWeight: 800 }}>{value}</div>
    </div>
  );
}

export function TableShell({ children, minWidth = 860 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth, background: "var(--surface-container-lowest)" }}>
        {children}
      </table>
    </div>
  );
}

export function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function wonShort(value: number) {
  return `약 ${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
}

export function wonRange(min: number, max: number) {
  return `${wonShort(min)}~${wonShort(max)}`;
}

export function formatDate(value: string) {
  return value.slice(0, 10);
}

export const grid4Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "var(--space-md)",
};

export const grid3Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "var(--space-md)",
};

export const grid2Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "var(--space-md)",
};

export const captionStyle: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-caption)",
};

export const mutedSmallStyle: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-body)",
};

const summaryButtonStyle: CSSProperties = {
  minHeight: "var(--touch-target)",
  width: "fit-content",
  display: "inline-flex",
  alignItems: "center",
  padding: "0 14px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  color: "var(--primary)",
  fontSize: "var(--fs-caption)",
  fontWeight: 850,
  cursor: "pointer",
  listStyle: "none",
};

const detailPanelStyle: CSSProperties = {
  marginTop: "var(--space-sm)",
  display: "grid",
  gap: "var(--space-sm)",
  padding: "var(--space-md)",
  border: "1px dashed var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
};

const detailSectionStyle: CSSProperties = {
  display: "grid",
  gap: "var(--space-xs)",
};

const detailRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "120px minmax(0, 1fr)",
  gap: "var(--space-sm)",
  alignItems: "start",
};

export const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--space-md)",
  padding: "var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
};

export const linkStyle: CSSProperties = {
  color: "var(--primary)",
  fontWeight: 800,
  textDecoration: "none",
};

const thStyle: CSSProperties = {
  padding: "12px",
  textAlign: "left",
  borderBottom: "1px solid var(--border)",
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
};

const tdStyle: CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid var(--border)",
  fontSize: "var(--fs-body)",
  verticalAlign: "middle",
};
