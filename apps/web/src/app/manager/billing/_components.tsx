import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { BillStatus, Deposit, ManagerBillRow, OverdueCase, OverdueStage } from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import {
  MANAGER_BILLING_ROUTES,
  managerBillHref,
  managerDunningHref,
} from "@/lib/billing-manager-nav";

export const routes = {
  ...MANAGER_BILLING_ROUTES,
  dunning: managerDunningHref,
  bill: managerBillHref,
};

export function BillingShell({
  title,
  active,
  children,
}: {
  title: ReactNode;
  active: string;
  children: ReactNode;
}) {
  void active;
  return <ManagerAppShell title={title} context="청구·수금·연체">{children}</ManagerAppShell>;
}

export function PageStack({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>{children}</div>;
}

export function Grid({ children, columns = 3 }: { children: ReactNode; columns?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: "var(--space-md)",
      }}
    >
      {children}
    </div>
  );
}

export function MetricCard({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <Card style={{ minHeight: 112, display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ fontSize: "var(--fs-title)", fontWeight: 800 }}>{value}</div>
      {note ? <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{note}</div> : null}
    </Card>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-md)" }}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-title)", fontWeight: 750 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TextButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      style={{
        minHeight: "var(--touch-target)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 16px",
        borderRadius: "var(--radius-btn)",
        border: variant === "primary" ? "none" : "1.5px solid var(--primary)",
        background: variant === "primary" ? "var(--primary)" : "transparent",
        color: variant === "primary" ? "var(--on-primary)" : "var(--primary)",
        textDecoration: "none",
        fontWeight: 700,
        fontSize: "var(--fs-body)",
      }}
    >
      {children}
    </Link>
  );
}

export function DisabledAction({ children }: { children: ReactNode }) {
  return (
    <Button disabled variant="secondary" style={{ cursor: "not-allowed", opacity: 0.55 }}>
      {children}
    </Button>
  );
}

export function BillTable<T extends ManagerBillRow>({
  bills,
  renderAction,
}: {
  bills: T[];
  renderAction?: (bill: T) => ReactNode;
}) {
  if (bills.length === 0) return <EmptyBox>표시할 청구서가 없습니다.</EmptyBox>;

  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {["호실", "임차인", "청구월", "금액", "확정 수납", "상태", "기한", ""].map((head) => (
              <th key={head} style={thStyle}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bills.map((bill) => (
            <tr key={bill.billId}>
              <td style={tdStyle}>{bill.unitId}</td>
              <td style={tdStyle}>{bill.tenantName}</td>
              <td style={tdStyle}>{bill.billingMonth}</td>
              <td style={tdStyle}>{won(bill.totalAmount)}</td>
              <td style={tdStyle}>{won(bill.paidAmount)}</td>
              <td style={tdStyle}>
                <StatusBadge status={bill.status} />
              </td>
              <td style={tdStyle}>{bill.dueDate}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {renderAction ? (
                  renderAction(bill)
                ) : (
                  <Link href={routes.bill(bill.billId)} style={linkStyle}>
                    상세
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DepositTable({
  deposits,
  emptyText,
  renderAction,
}: {
  deposits: Deposit[];
  emptyText: string;
  renderAction?: (deposit: Deposit) => ReactNode;
}) {
  if (deposits.length === 0) {
    return <EmptyBox>{emptyText}</EmptyBox>;
  }

  const heads = renderAction
    ? ["입금자", "금액", "입금일시", "상태", "후보", "액션"]
    : ["입금자", "금액", "입금일시", "상태", "후보"];

  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {heads.map((head) => (
              <th key={head} style={thStyle}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deposits.map((deposit) => (
            <tr key={deposit.id}>
              <td style={tdStyle}>{deposit.depositorName}</td>
              <td style={tdStyle}>{won(deposit.amount)}</td>
              <td style={tdStyle}>{formatDateTime(deposit.depositedAt)}</td>
              <td style={tdStyle}>
                <Badge emphasis={deposit.matchStatus !== "matched"}>{depositStatusLabel[deposit.matchStatus]}</Badge>
              </td>
              <td style={tdStyle}>{deposit.matchedBillId ?? deposit.guessedUnitId ?? "수동 확인"}</td>
              {renderAction ? <td style={{ ...tdStyle, textAlign: "right" }}>{renderAction(deposit)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OverdueTable({ cases, waiting }: { cases: OverdueCase[]; waiting?: boolean }) {
  if (cases.length === 0) return <EmptyBox>표시할 세대가 없습니다.</EmptyBox>;
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {["호실", "임차인", "미납", "경과", "단계", "가드", ""].map((head) => (
              <th key={head} style={thStyle}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cases.map((item) => (
            <tr key={item.billId}>
              <td style={tdStyle}>{item.unitId}</td>
              <td style={tdStyle}>{item.tenantName}</td>
              <td style={tdStyle}>{won(item.unpaidAmount)}</td>
              <td style={tdStyle}>{item.daysOverdue}일</td>
              <td style={tdStyle}>
                <Badge emphasis={!waiting}>{stageLabel[item.stage]}</Badge>
              </td>
              <td style={tdStyle}>{guardText(item.guard.blocked, item.guard.hasConfirming, item.guard.hasOrphan)}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {waiting ? (
                  <Link href={routes.matching} style={linkStyle}>
                    M-BILL-03에서 확인
                  </Link>
                ) : (
                  <Link href={routes.dunning(item.billId)} style={linkStyle}>
                    독촉문 작성
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GuardBanner({
  blocked,
  hasConfirming,
  hasOrphan,
}: {
  blocked: boolean;
  hasConfirming: boolean;
  hasOrphan: boolean;
}) {
  return (
    <div
      style={{
        border: "1.5px solid var(--primary)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-md)",
        background: "var(--surface-container-high)",
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--space-lg)",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>
          {blocked ? "발송 차단: 확인중 또는 orphan 입금이 있습니다" : "발송 가능: 확인중·orphan 가드를 통과했습니다"}
        </div>
        <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-body)" }}>
          확인중 {hasConfirming ? "있음" : "없음"} · orphan {hasOrphan ? "있음" : "없음"} · 자동 발송 없이 관리인 승인 후 발송
        </div>
      </div>
      {blocked ? <TextButtonLink href={routes.matching}>M-BILL-03에서 확인</TextButtonLink> : null}
    </div>
  );
}

export function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        border: "1.5px dashed var(--outline-variant)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-lg)",
        color: "var(--on-surface-variant)",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

export function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

export function percent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export const formFieldStyle: CSSProperties = {
  minHeight: "var(--touch-target)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  padding: "0 12px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--fs-body)",
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function guardText(blocked: boolean, hasConfirming: boolean, hasOrphan: boolean): string {
  if (!blocked) return "통과";
  if (hasConfirming && hasOrphan) return "확인중·orphan";
  if (hasConfirming) return "확인 대기";
  if (hasOrphan) return "orphan 보류";
  return "보류";
}

const statusLabel: Record<BillStatus, string> = {
  draft: "작성",
  sent: "수납대기",
  confirming: "확인중",
  partially_paid: "일부납부",
  paid: "완료",
  overdue: "연체",
  corrected: "정정",
  canceled: "취소",
};

const depositStatusLabel: Record<Deposit["matchStatus"], string> = {
  unmatched: "실제입금",
  matched: "확정",
  orphan: "orphan",
  mismatch: "불일치",
};

const stageLabel: Record<OverdueStage, string> = {
  minor: "경미",
  warning: "주의",
  severe: "심각",
};

function StatusBadge({ status }: { status: BillStatus }) {
  return <Badge emphasis={status === "confirming" || status === "overdue"}>{statusLabel[status]}</Badge>;
}

const captionStyle: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 750,
};

const tableWrapStyle: CSSProperties = {
  overflow: "hidden",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "var(--fs-body)",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  borderBottom: "1px solid var(--border)",
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  background: "var(--surface-container-low)",
};

const tdStyle: CSSProperties = {
  padding: "14px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};

const linkStyle: CSSProperties = {
  color: "var(--primary)",
  fontWeight: 800,
  textDecoration: "none",
};
