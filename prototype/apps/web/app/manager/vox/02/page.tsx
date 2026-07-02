import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Badge, Card } from "@roomlog/ui";
import { getManagerHomeSummary } from "@/lib/manager-home-api";
import { MHOME_ROUTES, MVOX_ROUTES } from "@/lib/manager-home-nav";

const muted: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
};

export default async function Page() {
  const { kpi, todoCount } = await getManagerHomeSummary();
  const hasAnyKpi =
    kpi.occupancyRate !== null ||
    kpi.collectionRate !== null ||
    kpi.overdueAmount > 0 ||
    kpi.urgentTickets > 0;

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "var(--space-lg) var(--page-margin)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-md)",
        }}
      >
        <div>
          <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-title)" }}>
            자산 현황 요약
          </div>
          <div style={{ ...muted, marginTop: "var(--space-xs)" }}>M-BILL 집계와 같은 산식</div>
        </div>
        <LinkButton href={MVOX_ROUTES["M-VOX-00"]} variant="ghost">
          뒤로
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
        {hasAnyKpi ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-sm)" }}>
              <Metric label="입주율" value={formatPercent(kpi.occupancyRate)} note="호실 원천 연결 전이면 숨김" />
              <Metric label="수납률" value={formatPercent(kpi.collectionRate)} note="확인중·orphan 제외" />
              <Metric label="미납" value={formatWon(kpi.overdueAmount)} note="현재 미납 합계" />
              <Metric label="긴급민원" value={`${kpi.urgentTickets}건`} note="미해결 긴급 티켓" />
            </div>
            <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                <Badge emphasis>폰 내 드릴</Badge>
                <Badge>점진 공개</Badge>
              </div>
              <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>
                오늘 업무 {todoCount}건과 KPI를 함께 보며 필요한 지표만 펼칩니다.
              </div>
              <div style={muted}>
                표와 긴 차트는 큰 화면이 더 편하지만, 폰에서도 수납·미납·민원 드릴을 조회할 수 있습니다.
              </div>
            </Card>
          </>
        ) : (
          <Card style={{ borderStyle: "dashed", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <Badge emphasis>빈 상태</Badge>
            <div style={{ fontSize: 24, lineHeight: 1.3, fontWeight: 900 }}>
              아직 표시할 자산 지표가 없어요
            </div>
            <div style={{ ...muted, fontSize: 18 }}>
              입주율이나 수납률을 0%로 보이지 않습니다. 첫 건물과 청구 데이터가 연결되면 요약이 나타납니다.
            </div>
            <LinkButton href={MHOME_ROUTES["M-HOME-05"]} variant="secondary">
              첫 건물 등록
            </LinkButton>
          </Card>
        )}

        <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>큰 화면 핸드오프</div>
          <div style={muted}>
            계약서 원문 대조나 다항목 정산표처럼 넓은 화면이 유리한 작업은 대시보드에서 이어볼 수 있습니다.
          </div>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            <LinkButton href={MHOME_ROUTES["M-HOME-02"]}>정밀 보기</LinkButton>
            <LinkButton href={MHOME_ROUTES["M-HOME-00"]} variant="secondary">
              대시보드로
            </LinkButton>
          </div>
        </Card>
      </main>

      <footer
        style={{
          flex: "none",
          padding: "var(--space-md) var(--page-margin)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <LinkButton href={MVOX_ROUTES["M-VOX-00"]} variant="secondary">
          Voice 홈
        </LinkButton>
      </footer>
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card style={{ minHeight: 128, display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", fontWeight: 800 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, lineHeight: 1.2, fontWeight: 900 }}>{value}</div>
      <div style={{ ...muted, fontSize: "var(--fs-caption)", lineHeight: "var(--lh-caption)" }}>{note}</div>
    </Card>
  );
}

function formatPercent(value: number | null) {
  if (value === null) return "확인 전";
  return `${Math.round(value * 100)}%`;
}

function formatWon(value: number) {
  if (value <= 0) return "확인 전";
  return `${value.toLocaleString("ko-KR")}원`;
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
        ...variants[variant],
      }}
    >
      {children}
    </Link>
  );
}
