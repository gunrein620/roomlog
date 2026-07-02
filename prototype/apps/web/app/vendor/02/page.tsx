import { Button, Card, Input } from "@roomlog/ui";
import { VENDOR_DEMO_TICKET_ID, getVendorTicket } from "@/lib/vendor-api";
import { ROUTES } from "@/lib/vendor-nav";
import { Body, ContactThread, Footer, LinkButton, ScreenHeader, labelStyle, mutedStyle } from "../_components";

export default async function Page() {
  const ticket = await getVendorTicket(VENDOR_DEMO_TICKET_ID);

  return (
    <>
      <ScreenHeader title="견적 회신" ticketId={ticket.id} backTo={ROUTES["V-JOB-01"]} />
      <Body>
        <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={labelStyle}>회신 유형 3택</div>
          {[
            ["numeric", "숫자 견적", "금액·항목·방문 가능 일시를 제출합니다."],
            ["visit", "방문 견적", "현장 확인 후 확정가를 산정합니다. 선정 시 현장 승인 게이트가 적용됩니다."],
            ["decline", "견적 불가", "불가 사유를 남기고 정상 종료합니다."],
          ].map(([value, title, desc]) => (
            <label
              key={value}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: 12,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <input type="radio" name="quoteType" defaultChecked={value === "numeric"} />
              <span>
                <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{title}</span>
                <span style={mutedStyle}>{desc}</span>
              </span>
            </label>
          ))}
        </Card>

        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>견적 내용</div>
          <Input placeholder="금액 또는 개략가 범위" />
          <Input placeholder="항목·방문 가능 일시" />
          <Input placeholder="비고 또는 견적 불가 사유" />
          <p style={{ ...mutedStyle, margin: 0 }}>
            타 업체 견적·경쟁 현황은 공개되지 않습니다. 결제·정산은 승인 후 별도 단계입니다.
          </p>
        </Card>

        <ContactThread />
      </Body>
      <Footer>
        <LinkButton href={ROUTES["V-JOB-03"]}>견적 제출</LinkButton>
        <Button fullWidth variant="ghost">임시 저장</Button>
      </Footer>
    </>
  );
}
