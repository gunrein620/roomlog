import { getReportHub } from "@/lib/report-api";
import { MANAGER_REPORT_ROUTES } from "@/lib/report-nav";
import { Grid, LinkButton, MetricCard, PageStack, ReportTable, ScreenHeader, Section, TrustNotice } from "../_components";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { reports, recipients, faq } = await getReportHub();
  const delivered = reports.filter((report) => report.status === "delivered").length;
  const drafts = reports.length - delivered;

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-RPT-00"
        title="관리 리포트 허브"
        subtitle="서술형 운영 리포트를 생성하고 임대인 보고 상태를 추적합니다."
        actions={
          <>
            <LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-04"]} variant="secondary">질의 챗봇</LinkButton>
            <LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-01"]}>새 리포트 생성</LinkButton>
          </>
        }
      />

      <Grid>
        <MetricCard label="생성 리포트" value={`${reports.length}건`} note="주·월·분기 서술형 스냅샷" />
        <MetricCard label="임대인 전달" value={`${delivered}건`} note="마스킹·감사 로그 적용" />
        <MetricCard label="초안" value={`${drafts}건`} note="전달 전 검토 필요" />
        <MetricCard label="수신자" value={`${recipients.length}명`} note="임대인 보고 대상" />
      </Grid>

      <TrustNotice>
        리포트의 1차 용도는 임대인 운영 보고입니다. 실시간 지표는 자산현황 리포트에서 탐색하고, 납부 수치는 청구·수금과 같은 기준으로 계산하며, 공실·민원·비용은 각 원천 기준으로 분리합니다.
      </TrustNotice>

      <Section
        title="생성 리포트 목록"
        action={<LinkButton href="/manager/home/02" variant="secondary">임대 현황 리포트로</LinkButton>}
      >
        <ReportTable reports={reports} />
      </Section>

      <Section title="빠른 질의">
        <Grid min={180}>
          {faq.map((item) => (
            <LinkButton key={item.id} href={MANAGER_REPORT_ROUTES["M-RPT-04"]} variant="secondary">
              {item.label}
            </LinkButton>
          ))}
        </Grid>
      </Section>
    </PageStack>
  );
}
