import { Badge, Card } from "@roomlog/ui";
import { MANAGER_DEMO_TICKET_ID, getManagerTicket } from "@/lib/ticket-manager-api";
import {
  EvidencePanel,
  LinkButton,
  TicketHeader,
  muted,
  pageStack,
  row,
  sectionTitle,
  ticketDashHref,
} from "../../_components/ticket-manager-ui";

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const ticket = await getManagerTicket(id ?? MANAGER_DEMO_TICKET_ID);

  return (
    <div style={pageStack}>
      <TicketHeader ticket={ticket} title="공유 기록·사진 비교" />
      <EvidencePanel />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div style={sectionTitle}>계약서 근거</div>
          <div style={muted}>설비 노후와 구조 하자는 임대인 확인 대상입니다. 입주 전 사진이 없는 경우에도 책임을 확정하지 않습니다.</div>
          <div style={row}>
            <Badge>근거 보기</Badge>
            <Badge>확정 아님</Badge>
          </div>
        </Card>
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={sectionTitle}>수리 이력</div>
          {["2026-03 필터 청소 안내", "2026-05 냉방 점검 기록 없음"].map((item) => (
            <div key={item} style={muted}>{item}</div>
          ))}
        </Card>
      </div>
      <div style={row}>
        <LinkButton href={ticketDashHref("01", ticket.id)}>이 근거로 책임 검토 반영</LinkButton>
        <LinkButton href={ticketDashHref("03", ticket.id)} variant="secondary">사진 재요청</LinkButton>
      </div>
    </div>
  );
}
