import { Badge, Card } from "@roomlog/ui";
import { VENDOR_DEMO_TICKET_ID, getVendorAnalysis, getVendorTicket } from "@/lib/vendor-api";
import { ROUTES } from "@/lib/vendor-nav";
import {
  Body,
  ContactThread,
  Footer,
  LinkButton,
  PhotoPreview,
  ScreenHeader,
  TicketSummary,
  TrustBadges,
  labelStyle,
  mutedStyle,
} from "../_components";

export default async function Page() {
  const [ticket, analysis] = await Promise.all([
    getVendorTicket(VENDOR_DEMO_TICKET_ID),
    getVendorAnalysis(VENDOR_DEMO_TICKET_ID),
  ]);

  return (
    <>
      <ScreenHeader title="하자 상세" ticketId={ticket.id} backTo={ROUTES["V-JOB-00"]} />
      <Body>
        <section>
          <div style={labelStyle}>정제된 사진</div>
          <PhotoPreview />
          <div style={{ marginTop: 8 }}>
            <TrustBadges />
          </div>
        </section>

        <TicketSummary ticket={ticket} analysis={analysis} />

        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>전달 정보 범위</div>
          <Badge emphasis>관리자 검수 완료</Badge>
          <p style={{ ...mutedStyle, margin: 0 }}>
            정확 주소, 임차인 연락처, 계약서, 책임·비용 판단은 업체에게 전달되지 않습니다.
          </p>
        </Card>

        <ContactThread />
      </Body>
      <Footer>
        <LinkButton href={ROUTES["V-JOB-02"]}>견적 회신하기</LinkButton>
      </Footer>
    </>
  );
}
