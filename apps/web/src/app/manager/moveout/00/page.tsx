import { Card } from "@roomlog/ui";
import { getManagerDashboard, listManagerRows } from "@/lib/moveout-manager-api";
import { MANAGER_MOVEOUT_ROUTES, withManagerMoveoutId } from "@/lib/moveout-manager-nav";
import {
  LinkButton,
  ManagerRowsTable,
  MetricCard,
  PageStack,
  ScreenHeader,
  Section,
  grid4Style,
} from "../_components";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [summary, rows] = await Promise.all([getManagerDashboard(), listManagerRows()]);
  const selectedRow =
    rows.find((row) => row.slaBreached || row.openDisputeCount > 0) ??
    rows.find((row) => row.contractConfirmed) ??
    rows[0];

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-OUT-00"
        title="퇴실/정산 검토 대시보드"
        desc="만료 임박, 이의, SLA 경과 호실을 먼저 올려 기록 리포트와 예상 정산안 검토로 연결합니다."
        actions={
          selectedRow ? (
            <>
              <LinkButton
                href={withManagerMoveoutId(MANAGER_MOVEOUT_ROUTES["M-OUT-03"], selectedRow.summaryId)}
                variant="secondary"
              >
                이의 처리 큐
              </LinkButton>
              <LinkButton href={withManagerMoveoutId(MANAGER_MOVEOUT_ROUTES["M-OUT-02"], selectedRow.summaryId)}>
                정산안 검토
              </LinkButton>
            </>
          ) : undefined
        }
      />

      <section style={grid4Style}>
        <MetricCard label="만료 임박" value={`${summary.expiringSoon}호실`} note="D-day가 가까운 계약" />
        <MetricCard label="이의 대기" value={`${summary.disputesWaiting}건`} note="응답 또는 반영 필요" />
        <MetricCard label="SLA 경과" value={`${summary.slaBreached}건`} note="에스컬레이션 출구 표시" />
        <MetricCard label="검토 완료" value={`${summary.reviewDone}호실`} note="예상안 기준 · 실제 송금 아님" />
      </section>

      <Section title="만료 예정 호실">
        {rows.length === 0 ? (
          <Card style={{ display: "grid", gap: "var(--space-xs)", color: "var(--on-surface-variant)" }}>
            <div style={{ fontWeight: 850, color: "var(--on-surface)" }}>검토할 퇴실/정산 건이 없습니다.</div>
            <div>관리 중인 호실에 활성 퇴실 건이 생기면 기록 리포트, 예상 정산안, 이의 처리 링크가 표시됩니다.</div>
          </Card>
        ) : (
          <ManagerRowsTable rows={rows} />
        )}
      </Section>
    </PageStack>
  );
}
