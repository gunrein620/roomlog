import { Card, Input } from "@roomlog/ui";
import { MANAGER_DEMO_TICKET_ID, getManagerTicket } from "@/lib/ticket-manager-api";
import {
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
      <TicketHeader ticket={ticket} title="AI 답변 초안 검토·발송" />
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={row}>
          <Input aria-label="답변 유형" defaultValue="거절 통보 / 추가사진요청 / 일정조율" />
        </div>
        <div style={sectionTitle}>AI 초안 편집기</div>
        <div
          style={{
            minHeight: "260px",
            border: "1px solid var(--input-border)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-lg)",
            background: "var(--surface-container-lowest)",
            fontSize: "var(--fs-body)",
            lineHeight: "var(--lh-body)",
          }}
        >
          {ticket.unitId}호 접수 건은 현재 근거 확인 중입니다. 추가 사진 또는 방문 일정이 필요할 수 있으며,
          거절 통보가 필요한 경우 관리인이 초안을 직접 검토한 뒤 발송합니다.
        </div>
        <div style={muted}>발송은 임차인 알림만 생성하며 티켓 상태를 변경하지 않습니다.</div>
      </Card>
      <div style={row}>
        <LinkButton href={ticketDashHref("01", ticket.id)}>수정 후 발송</LinkButton>
        <LinkButton href={ticketDashHref("03", ticket.id)} variant="secondary">초안 다시 생성</LinkButton>
        <LinkButton href={ticketDashHref("01", ticket.id)} variant="ghost">뒤로</LinkButton>
      </div>
    </div>
  );
}
