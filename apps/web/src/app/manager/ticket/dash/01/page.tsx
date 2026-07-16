import { Badge, Button, Card } from "@roomlog/ui";
import {
  MANAGER_DEMO_TICKET_ID,
  getManagerAnalysis,
  getManagerRepair,
  getManagerTicket,
} from "@/lib/ticket-manager-api";
import {
  EvidencePanel,
  LinkButton,
  ResponsibilityCard,
  StatusBadges,
  TicketHeader,
  Timeline,
  callRoutes,
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
  const [ticket, analysis, repair] = await Promise.all([
    getManagerTicket(ticketId),
    getManagerAnalysis(ticketId),
    getManagerRepair(ticketId),
  ]);
  const completionGuard = repair.stage === "completed" || repair.stage === "paid";

  return (
    <div style={pageStack}>
      <TicketHeader ticket={ticket} title="티켓 상세 & 검토" />
      <StatusBadges ticket={ticket} repair={repair} />

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-lg)", alignItems: "start" }}>
        <div style={pageStack}>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitle}>AI 요약</div>
            <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: "var(--fw-subtitle)" }}>{ticket.title}</div>
            <div style={muted}>{ticket.description}</div>
            <div style={row}>
              {analysis.problemCandidates.map((candidate) => (
                <Badge key={candidate}>{candidate}</Badge>
              ))}
              {analysis.safetyRisk ? <Badge emphasis>위험 키워드 상향</Badge> : null}
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
            <ResponsibilityCard analysis={analysis} />
            <EvidencePanel compact />
          </div>

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <div style={sectionTitle}>임차인 입력·첨부</div>
            <div style={muted}>{ticket.location} · {ticket.description}</div>
            <div style={row}>
              <Badge>사진 3장</Badge>
              <Badge>반복 민원 1건</Badge>
              <Button variant="secondary">연결 티켓 보기</Button>
            </div>
          </Card>

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitle}>다음 행동</div>
            <Button disabled={!completionGuard} style={!completionGuard ? { opacity: 0.45, cursor: "not-allowed" } : undefined}>
              {completionGuard ? "완료 처리" : "완료 처리 · 수리완료/결제 가드"}
            </Button>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <LinkButton href={ticketDashHref("03", ticket.id)} variant="secondary">AI 답변/거절 통보</LinkButton>
              <LinkButton href={ticketDashHref("04", ticket.id)} variant="secondary">업체 배정/견적</LinkButton>
              <LinkButton href={callRoutes["01"]} variant="ghost">음성으로 빠른 승인</LinkButton>
            </div>
          </Card>
        </div>

        <Timeline ticket={ticket} analysis={analysis} repair={repair} />
      </div>
    </div>
  );
}
