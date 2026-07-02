import { Badge, Card } from "@roomlog/ui";
import { MANAGER_DEMO_TICKET_ID, getManagerTicket } from "@/lib/ticket-manager-api";
import {
  LinkButton,
  MobileScreen,
  callRoutes,
  muted,
  row,
} from "../../_components/ticket-manager-ui";

export default async function Page() {
  const ticket = await getManagerTicket(MANAGER_DEMO_TICKET_ID);

  return (
    <MobileScreen
      eyebrow={`M-CALL-02 · ${ticket.id}`}
      title="추가 사진 요청"
      footer={
        <>
          <LinkButton href={callRoutes["01"]} fullWidth>요청 보내기</LinkButton>
          <LinkButton href={callRoutes["01"]} variant="secondary" fullWidth>취소</LinkButton>
        </>
      }
    >
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={row}>
          <Badge emphasis>{ticket.unitId}호</Badge>
          <Badge>한 결정</Badge>
        </div>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>AI 제안 요청 항목</div>
        <div style={muted}>누수 부위 근접 사진 1장, 바닥 전체가 보이는 사진 1장을 요청합니다.</div>
      </Card>
      <Card style={{ borderStyle: "dashed" }}>
        <div style={muted}>발송 후 완료 피드백을 보여주고 다음 민원으로 이어집니다.</div>
      </Card>
    </MobileScreen>
  );
}
