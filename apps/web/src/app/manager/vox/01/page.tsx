"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Badge, Button, Card } from "@roomlog/ui";
import type { ManagerHomeSummary } from "@/lib/manager-home-api";
import { MANAGER_CROSS, MHOME_ROUTES, MVOX_ROUTES } from "@/lib/manager-home-nav";

const muted: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
};

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
};

export default function Page() {
  const [summary, setSummary] = useState<ManagerHomeSummary | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let mounted = true;

    // server-only 집계 BFF는 라우트 핸들러를 거쳐 가져온다(클라이언트에서 직접 import 불가).
    fetch("/api/manager/home-summary")
      .then((res) => res.json() as Promise<ManagerHomeSummary>)
      .then((nextSummary) => {
        if (mounted) setSummary(nextSummary);
      })
      .catch(() => {
        /* 셸 단계: 집계 실패는 조용히 무시(홈은 0/빈 큐로 렌더) */
      });

    return () => {
      mounted = false;
    };
  }, []);

  const queues = summary?.queues ?? [];
  const todoCount = summary?.todoCount ?? 0;
  const total = Math.max(todoCount, 1);
  const firstQueue = queues[0];
  const processed = todoCount > 0 ? 1 : 0;

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
            오늘 업무 처리
          </div>
          <div style={{ ...muted, marginTop: "var(--space-xs)" }}>
            진행도 {processed}/{total}
          </div>
        </div>
        <LinkButton href={MVOX_ROUTES["M-VOX-00"]} variant="ghost">
          나중에
        </LinkButton>
      </header>

      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--space-lg) var(--page-margin)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-lg)",
        }}
      >
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div style={row}>
            <Badge emphasis>{firstQueue?.label ?? "큐 없음"}</Badge>
            <Badge>한 화면 한 결정</Badge>
          </div>
          <div style={{ fontSize: 24, lineHeight: 1.3, fontWeight: 900 }}>
            {firstQueue
              ? `${firstQueue.label} ${firstQueue.count}건부터 처리합니다`
              : "지금 처리할 업무가 없습니다"}
          </div>
          <div style={{ ...muted, fontSize: 18 }}>
            음성 안내와 같은 내용을 화면에 함께 표시합니다. 처리 후 다음 업무로 넘어갑니다.
          </div>
        </Card>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <SectionTitle>저위험 allowlist</SectionTitle>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={row}>
              <Badge emphasis>1탭 가능</Badge>
              <Badge>추가사진 요청</Badge>
            </div>
            <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>
              302호 누수 사진이 흐립니다. 같은 위치 사진 1장을 더 요청할까요?
            </div>
            <div style={muted}>근거: 접수 사진 1장 · 수리 확정/비용/발송 없음</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-sm)" }}>
              <Button>승인</Button>
              <Button variant="secondary">거절</Button>
            </div>
            <Button variant="secondary">추가 요청</Button>
          </Card>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <SectionTitle>고위험 정밀 검토 모드</SectionTitle>
          <Card
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-md)",
              border: "1.5px solid var(--primary)",
            }}
          >
            <div style={row}>
              <Badge emphasis>D17</Badge>
              <Badge>폰에서 완결</Badge>
              <Badge>확인 게이트</Badge>
            </div>
            <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>
              입금 확인 대기: 김룸로그 · 580,000원
            </div>
            <Evidence label="입금자" value="김룸로그" />
            <Evidence label="입금액" value="580,000원" />
            <Evidence label="청구 대조" value="7월 월세 550,000원 + 관리비 30,000원" />
            <Evidence label="상태" value="확인중/orphan 여부를 확인 후 확정" />
            <label
              style={{
                display: "flex",
                gap: "var(--space-sm)",
                alignItems: "flex-start",
                fontSize: "var(--fs-body)",
                lineHeight: "var(--lh-body)",
                fontWeight: 700,
              }}
            >
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                style={{ width: 22, height: 22, marginTop: 2 }}
              />
              근거를 모두 확인했고 이 입금 매칭을 확정합니다
            </label>
            <LinkButton href={MANAGER_CROSS.billing} disabled={!confirmed}>
              정밀 검토 후 확인
            </LinkButton>
            <div style={muted}>큰 화면은 권장일 뿐이며, 이 결정은 폰 안에서 끝낼 수 있습니다.</div>
          </Card>
        </section>

        <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>원천 세트로 바로가기</div>
          <div style={muted}>각 항목의 실제 처리 상태는 해당 세트에서 갱신되고 큐에서 제거됩니다.</div>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {queues.map((queue) => (
              <LinkButton key={queue.type} href={queue.href} variant="secondary">
                {queue.label} {queue.count}건
              </LinkButton>
            ))}
            <LinkButton href={MANAGER_CROSS.ticketCall} variant="secondary">
              민원 통화로
            </LinkButton>
            <LinkButton href={MHOME_ROUTES["M-HOME-01"]} variant="ghost">
              큰 화면 업무 허브
            </LinkButton>
          </div>
        </Card>
      </main>

      <footer
        style={{
          flex: "none",
          padding: "var(--space-md) var(--page-margin)",
          borderTop: "1px solid var(--border)",
          display: "grid",
          gap: "var(--space-sm)",
        }}
      >
        <LinkButton href={MVOX_ROUTES["M-VOX-00"]} variant="secondary">
          홈으로
        </LinkButton>
      </footer>
    </>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        color: "var(--on-surface-variant)",
        fontSize: "var(--fs-caption)",
        lineHeight: "var(--lh-caption)",
        fontWeight: 800,
      }}
    >
      {children}
    </div>
  );
}

function Evidence({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "92px 1fr",
        gap: "var(--space-sm)",
        padding: "var(--space-sm) 0",
        borderTop: "1px solid var(--border)",
        fontSize: "var(--fs-body)",
        lineHeight: "var(--lh-body)",
      }}
    >
      <span style={{ color: "var(--on-surface-variant)", fontWeight: 700 }}>{label}</span>
      <span style={{ fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function LinkButton({
  href,
  children,
  variant = "primary",
  disabled = false,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
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
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      onClick={(event) => {
        if (disabled) event.preventDefault();
      }}
      style={{
        minHeight: "var(--touch-target)",
        borderRadius: "var(--radius-btn)",
        padding: "0 var(--space-lg)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        fontSize: "var(--fs-body)",
        lineHeight: "var(--lh-body)",
        fontWeight: 800,
        opacity: disabled ? 0.45 : undefined,
        cursor: disabled ? "not-allowed" : "pointer",
        pointerEvents: disabled ? "none" : undefined,
        ...variants[variant],
      }}
    >
      {children}
    </Link>
  );
}
