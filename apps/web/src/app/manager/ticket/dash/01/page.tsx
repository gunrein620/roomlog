import { Badge, Button, Card } from "@roomlog/ui";
import { getManagerTicketDetail } from "@/lib/ticket-manager-api";
import {
  LinkButton,
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

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const detail = await getManagerTicketDetail(id);

  if (!detail) {
    return (
      <Card role="status" style={{ display: "grid", gap: "var(--space-sm)" }}>
        <div style={sectionTitle}>티켓 상세 & 검토</div>
        <div style={muted}>조회할 티켓이 없습니다.</div>
      </Card>
    );
  }

  const { ticket, analysis, repair } = detail;
  const completionGuard = repair?.stage === "completed" || repair?.stage === "paid";

  return (
    <div style={pageStack}>
      <TicketHeader ticket={ticket} title="티켓 상세 & 검토" />
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

          <ResponsibilityCard analysis={analysis} />

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <div style={sectionTitle}>임차인 입력·첨부</div>
            <div style={muted}>{[ticket.location, ticket.description].filter(Boolean).join(" · ")}</div>
            <AttachmentThumbnailGallery
              attachmentUrls={detail.attachmentUrls}
              emptyMessage="조회할 첨부 내용이 없습니다."
            />
          </Card>

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitle}>다음 행동</div>
            <Button disabled={!completionGuard} style={!completionGuard ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>
              {completionGuard ? "완료 처리" : "완료 처리 · 수리완료/결제 가드"}
            </Button>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <LinkButton href={ticketDashHref("03", ticket.id)} variant="secondary">AI 답변/거절 통보</LinkButton>
              <LinkButton href={ticketDashHref("04", ticket.id)} variant="secondary">업체 배정/견적</LinkButton>
            </div>
          </Card>
        </div>

        <Timeline ticket={ticket} analysis={analysis} repair={repair} />
      </div>
    </div>
  );
}
