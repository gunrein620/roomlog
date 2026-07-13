import Link from "next/link";
import { Badge, Card, Input } from "@roomlog/ui";
import { MHOME_ROUTES } from "@/lib/manager-home-nav";

// M-HOME-03(전체 건물 관리) 데모 콘텐츠를 00 페이지 하단 섹션으로 통합.
// 상단 탭 "전체 건물 관리"는 /manager/home/00#buildings로 스크롤한다.
// D-table 2: risk_score 산식 미확정(수납률 "확인 중") → 임의 라벨 금지. 원시 지표만 노출.
const buildings = [
  { name: "연남 스테이", address: "서울 마포구 동교로", collection: "확인 중", vacant: "1호", overdue: "2건", ticket: "긴급 2" },
  { name: "성수 하우스", address: "서울 성동구 연무장길", collection: "확인 중", vacant: "0호", overdue: "1건", ticket: "진행 3" },
  { name: "도곡 레지던스", address: "서울 강남구 논현로", collection: "확인 중", vacant: "2호", overdue: "0건", ticket: "진행 1" },
  { name: "문래 로프트", address: "서울 영등포구 도림로", collection: "확인 중", vacant: "1호", overdue: "1건", ticket: "진행 0" },
];

export function BuildingsSection() {
  return (
    <section id="buildings" aria-labelledby="buildings-section-title" className="manager-embedded-section">
      <div className="manager-embedded-section-heading">
        <h2 id="buildings-section-title">전체 건물 관리</h2>
        <span className="manager-embedded-demo-badge">데모</span>
      </div>

      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-lg)", alignItems: "end" }}>
          <Input aria-label="건물 검색" placeholder="건물명, 지역, 담당자 검색" readOnly />
          <LinkButton href={MHOME_ROUTES["M-HOME-05"]}>건물 등록</LinkButton>
        </div>

        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          {["리스크순", "수납률순", "월세순", "공실순", "담당자", "유형", "지역", "상태"].map((label, index) => (
            <Badge key={label} emphasis={index === 0}>{label}</Badge>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-md)" }}>
          {buildings.map((building) => (
            <Link key={building.name} href={`${MHOME_ROUTES["M-HOME-04"]}?building=${encodeURIComponent(building.name)}`} style={linkReset}>
              <Card style={{ display: "grid", gap: "var(--space-md)", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)" }}>
                  <div>
                    <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>{building.name}</div>
                    <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{building.address}</div>
                  </div>
                  <Badge>리스크 산정 전</Badge>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-sm)" }}>
                  <Metric label="수납률" value={building.collection} />
                  <Metric label="공실" value={building.vacant} />
                  <Metric label="연체" value={building.overdue} />
                  <Metric label="민원" value={building.ticket} />
                </div>
                <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
                  리스크 점수는 수납률 확정 후 산정됩니다(임의 라벨 금지). 산정 후 라벨은 관리인 triage 전용.
                </div>
              </Card>
            </Link>
          ))}
        </div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "var(--space-sm)", borderRadius: "var(--radius)", background: "var(--surface-container-low)" }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ marginTop: "var(--space-xs)", fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={{ minHeight: "var(--touch-target)", padding: "0 var(--space-lg)", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-btn)", background: "var(--primary)", color: "var(--on-primary)", textDecoration: "none", fontWeight: 800 }}>{children}</Link>;
}

const linkReset = { color: "inherit", textDecoration: "none" } as const;
const captionStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", fontWeight: 700 } as const;
