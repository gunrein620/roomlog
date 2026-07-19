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
  callRoutes,
  muted,
  row,
} from "../../_components/ticket-manager-ui";

export default async function Page() {
  const [ticket, repair] = await Promise.all([
    getManagerTicket(MANAGER_DEMO_TICKET_ID),
    getManagerRepair(),
  ]);
  const canApprove = repair.stage === "completed" || repair.stage === "paid";

  return (
    <MobileScreen
      eyebrow={`M-CALL-04 · ${ticket.id}`}
      title={`결제 승인 · ${ticket.unitId}호`}
      footer={
        <>
          <LinkButton href={canApprove ? callRoutes["01"] : "/manager/vendor-mgmt/credit"} fullWidth>
            {canApprove ? "승인" : "크레딧 결제로"}
          </LinkButton>
          <LinkButton href={callRoutes["00"]} variant="secondary" fullWidth>보류</LinkButton>
        </>
      }
    >
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={row}>
          <Badge emphasis><Money amount={repair.quoteAmount} /></Badge>
          <Badge>{canApprove ? "승인 가능" : "수리완료 필요"}</Badge>
        </div>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>수리비/예치금 최종 승인</div>
        <div style={muted}>결제는 수리완료 후에만 승인합니다. 금액 임계 또는 증빙 부족 시 웹 확인이 필요합니다.</div>
      </Card>
      <Card style={{ border: "1.5px dashed var(--outline-variant)" }}>
        <div style={muted}>승인 완료 시 “{ticket.unitId}호 처리됐어요” 확인 후 다음 민원으로 이어집니다.</div>
      </Card>
      <LinkButton href="/manager/vendor-mgmt/credit" variant="secondary" fullWidth>업체 지급 요청에서 확인</LinkButton>
    </MobileScreen>
  );
}
