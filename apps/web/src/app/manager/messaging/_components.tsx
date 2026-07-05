import Link from "next/link";
import type {
  AnnouncementCategory,
  AnnouncementReadState,
  AnnouncementScope,
  ThreadContext,
} from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { stripScreenId } from "@/lib/screen-id";

export const CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  urgent: "긴급",
  life: "생활",
  event: "행사",
};

export const SCOPE_LABEL: Record<AnnouncementScope, string> = {
  all: "전체",
  building: "건물",
  unit: "호실",
};

export const STATE_LABEL: Record<AnnouncementReadState, string> = {
  unread: "미확인",
  read: "읽음",
  confirmed: "확인",
};

export const CONTEXT_LABEL: Record<ThreadContext, string> = {
  defect: "하자",
  payment: "청구 문의",
  contract: "계약",
  moveout: "퇴실",
  announcement: "공지 문의",
  general: "일반",
};

export const sectionTitleStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  marginBottom: "var(--space-sm)",
} as const;

export const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "var(--space-md)",
} as const;

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ManagerMessagingNav() {
  const items = [
    ["허브", MANAGER_MESSAGING_ROUTES["M-MSG-00"]],
    ["공지 작성", MANAGER_MESSAGING_ROUTES["M-MSG-01"]],
    ["발송 결과", MANAGER_MESSAGING_ROUTES["M-MSG-03"]],
  ] as const;

  return (
    <nav aria-label="관리인 소통 화면" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          style={{
            minHeight: 40,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            borderRadius: "var(--radius)",
            color: "var(--on-surface)",
            textDecoration: "none",
            fontSize: "var(--fs-caption)",
            fontWeight: 700,
            background: "var(--surface-container-lowest)",
            border: "1px solid var(--border)",
          }}
        >
          {label}
        </Link>
      ))}
    </nav>
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
        fontWeight: 700,
      }}
    >
      {children}
    </Link>
  );
}

export function StaticButton({ children }: { children: React.ReactNode }) {
  return <Button>{children}</Button>;
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
      <span style={{ fontWeight: 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function NoticeCard({
  title,
  children,
  emphasis,
}: {
  title: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Card
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-sm)",
        background: emphasis ? "var(--surface-container-high)" : "var(--surface-container-lowest)",
        border: emphasis ? "1.5px solid var(--primary)" : "1px solid var(--border)",
      }}
    >
      <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
        {children}
      </div>
    </Card>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "var(--space-lg)",
        marginBottom: "var(--space-lg)",
      }}
    >
      <div>
        {stripScreenId(eyebrow) ? <div style={sectionTitleStyle}>{stripScreenId(eyebrow)}</div> : null}
        <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
          {title}
        </h1>
      </div>
      {actions ? <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}

export { Badge, Card };
