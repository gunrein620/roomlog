import { Badge, Card } from "@roomlog/ui";
import { getManagerTicketDetail } from "@/lib/ticket-manager-api";
import { resolveTicketDirectFlow } from "@/lib/ticket-direct-flow-state";
import {
  LinkButton,
  DirectHandlingActions,
  ResponsibilityCard,
  StatusBadges,
  TicketHeader,
  Timeline,
  muted,
  pageStack,
  row,
  sectionTitle,
  ticketDashHref,
} from "../../_components/ticket-manager-ui";
import { AttachmentThumbnailGallery } from "./AttachmentThumbnailGallery";
import { TicketDetailBackButton } from "./TicketDetailBackButton";
import { ManagerTicketChat } from "./ManagerTicketChat";
import {
  cancelDirectHandlingAction,
  completeDirectHandlingAction,
  decideResponsibilityAction,
  sendTicketChatAction,
  startDirectHandlingAction,
} from "./actions";

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const detail = await getManagerTicketDetail(id);

  if (!detail) {
    return (
      <Card role="status" style={{ display: "grid", gap: "var(--space-sm)" }}>
        <div style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          <TicketDetailBackButton />
          <span>하자/민원 처리</span>
        </div>
        <div style={muted}>조회할 티켓이 없습니다.</div>
      </Card>
    );
  }

  const { ticket, analysis, repair } = detail;
  const flow = resolveTicketDirectFlow({
    ticketStatus: ticket.status,
    directHandling: ticket.directHandling,
    hasRepairPath: Boolean(repair),
    repairStage: repair?.stage,
  });
  return (
    <div style={pageStack}>
      <TicketHeader
        ticket={ticket}
        showBuildingName
        title={(
          <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-sm)" }}>
            <TicketDetailBackButton />
            <span>하자/민원 처리</span>
          </span>
        )}
      />
      <StatusBadges ticket={ticket} repair={repair} />

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-lg)", alignItems: "start" }}>
        <div style={pageStack}>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitle}>AI 요약</div>
            {analysis ? (
              <>
                <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: "var(--fw-subtitle)" }}>{ticket.title}</div>
                <div style={muted}>{ticket.description}</div>
                <div style={row}>
                  {analysis.problemCandidates.map((candidate) => (
                    <Badge key={candidate}>{candidate}</Badge>
                  ))}
                  {analysis.safetyRisk ? <Badge emphasis>위험 키워드 상향</Badge> : null}
                </div>
              </>
            ) : (
              <div style={muted}>조회할 AI 분석 내용이 없습니다.</div>
            )}
          </Card>

          <ResponsibilityCard
            analysis={analysis}
            ticketId={ticket.id}
            aiFeedback={detail.aiFeedback}
            responsibilityDecision={detail.responsibilityDecision}
            decisionAction={decideResponsibilityAction}
          />

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <div style={sectionTitle}>임차인 입력·첨부</div>
            <div style={muted}>{[ticket.location, ticket.description].filter(Boolean).join(" · ")}</div>
            <AttachmentThumbnailGallery
              attachmentUrls={detail.attachmentUrls}
              emptyMessage="조회할 첨부 내용이 없습니다."
            />
          </Card>

          <ManagerTicketChat
            ticketId={ticket.id}
            messages={detail.messages}
            action={sendTicketChatAction}
          />

          {detail.vendorDecline ? (
            <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
              <div style={{ fontWeight: 700 }}>업체가 배정을 거절했습니다</div>
              <div style={muted}>{detail.vendorDecline.reason}</div>
              <div style={{ ...row, justifyContent: "flex-end" }}>
                <LinkButton
                  href={ticketDashHref("04", ticket.id)}
                  variant="secondary"
                >
                  다른 업체 배정
                </LinkButton>
              </div>
            </Card>
          ) : null}

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitle}>다음 행동</div>
            <DirectHandlingActions
              ticket={ticket}
              repair={repair}
              startAction={startDirectHandlingAction}
              completeAction={completeDirectHandlingAction}
              cancelAction={cancelDirectHandlingAction}
            />
            <div style={{ ...row, justifyContent: "flex-end" }}>
              {flow.showVendorAssignment ? (
                <LinkButton href={ticketDashHref("04", ticket.id)} variant="secondary">업체 배정/견적</LinkButton>
              ) : null}
              <LinkButton href={ticketDashHref("03", ticket.id)} variant="secondary">답변 초안 생성</LinkButton>
            </div>
          </Card>
        </div>

        <Timeline ticket={ticket} analysis={analysis} repair={repair} />
      </div>
    </div>
  );
}
