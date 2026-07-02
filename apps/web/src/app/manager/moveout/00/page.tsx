import { getManagerDashboard, listManagerRows } from "@/lib/moveout-manager-api";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";
import {
  LinkButton,
  ManagerRowsTable,
  MetricCard,
  PageStack,
  ScreenHeader,
  Section,
  grid4Style,
} from "../_components";

export default async function Page() {
  const [summary, rows] = await Promise.all([getManagerDashboard(), listManagerRows()]);

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-OUT-00"
        title="퇴실/정산 검토 대시보드"
        desc="만료 임박, 이의, SLA 경과 호실을 먼저 올려 기록 리포트와 예상 정산안 검토로 연결합니다."
        actions={<LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-03"]} variant="secondary">이의 처리 큐</LinkButton>}
      />

      <section style={grid4Style}>
        <MetricCard label="만료 임박" value={`${summary.expiringSoon}호실`} note="D-day가 가까운 계약" />
        <MetricCard label="이의 대기" value={`${summary.disputesWaiting}건`} note="응답 또는 반영 필요" />
        <MetricCard label="SLA 경과" value={`${summary.slaBreached}건`} note="에스컬레이션 출구 표시" />
        <MetricCard label="검토 완료" value={`${summary.reviewDone}호실`} note="예상안 기준 · 실제 송금 아님" />
      </section>

      <Section title="만료 예정 호실">
        <ManagerRowsTable rows={rows} />
      </Section>
    </PageStack>
  );
}
