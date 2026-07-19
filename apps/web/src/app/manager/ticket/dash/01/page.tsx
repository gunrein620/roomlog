import { Badge, Card } from "@roomlog/ui";
import { getManagerTicketDetail } from "@/lib/ticket-manager-api";
import {
  findManagerVendorJobByTicket,
  searchAssignableVendorCandidates,
} from "@/lib/vendor-mgmt-api";
import {
  ResponsibilityCard,
  StatusBadges,
  TicketHeader,
  muted,
  pageStack,
  row,
  sectionTitle,
} from "../../_components/ticket-manager-ui";
import { AttachmentThumbnailGallery } from "./AttachmentThumbnailGallery";
import { TicketDetailBackButton } from "./TicketDetailBackButton";
import { RegisteredVendorAssignment } from "./RegisteredVendorAssignment";
import { decideResponsibilityAction } from "./actions";

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
  const assignmentData = await Promise.all([
    searchAssignableVendorCandidates(ticket.id),
    findManagerVendorJobByTicket(ticket.id),
  ]).catch(() => null);
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

      {assignmentData ? (
        <RegisteredVendorAssignment
          ticket={ticket}
          candidates={assignmentData[0].data}
          current={assignmentData[1].data}
        />
      ) : (
        <Card role="alert" style={{ display: "grid", gap: "var(--space-sm)" }}>
          <strong>업체 정보를 불러오지 못했습니다</strong>
          <div style={muted}>잠시 후 페이지를 새로고침해 주세요.</div>
        </Card>
      )}
    </div>
  );
}
