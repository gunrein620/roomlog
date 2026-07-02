import { Button, Card, Input } from "@roomlog/ui";
import { VENDOR_DEMO_TICKET_ID, getVendorRepair, getVendorTicket } from "@/lib/vendor-api";
import { ROUTES } from "@/lib/vendor-nav";
import { Body, Footer, InfoRow, PhotoPreview, ScreenHeader, labelStyle, mutedStyle } from "../_components";

export default async function Page() {
  const [ticket, repair] = await Promise.all([
    getVendorTicket(VENDOR_DEMO_TICKET_ID),
    getVendorRepair(VENDOR_DEMO_TICKET_ID),
  ]);
  const baseAmount = repair.onsiteQuoteAmount ?? repair.quoteAmount ?? 0;

  return (
    <>
      <ScreenHeader title="완료 보고" ticketId={ticket.id} backTo={ROUTES["V-JOB-05"]} />
      <Body>
        <section>
          <div style={labelStyle}>완료 사진</div>
          <PhotoPreview />
          <p style={mutedStyle}>첨부 사진은 메타데이터 제거 후 제출됩니다.</p>
        </section>
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>보고 내용</div>
          <Input placeholder="수리 내역·사용 자재" defaultValue={repair.completionNote} />
          <Input placeholder="최종 금액" defaultValue={repair.finalAmount?.toString()} />
          <InfoRow label="승인 기준 금액" value={`${baseAmount.toLocaleString()}원`} />
          <p style={{ ...mutedStyle, margin: 0 }}>결제 실행은 관리자/임차인 승인 소관이며, 업체는 완료 보고만 제출합니다.</p>
        </Card>
        <details style={{ border: "1px dashed var(--outline-variant)", borderRadius: "var(--radius-md)", padding: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>반려 수신 시</summary>
          <p style={mutedStyle}>관리자 미흡 사유를 확인하고 V-JOB-05 재작업 후 이 화면에서 재보고합니다.</p>
        </details>
      </Body>
      <Footer>
        <Button fullWidth>완료 보고 제출</Button>
        <p style={{ ...mutedStyle, margin: 0, textAlign: "center" }}>제출 후 정산 안내와 함께 링크가 종료됩니다.</p>
      </Footer>
    </>
  );
}
