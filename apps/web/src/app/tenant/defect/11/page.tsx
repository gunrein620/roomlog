import Link from "next/link";
import { Badge, Button, Card } from "@roomlog/ui";
import { routeFor, withId } from "@/lib/nav";
import { getTenantDefectDetail } from "@/lib/defect-api";
import {
  openManagerConversationAction,
  submitResponsibilityFeedbackAction,
} from "./actions";

// T-DEF-11 · 내 신고 현황(hub) — 접수·검토(티켓)와 수리 진행(수리) 섹션을 라벨로 분리해 한 화면에.
// 진입은 단일(11), 표시만 분리 — #3 데이터 분리 원칙 유지.

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

const sectionLabelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
} as const;

const TICKET_STATUS_LABEL: Record<string, string> = {
  received: "접수",
  reviewing: "검토",
  info_requested: "추가정보 요청",
  processing: "처리 중",
  resolved: "완료",
  reopened: "재요청",
};

const REPAIR_STAGE_LABEL: Record<string, string> = {
  vendor_assigned: "업체 배정",
  quoted: "견적",
  scheduled: "일정 확정",
  in_progress: "수리 중",
  completed: "완료",
  paid: "결제",
};

function formatVisit(iso?: string) {
  if (!iso) return "일정 미정";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} 방문`;
}

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ id?: string; appealed?: string }>;
}) {
  const { id, appealed } = await searchParams;
  const detail = await getTenantDefectDetail(id);
  const { ticket, repair, responsibilityDecision } = detail;
  // 임차인책임 경로 여부 — repairJobId 존재 = 수리 트랙이 열려 있음(#3 데이터 분리 기준).
  const isTenantPath = Boolean(ticket.repairJobId);
  const appealSubmitted =
    appealed === "1" ||
    detail.aiFeedback.some(
      (feedback) => feedback.target === "RESPONSIBILITY" && feedback.status === "OPEN",
    );
  const decisionLabel = responsibilityDecision?.responsibility === "TENANT" ? "임차인" : "임대인";

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "var(--space-md) var(--page-margin)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-sm)",
        }}
      >
        <Link
          href={routeFor("T-DEF-00")}
          style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: "var(--fs-header)", fontWeight: "var(--fw-header)" }}>내 신고 상세</div>
        <Badge emphasis>{TICKET_STATUS_LABEL[ticket.status]}</Badge>
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
        <Card style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <div style={{ width: 48, height: 48, flex: "none", borderRadius: "var(--radius-md)", background: "var(--surface-container-high)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
            <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>{ticket.title}</div>
            <Badge>긴급도 {ticket.urgency}</Badge>
          </div>
        </Card>

        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={sectionLabelStyle}>접수·검토</div>
            {!isTenantPath && <Badge emphasis>현재</Badge>}
          </div>
          <div style={{ fontSize: "var(--fs-body)", color: "var(--on-surface-variant)" }}>
            {TICKET_STATUS_LABEL[ticket.status]} · 관리자 검토 진행
          </div>
          {responsibilityDecision ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-xs)",
                padding: "var(--space-sm)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
              }}
            >
              <strong>관리자 확정: {decisionLabel} 책임</strong>
              <span style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                {responsibilityDecision.note}
              </span>
            </div>
          ) : null}
          {!isTenantPath && (
            <Link
              href={withId(routeFor("T-DEF-09"), id)}
              style={{ ...secondaryLinkStyle, alignSelf: "flex-start", width: "auto", height: "auto", padding: "var(--space-sm) var(--space-md)" }}
            >
              처리 현황 자세히 ›
            </Link>
          )}
        </Card>

        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={sectionLabelStyle}>수리 진행</div>
            {isTenantPath && <Badge emphasis>현재</Badge>}
          </div>
          {isTenantPath ? (
            <>
              <div style={{ fontSize: "var(--fs-body)", color: "var(--on-surface-variant)" }}>
                {repair ? REPAIR_STAGE_LABEL[repair.stage] : "수리 대기"} · {repair?.vendorName ?? "업체 미정"} · {formatVisit(repair?.scheduledAt)}
              </div>
              <Link
                href={withId(routeFor("T-DEF-08"), id)}
                style={{ ...secondaryLinkStyle, alignSelf: "flex-start", width: "auto", height: "auto", padding: "var(--space-sm) var(--space-md)" }}
              >
                수리 진행 자세히 ›
              </Link>
            </>
          ) : (
            <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
              이 건은 관리자가 처리 중이라 별도 수리 단계가 없어요
            </div>
          )}
        </Card>

        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={sectionLabelStyle}>책임 판단 이의제기</div>
          <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
            AI 가능성 또는 관리자 확정에 이견이 있으면 근거를 남겨 다시 검토받을 수 있어요.
          </div>
          <form action={submitResponsibilityFeedbackAction} style={{ display: "grid", gap: "var(--space-sm)" }}>
            <input type="hidden" name="complaintId" value={detail.complaintId} />
            <textarea
              name="reason"
              required
              aria-label="책임 판단 이의제기 사유"
              placeholder="이의제기 사유를 입력해 주세요"
              style={{
                minHeight: "calc(var(--touch-target) * 2)",
                resize: "vertical",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--surface-container-lowest)",
                color: "var(--on-surface)",
                padding: "var(--space-sm)",
                font: "inherit",
              }}
            />
            <Button type="submit" variant="secondary">관리자 재검토 요청</Button>
          </form>
          {appealSubmitted ? (
            <form action={openManagerConversationAction}>
              <input type="hidden" name="roomId" value={detail.roomId ?? ""} />
              <Button type="submit" fullWidth>관리자와 대화하기</Button>
            </form>
          ) : null}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={sectionLabelStyle}>대화</div>
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "80%",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md) var(--radius-md) var(--radius-md) 2px",
              padding: "var(--space-sm) var(--space-md)",
              fontSize: "var(--fs-caption)",
              color: "var(--on-surface-variant)",
            }}
          >
            접수했습니다. 검토 후 안내드릴게요.
          </div>

          {ticket.status === "info_requested" && (
            <Card style={{ borderStyle: "dashed", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
              <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                추가 정보 요청 항목이 있어요.
              </div>
              <Link
                href={withId(routeFor("T-DEF-02"), id)}
                style={{ ...secondaryLinkStyle, alignSelf: "flex-start", width: "auto", height: "auto", padding: "var(--space-sm) var(--space-md)" }}
              >
                추가 정보 제출
              </Link>
            </Card>
          )}
        </div>
      </div>

    </>
  );
}
