import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { getManagerHomeSummary } from "@/lib/manager-home-api";
import { ManagerHomeShell } from "../_components";

// D-table 1: 매핑 없는 큐는 만들지 않는다(거짓 표면 금지). 원천 실집계만 렌더.
export default async function Page() {
  const summary = await getManagerHomeSummary();
  const queues = summary.queues.map((queue) => ({
    label: queue.label,
    count: queue.count,
    href: queue.href,
    source: queue.type === "ticket" ? "M-DASH · 접수/검토/추가정보요청" : "M-BILL · 청구·입금 확인",
    due: "오늘",
    level: queue.type === "ticket" ? "긴급순" : "정밀 검토",
  }));

  return (
    <ManagerHomeShell title="미처리 업무 허브" context="관리 중인 집 · 오늘 할 일">
      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-lg)", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: "var(--space-sm) 0", fontSize: "var(--fs-title)" }}>오늘 처리할 업무</h1>
            <p style={{ margin: 0, color: "var(--on-surface-variant)" }}>
              여기서는 분류와 이동만 제공합니다. 실제 처리는 각 원천 세트에서 진행합니다.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Badge emphasis>긴급순</Badge>
            <Badge>기한순</Badge>
          </div>
        </header>

        <Card style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "var(--space-md)", alignItems: "center", fontWeight: 800, color: "var(--on-surface-variant)" }}>
          <span>큐 유형</span>
          <span>건수</span>
          <span>기한/긴급도</span>
          <span>바로가기</span>
        </Card>

        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {queues.length === 0 ? (
            <Card style={{ color: "var(--on-surface-variant)" }}>미처리 업무가 없어요.</Card>
          ) : null}
          {queues.map((queue) => (
            <Link key={`${queue.label}-${queue.href}`} href={queue.href} style={linkReset}>
              <Card style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "var(--space-md)", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
                    <Badge emphasis={queue.level === "정밀 검토"}>{queue.label}</Badge>
                    <span style={{ fontWeight: 800 }}>이슈 요지 먼저 확인</span>
                  </div>
                  <div style={{ marginTop: "var(--space-xs)", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
                    {queue.source} · 호실과 실명은 상세 화면에서 종속 표기
                  </div>
                </div>
                <strong>{queue.count}건</strong>
                <Badge>{queue.due} · {queue.level}</Badge>
                <span style={{ color: "var(--primary)", fontWeight: 800 }}>이동</span>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </ManagerHomeShell>
  );
}

const linkReset = { color: "inherit", textDecoration: "none" } as const;
