import Link from "next/link";
import { Badge, Card, ManagerShell } from "@roomlog/ui";
import { getManagerHomeSummary } from "@/lib/manager-home-api";
import { MANAGER_CROSS, MHOME_ROUTES } from "@/lib/manager-home-nav";

const buildings = [
  { name: "연남 스테이", issue: "긴급민원 2건", metric: "수납률 확인 필요", risk: "정밀 검토" },
  { name: "성수 하우스", issue: "공실 1호", metric: "계약 만료 D-14", risk: "주의" },
  { name: "도곡 레지던스", issue: "미납 추적", metric: "입금 확인 대기", risk: "주의" },
];

export default async function Page() {
  const summary = await getManagerHomeSummary();
  const hasKpi = Object.values(summary.kpi).some((value) => value !== null && value !== 0);
  const kpis = [
    { label: "입주율", value: summary.kpi.occupancyRate === null ? "확인 중" : `${summary.kpi.occupancyRate}%` },
    { label: "이번 달 수납률", value: summary.kpi.collectionRate === null ? "확인 중" : `${summary.kpi.collectionRate}%` },
    { label: "미납 금액", value: `${summary.kpi.overdueAmount.toLocaleString("ko-KR")}원` },
    { label: "긴급민원", value: `${summary.kpi.urgentTickets}건` },
  ];

  return (
    <ManagerShell title={`${summary.managerName} 자산현황 대시보드`} context="워크스페이스 · 큰 화면" nav={<HomeNav active="home" />}>
      <div style={{ display: "grid", gap: "var(--space-xl)" }}>
        <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-xl)", alignItems: "center", background: "var(--surface-container-high)" }}>
          <div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <Badge emphasis>M-HOME-00</Badge>
              <Badge>{summary.managerName}</Badge>
              {summary.managedRoomCount > 0 ? <Badge>관리 호실 {summary.managedRoomCount}개</Badge> : null}
            </div>
            <h1 style={{ margin: "var(--space-md) 0 var(--space-sm)", fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
              오늘 할 일 {summary.todoCount}건
            </h1>
            <p style={{ margin: 0, color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
              {summary.managerName}님에게 배정된 호실과 티켓 기준으로만 요약합니다.
            </p>
          </div>
          <LinkButton href={MHOME_ROUTES["M-HOME-01"]} primary>
            오늘 할 일 열기
          </LinkButton>
        </Card>

        {hasKpi ? (
          <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--space-md)" }}>
            {kpis.map((kpi) => (
              <Link key={kpi.label} href={kpi.label.includes("수납") || kpi.label.includes("미납") ? MANAGER_CROSS.billing : MHOME_ROUTES["M-HOME-03"]} style={linkReset}>
                <Card style={{ minHeight: 116 }}>
                  <div style={captionStyle}>{kpi.label}</div>
                  <div style={{ marginTop: "var(--space-md)", fontSize: "var(--fs-title)", fontWeight: 800 }}>{kpi.value}</div>
                </Card>
              </Link>
            ))}
          </section>
        ) : (
          <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-lg)", alignItems: "center", border: "1.5px dashed var(--outline-variant)" }}>
            <div>
              <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>첫 건물을 등록하세요</div>
              <div style={{ marginTop: "var(--space-xs)", color: "var(--on-surface-variant)" }}>
                아직 단일 산식으로 보여줄 KPI가 없어 0%를 표시하지 않습니다.
              </div>
            </div>
            <LinkButton href={MHOME_ROUTES["M-HOME-05"]}>첫 건물 등록</LinkButton>
          </Card>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "var(--space-lg)" }}>
          <Card>
            <SectionHeader title="건물 요약" href={MHOME_ROUTES["M-HOME-03"]} action="전체 건물 관리" />
            <div style={{ display: "grid", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
              {buildings.map((building) => (
                <Link key={building.name} href={MHOME_ROUTES["M-HOME-03"]} style={linkReset}>
                  <div style={rowStyle}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{building.name}</div>
                      <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{building.issue}</div>
                    </div>
                    <Badge emphasis={building.risk === "정밀 검토"}>{building.risk}</Badge>
                    <span style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{building.metric}</span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader title="임대 현황 리포트" href={MHOME_ROUTES["M-HOME-02"]} action="리포트 보기" />
            <div style={{ marginTop: "var(--space-lg)", display: "grid", gap: "var(--space-sm)" }}>
              {["실수납 추이", "공실·입주 비율", "수리비·비용"].map((label, index) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: `${48 + index * 18}% 1fr`, gap: "var(--space-sm)", alignItems: "center" }}>
                  <div style={{ height: 28, borderRadius: "var(--radius-sm)", background: "var(--surface-container-highest)" }} />
                  <span style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>{label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </ManagerShell>
  );
}

function HomeNav({ active }: { active: "home" | "settings" }) {
  const items = [
    ["홈", MHOME_ROUTES["M-HOME-00"], active === "home"],
    ["티켓 처리", MANAGER_CROSS.ticketDash, false],
    ["청구", MANAGER_CROSS.billing, false],
    ["소통", MANAGER_CROSS.messaging, false],
    ["설정", MHOME_ROUTES["M-HOME-06"], active === "settings"],
  ] as const;
  return (
    <nav aria-label="관리인 자산현황" style={{ display: "grid", gap: "var(--space-sm)" }}>
      {items.map(([label, href, current]) => (
        <Link key={href} href={href} style={{ ...navLinkStyle, background: current ? "var(--surface-container-high)" : "var(--surface-container-lowest)", border: current ? "1.5px solid var(--primary)" : "1px solid var(--border)" }}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function LinkButton({ href, primary, children }: { href: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ minHeight: "var(--touch-target)", padding: "0 var(--space-lg)", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-btn)", background: primary ? "var(--primary)" : "transparent", color: primary ? "var(--on-primary)" : "var(--primary)", border: primary ? "none" : "1.5px solid var(--primary)", textDecoration: "none", fontWeight: 800 }}>
      {children}
    </Link>
  );
}

function SectionHeader({ title, href, action }: { title: string; href: string; action: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
      <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>{title}</div>
      <Link href={href} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>{action}</Link>
    </div>
  );
}

const linkReset = { color: "inherit", textDecoration: "none" } as const;
const captionStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", fontWeight: 700 } as const;
const rowStyle = { minHeight: 68, display: "grid", gridTemplateColumns: "1fr auto auto", gap: "var(--space-md)", alignItems: "center", borderBottom: "1px solid var(--border)" } as const;
const navLinkStyle = { minHeight: 42, display: "flex", alignItems: "center", padding: "0 var(--space-md)", borderRadius: "var(--radius)", color: "var(--on-surface)", textDecoration: "none", fontWeight: 800 } as const;
