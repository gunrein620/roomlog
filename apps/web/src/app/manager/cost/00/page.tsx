import { Input } from "@roomlog/ui";
import { getCostQueueSummary, getMonthlyCostSummary, listCosts } from "@/lib/cost-api";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";
import {
  CostTable,
  LinkButton,
  MetricCard,
  PageStack,
  QueueRows,
  ScreenHeader,
  Section,
  filterGridStyle,
  grid3Style,
  typeLabel,
  won,
} from "../_components";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [costs, queue, monthly] = await Promise.all([listCosts(), getCostQueueSummary(), getMonthlyCostSummary()]);

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-COST-00"
        title="비용 원장/큐"
        desc="결제·정산 흐름에서 생긴 영수증과 비용을 모아 검토·분류·공개 상태를 큐레이션합니다."
        actions={<LinkButton href={MANAGER_COST_ROUTES["M-COST-01"]} variant="secondary">영수증 업로드</LinkButton>}
      />

      <section style={grid3Style}>
        <MetricCard label="검토 대기" value={`${queue.total}건`} note="사유별로 나눠 처리" />
        <MetricCard label="이번 달 지출" value={won(monthly.totalAmount)} note="confirmed만 반영" />
        <MetricCard label="미검증 확정" value={`${queue.unverifiedConfirmed}건`} note="정직한 꼬리표로 유지" />
      </section>

      <Section title="검색·필터">
        <div style={filterGridStyle}>
          <Input aria-label="비용 검색" placeholder="항목, 호실, 영수증 검색" readOnly />
          <Input aria-label="기간 필터" value={monthly.month} readOnly />
          <Input aria-label="건물 필터" value="연남 스테이" readOnly />
        </div>
      </Section>

      <Section title="검토 큐">
        <div style={grid3Style}>
          <MetricCard label="OCR 저신뢰" value={`${queue.ocrLowConfidence}건`} />
          <MetricCard label="분류 불확실" value={`${queue.classificationUnclear}건`} />
          <MetricCard label="호실 미매칭" value={`${queue.unitUnmatched}건`} />
        </div>
        <QueueRows costs={costs} />
      </Section>

      <Section title="이번 달 유형별 합계">
        <div style={grid3Style}>
          {Object.entries(monthly.byType).map(([type, amount]) => (
            <MetricCard key={type} label={typeLabel[type as keyof typeof typeLabel]} value={won(amount)} />
          ))}
        </div>
      </Section>

      <Section title="비용 목록">
        <CostTable costs={costs} />
      </Section>
    </PageStack>
  );
}
