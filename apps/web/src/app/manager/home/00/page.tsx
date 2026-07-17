import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { MANAGER_CROSS, MHOME_ROUTES } from "@/lib/manager-home-nav";
import { getUser } from "@/lib/session";
import { AlertStatTiles } from "./AlertStatTiles";
import { HomeCards } from "./HomeCards";
import { InstrumentPanel } from "./InstrumentPanel";
import { RepairExpenseSection } from "./RepairExpenseSection";
import { TodayTasksCard } from "./TodayTasksCard";
import { DASHBOARD_SOURCE_LABELS } from "./dashboard-calculations";
import { assembleManagerDashboard } from "./dashboard-data";
import { BuildingsSection } from "./sections/BuildingsSection";
import { ReportSection } from "./sections/ReportSection";

export default async function Page() {
  const user = await getUser();
  const dashboard = await assembleManagerDashboard(user);
  const managerName = user?.name ?? "관리인";

  const warnings = {
    overdue: dashboard.briefingInput.overdueCount,
    urgent: dashboard.briefingInput.urgentTicketCount,
    expiring: dashboard.briefingInput.expiringContractCount,
    unanswered: dashboard.briefingInput.unansweredThreadCount
  };
  const occupancy = {
    contracted: dashboard.homeCards.length,
    total: dashboard.homeCards.length + dashboard.uncontractedListings.length
  };

  return (
    // 워크스페이스 셸(글로벌 사이드바)을 따른다. AI 진입은 다른 관리 화면과 동일하게
    // 공용 플로팅 런처가 담당한다(대시보드 상단의 AI 브리핑 배너는 제거).
    <ManagerAppShell
      title="관리 홈"
      context={`관리 중 ${dashboard.homeCards.length}곳`}
      managerName={managerName}
      theme="cosmic"
    >
      <div className="manager-home-dashboard">
        <header className="manager-home-intro">
          <div>
            <p>오늘의 운영 현황</p>
            <strong>{managerName}님, 우선 업무 {dashboard.todayTasks.length}건을 확인해주세요.</strong>
          </div>
        </header>

        {dashboard.sourceFailures.length > 0 ? (
          <div role="status" className="manager-home-source-alert">
            <strong>일부 데이터를 불러오지 못했습니다.</strong>
            <span>
              {dashboard.sourceFailures.map((key) => DASHBOARD_SOURCE_LABELS[key]).join(", ")} 항목은 연결된 메뉴에서 다시 확인해주세요.
            </span>
          </div>
        ) : null}

        {/* ── 코스믹 히어로 존: 계기판(현재 상태) 풀폭 → 경고 스트립 → 별자리 차트 밴드(추이) ── */}
        <InstrumentPanel
          depositRatePct={dashboard.depositRatePct}
          monthLabel={dashboard.depositRateMonthLabel}
          payerCounts={dashboard.depositPayerCounts}
          depositAmounts={dashboard.depositAmounts}
          occupancyPct={occupancy.total > 0 ? Math.round((occupancy.contracted / occupancy.total) * 100) : null}
          occupancySub={occupancy.total > 0 ? `${occupancy.contracted} / ${occupancy.total}곳` : "확인 필요"}
          occupancyHref={MHOME_ROUTES["M-HOME-03"]}
          ticketPct={
            dashboard.ticketProgress
              ? Math.round((dashboard.ticketProgress.resolved / dashboard.ticketProgress.total) * 100)
              : null
          }
          ticketSub={dashboard.ticketProgress ? `진행 중 ${dashboard.ticketProgress.open}건` : "티켓 없음"}
          ticketHref={MANAGER_CROSS.ticketDash}
        />

        <AlertStatTiles warnings={warnings} />

        <ReportSection repairExpenses={dashboard.repairExpenses} />

        <RepairExpenseSection repairExpenses={dashboard.repairExpenses} />

        {/* ── 운영 존: 관리 중인 집·미계약 | 오늘 확인할 업무 — 2단으로 스캔 거리를 줄인다 ── */}
        <div className="manager-home-ops">
          <HomeCards
            homeCards={dashboard.homeCards}
            uncontractedListings={dashboard.uncontractedListings}
          />

          <section aria-labelledby="manager-today-tasks-title" className="manager-home-tasks">
            <div className="manager-home-tasks-heading">
              <h2 id="manager-today-tasks-title">오늘 확인할 업무</h2>
              <span>{dashboard.todayTasks.length}건</span>
            </div>
            <TodayTasksCard tasks={dashboard.todayTasks} sourceFailures={dashboard.sourceFailures} />
          </section>
        </div>

        <BuildingsSection />
      </div>

      <style>{`
        /* 집우집주 코스믹 테마 토큰(팔레트·서체·radius)은 packages/ui/tokens.css의 .theme-cosmic으로
           승격됨 — ManagerAppShell theme="cosmic" prop이 워크스페이스 루트에 그 클래스를 얹는다.
           여기 남는 건 이 페이지 전용 장식(별무리 사이드바 배경 등)과 레이아웃뿐이다. */

        .manager-home-dashboard {
          display: grid;
          gap: var(--space-xl);
        }

        /* 로드 오케스트레이션 — 페이지 블록들이 위에서부터 순서대로 떠오른다.
           계기판(히어로)이 먼저, 아래 존들이 반 박자씩 따라온다. */
        .manager-home-dashboard > * {
          animation: manager-home-rise 0.5s cubic-bezier(0.22, 0.9, 0.28, 1) backwards;
        }

        .manager-home-dashboard > *:nth-child(2) { animation-delay: 0.05s; }
        .manager-home-dashboard > *:nth-child(3) { animation-delay: 0.1s; }
        .manager-home-dashboard > *:nth-child(4) { animation-delay: 0.15s; }
        .manager-home-dashboard > *:nth-child(n + 5) { animation-delay: 0.2s; }

        @keyframes manager-home-rise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
        }

        /* ── 운영 존 2단 — 관리 중인 집·미계약 | 오늘 확인할 업무. 좁으면 세로로 ── */
        .manager-home-ops {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
          gap: var(--space-xl);
          align-items: start;
        }

        @media (max-width: 1080px) {
          .manager-home-ops {
            grid-template-columns: 1fr;
          }
        }

        /* ── 레퍼런스 정렬 — 박스를 줄이고 톤으로 말하기 ── */

        /* 활성 필터 '전체': 진한 단색 필 → 옅은 틴트 + 유색 텍스트 (레퍼런스의 Recent 탭 스타일).
           유형별 필터(연체·긴급 등)는 원래 틴트 방식이라 그대로 둔다. */
        .manager-home-dashboard .manager-task-filter--selected {
          border-color: transparent;
          background: var(--primary-container);
          color: var(--on-primary-container);
        }

        .manager-home-intro {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-lg);
        }

        .manager-home-intro p,
        .manager-home-intro strong {
          margin: 0;
        }

        /* 아이브로우 — 발표자료의 宇→宙 그라데이션(페리윙클→핑크)과 ✦ 스파클을 미세하게 인용 */
        .manager-home-intro p {
          margin-bottom: var(--space-xs);
          font-size: 15px;
          line-height: 22px;
          font-weight: 800;
          letter-spacing: 0.14em;
          background: linear-gradient(92deg, #5a68d8, #b8508a);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .manager-home-intro p::before {
          content: "\\2726  ";
        }

        /* 페이지 최상위 문장 — 헤딩 위계에서 제일 크게 */
        .manager-home-intro strong {
          display: block;
          font-size: 28px;
          line-height: 36px;
          font-weight: 800;
        }

        .manager-home-source-alert {
          display: flex;
          align-items: baseline;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          border: 1px solid color-mix(in srgb, var(--error) 32%, var(--border));
          border-radius: var(--radius-md);
          background: var(--error-container);
          color: var(--on-error-container);
          font-size: var(--fs-caption);
          line-height: var(--lh-caption);
        }

        .manager-home-tasks {
          display: grid;
          gap: var(--space-md);
        }

        .manager-home-tasks-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-lg);
        }

        .manager-home-tasks-heading h2 {
          margin: 0;
          font-size: var(--fs-title);
          line-height: var(--lh-title);
        }

        .manager-home-tasks-heading > span {
          color: var(--on-surface-variant);
          font-size: var(--fs-caption);
          font-weight: 700;
        }

        /* 심야 우주 사이드바·콘텐츠 배경은 manager/globals.css의 .theme-cosmic 스코프로
           승격됨(모든 관리 화면 공용). 여기 남는 건 이 페이지 전용 인트로/레이아웃뿐이다. */

        @media (max-width: 620px) {
          .manager-home-intro,
          .manager-home-source-alert {
            align-items: flex-start;
            flex-direction: column;
          }

        }

        @media (prefers-reduced-motion: reduce) {
          .manager-home-dashboard > * {
            animation: none;
          }
        }

      `}</style>
    </ManagerAppShell>
  );
}
