import Link from "next/link";
import { Badge, Card, Input } from "@roomlog/ui";
import { getManagerQueueSummary, getManagerRepair, listManagerTickets } from "@/lib/ticket-manager-api";
import {
  LinkButton,
  Money,
  StatusBadges,
  muted,
  pageStack,
  repairStageLabel,
  row,
  sectionTitle,
  ticketDashHref,
  ticketStatusLabel,
  urgencyLabel,
} from "../../_components/ticket-manager-ui";

export default async function Page() {
  const [tickets, summary] = await Promise.all([listManagerTickets(), getManagerQueueSummary()]);
  const repairs = await Promise.all(tickets.map((ticket) => getManagerRepair(ticket.id)));

  return (
    <div style={pageStack}>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-title)" }}>티켓 처리 대시보드</div>
          <div style={muted}>긴급 상단 고정 · 보류 버킷 · 티켓/수리 상태 분리</div>
        </div>
        <LinkButton href="/manager/ticket/call/00" variant="secondary">
          모바일 통화로 처리
        </LinkButton>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "var(--space-md)" }}>
        {[
          ["오늘", summary.today],
          ["긴급", summary.urgent],
          ["확인대기", summary.awaitingReview],
          ["결제대기", summary.awaitingPayment],
          ["보류", summary.onHold],
        ].map(([label, count]) => (
          <Card key={label} style={{ minHeight: "88px" }}>
            <div style={muted}>{label}</div>
            <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-title)" }}>{count}</div>
          </Card>
        ))}
      </div>

      <Card style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "var(--space-md)", alignItems: "center" }}>
        <Input aria-label="티켓 검색" placeholder="호실, 증상, 티켓 ID 검색" />
        <Badge emphasis>보류 {summary.onHold}건</Badge>
        <Badge>긴급순 · 최신순</Badge>
      </Card>

      {/* 좁은 창에서는 행을 찌그러뜨리지 않고 가로 스크롤로 전환 */}
      <Card style={{ padding: 0, overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 120px 180px 120px 120px",
            minWidth: 920,
            gap: "var(--space-md)",
            padding: "var(--space-md) var(--space-lg)",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-container-low)",
            ...sectionTitle,
          }}
        >
          <span>민원</span>
          <span>상태</span>
          <span>책임 가능성</span>
          <span>수리</span>
          <span>경과</span>
          <span>액션</span>
        </div>
        {tickets.map((ticket, index) => {
          const repair = repairs[index];
          return (
            <Link
              key={ticket.id}
              href={ticketDashHref("01", ticket.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 120px 180px 120px 120px",
                minWidth: 920,
                gap: "var(--space-md)",
                padding: "var(--space-md) var(--space-lg)",
                borderBottom: "1px solid var(--border)",
                color: "inherit",
                textDecoration: "none",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>
                  {ticket.unitId}호 · {ticket.title}
                </div>
                <div style={muted}>{ticket.id} · 긴급도 {urgencyLabel[ticket.urgency]}</div>
              </div>
              <StatusBadges ticket={ticket} repair={repair} />
              <Badge>{ticket.urgency === 1 ? "임대인 높음" : "검토 필요"}</Badge>
              <div style={muted}>
                {repair.vendorName} · <Money amount={repair.quoteAmount} /> · {repairStageLabel[repair.stage]}
              </div>
              <span style={muted}>오늘</span>
              <Badge emphasis>{ticketStatusLabel[ticket.status]}</Badge>
            </Link>
          );
        })}
      </Card>
    </div>
  );
}
