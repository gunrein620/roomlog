import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  DefectAnalysis,
  RepairJob,
  RepairStage,
  ResponsibilityVerdict,
  TicketAiFeedback,
  TicketResponsibilityDecision,
  Ticket,
  TicketStatus,
  Urgency,
} from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { stripScreenId } from "@/lib/screen-id";
import { buildTicketTimeline } from "@/lib/ticket-timeline";
import { ManagerMutationForm } from "../../_components/ManagerMutationForm";
import type { ManagerMutationAction } from "../../_components/manager-mutation-state";

export const dashRoutes = {
  "00": "/manager/ticket/dash/00",
  "01": "/manager/ticket/dash/01",
  "02": "/manager/ticket/dash/02",
  "03": "/manager/ticket/dash/03",
  "04": "/manager/ticket/dash/04",
  "05": "/manager/ticket/dash/05",
  e0: "/manager/ticket/dash/e0",
} as const;

export function ticketDashHref(screen: keyof typeof dashRoutes, ticketId?: string) {
  const route = dashRoutes[screen];

  return ticketId ? `${route}?id=${encodeURIComponent(ticketId)}` : route;
}

export const callRoutes = {
  "00": "/manager/ticket/call/00",
  "01": "/manager/ticket/call/01",
  "02": "/manager/ticket/call/02",
  "03": "/manager/ticket/call/03",
  "04": "/manager/ticket/call/04",
  e0: "/manager/ticket/call/e0",
} as const;

export const ticketStatusLabel: Record<TicketStatus, string> = {
  received: "접수",
  reviewing: "검토",
  info_requested: "추가정보 요청",
  processing: "처리 중",
  resolved: "완료",
  reopened: "재요청",
  cancelled: "취소됨",
};

export const repairStageLabel: Record<RepairStage, string> = {
  vendor_assigned: "업체 배정",
  quoted: "견적",
  scheduled: "일정 확정",
  in_progress: "수리 중",
  completed: "수리 완료",
  paid: "결제 완료",
};

export const urgencyLabel: Record<Urgency, string> = {
  1: "즉시",
  2: "높음",
  3: "보통",
  4: "낮음",
};

export const responsibilityLabel: Record<ResponsibilityVerdict, string> = {
  landlord_likely: "임대인 책임 가능성",
  tenant_likely: "임차인 책임 가능성",
  unclear: "판단 어려움",
};

export const pageStack: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-lg)",
};

export const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
};

export const muted: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-caption)",
};

export const sectionTitle: CSSProperties = {
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
};

export function LinkButton({
  href,
  children,
  variant = "primary",
  fullWidth,
  style,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
  style?: CSSProperties;
}) {
  const variants: Record<"primary" | "secondary" | "ghost", CSSProperties> = {
    primary: {
      background: "var(--primary)",
      color: "var(--on-primary)",
      border: "none",
    },
    secondary: {
      background: "transparent",
      color: "var(--primary)",
      border: "1.5px solid var(--primary)",
    },
    ghost: {
      background: "transparent",
      color: "var(--on-surface-variant)",
      border: "none",
    },
  };

  return (
    <Link
      href={href}
      style={{
        minHeight: "var(--touch-target)",
        borderRadius: "var(--radius-btn)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body)",
        fontWeight: 700,
        padding: "0 var(--space-lg)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        width: fullWidth ? "100%" : undefined,
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </Link>
  );
}

export function TicketHeader({
  ticket,
  title,
  showBuildingName = false,
}: {
  ticket: Ticket;
  title: ReactNode;
  showBuildingName?: boolean;
}) {
  const locationLabel = showBuildingName && ticket.buildingName
    ? `${ticket.buildingName} / ${ticket.unitId}호`
    : `${ticket.unitId}호`;

  return (
    <div style={{ ...row, justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-title)" }}>{title}</div>
        <div style={{ ...muted, marginTop: "var(--space-xs)" }}>
          {locationLabel}
        </div>
      </div>
      <div style={row}>
        <Badge emphasis>긴급도 {urgencyLabel[ticket.urgency]}</Badge>
        <Badge>{ticketStatusLabel[ticket.status]}</Badge>
      </div>
    </div>
  );
}

export function StatusBadges({ ticket, repair }: { ticket: Ticket; repair?: RepairJob | null }) {
  const repairStatusLabel = repair?.stage === "in_progress"
    ? "수리중"
    : `수리 ${repair ? repairStageLabel[repair.stage] : "대기"}`;

  return (
    <div style={row}>
      <Badge emphasis>티켓 {ticketStatusLabel[ticket.status]}</Badge>
      <Badge>{repairStatusLabel}</Badge>
      {ticket.disposition === "on_hold" ? <Badge>보류 큐</Badge> : null}
    </div>
  );
}

export function ResponsibilityCard({
  analysis,
  ticketId,
  aiFeedback = [],
  responsibilityDecision,
  decisionAction,
}: {
  analysis?: DefectAnalysis | null;
  ticketId: string;
  aiFeedback?: TicketAiFeedback[];
  responsibilityDecision?: TicketResponsibilityDecision;
  decisionAction: ManagerMutationAction;
}) {
  if (!analysis) {
    return (
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={sectionTitle}>AI 책임 검토</div>
        <div style={muted}>조회할 책임 검토 내용이 없습니다.</div>
      </Card>
    );
  }

  const percent = Math.round(analysis.confidence * 100);
  const openAppeals = aiFeedback.filter(
    (feedback) => feedback.target === "RESPONSIBILITY" && feedback.status === "OPEN",
  );
  const decisionLabel = responsibilityDecision?.responsibility === "TENANT" ? "임차인" : "임대인";
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", padding: "var(--space-md)" }}>
      <div style={sectionTitle}>AI 책임 검토</div>
      <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: "var(--fw-subtitle)" }}>
        {responsibilityLabel[analysis.responsibility]} {percent}%
      </div>
      <div style={{ ...row, justifyContent: "space-between" }}>
        {analysis.moveinComparisonAvailable ? <Badge>입주 기록 비교 가능</Badge> : null}
        <div style={muted}>AI 책임 검토는 참고용입니다.</div>
      </div>

      {openAppeals.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-xs)",
            padding: "var(--space-sm)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          <strong style={{ fontSize: "var(--fs-caption)" }}>OPEN 책임 판단 이의제기</strong>
          {openAppeals.map((feedback) => (
            <div key={feedback.id} style={muted}>{feedback.reason}</div>
          ))}
        </div>
      ) : null}

      {responsibilityDecision ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
          <strong>관리자 확정: {decisionLabel} 책임</strong>
          <div style={muted}>{responsibilityDecision.note}</div>
        </div>
      ) : null}

      <ManagerMutationForm action={decisionAction}>
        <input type="hidden" name="ticketId" value={ticketId} />
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <label style={{ display: "grid", gap: "var(--space-xs)", fontSize: "var(--fs-caption)" }}>
            관리자 책임 확정
            <select
              name="responsibility"
              defaultValue={responsibilityDecision?.responsibility ?? "LANDLORD"}
              style={{
                minHeight: "var(--touch-target)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--surface-container-lowest)",
                color: "var(--on-surface)",
                padding: "0 var(--space-sm)",
              }}
            >
              <option value="TENANT">임차인 책임</option>
              <option value="LANDLORD">임대인 책임</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: "var(--space-xs)", fontSize: "var(--fs-caption)" }}>
            세입자에게 보이는 사유
            <textarea
              name="note"
              required
              defaultValue={responsibilityDecision?.note}
              style={{
                minHeight: "calc(var(--touch-target) * 2)",
                resize: "vertical",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--surface-container-lowest)",
                color: "var(--on-surface)",
                padding: "var(--space-sm)",
                font: "inherit",
              }}
            />
          </label>
          <Button type="submit">관리자 확정 저장</Button>
        </div>
      </ManagerMutationForm>
    </Card>
  );
}

export function EvidencePanel({
  compact,
  available = true,
}: {
  compact?: boolean;
  available?: boolean;
}) {
  if (!available) {
    return (
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={sectionTitle}>사진 비교·근거</div>
        <div style={muted}>조회할 사진 비교·근거 내용이 없습니다.</div>
      </Card>
    );
  }

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <div style={sectionTitle}>사진 비교·근거</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-sm)",
        }}
      >
        {["입주 전", "현재"].map((label) => (
          <div
            key={label}
            style={{
              minHeight: compact ? "72px" : "140px",
              border: "1px dashed var(--outline-variant)",
              borderRadius: "var(--radius)",
              background: "var(--surface-container-low)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--on-surface-variant)",
              fontSize: "var(--fs-caption)",
            }}
          >
            {label} 사진
          </div>
        ))}
      </div>
      <div style={muted}>계약 조항: 통상 사용 마모와 구조 설비 하자는 관리인 검토 후 판정</div>
      <LinkButton href={dashRoutes["02"]} variant="secondary" fullWidth>
        근거 자세히
      </LinkButton>
    </Card>
  );
}

export function Timeline({
  ticket,
  analysis,
  repair,
}: {
  ticket: Ticket;
  analysis?: DefectAnalysis | null;
  repair?: RepairJob | null;
}) {
  const items = buildTicketTimeline({
    ticketStatus: ticket.status,
    hasAnalysis: Boolean(analysis),
    repairStage: repair?.stage,
  });

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      <div style={sectionTitle}>처리 이력</div>
      {items.map((item) => (
        <div key={item.label} style={{ ...row, alignItems: "flex-start" }}>
          <span
            role="img"
            aria-label={`${item.label}: ${item.reached ? "진행됨" : "미진행"}`}
            style={{
              width: "var(--space-sm)",
              height: "var(--space-sm)",
              marginTop: "var(--space-sm)",
              borderRadius: "var(--radius-full)",
              background: item.reached
                ? "var(--primary)"
                : "var(--surface-container-lowest)",
              border: `1.5px solid var(--primary)`,
              boxSizing: "border-box",
              flex: "none",
            }}
          />
          <span style={muted}>{item.label}</span>
        </div>
      ))}
    </Card>
  );
}

export function RepairProgress({ repair }: { repair: RepairJob }) {
  const stages: RepairStage[] = [
    "vendor_assigned",
    "quoted",
    "scheduled",
    "in_progress",
    "completed",
    "paid",
  ];
  const current = stages.indexOf(repair.stage);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "var(--space-sm)" }}>
      {stages.map((stage, index) => (
        <div
          key={stage}
          style={{
            minHeight: "64px",
            border: index <= current ? "1.5px solid var(--primary)" : "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "var(--space-sm)",
            background: index <= current ? "var(--chip-bg)" : "var(--surface-container-lowest)",
            fontSize: "var(--fs-caption)",
            color: index <= current ? "var(--on-surface)" : "var(--on-surface-variant)",
            fontWeight: index === current ? 700 : 400,
          }}
        >
          {repairStageLabel[stage]}
        </div>
      ))}
    </div>
  );
}

export function PaymentGate({ repair }: { repair: RepairJob }) {
  const canApprove = repair.stage === "completed" || repair.stage === "paid";
  return (
    <Card
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-md)",
        border: canApprove ? "1.5px solid var(--primary)" : "1.5px dashed var(--outline-variant)",
      }}
    >
      <div style={sectionTitle}>승인 게이트</div>
      <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>
        결제 승인은 수리완료 확인 후 활성화
      </div>
      <div style={muted}>
        현재 수리 상태: {repairStageLabel[repair.stage]} · 업체 확정, 견적 승인, 수리완료 조건을 확인합니다.
      </div>
      <Button disabled={!canApprove} style={!canApprove ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>
        결제 승인
      </Button>
    </Card>
  );
}

export function MobileScreen({
  eyebrow,
  title,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "var(--space-lg) var(--page-margin)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {stripScreenId(eyebrow) ? <div style={muted}>{stripScreenId(eyebrow)}</div> : null}
        <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-title)", marginTop: "var(--space-xs)" }}>
          {title}
        </div>
      </header>
      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--page-margin)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-lg)",
        }}
      >
        {children}
      </main>
      <footer
        style={{
          flex: "none",
          padding: "var(--space-md) var(--page-margin)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
        }}
      >
        {footer}
      </footer>
    </>
  );
}

export function SingleUserStatus({ ticket, repair }: { ticket: Ticket; repair?: RepairJob }) {
  const text =
    ticket.disposition === "on_hold"
      ? "보류 중"
      : repair?.stage === "completed"
        ? "처리 마무리 단계"
        : ticket.status === "processing"
          ? "처리 중"
          : ticket.status === "info_requested"
            ? "추가 확인 필요"
            : "검토 중";

  return (
    <Card style={{ background: "var(--chip-bg)" }}>
      <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>현재 상태 · {text}</div>
      <div style={{ ...muted, marginTop: "var(--space-xs)" }}>
        모바일에서는 티켓/수리 트랙을 합쳐 한 줄로 안내합니다.
      </div>
    </Card>
  );
}

export function Money({ amount }: { amount?: number }) {
  return <>{amount ? `${amount.toLocaleString("ko-KR")}원` : "견적 대기"}</>;
}
