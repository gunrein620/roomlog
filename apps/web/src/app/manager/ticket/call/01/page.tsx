import { Badge, Card } from "@roomlog/ui";
import {
  MANAGER_DEMO_TICKET_ID,
  getManagerAnalysis,
  getManagerRepair,
  getManagerTicket,
} from "@/lib/ticket-manager-api";
import {
  LinkButton,
  MobileScreen,
  SingleUserStatus,
  callRoutes,
  dashRoutes,
  muted,
  responsibilityLabel,
  row,
  urgencyLabel,
} from "../../_components/ticket-manager-ui";

export default async function Page() {
  const [ticket, analysis, repair] = await Promise.all([
    getManagerTicket(MANAGER_DEMO_TICKET_ID),
    getManagerAnalysis(MANAGER_DEMO_TICKET_ID),
    getManagerRepair(),
  ]);

  return (
    <MobileScreen
      eyebrow={`M-CALL-01 · ${ticket.id}`}
      title={`${ticket.unitId}호 민원 브리핑`}
      footer={
        <>
          <LinkButton href={callRoutes["03"]} fullWidth>임대인 처리</LinkButton>
          <LinkButton href={dashRoutes["01"]} variant="secondary" fullWidth>세입자 안내 · 웹 확인 필요</LinkButton>
          <LinkButton href={callRoutes["00"]} variant="ghost" fullWidth>보류</LinkButton>
        </>
      }
    >
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={row}>
          <Badge emphasis>긴급도 {urgencyLabel[analysis.urgency]}</Badge>
          <Badge>{analysis.safetyRisk ? "근거 미확인" : "음성 요약"}</Badge>
        </div>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>{ticket.title}</div>
        <div style={muted}>{ticket.description}</div>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>
          {responsibilityLabel[analysis.responsibility]} {Math.round(analysis.confidence * 100)}%
        </div>
        <div style={muted}>확정 아님 · 관리자가 수정 가능</div>
      </Card>
      <SingleUserStatus ticket={ticket} repair={repair} />
      <Card style={{ border: "1.5px solid var(--primary)", display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>1단 판정</div>
        <div style={muted}>먼저 아래(하단) 3개 중 하나만 결정하세요. 후속 조치는 그다음입니다.</div>
      </Card>
      {/* 2단은 1단 결정 후 후속 — 동급 동시 노출 금지(v3 P1). 셸에선 접힘 처리, 기본 숨김. */}
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        <details>
          <summary style={{ fontSize: "var(--fs-body)", fontWeight: 700, cursor: "pointer" }}>
            2단 후속 제안 (1단 결정 후)
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
            <LinkButton href={callRoutes["02"]} variant="secondary" fullWidth>추가 사진 요청</LinkButton>
            <div style={muted}>추가 확인이 필요하면 사진을 요청하고 전화로 안내합니다.</div>
          </div>
        </details>
      </Card>
    </MobileScreen>
  );
}
