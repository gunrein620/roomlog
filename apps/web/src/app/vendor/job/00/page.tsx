import { Badge, Card } from "@roomlog/ui";
import { VENDOR_DEMO_TICKET_ID, getVendorAnalysis, getVendorTicket, listVendorJobs } from "@/lib/vendor-api";
import { ROUTES, type VendorRoute } from "@/lib/vendor-nav";
import {
  Body,
  ContactThread,
  DEMO_EXPIRES_AT,
  Footer,
  LinkButton,
  REQUESTER,
  Stepper,
  TicketSummary,
  TrustBadges,
  labelStyle,
  mutedStyle,
} from "../_components";

export default async function Page() {
  const [jobs, ticket, analysis] = await Promise.all([
    listVendorJobs(),
    getVendorTicket(VENDOR_DEMO_TICKET_ID),
    getVendorAnalysis(VENDOR_DEMO_TICKET_ID),
  ]);
  const job = jobs[0];
  const cta: { label: string; href: VendorRoute } =
    job?.stage === "scheduled"
      ? { label: "일정·수리 진행", href: ROUTES["V-JOB-04"] }
      : job?.quoteType
        ? { label: "진행 상태 보기", href: ROUTES["V-JOB-03"] }
        : { label: "견적 회신하기", href: ROUTES["V-JOB-02"] };

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "16px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{REQUESTER}</div>
            <div style={mutedStyle}>룸로그를 통한 정식 수리 견적 요청</div>
          </div>
          <Badge emphasis>{ticket.id}</Badge>
        </div>
        <TrustBadges />
      </header>

      <Body>
        <section>
          <div style={labelStyle}>진행 단계</div>
          <Stepper steps={["요청", "회신", "선정", "수리", "완료"]} current={job?.quoteType ? 1 : 0} />
        </section>

        <TicketSummary ticket={ticket} analysis={analysis} />

        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>링크 상태</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>유효 기한 {DEMO_EXPIRES_AT}</div>
          <p style={{ ...mutedStyle, margin: 0 }}>
            토큰 링크는 일회성입니다. 기기 바인딩 위반, 관리자 철회, 재발급 시 무효 처리됩니다.
          </p>
        </Card>

        <LinkButton href={ROUTES["V-JOB-01"]} variant="secondary">
          하자 상세 보기
        </LinkButton>
        <ContactThread />
      </Body>

      <Footer>
        <LinkButton href={cta.href}>{cta.label}</LinkButton>
      </Footer>
    </>
  );
}
