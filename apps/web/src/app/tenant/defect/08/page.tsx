import Link from "next/link";
import { Button, Card } from "@roomlog/ui";
import type { RepairStage } from "@roomlog/types";
import { routeFor } from "@/lib/nav";
import { DEMO_TICKET_ID, getRepair } from "@/lib/defect-api";

// T-DEF-08 · 수리 진행 — 수리 상태 전용(티켓 상태는 09/11 소관, 여기서 섞지 않음).

const primaryLinkStyle = {
  height: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  width: "100%",
  boxSizing: "border-box",
} as const;

const secondaryLinkStyle = {
  height: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  background: "transparent",
  color: "var(--primary)",
  border: "1.5px solid var(--primary)",
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  width: "100%",
  boxSizing: "border-box",
} as const;

const STAGES: { key: RepairStage; label: string }[] = [
  { key: "vendor_assigned", label: "업체 배정" },
  { key: "quoted", label: "견적" },
  { key: "scheduled", label: "일정 확정" },
  { key: "in_progress", label: "수리 중" },
  { key: "completed", label: "완료" },
  { key: "paid", label: "결제" },
];

function formatVisitTime(iso?: string) {
  if (!iso) return "일정 미정";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours() < 12 ? "오전" : "오후"}`;
}

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const repair = await getRepair(id);
  const currentIndex = STAGES.findIndex((s) => s.key === repair.stage);
  const completedIndex = STAGES.findIndex((s) => s.key === "completed");
  const reachedPayment = currentIndex >= completedIndex;

  return (
    <>
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-md) var(--page-margin)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link
          href={routeFor("T-DEF-11")}
          style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: "var(--fs-header)", fontWeight: "var(--fw-header)" }}>수리 진행</div>
        <div style={{ width: 34 }} />
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--page-margin)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-lg)",
        }}
      >
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div
            style={{
              fontSize: "var(--fs-caption)",
              color: "var(--on-surface-variant)",
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            수리 단계
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            {STAGES.map((stage, i) => {
              const done = i < currentIndex;
              const current = i === currentIndex;
              return (
                <div key={stage.key} style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      flex: "none",
                      borderRadius: "var(--radius-full)",
                      background: done ? "var(--primary)" : "transparent",
                      border: current ? "2px solid var(--primary)" : done ? "none" : "1.5px solid var(--outline-variant)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: current ? "var(--fs-body)" : "var(--fs-caption)",
                      fontWeight: current ? 700 : 400,
                      color: done || current ? "var(--on-surface)" : "var(--on-surface-variant)",
                    }}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
            방문 일정 · {repair.vendorName ?? "업체 미정"}
          </span>
          <span style={{ fontSize: "var(--fs-caption)", fontWeight: 700 }}>{formatVisitTime(repair.scheduledAt)}</span>
        </Card>
      </div>

      <div
        style={{
          flex: "none",
          padding: "var(--space-md) var(--page-margin)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-sm)",
        }}
      >
        {reachedPayment ? (
          <Link href={routeFor("T-DEF-07")} style={primaryLinkStyle}>
            결제 단계로
          </Link>
        ) : (
          <Button fullWidth disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
            결제 단계로
          </Button>
        )}
        <Link href={routeFor("T-DEF-11")} style={secondaryLinkStyle}>
          업체와 채팅
        </Link>
      </div>
    </>
  );
}
