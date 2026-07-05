import { getReportFaq } from "@/lib/report-api";
import { DEMO_REPORT_ID } from "@/lib/demo-report";
import { MANAGER_REPORT_ROUTES } from "@/lib/report-nav";
import { Badge, Card } from "@roomlog/ui";
import { FaqButtons, LinkButton, PageStack, ScreenHeader, Section } from "../_components";

export default async function Page() {
  const faq = await getReportFaq();

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-RPT-05"
        title="빠른 조회"
        subtitle="모바일 짝 화면의 FAQ 우선 흐름을 데스크탑 셸 안에서 확인합니다."
        actions={<LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-04"]}>정밀 질의로</LinkButton>}
      />

      <Section title="자주 묻는 질문">
        <FaqButtons faq={faq} targetReportId={DEMO_REPORT_ID} />
      </Section>

      <Card style={{ display: "grid", gap: "var(--space-md)", maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
          <div style={{ fontWeight: 850 }}>미납 호실</div>
          <Badge emphasis>금액성 · 실시간 M-BILL</Badge>
        </div>
        <div style={{ lineHeight: "var(--lh-body)" }}>현재 미납은 3세대입니다. 302호는 34일 연체로 독촉 초안 검토 대상입니다.</div>
        <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" }}>
          빠른 조회에서도 발송은 하지 않습니다. 독촉/공지 초안은 메시징에서 대상·기간·금액 대조 후 확정합니다.
        </div>
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <LinkButton href="/manager/messaging/00" variant="secondary">메시징 초안</LinkButton>
          <LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-04"]} variant="secondary">근거 자세히</LinkButton>
        </div>
      </Card>
    </PageStack>
  );
}
