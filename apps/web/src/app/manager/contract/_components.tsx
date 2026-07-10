import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ContractExtraction, DeletionState, ExtractionGroup } from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import {
  MANAGER_CONTRACT_ROUTES,
  type ManagerContractRoute,
  type ManagerContractScreenId,
} from "@/lib/contract-manager-nav";

export const deletionLabel: Record<DeletionState, string> = {
  none: "요청 없음",
  requested: "삭제 요청",
  completed: "삭제 완료",
  limited: "제한 보관",
  denied: "삭제 불가",
};

export const groupLabel: Record<ExtractionGroup, string> = {
  money: "돈",
  term: "기간",
  responsibility: "책임",
};

export function ContractShell({
  id,
  title,
  children,
}: {
  id: ManagerContractScreenId;
  title: ReactNode;
  children: ReactNode;
}) {
  void id;
  return <ManagerAppShell title={title} context="관리 중인 집 · 계약서">{children}</ManagerAppShell>;
}

export function PageStack({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gap: "var(--space-xl)" }}>{children}</div>;
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: "var(--space-md)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-subtitle)", lineHeight: "var(--lh-title)" }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Grid({
  columns = 3,
  children,
}: {
  columns?: 2 | 3 | 4;
  children: React.ReactNode;
}) {
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

export function MetricCard({ label, value, note }: { label: string; value: React.ReactNode; note: string }) {
  return (
    <Card style={{ minHeight: 112, display: "grid", alignContent: "space-between", gap: "var(--space-sm)" }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)", fontWeight: 800 }}>{value}</div>
      <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{note}</div>
    </Card>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";
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
        border: isSecondary ? "1.5px solid var(--primary)" : "none",
        background: isPrimary ? "var(--primary)" : "transparent",
        color: isPrimary ? "var(--on-primary)" : "var(--primary)",
        textDecoration: "none",
        fontSize: "var(--fs-body)",
        fontWeight: 800,
      }}
    >
      {children}
    </Link>
  );
}

export function StaticButton({
  children,
  variant = "primary",
  ...props
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button variant={variant} {...props}>{children}</Button>;
}

export function BackLink({ href = MANAGER_CONTRACT_ROUTES["M-DOC-00"] }: { href?: ManagerContractRoute }) {
  return (
    <Link href={href} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>
      뒤로
    </Link>
  );
}

export function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--space-md)",
        padding: "var(--space-sm) 0",
        borderBottom: "1px solid var(--border)",
        fontSize: "var(--fs-caption)",
      }}
    >
      <span style={{ color: "var(--on-surface-variant)" }}>{label}</span>
      <span style={{ textAlign: "right", fontWeight: 800 }}>{value}</span>
    </div>
  );
}

export function ExtractionTable({ extraction }: { extraction: ContractExtraction }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {(["money", "term", "responsibility"] as const).map((group) => {
        const items = extraction.items.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <Card key={group} style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)" }}>
              <div style={{ fontWeight: 800 }}>{groupLabel[group]} 항목</div>
              <Badge>{items.filter((item) => item.needsCheck).length}개 확인 필요</Badge>
            </div>
            {items.map((item) => (
              <div
                key={item.label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr auto",
                  gap: "var(--space-md)",
                  alignItems: "start",
                  padding: "var(--space-sm) 0",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div style={captionStyle}>{item.label}</div>
                <div>
                  <div style={{ fontWeight: 800 }}>{item.value}</div>
                  {item.evidence ? (
                    <div style={{ marginTop: "var(--space-xs)", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" }}>
                      근거: {item.evidence}
                    </div>
                  ) : null}
                </div>
                {item.needsCheck ? <Badge emphasis>확인 필요</Badge> : <Badge>대조됨</Badge>}
              </div>
            ))}
          </Card>
        );
      })}
    </div>
  );
}

export function SourceBadge({ origin }: { origin: "tenant_upload" | "manager_upload" | "manual" }) {
  const label = origin === "tenant_upload" ? "임차인 업로드" : origin === "manager_upload" ? "관리자 업로드" : "관리자 수동값";
  return <Badge emphasis={origin !== "manual"}>{label}</Badge>;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export const captionStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 700,
} as const;

export const linkReset = { color: "inherit", textDecoration: "none" } as const;

export { Badge, Card };
