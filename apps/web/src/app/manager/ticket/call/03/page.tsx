import { Badge, Card } from "@roomlog/ui";
import {
  MANAGER_DEMO_TICKET_ID,
  getManagerRepair,
  getManagerTicket,
} from "@/lib/ticket-manager-api";
import {
  LinkButton,
  MobileScreen,
  Money,
  SingleUserStatus,
  callRoutes,
  dashRoutes,
  muted,
  row,
} from "../../_components/ticket-manager-ui";

export default async function Page() {
  const [ticket, repair] = await Promise.all([
    getManagerTicket(MANAGER_DEMO_TICKET_ID),
    getManagerRepair(),
  ]);

  return (
    <MobileScreen
      eyebrow={`M-CALL-03 · ${ticket.id}`}
      title={`업체 배정 · ${ticket.unitId}호`}
      footer={
        <>
          <LinkButton href={callRoutes["04"]} fullWidth>승인</LinkButton>
          <LinkButton href={dashRoutes["04"]} variant="secondary" fullWidth>다른 업체</LinkButton>
          <LinkButton href={callRoutes["00"]} variant="ghost" fullWidth>보류</LinkButton>
        </>
      }
    >
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={row}>
          <Badge emphasis>{repair.vendorName}</Badge>
          <Badge><Money amount={repair.quoteAmount} /></Badge>
        </div>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>오늘 방문 가능 · 냉난방 전문</div>
        <div style={muted}>승인하면 repair_status가 업체 배정/견적 승인 흐름으로 진행됩니다.</div>
      </Card>
      <SingleUserStatus ticket={ticket} repair={repair} />
      <LinkButton href={dashRoutes["04"]} variant="secondary" fullWidth>견적 비교는 웹에서</LinkButton>
    </MobileScreen>
  );
}
