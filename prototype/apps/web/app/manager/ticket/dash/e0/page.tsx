import { Card } from "@roomlog/ui";
import { LinkButton, dashRoutes, muted, pageStack } from "../../_components/ticket-manager-ui";

export default function Page() {
  return (
    <div style={{ ...pageStack, maxWidth: "640px", margin: "0 auto" }}>
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", textAlign: "center" }}>
        <div style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-title)" }}>로드 오류</div>
        <div style={muted}>목록 또는 상세를 불러오지 못했습니다. 필터와 선택 티켓은 유지됩니다.</div>
        <LinkButton href={dashRoutes["00"]} fullWidth>다시 시도</LinkButton>
        <LinkButton href={dashRoutes["00"]} variant="secondary" fullWidth>대시보드로</LinkButton>
      </Card>
    </div>
  );
}
