import { Badge, Button, Card, Input } from "@roomlog/ui";
import { getVendorRepair, getVendorTicket } from "@/lib/vendor-api";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";
import { Body, Footer, InfoRow, LinkButton, ScreenHeader, Stepper, formatVisitTime, labelStyle, mutedStyle } from "../_components";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const [ticket, repair] = await Promise.all([
    getVendorTicket(id),
    getVendorRepair(id),
  ]);
  const needsGate = repair.quoteType === "visit" && repair.onsiteApproval !== "approved";

  return (
    <>
      <ScreenHeader title="수리 진행" ticketId={ticket.id} backTo={ROUTES["V-JOB-00"]} />
      <Body>
        <Stepper steps={["일정확정", "현장 확정가", "수리중", "완료"]} current={needsGate ? 1 : 2} />
        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>방문 정보</div>
          <InfoRow label="확정 일정" value={formatVisitTime(repair.scheduledAt)} />
          <InfoRow label="방문 주소" value="성수동 ○○로 12, 302호" />
        </Card>
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>현장 확정가 게이트</div>
          {needsGate ? (
            <>
              <Badge emphasis>착수 전 승인 대기</Badge>
              <Input placeholder="현장 확정가 금액" defaultValue={repair.onsiteQuoteAmount?.toString()} />
              <Input placeholder="확정 항목·사유" />
              <p style={{ ...mutedStyle, margin: 0 }}>
                방문 견적 건은 임차인/관리자 승인 전 착수할 수 없습니다. 빠른 승인 ETA 20분, 개략가 초과 시 승인 필수.
              </p>
            </>
          ) : (
            <>
              <Badge emphasis>착수 가능</Badge>
              <p style={{ ...mutedStyle, margin: 0 }}>승인된 확정가 기준으로 수리를 진행 중입니다.</p>
            </>
          )}
        </Card>
        <details style={{ border: "1px dashed var(--outline-variant)", borderRadius: "var(--radius-md)", padding: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>재방문·추가비용 요청</summary>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <Input placeholder="사유·금액" />
            <Button fullWidth variant="secondary">빠른 승인 요청</Button>
            <p style={mutedStyle}>승인 시 일정 재확정으로 이동하고, 거절 시 현 범위만 진행합니다.</p>
          </div>
        </details>
      </Body>
      <Footer>
        {needsGate ? (
          <Button fullWidth>현장 확정가 제출</Button>
        ) : (
          <LinkButton href={withId(ROUTES["V-JOB-06"], id)}>완료 보고하기</LinkButton>
        )}
        <LinkButton href={withId(ROUTES["V-JOB-04"], id)} variant="secondary">일정 재확정</LinkButton>
      </Footer>
    </>
  );
}
