import { Card } from "@roomlog/ui";
import {
  LinkButton,
  MobileScreen,
  callRoutes,
  dashRoutes,
  muted,
} from "../../_components/ticket-manager-ui";

export default function Page() {
  return (
    <MobileScreen
      eyebrow="M-CALL-E0"
      title="통화 오류"
      footer={
        <>
          <LinkButton href={callRoutes["01"]} fullWidth>다시 연결</LinkButton>
          <LinkButton href={dashRoutes["01"]} variant="secondary" fullWidth>웹에서 처리</LinkButton>
          <LinkButton href={callRoutes["00"]} variant="ghost" fullWidth>뒤로</LinkButton>
        </>
      }
    >
      <Card style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-title)" }}>연결이 끊겼습니다</div>
        <div style={muted}>직전 티켓과 결정 단계는 보존됩니다. pending/committed 결정을 잃지 않고 복구합니다.</div>
      </Card>
    </MobileScreen>
  );
}
