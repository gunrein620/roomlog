import {
  MANAGER_DEMO_TICKET_ID,
  draftManagerTicketReply,
  getManagerTicket,
} from "@/lib/ticket-manager-api";
import {
  TicketHeader,
  pageStack,
} from "../../_components/ticket-manager-ui";
import { ManagerTicketReplyForm } from "./ManagerTicketReplyForm";

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const ticket = await getManagerTicket(id ?? MANAGER_DEMO_TICKET_ID);
  const draft = await draftManagerTicketReply(ticket.id);

  return (
    <div style={pageStack}>
      <TicketHeader ticket={ticket} title="AI 답변 초안 검토·발송" />
      <ManagerTicketReplyForm ticketId={ticket.id} initialDraft={draft} />
    </div>
  );
}
