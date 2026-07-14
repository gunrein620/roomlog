import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { MANAGER_CROSS, MHOME_ROUTES } from "@/lib/manager-home-nav";

// M-HOME-02(임대 현황 리포트) 데모 콘텐츠를 00 페이지 하단 섹션으로 통합.
// 상단 탭 "임대 현황 리포트"는 /manager/home/00#report로 스크롤한다.
// 월별 수익 추이·월별 수리비는 메인 계기판 아래 자산 막대 카드(PortfolioBarCards)에도 뽑아 올렸다(이 섹션의 4개 차트는 그대로 유지).
// 실수납·미납률 KPI 카드는 계기판의 입주율·티켓 링과 겹쳐 여기서 삭제했다.
const charts = [
  ["월별 수익 추이", "70%", "실수납"],
  ["공실률·입주율", "44%", "입주율"],
  ["민원처리율", "58%", "완료 티켓"],
  ["월별 수리비", "36%", "비용"],
] as const;

export function ReportSection() {
  return (
    <section id="report" aria-labelledby="report-section-title" className="manager-embedded-section">
      <div className="manager-embedded-section-heading">
        <h2 id="report-section-title">임대 현황 리포트</h2>
        <span className="manager-embedded-demo-badge">데모</span>
      </div>

      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Badge emphasis>6M</Badge>
          <Badge>1Y</Badge>
          <Badge>건물 전체</Badge>
          <Badge>PDF/CSV</Badge>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
          {charts.map(([title, width, label]) => (
            <Card key={title} style={{ minHeight: 220 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)" }}>
                <strong>{title}</strong>
                <Badge>{label}</Badge>
              </div>
              <div style={{ marginTop: "var(--space-xl)", display: "grid", gap: "var(--space-sm)" }}>
                {[0, 1, 2, 3].map((offset) => (
                  <div key={offset} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: "var(--space-md)", alignItems: "center" }}>
                    <span style={captionStyle}>{offset + 1}월</span>
                    <div style={{ height: 18, borderRadius: "var(--radius-full)", background: "var(--surface-container)" }}>
                      <div style={{ width: offset === 0 ? width : `${Math.max(28, Number.parseInt(width) - offset * 8)}%`, height: "100%", borderRadius: "var(--radius-full)", background: "var(--surface-container-highest)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <Card style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
          <Drill href={`${MANAGER_CROSS.billing}/overdue`}>미납 드릴다운</Drill>
          <Drill href={MANAGER_CROSS.ticketDash}>수리비 드릴다운</Drill>
          <Drill href={MHOME_ROUTES["M-HOME-00"]}>대시보드로</Drill>
        </Card>
      </div>

      <style>{`
        .manager-embedded-section {
          /* 통합 전엔 별도 페이지였다 — 다른 섹션들보다 훨씬 넉넉하게 띄워 경계를 호흡으로 구분한다 */
          margin-top: 56px;
          scroll-margin-top: 96px;
        }

        .manager-embedded-section-heading {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          margin-bottom: var(--space-lg);
        }

        /* 통합 섹션은 "페이지였던 것"이라 위계가 한 단계 높다 — 관리 중인 집·오늘 확인할 업무와 같은 fs-title 급으로 맞춘다 */
        .manager-embedded-section-heading h2 {
          margin: 0;
          font-size: var(--fs-title);
          line-height: var(--lh-title);
        }

        .manager-embedded-demo-badge {
          flex: 0 0 auto;
          padding: var(--space-xs) var(--space-sm);
          border-radius: var(--radius-full);
          color: var(--on-warning-container);
          background: var(--warning-container);
          font-size: var(--fs-caption);
          line-height: var(--lh-caption);
        }
      `}</style>
    </section>
  );
}

function Drill({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>{children}</Link>;
}

const captionStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", fontWeight: 700 } as const;
