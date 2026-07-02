import Link from "next/link";
import { Card } from "@roomlog/ui";
import type { TicketStatus } from "@roomlog/types";
import { routeFor } from "@/lib/nav";
import { DEMO_TICKET_ID, getAnalysis, getTicket } from "@/lib/api";

// T-DEF-09 · 관리자 처리 현황 — 티켓 상태 전용(수리 타임라인은 08 소관, 여기서 섞지 않음).
// v3: 관리자 결정에 따라 05(동의 미완) 또는 06(동의완료·업체확보)으로 복귀하는 간선을 지원.

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

const STATUSES: { key: TicketStatus; label: string }[] = [
  { key: "received", label: "접수" },
  { key: "reviewing", label: "검토" },
  { key: "info_requested", label: "추가정보 요청" },
  { key: "processing", label: "처리 중" },
  { key: "resolved", label: "완료" },
  { key: "reopened", label: "재요청" },
  { key: "cancelled", label: "취소됨" },
];

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const [ticket, analysis] = await Promise.all([getTicket(id), getAnalysis(id)]);
  const currentIndex = STATUSES.findIndex((s) => s.key === ticket.status);

  // 진입 사유 라벨 — Ticket에 별도 reason 필드가 없어 책임 가능성으로 근사한다.
  // (업체 수배 중 라벨은 06의 "업체 없음" 인-스크린에서만 발생 — 이 화면 진입 시점엔 해당 신호가 없음)
  const entryReason =
    analysis.responsibility === "landlord_likely"
      ? "임대인 책임 처리 대기"
      : analysis.responsibility === "unclear"
        ? "판단 어려움 검토 중"
        : "이의 검토 중";

  const infoRequested = ticket.status === "info_requested";
  // 데모 기준: 처리 중 + 임차인책임 가능성 = 이의 기각/책임 확정 후 수리 재개 시나리오.
  // repairJobId 존재 여부로 "동의 미완(→05)" vs "동의완료·업체확보(→06)"를 근사한다.
  const decisionResumed = ticket.status === "processing" && analysis.responsibility === "tenant_likely";
  const resumeTarget = decisionResumed ? (ticket.repairJobId ? "T-DEF-06" : "T-DEF-05") : null;

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "var(--space-md) var(--page-margin)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-sm)",
        }}
      >
        <Link
          href={routeFor("T-DEF-11")}
          style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textDecoration: "none", marginTop: 2 }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: "var(--fs-header)", fontWeight: "var(--fw-header)" }}>관리자 처리 현황</div>
          <div
            style={{
              marginTop: 4,
              display: "inline-block",
              padding: "2px 8px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: "var(--fs-caption)",
              color: "var(--on-surface-variant)",
            }}
          >
            {entryReason}
          </div>
        </div>
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
            티켓 상태
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            {STATUSES.map((s, i) => {
              const done = i < currentIndex;
              const current = i === currentIndex;
              return (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
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
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", textAlign: "center" }}>
          관리자 확인 후 처리됩니다
        </div>

        {resumeTarget && (
          <Card style={{ border: "1.5px solid var(--primary)", background: "var(--chip-bg)" }}>
            <div style={{ fontSize: "var(--fs-caption)", fontWeight: 700, lineHeight: "var(--lh-caption)" }}>
              임차인 책임으로 확인됐어요. {resumeTarget === "T-DEF-06" ? "업체가 이미 확보돼 바로 " : "동의 후 "}
              수리를 진행할 수 있어요.
            </div>
          </Card>
        )}

        {infoRequested && (
          <Card style={{ borderStyle: "dashed", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
              관리자가 추가 정보를 요청했어요.
            </div>
            <Link
              href={routeFor("T-DEF-02")}
              style={{ ...secondaryLinkStyle, alignSelf: "flex-start", width: "auto", height: "auto", padding: "var(--space-sm) var(--space-md)" }}
            >
              추가 정보 제출
            </Link>
          </Card>
        )}
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
        {resumeTarget ? (
          <>
            <Link href={routeFor(resumeTarget)} style={primaryLinkStyle}>
              수리 진행하기
            </Link>
            <Link href={routeFor("T-DEF-11")} style={secondaryLinkStyle}>
              관리자와 채팅
            </Link>
          </>
        ) : (
          <Link href={routeFor("T-DEF-11")} style={primaryLinkStyle}>
            관리자와 채팅
          </Link>
        )}
      </div>
    </>
  );
}
