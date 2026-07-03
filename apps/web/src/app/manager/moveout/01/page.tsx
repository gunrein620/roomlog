import { getMoveout, getRecords, getReportAudit } from "@/lib/moveout-manager-api";
import { DEMO_MOVEOUT_ID } from "@/lib/demo-moveout";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";
import {
  DisabledButton,
  LinkButton,
  NoticeBanner,
  PageStack,
  RecordRows,
  ScreenHeader,
  Section,
  TriageRows,
  grid2Style,
  grid3Style,
  MetricCard,
} from "../_components";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const moveoutId = id ?? DEMO_MOVEOUT_ID;
  const [moveout, records, audit] = await Promise.all([
    getMoveout(moveoutId),
    getRecords(moveoutId),
    getReportAudit(moveoutId),
  ]);
  const comparisons = records.filter((record) => record.moveinComparisonAvailable).length;
  const triageCount = records.filter((record) => record.wearVerdict).length;

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-OUT-01"
        title={`${moveout.unitId}호 퇴실 기록 리포트`}
        desc="입주전 사진, 계약서, 하자, 수리, 채팅, 납부 기록을 같은 근거로 종합해 검토합니다."
        actions={<LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-00"]} variant="ghost">대시보드로</LinkButton>}
      />

      <NoticeBanner />

      <section style={grid3Style}>
        <MetricCard label="누적 기록" value={`${records.length}건`} note="신규 입력 없이 기존 기록 종합" />
        <MetricCard label="입주전 비교" value={`${comparisons}건`} note="공백은 책임 인정이 아님" />
        <MetricCard label="훼손 추정 triage" value={`${triageCount}건`} note="노후·마모 가능성부터 신중히 검토" />
      </section>

      <Section title="누적 기록 종합">
        <RecordRows records={records} />
      </Section>

      <Section title="훼손 추정 triage">
        <TriageRows records={records} audit={audit} />
      </Section>

      <Section title="입주전 비교와 내보내기">
        <div style={grid2Style}>
          <MetricCard label="입주전 비교" value={comparisons > 0 ? "근거 있음" : "근거 없음"} note="비교 근거가 없으면 별도 근거 없이 차감 후보를 강화하지 않습니다." />
          <MetricCard label="PDF/Excel" value="준비됨" note="데모 표면 · 리포트 근거와 감사로그 포함" />
        </div>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <DisabledButton>PDF 내보내기</DisabledButton>
        <DisabledButton>Excel 내보내기</DisabledButton>
        <LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-03"]} variant="secondary">이의 확인</LinkButton>
        <LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-02"]}>예상 정산안 검토</LinkButton>
      </div>
    </PageStack>
  );
}
