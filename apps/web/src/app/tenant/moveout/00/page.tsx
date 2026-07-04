import Link from "next/link";
import type { Dispute, MoveoutChecklistItem, MoveoutSummary, SettlementEstimate } from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { getChecklist, getDisputes, getSettlement, listMoveouts } from "@/lib/moveout-api";
import { MOVEOUT_ROUTES } from "@/lib/moveout-nav";

export const dynamic = "force-dynamic";

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

const secondaryLinkStyle = {
  flex: 1,
  display: "flex",
  height: 42,
  alignItems: "center",
  justifyContent: "center",
  border: "1.5px solid var(--primary)",
  borderRadius: "var(--radius-btn)",
  color: "var(--primary)",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
} as const;

function moneyRange(min?: number, max?: number) {
  if (min == null || max == null) return "계약 정보 확인 중";
  return `약 ${Math.round(min / 10000).toLocaleString("ko-KR")}만~${Math.round(
    max / 10000,
  ).toLocaleString("ko-KR")}만원`;
}

function statusLabel(progress: number) {
  if (progress >= 0.8) return "마무리 단계";
  if (progress >= 0.5) return "준비 중";
  return "시작 전";
}

function selectActiveMoveout(moveouts: MoveoutSummary[]) {
  return [...moveouts].sort((a, b) => activeRank(a) - activeRank(b))[0];
}

function activeRank(moveout: MoveoutSummary) {
  if (moveout.contractConfirmed && typeof moveout.daysRemaining === "number") {
    return moveout.daysRemaining;
  }

  return Number.MAX_SAFE_INTEGER - Date.parse(moveout.updatedAt);
}

function checklistProgress(checklist: MoveoutChecklistItem[]) {
  if (checklist.length === 0) {
    return 0;
  }

  const readyItems = checklist.filter((item) => item.present && item.condition !== "damage_check").length;
  return readyItems / checklist.length;
}

function disputeProgress(disputes: Dispute[]) {
  if (disputes.length === 0) {
    return 1;
  }

  const closedCount = disputes.filter((dispute) => dispute.status === "resolved" || dispute.status === "confirmed").length;
  return closedCount / disputes.length;
}

function settlementProgress(moveout: MoveoutSummary, settlement: SettlementEstimate) {
  if (!moveout.contractConfirmed) {
    return 0;
  }

  if (settlement.status === "review_done") {
    return 1;
  }

  if (settlement.status === "reviewing" || settlement.status === "re_review") {
    return 0.7;
  }

  return settlement.deductions.some((deduction) => deduction.needsConfirmation) ? 0.35 : 0.5;
}

function completionProgress(
  moveout: MoveoutSummary,
  checklist: MoveoutChecklistItem[],
  disputes: Dispute[],
  settlement: SettlementEstimate,
) {
  const progress =
    checklistProgress(checklist) * 0.5 +
    settlementProgress(moveout, settlement) * 0.3 +
    disputeProgress(disputes) * 0.2;

  return Math.min(1, Math.max(0, progress));
}

function notificationItems(
  moveout: MoveoutSummary,
  settlement: SettlementEstimate,
  disputes: Dispute[],
) {
  const items: { label: string; href: string }[] = [];
  const needsConfirmation = settlement.deductions.filter((deduction) => deduction.needsConfirmation).length;
  const answeredDisputes = disputes.filter((dispute) => dispute.status === "answered").length;
  const breachedDisputes = disputes.filter((dispute) => dispute.slaBreached && dispute.status !== "resolved").length;

  if (!moveout.contractConfirmed) {
    items.push({ label: "계약 정보 확인 필요", href: MOVEOUT_ROUTES["T-OUT-03"] });
  }

  if (needsConfirmation > 0) {
    items.push({ label: `차감 후보 확인 ${needsConfirmation}건`, href: MOVEOUT_ROUTES["T-OUT-03"] });
  }

  if (answeredDisputes > 0) {
    items.push({ label: `관리자 응답 ${answeredDisputes}건`, href: MOVEOUT_ROUTES["T-OUT-04"] });
  }

  if (breachedDisputes > 0) {
    items.push({ label: `SLA 경과 ${breachedDisputes}건`, href: MOVEOUT_ROUTES["T-OUT-04"] });
  }

  return items;
}

export default async function Page() {
  const moveouts = await listMoveouts();
  const moveout = selectActiveMoveout(moveouts);

  if (!moveout) {
    return (
      <>
        <header
          style={{
            flex: "none",
            padding: "16px 14px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700 }}>퇴실 준비</div>
        </header>
        <div style={{ flex: 1, padding: "16px 14px" }}>
          <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>진행 중인 퇴실이 없습니다</div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              퇴실 요청이 생성되면 이곳에서 기록, 체크리스트, 예상 정산을 확인할 수 있습니다.
            </div>
          </Card>
        </div>
      </>
    );
  }

  const [checklist, settlement, disputes] = await Promise.all([
    getChecklist(moveout.id),
    getSettlement(moveout.id),
    getDisputes(moveout.id),
  ]);
  const progress = completionProgress(moveout, checklist, disputes, settlement);
  const notifications = notificationItems(moveout, settlement, disputes);

  return (
    <>
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "16px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{moveout.unitId}호 · 퇴실 준비</div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
            룸로그 T-OUT
          </div>
        </div>
        <Link
          href={notifications[0]?.href ?? MOVEOUT_ROUTES["T-OUT-03"]}
          aria-label="알림"
          style={{
            position: "relative",
            width: 38,
            height: 38,
            border: "1.5px solid var(--outline-variant)",
            borderRadius: 10,
            background: "var(--surface-container-lowest)",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
          }}
        >
          🔔
          {notifications.length > 0 && (
            <span
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                minWidth: 18,
                height: 18,
                border: "1.5px solid var(--primary)",
                borderRadius: "var(--radius-full)",
                background: "var(--surface-container-lowest)",
                color: "var(--on-surface)",
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 3px",
              }}
            >
              {notifications.length}
            </span>
          )}
        </Link>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <section>
          <div style={labelStyle}>계약 종료</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {moveout.contractConfirmed ? (
              <>
                <div style={{ fontSize: 28, fontWeight: 800 }}>D-{moveout.daysRemaining}</div>
                <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
                  종료일 {moveout.leaseEndDate?.slice(0, 10)}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 800 }}>계약 정보 확정 후 안내</div>
                <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
                  종료일과 보증금 정보가 확정되면 예상 정산을 볼 수 있어요.
                </div>
                <Badge style={{ alignSelf: "flex-start" }}>관리자 문의 필요</Badge>
              </>
            )}
          </Card>
        </section>

        <section>
          <div style={labelStyle}>예상 정산 요약</div>
          <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>
              {moveout.contractConfirmed
                ? moneyRange(moveout.estimatedRefundMin, moveout.estimatedRefundMax)
                : "계약 정보 확인 중"}
            </span>
            <Badge emphasis>미확정</Badge>
          </Card>
        </section>

        <section>
          <div style={labelStyle}>준비 진행</div>
          <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Badge emphasis>{statusLabel(progress)}</Badge>
            <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              {Math.round(progress * 100)}%
            </span>
          </Card>
        </section>

        <section>
          <div style={labelStyle}>확인할 일</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notifications.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>새로 확인할 항목이 없습니다.</div>
            ) : (
              notifications.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  style={{ color: "var(--primary)", fontSize: 13, fontWeight: 800, textDecoration: "none" }}
                >
                  {item.label}
                </Link>
              ))
            )}
          </Card>
        </section>

        <div
          style={{
            border: "1.5px solid var(--primary)",
            borderRadius: "var(--radius-md)",
            padding: 12,
            background: "var(--surface-container-high)",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {settlement.disclaimer}
        </div>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Link href={MOVEOUT_ROUTES["T-OUT-01"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>내 퇴실 기록 보기</Button>
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={MOVEOUT_ROUTES["T-OUT-03"]} style={secondaryLinkStyle}>
            예상 정산
          </Link>
          <Link href={MOVEOUT_ROUTES["T-OUT-02"]} style={secondaryLinkStyle}>
            체크리스트
          </Link>
          <Link href={MOVEOUT_ROUTES["T-OUT-04"]} style={secondaryLinkStyle}>
            이의·정정
          </Link>
        </div>
      </footer>
    </>
  );
}
