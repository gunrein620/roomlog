import { Button, Card } from "@roomlog/ui";
import { VENDOR_DEMO_TICKET_ID, getVendorRepair, getVendorTicket } from "@/lib/vendor-api";
import { ROUTES } from "@/lib/vendor-nav";
import { Body, Footer, InfoRow, LinkButton, QuoteSummary, ScreenHeader, labelStyle, mutedStyle } from "../_components";

export default async function Page() {
  const [ticket, repair] = await Promise.all([
    getVendorTicket(VENDOR_DEMO_TICKET_ID),
    getVendorRepair(VENDOR_DEMO_TICKET_ID),
  ]);

  return (
    <>
      <ScreenHeader title="귀사가 선정되었습니다" ticketId={ticket.id} backTo={ROUTES["V-JOB-00"]} />
      <Body>
        <QuoteSummary repair={repair} />
        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>선정 후 단계적 공개</div>
          <InfoRow label="방문 주소" value="성수동 ○○로 12, 302호" />
          <InfoRow label="연락 채널" value="룸로그 중계 통화" />
          <p style={{ ...mutedStyle, margin: 0 }}>
            주소·연락 채널은 선정 후 최초 노출 정보입니다. 계약서·개인정보는 계속 비전달됩니다.
          </p>
        </Card>
        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>방문 준비</div>
          <InfoRow label="후보 1" value="7/3 오전 10:00" />
          <InfoRow label="후보 2" value="7/3 오후 2:00" />
          {repair.quoteType === "visit" && (
            <p style={{ ...mutedStyle, margin: 0 }}>
              방문 견적 건은 현장에서 확정가를 산정하고 착수 전 승인을 받아야 합니다.
            </p>
          )}
        </Card>
      </Body>
      <Footer>
        <LinkButton href={ROUTES["V-JOB-05"]}>방문 일정 확정</LinkButton>
        <Button fullWidth variant="ghost">정중히 사퇴</Button>
      </Footer>
    </>
  );
}
