import { getVendorPerf } from "@/lib/vendor-mgmt-api";
import {
  JobRows,
  LinkButton,
  ManagerVendorMgmtShell,
  MetricCard,
  NoticeCard,
  PageStack,
  ScreenHeader,
  Section,
  grid2Style,
  grid3Style,
  minNLabel,
  vendorHref,
} from "../_components";

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const { vendor, perf, jobs } = await getVendorPerf(id);
  const showRating = perf.ratingVisible && perf.satisfactionAvg != null;

  return (
    <ManagerVendorMgmtShell title="성과 기록">
      <PageStack>
        <ScreenHeader
          eyebrow="M-VEND-02"
          title={`${vendor.name} 성과 기록`}
          desc="vendor_perf 단일 집계를 표본·커버리지와 함께 조회합니다. 이 화면에는 만족도 입력이 없습니다."
          actions={<LinkButton href={vendorHref("M-VEND-01", vendor.id)} variant="ghost">상세로</LinkButton>}
        />

        <section style={grid3Style}>
          <MetricCard label="총 표본" value={`n=${perf.sampleN}`} note={minNLabel} />
          <MetricCard label="커버리지" value={`${perf.ratedCount}/${perf.completedCount}`} note="rated_n / completed_n" />
          <MetricCard label="만족도 평균" value={showRating ? `${perf.satisfactionAvg?.toFixed(1)} / 5` : "거래 N건"} note={showRating ? "충분 표본" : "소표본 또는 커버리지 낮음"} />
        </section>

        <Section title="vendor_perf 4지표">
          <div style={grid2Style}>
            <MetricCard label="응답 속도 중앙값" value={perf.responseMedianHours != null ? `${perf.responseMedianHours}시간` : "참고 불가"} />
            <MetricCard label="평균 견적 대비" value={perf.quoteVsAvgPct != null ? `${perf.quoteVsAvgPct}%` : "참고 불가"} note="M-COST-03 원장 매핑" />
            <MetricCard label="완료 건수" value={`${perf.completedCount}건`} />
            <MetricCard label="만족도 평균" value={showRating ? `${perf.satisfactionAvg?.toFixed(1)} / 5` : "참고 불가"} note="min_n·커버리지 가드" />
          </div>
        </Section>

        <Section title="AI 코멘트">
          {perf.aiCommentEnabled && perf.aiComment ? (
            <NoticeCard title={`AI 코멘트 · ${perf.aiComment.label}`} emphasis>
              {perf.aiComment.summary} 근거: {perf.aiComment.basisJobIds.join(", ")}
            </NoticeCard>
          ) : (
            <NoticeCard title="AI 코멘트 비활성" emphasis>
              min_n 미만이거나 표본 신뢰가 부족해 AI 코멘트를 표시하지 않습니다.
            </NoticeCard>
          )}
        </Section>

        <Section title="완료 이력">
          <JobRows jobs={jobs} />
        </Section>

        <NoticeCard title="업체 미러 안내" emphasis>
          {perf.mirrorNotice}
        </NoticeCard>
      </PageStack>
    </ManagerVendorMgmtShell>
  );
}
