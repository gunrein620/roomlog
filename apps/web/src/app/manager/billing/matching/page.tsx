import { Button, Card } from "@roomlog/ui";
import { getManagerDeposits } from "@/lib/billing-manager-api";
import {
  BillTable,
  BillingShell,
  DepositTable,
  PageStack,
  Section,
  routes,
} from "../_components";

export default async function Page() {
  const data = await getManagerDeposits();

  return (
    <BillingShell title="입금 매칭·확인 필요" active={routes.matching}>
      <PageStack>
        <Section
          title="납부 신고 큐"
          action={<Button variant="secondary">임차인에게 확인 요청</Button>}
        >
          <BillTable bills={data.paymentReports} />
        </Section>

        <Section
          title="실제 입금 매칭"
          action={<Button>매칭 확정</Button>}
        >
          <DepositTable deposits={data.deposits} emptyText="매칭할 실제 입금이 없습니다." />
        </Section>

        <Section
          title="orphan 입금 큐"
          action={<Button variant="secondary">수동 연결</Button>}
        >
          <DepositTable deposits={data.orphanDeposits} emptyText="미해소 orphan 입금이 없습니다." />
        </Section>

        <Section
          title="불일치·확인 요청"
          action={<Button variant="secondary">보류(확인 필요 유지)</Button>}
        >
          <DepositTable deposits={data.mismatchDeposits} emptyText="불일치 입금이 없습니다." />
        </Section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-md)" }}>
          <Card>
            <h2 style={{ margin: 0, fontSize: "var(--fs-title)" }}>환불·과오납 처리</h2>
            <p style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
              초과·이중 납부는 납부완료로 흡수하지 않고 환불 또는 이월 surface에서 별도 처리합니다.
            </p>
            <Button variant="secondary">환불·과오납 처리</Button>
          </Card>
          <Card>
            <h2 style={{ margin: 0, fontSize: "var(--fs-title)" }}>분쟁 종료</h2>
            <p style={{ color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
              매칭 입금이 영구히 확인되지 않는 주장은 관리자 수동 처리로 보류를 종료합니다.
            </p>
            <Button variant="secondary">분쟁 종료(수동 처리)</Button>
          </Card>
        </div>
      </PageStack>
    </BillingShell>
  );
}
