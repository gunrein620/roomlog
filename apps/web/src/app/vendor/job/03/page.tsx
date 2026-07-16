import { Button, Card } from "@roomlog/ui";
import { getVendorRepair, getVendorTicket } from "@/lib/vendor-api";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";
import { Body, Footer, LinkButton, QuoteSummary, ScreenHeader, Stepper, labelStyle, mutedStyle } from "../_components";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const [ticket, repair] = await Promise.all([
    getVendorTicket(id),
    getVendorRepair(id),
  ]);

  return (
    <>
      <ScreenHeader title="회신 완료" ticketId={ticket.id} backTo={ROUTES["V-JOB-00"]} />
      <Body>
        <Stepper steps={["요청", "회신", "선정", "수리", "완료"]} current={1} />
        <QuoteSummary repair={repair} />
        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>현재 상태</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>승인 대기 — 관리자 검토 중</div>
          <p style={{ ...mutedStyle, margin: 0 }}>
            선정 전 진행은 불가합니다. 마감 전에는 견적 수정 또는 철회가 가능합니다. 예상 응답 ETA 2시간.
          </p>
        </Card>
        <details style={{ border: "1px dashed var(--outline-variant)", borderRadius: "var(--radius-md)", padding: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>시스템 분기 보기</summary>
          <p style={mutedStyle}>다른 업체 선정, 재견적 요청, 마감 잠금, 견적 불가 정상 종료가 이 화면 안에서 안내됩니다.</p>
        </details>
      </Body>
      <Footer>
        <Button fullWidth variant="secondary">진행 상태 새로고침</Button>
        <LinkButton href={withId(ROUTES["V-JOB-02"], id)} variant="secondary">견적 수정</LinkButton>
        <LinkButton href={withId(ROUTES["V-JOB-04"], id)}>일정 확정하러 가기</LinkButton>
      </Footer>
    </>
  );
}
