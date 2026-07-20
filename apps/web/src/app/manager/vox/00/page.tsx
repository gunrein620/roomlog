import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Badge, Card, Input } from "@roomlog/ui";
import { getManagerHomeSummary } from "@/lib/manager-home-api";
import { MANAGER_CROSS, MHOME_ROUTES, MVOX_ROUTES } from "@/lib/manager-home-nav";

const stack: CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: "var(--space-lg) var(--page-margin)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-lg)",
};

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
};

const muted: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
};

export default async function Page() {
  const summary = await getManagerHomeSummary();
  const hasWork = summary.todoCount > 0;
  const today = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "var(--space-lg) var(--page-margin)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          gap: "var(--space-md)",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-title)" }}>
            오늘도 바로 처리해요
          </div>
          <div style={{ ...muted, marginTop: "var(--space-xs)" }}>{today} · 관리인 Voice</div>
        </div>
        <Link
          href={MVOX_ROUTES["M-VOX-01"]}
          aria-label={`알림 ${summary.todoCount}건`}
          style={{
            minWidth: "var(--touch-target)",
            height: "var(--touch-target)",
            borderRadius: "var(--radius-btn)",
            border: "1.5px solid var(--outline-variant)",
            background: "var(--surface-container-lowest)",
            color: "var(--on-surface)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--fs-body)",
            fontWeight: 800,
          }}
        >
          {summary.todoCount}
        </Link>
      </header>

      <main style={stack}>
        <Card
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-md)",
            border: "1.5px solid var(--primary)",
          }}
        >
          <div style={row}>
            <Badge emphasis>음성 요약</Badge>
            <Badge>텍스트 병기</Badge>
          </div>
          {hasWork ? (
            <>
              <div
                style={{
                  fontSize: 28,
                  lineHeight: 1.25,
                  fontWeight: 900,
                  letterSpacing: 0,
                }}
              >
                오늘 미처리 {summary.todoCount}건
              </div>
              <div style={{ ...muted, fontSize: 18 }}>
                {summary.queues.map((q) => `${q.label} ${q.count}건`).join(", ")}
                {summary.kpi.urgentTickets > 0 ? ` · 긴급민원 ${summary.kpi.urgentTickets}건` : ""}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 24, lineHeight: 1.3, fontWeight: 900 }}>
                지금 바로 처리할 업무가 없어요
              </div>
              <div style={{ ...muted, fontSize: 18 }}>
                건물 데이터가 아직 없다면 첫 건물 등록 후 업무와 지표를 함께 볼 수 있어요.
              </div>
            </>
          )}
        </Card>

        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <LinkButton href={MVOX_ROUTES["M-VOX-01"]}>오늘 업무 시작</LinkButton>
          <LinkButton href={MANAGER_CROSS.ticketCall} variant="secondary">
            민원 통화 시작
          </LinkButton>
          <LinkButton href={MVOX_ROUTES["M-VOX-02"]} variant="secondary">
            현황 요약 보기
          </LinkButton>
        </div>

        <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>텍스트로 빠른 조회</div>
          <Input aria-label="Voice 비서에게 물어보기" placeholder="예: 오늘 미납 많은 건물 알려줘" />
          <LinkButton href={MANAGER_CROSS.report} variant="ghost">
            질의 챗봇으로 열기
          </LinkButton>
        </Card>

        {!hasWork ? (
          <Card style={{ borderStyle: "dashed", display: "grid", gap: "var(--space-sm)" }}>
            <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>첫 건물 등록이 필요해요</div>
            <div style={muted}>폰에서도 이어갈 수 있고, 큰 화면에서는 CSV 등록이 더 편합니다.</div>
            <LinkButton href={MHOME_ROUTES["M-HOME-05"]} variant="secondary">
              첫 건물 등록
            </LinkButton>
          </Card>
        ) : null}
      </main>

      <PhoneTab active="home" />
      <Link
        href={MANAGER_CROSS.messaging}
        aria-label="채팅 열기"
        style={{
          position: "absolute",
          right: 24,
          bottom: 82,
          width: 58,
          height: 58,
          borderRadius: "var(--radius-full)",
          background: "var(--primary)",
          color: "var(--on-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textDecoration: "none",
          fontSize: 22,
          fontWeight: 900,
          boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
        }}
      >
        말
      </Link>
    </>
  );
}

function LinkButton({
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
    secondary: {
      background: "transparent",
      color: "var(--primary)",
      border: "1.5px solid var(--primary)",
    },
    ghost: {
      background: "transparent",
      color: "var(--on-surface-variant)",
      border: "1px solid var(--border)",
    },
  };

  return (
    <Link
      href={href}
      style={{
        minHeight: 58,
        borderRadius: "var(--radius-btn)",
        padding: "0 var(--space-lg)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        fontSize: 18,
        lineHeight: 1.3,
        fontWeight: 800,
        ...variants[variant],
      }}
    >
      {children}
    </Link>
  );
}

function PhoneTab({ active }: { active: "home" | "billing" | "messaging" }) {
  const tabs = [
    { key: "home", label: "홈", href: MVOX_ROUTES["M-VOX-00"] },
    { key: "billing", label: "청구", href: MANAGER_CROSS.billing },
    { key: "messaging", label: "소통", href: MANAGER_CROSS.messaging },
  ] as const;

  return (
    <nav
      aria-label="관리인 하단 탭"
      style={{
        flex: "none",
        borderTop: "1px solid var(--border)",
        padding: "var(--space-sm) var(--page-margin)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "var(--space-sm)",
        background: "var(--surface)",
      }}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          style={{
            minHeight: "var(--touch-target)",
            borderRadius: "var(--radius-btn)",
            textDecoration: "none",
            color: active === tab.key ? "var(--on-primary)" : "var(--on-surface-variant)",
            background: active === tab.key ? "var(--primary)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "var(--fs-caption)",
            fontWeight: 800,
          }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
