import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { MANAGER_CROSS, MHOME_ROUTES } from "@/lib/manager-home-nav";
import { ManagerHomeShell } from "../_components";

const kpis = [
  ["총 보증금", "8.4억", "계약 원장 기준"],
  ["월 예상수익", "1,860만원", "청구 예정 합계"],
  ["실수납", "1,420만원", "확인 완료 입금만"],
  ["미납률", "확인 중", "M-BILL 단일 산식 연결 전"],
] as const;

const charts = [
  ["월별 수익 추이", "70%", "실수납"],
  ["공실률·입주율", "44%", "입주율"],
  ["민원처리율", "58%", "완료 티켓"],
  ["월별 수리비", "36%", "비용"],
] as const;

export default function Page() {
  return (
    <ManagerHomeShell title="임대 현황 리포트" context="관리 중인 집 · 리포트" demo>
      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-lg)" }}>
          <div>
            <h1 style={{ margin: "var(--space-sm) 0", fontSize: "var(--fs-title)" }}>지표와 차트</h1>
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Badge emphasis>6M</Badge>
            <Badge>1Y</Badge>
            <Badge>건물 전체</Badge>
            <Badge>PDF/CSV</Badge>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--space-md)" }}>
          {kpis.map(([label, value, note]) => (
            <Card key={label}>
              <div style={captionStyle}>{label}</div>
              <div style={{ marginTop: "var(--space-md)", fontSize: "var(--fs-title)", fontWeight: 800 }}>{value}</div>
              <div style={{ marginTop: "var(--space-xs)", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{note}</div>
            </Card>
          ))}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
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
        </section>

        <Card style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
          <Drill href={`${MANAGER_CROSS.billing}/overdue`}>미납 드릴다운</Drill>
          <Drill href={MANAGER_CROSS.ticketDash}>수리비 드릴다운</Drill>
          <Drill href={MHOME_ROUTES["M-HOME-00"]}>대시보드로</Drill>
        </Card>
      </div>
    </ManagerHomeShell>
  );
}

function Drill({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>{children}</Link>;
}

const captionStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", fontWeight: 700 } as const;
