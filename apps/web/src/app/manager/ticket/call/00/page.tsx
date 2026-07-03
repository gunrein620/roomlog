import { Badge, Card } from "@roomlog/ui";
import { getManagerQueueSummary, listManagerTickets } from "@/lib/ticket-manager-api";
import {
  LinkButton,
  MobileScreen,
  callRoutes,
  dashRoutes,
  muted,
  row,
} from "../../_components/ticket-manager-ui";

export default async function Page() {
  const [summary, tickets] = await Promise.all([getManagerQueueSummary(), listManagerTickets()]);
  const first = tickets[0];

  return (
    <MobileScreen
      eyebrow="M-CALL-00"
      title="비서 통화 홈"
      footer={
        <>
          <LinkButton href={callRoutes["01"]} fullWidth>비서와 통화 시작</LinkButton>
          <LinkButton href={dashRoutes["00"]} variant="secondary" fullWidth>데스크탑에서 보기</LinkButton>
        </>
      }
    >
      <Card style={{ textAlign: "center", padding: "var(--space-xxl)" }}>
        <div style={muted}>오늘 처리할 민원</div>
        <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-title)", marginTop: "var(--space-sm)" }}>
          {summary.today}건
        </div>
      </Card>
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={row}>
          <Badge emphasis>수신 알림</Badge>
          <Badge>긴급 {summary.urgent}</Badge>
        </div>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>
          {first.unitId}호 · {first.title}
        </div>
        <div style={muted}>통화 시작 시 이 민원부터 브리핑합니다.</div>
      </Card>
      <Card style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>보류 {summary.onHold}건</span>
        <Badge>선택 후 재진입</Badge>
      </Card>
      <Card style={{ borderStyle: "dashed" }}>
        <div style={muted}>빈 큐와 연결 중 상태는 이 화면 안에서 표시됩니다.</div>
      </Card>
    </MobileScreen>
  );
}
