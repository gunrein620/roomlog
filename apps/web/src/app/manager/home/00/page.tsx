import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { MANAGER_CROSS, MHOME_ROUTES } from "@/lib/manager-home-nav";
import { getUser } from "@/lib/session";
import { AlertStatTiles } from "./AlertStatTiles";
import { CopilotPanel } from "./CopilotPanel";
import { HeroDepositCard } from "./HeroDepositCard";
import { HomeCards } from "./HomeCards";
import { RingStatCard } from "./RingStatCard";
import { TodayTasksCard } from "./TodayTasksCard";
import { DASHBOARD_SOURCE_LABELS } from "./dashboard-calculations";
import { assembleManagerDashboard } from "./dashboard-data";
import { BuildingsSection } from "./sections/BuildingsSection";
import { RegisterSection } from "./sections/RegisterSection";
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
    // 워크스페이스 셸(글로벌 사이드바)을 따르되, 홈은 자체 코파일럿을 내장하므로
    // 공용 AI 비서 플로팅 런처는 숨긴다 — AI 표면 통일 방향은 PR에서 논의.
    <ManagerAppShell
      title="관리 홈"
      context={`관리 중 ${dashboard.homeCards.length}곳`}
      managerName={managerName}
      hideAssistantLauncher
    >
      <div className="manager-home-dashboard">
        <header className="manager-home-intro">
          <div>
            <p>오늘의 운영 현황</p>
            <strong>{managerName}님, 우선 업무 {dashboard.todayTasks.length}건을 확인해주세요.</strong>
          </div>
        </header>

        <div data-copilot-slot>
          <CopilotPanel briefingInput={dashboard.briefingInput} />
        </div>

        {dashboard.sourceFailures.length > 0 ? (
          <div role="status" className="manager-home-source-alert">
            <strong>일부 데이터를 불러오지 못했습니다.</strong>
            <span>
              {dashboard.sourceFailures.map((key) => DASHBOARD_SOURCE_LABELS[key]).join(", ")} 항목은 연결된 메뉴에서 다시 확인해주세요.
            </span>
          </div>
        ) : null}

        <div className="manager-home-bento">
          <HeroDepositCard
            depositRatePct={dashboard.depositRatePct}
            monthLabel={dashboard.depositRateMonthLabel}
            payerCounts={dashboard.depositPayerCounts}
            depositAmounts={dashboard.depositAmounts}
          />
          <RingStatCard
            label="입주율"
            pct={occupancy.total > 0 ? Math.round((occupancy.contracted / occupancy.total) * 100) : null}
            sub={occupancy.total > 0 ? `${occupancy.contracted} / ${occupancy.total}곳` : "확인 필요"}
            href={MHOME_ROUTES["M-HOME-03"]}
            gridArea="occ"
            tint="blue"
          />
          <RingStatCard
            label="티켓 처리율"
            pct={
              dashboard.ticketProgress
                ? Math.round((dashboard.ticketProgress.resolved / dashboard.ticketProgress.total) * 100)
                : null
            }
            sub={dashboard.ticketProgress ? `진행 중 ${dashboard.ticketProgress.open}건` : "티켓 없음"}
            href={MANAGER_CROSS.ticketDash}
            gridArea="ticket"
            tint="mint"
          />
          <AlertStatTiles warnings={warnings} />
        </div>

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

        <ReportSection />
        <BuildingsSection />
        <RegisterSection />
      </div>

      <style>{`
        /* 둥근 한글 서체 — 나눔스퀘어라운드 (네이버 한글 정적 CDN).
           원본 CSS는 웨이트별 패밀리명이 분리되어 있어 가짜 볼드가 생기므로
           woff2를 직접 선언해 font-weight 400/700/800에 매핑한다. */
        @font-face {
          font-family: "NanumSquareRound";
          src: url(https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareRound/NanumSquareRoundR.woff2) format("woff2");
          font-weight: 400;
          font-display: swap;
        }
        @font-face {
          font-family: "NanumSquareRound";
          src: url(https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareRound/NanumSquareRoundB.woff2) format("woff2");
          font-weight: 700;
          font-display: swap;
        }
        @font-face {
          font-family: "NanumSquareRound";
          src: url(https://hangeul.pstatic.net/hangeul_static/webfont/NanumSquareRound/NanumSquareRoundEB.woff2) format("woff2");
          font-weight: 800;
          font-display: swap;
        }

        /* ── 집우집주(宇宙) 코스믹 스킨 — M-HOME-00 한정 토큰 오버라이드.
           컴포넌트는 시맨틱 토큰만 소비하므로 여기서 팔레트만 갈아끼운다.
           검증 후 packages/ui/tokens.css(theme v1)로 승격 예정. ── */
        .manager-workspace:has(.manager-home-dashboard) {
          /* surface: 새벽빛 라벤더 캔버스 — 보더 없이도 흰 카드가 읽히도록 캔버스를 한 톤 깊게 */
          --surface: #f1eef9;
          --surface-dim: #e8e3f3;
          --surface-container-lowest: #ffffff;
          --surface-container-low: #f5f2fb;
          --surface-container: #efebf8;
          --surface-container-high: #e8e3f3;
          --surface-container-highest: #e1dcef;
          --on-surface: #211c33;
          --on-surface-variant: #6b6584;
          --inverse-surface: #262040;
          --inverse-on-surface: #f7f5fc;

          /* 선 대신 면 — 보더 완전 제거. 구분은 캔버스-카드 톤 차이와 그림자만 맡는다 */
          --outline: #9a93b6;
          --outline-variant: transparent;
          --border: transparent;

          /* primary: 우주 인디고 */
          --primary: #5747cf;
          --on-primary: #ffffff;
          --primary-container: #e9e5ff;
          --on-primary-container: #3a2ba8;

          --chip-bg: #f0edf9;
          --chip-on: #4c4570;

          /* pastel: 성운 팔레트 — 유형 구분 의미는 유지, 색축만 보라 계열로 */
          --pastel-peach: #f9e0d3;
          --on-pastel-peach: #86432a;
          --pastel-mint: #daefe6;
          --on-pastel-mint: #1f6a52;
          --pastel-lilac: #e9e2fa;
          --on-pastel-lilac: #4f3d9e;
          --pastel-blue: #e1e6fb;
          --on-pastel-blue: #3a4894;
          --pastel-pink: #fadeee;
          --on-pastel-pink: #963f6d;
          --pastel-yellow: #f7ebc4;
          --on-pastel-yellow: #6d581a;

          /* nav: 심야 우주 */
          --nav-surface: #201a3f;
          --nav-on-surface: #f4f1fd;
          --nav-on-surface-muted: #a79ed6;

          --input-border: #e6e1f2;
          --input-placeholder: #9a93b6;
          --input-text: #211c33;

          /* 서체: 둥근 한글 — 모서리 곡률과 같은 이야기를 글자에서도 */
          --font-sans: "NanumSquareRound", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;

          /* elevation: 남보라 그림자 — 레퍼런스처럼 있는 듯 없는 듯, 넓게 퍼진 저농도로 */
          --shadow: 0 24px 56px rgba(35, 27, 74, 0.09);
          --shadow-soft: 0 14px 36px rgba(35, 27, 74, 0.05);

          /* 곡률 — 크기에 비례해 radius 확대 (카드 20 / 버튼 16) */
          --radius-sm: 10px;
          --radius: 14px;
          --radius-md: 20px;
          --radius-btn: 16px;
          --radius-lg: 26px;
        }

        .manager-home-dashboard {
          display: grid;
          gap: var(--space-xl);
        }

        /* ── 벤토 그리드 — 3열 1:1:1(입주율 링 · 납부 히어로 · 티켓 처리율 링) + 경고 타일 스트립 ── */
        .manager-home-bento {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          grid-template-areas:
            "occ hero ticket"
            "alerts alerts alerts";
          gap: var(--space-md);
        }

        .manager-home-bento > .manager-hero-deposit {
          grid-area: hero;
        }

        .manager-home-bento > .manager-alert-tiles {
          grid-area: alerts;
        }

        @media (max-width: 1120px) {
          .manager-home-bento {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-template-areas:
              "hero hero"
              "occ ticket"
              "alerts alerts";
          }
        }

        @media (max-width: 620px) {
          .manager-home-bento {
            grid-template-columns: 1fr;
            grid-template-areas:
              "hero"
              "occ"
              "ticket"
              "alerts";
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

        /* 시그니처 — 심야 우주 네비: 별무리(radial dot 레이어) + 궤도 링 + 성운 코너.
           전부 background 레이어라 DOM 추가·리플로 비용 없음.
           글로벌 사이드바(ManagerSidebar)는 토큰을 소비하므로, 이 스코프에서
           표면·글자 토큰을 어두운 배경용으로 재반전시켜 가독성을 지킨다. */
        .manager-workspace:has(.manager-home-dashboard) .manager-workspace__sidebar {
          --surface-container-lowest: transparent;
          --surface-container-low: rgba(255, 255, 255, 0.06);
          --surface-container: rgba(255, 255, 255, 0.08);
          --surface-container-high: rgba(255, 255, 255, 0.12);
          --on-surface: #f4f1fd;
          --on-surface-variant: #a79ed6;
          --border: rgba(160, 146, 255, 0.22);
          --primary-container: rgba(233, 229, 255, 0.94);
          --on-primary-container: #43338f;
          border-right-color: #2c2454 !important;
          background:
            radial-gradient(1.5px 1.5px at 18% 9%, rgba(255, 255, 255, 0.9), transparent 55%),
            radial-gradient(1px 1px at 72% 5%, rgba(255, 255, 255, 0.7), transparent 55%),
            radial-gradient(1px 1px at 44% 16%, rgba(214, 205, 255, 0.8), transparent 55%),
            radial-gradient(1.5px 1.5px at 84% 27%, rgba(255, 255, 255, 0.55), transparent 55%),
            radial-gradient(1px 1px at 24% 38%, rgba(214, 205, 255, 0.6), transparent 55%),
            radial-gradient(1px 1px at 64% 49%, rgba(255, 255, 255, 0.5), transparent 55%),
            radial-gradient(1.5px 1.5px at 36% 63%, rgba(255, 255, 255, 0.6), transparent 55%),
            radial-gradient(1px 1px at 80% 74%, rgba(214, 205, 255, 0.55), transparent 55%),
            radial-gradient(1px 1px at 16% 86%, rgba(255, 255, 255, 0.45), transparent 55%),
            radial-gradient(1px 1px at 58% 94%, rgba(214, 205, 255, 0.5), transparent 55%),
            radial-gradient(circle 130px at 86% 5%, transparent 100px, rgba(160, 146, 255, 0.3) 101px, transparent 103px),
            radial-gradient(circle 380px at 115% -6%, rgba(242, 123, 169, 0.14), transparent 68%),
            radial-gradient(circle 360px at -25% 106%, rgba(102, 88, 214, 0.3), transparent 70%),
            linear-gradient(172deg, #292153 0%, #1e1840 52%, #241d4e 100%) !important;
        }

        .manager-workspace:has(.manager-home-dashboard) .manager-workspace__content {
          background: var(--surface);
        }

        @media (max-width: 620px) {
          .manager-home-intro,
          .manager-home-source-alert {
            align-items: flex-start;
            flex-direction: column;
          }

        }

      `}</style>
    </ManagerAppShell>
  );
}
