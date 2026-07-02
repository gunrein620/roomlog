import { Badge, Button, Card } from "@roomlog/ui";
import { MANAGER_DEMO_TICKET_ID, getManagerRepair, getManagerTicket } from "@/lib/ticket-manager-api";
import {
  LinkButton,
  Money,
  RepairProgress,
  TicketHeader,
  dashRoutes,
  muted,
  pageStack,
  row,
  sectionTitle,
} from "../../_components/ticket-manager-ui";

export default async function Page() {
  const [ticket, repair] = await Promise.all([
    getManagerTicket(MANAGER_DEMO_TICKET_ID),
    getManagerRepair(MANAGER_DEMO_TICKET_ID),
  ]);

  return (
    <div style={pageStack}>
      <TicketHeader ticket={ticket} title="업체 배정 & 견적 + 수리 추적" />
      <RepairProgress repair={repair} />
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "var(--space-lg)" }}>
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div style={sectionTitle}>업체 후보·견적</div>
          {["한강냉난방", "강서홈케어", "24시 설비"].map((vendor, index) => (
            <div key={vendor} style={{ ...row, justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "var(--space-sm)" }}>
              <div>
                <div style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>{vendor}</div>
                <div style={muted}>{index === 0 ? "추천 · 오늘 출동 가능" : "견적 대기"}</div>
              </div>
              <Badge>{index === 0 ? <Money amount={repair.quoteAmount} /> : "요청"}</Badge>
            </div>
          ))}
          <Button>업체 선정·견적 승인</Button>
          <Button variant="secondary">여러 업체에 견적 요청</Button>
        </Card>

        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div style={sectionTitle}>payload 게이트·자동출동</div>
          <div style={muted}>전달: 증상, 위치, 사진, 희망 일정 · 제외: 상세주소, 연락처, 계약서</div>
          <Badge emphasis>관리자 승인 후 업체 전달</Badge>
          <div style={{ ...row, justifyContent: "space-between" }}>
            <span style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>자동 출동</span>
            <Button variant="secondary">변경 확인</Button>
          </div>
          <div style={muted}>토글 변경은 확인과 이력 기록을 거칩니다.</div>
        </Card>
      </div>
      <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
        <div style={sectionTitle}>수리 진행 추적</div>
        <div style={muted}>일정 확정 → 수리중 → 수리완료 확인 → 만족도 1탭 기록</div>
        <LinkButton href={dashRoutes["05"]} fullWidth>
          수리완료 확인 시 결제 승인으로
        </LinkButton>
      </Card>
    </div>
  );
}
