import { Badge, Card } from "@roomlog/ui";
import { MANAGER_DEMO_TICKET_ID, getManagerRepair, getManagerTicket } from "@/lib/ticket-manager-api";
import {
  LinkButton,
  Money,
  PaymentGate,
  RepairProgress,
  TicketHeader,
  dashRoutes,
  muted,
  pageStack,
  row,
  sectionTitle,
  ticketDashHref,
} from "../../_components/ticket-manager-ui";

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const ticketId = id ?? MANAGER_DEMO_TICKET_ID;
  const [ticket, repair] = await Promise.all([
    getManagerTicket(ticketId),
    getManagerRepair(ticketId),
  ]);

  return (
    <div style={pageStack}>
      <TicketHeader ticket={ticket} title="결제/비용 승인" />
      <RepairProgress repair={repair} />
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "var(--space-lg)" }}>
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div style={sectionTitle}>견적 상세·비용 분류</div>
          {repair.quoteItems?.map((item) => (
            <div key={item.label} style={{ ...row, justifyContent: "space-between" }}>
              <span>{item.label}</span>
              <Badge><Money amount={item.amount} /></Badge>
            </div>
          ))}
          <div style={{ ...row, justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: "var(--space-md)" }}>
            <strong>합계</strong>
            <Badge emphasis><Money amount={repair.quoteAmount} /></Badge>
          </div>
          <div style={muted}>결제 주체: 관리인 비용 · 차감 방식: 정산 반영 · 영수증/증빙 첨부 대기</div>
        </Card>
        <PaymentGate repair={repair} />
      </div>
      <div style={row}>
        <LinkButton href={ticketDashHref("01", ticket.id)}>결제 승인 후 상세로</LinkButton>
        <LinkButton href={dashRoutes["00"]} variant="secondary">보류·반려 큐로</LinkButton>
        <LinkButton href={ticketDashHref("04", ticket.id)} variant="ghost">뒤로</LinkButton>
      </div>
    </div>
  );
}
