import { Card } from "@roomlog/ui";
import { getManagerSettlement, getMoveout } from "@/lib/moveout-manager-api";
import { DEMO_MOVEOUT_ID } from "@/lib/demo-moveout";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";
import {
  DeductionRows,
  DisabledButton,
  DisputeQueue,
  LinkButton,
  MetricCard,
  NoticeBanner,
  PageStack,
  ScreenHeader,
  Section,
  StatusBadge,
  blockReasonLabel,
  grid2Style,
  mutedSmallStyle,
  rowStyle,
  won,
  wonRange,
} from "../_components";

export default async function Page() {
  const [moveout, review] = await Promise.all([getMoveout(DEMO_MOVEOUT_ID), getManagerSettlement(DEMO_MOVEOUT_ID)]);
  const { settlement, gate } = review;
  const contractBlocked = !moveout.contractConfirmed;

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-OUT-02"
        title={`${moveout.unitId}호 예상 정산안 검토`}
        desc="보증금과 차감 후보를 범위로 검토합니다. 실제 반환 송금은 이 화면의 범위 밖입니다."
        actions={<StatusBadge status={settlement.status} />}
      />

      <NoticeBanner />

      <section style={grid2Style}>
        <MetricCard label="보증금" value={won(settlement.depositAmount)} note={moveout.contractConfirmed ? "계약서 확정값 기준" : "계약 미확정 · 검토 차단"} />
        <MetricCard label="예상 반환액" value={wonRange(settlement.refundMin, settlement.refundMax)} note="줄 수도 늘 수도 있으며 확정 아님" />
      </section>

      {contractBlocked ? (
        <Card style={{ border: "1.5px solid var(--primary)", background: "var(--surface-container-high)" }}>
          <div style={{ fontWeight: 850 }}>계약 미확정 호실</div>
          <div style={{ marginTop: "var(--space-xs)", ...mutedSmallStyle }}>
            종료일, 보증금, 원상복구·청소 조항이 확정되지 않아 검토 진입과 검토 완료를 차단합니다. 계약 확정 화면에서 먼저 확인해야 합니다.
          </div>
        </Card>
      ) : null}

      <Section title="차감 후보와 금액 조정">
        <DeductionRows deductions={settlement.deductions} />
      </Section>

      <Section title="임차인 이의 enum">
        <DisputeQueue disputes={review.disputes} />
      </Section>

      <Section title="검토 완료 게이트">
        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <div style={rowStyle}>
            <div>
              <div style={{ fontWeight: 850 }}>{gate.canComplete && !contractBlocked ? "게이트 통과 가능" : "검토 완료 차단"}</div>
              <div style={mutedSmallStyle}>{contractBlocked ? "계약 미확정이 최우선 차단 사유입니다." : gate.message}</div>
            </div>
            <StatusBadge status={gate.canComplete && !contractBlocked ? "review_done" : "reviewing"} />
          </div>
          <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
            {(contractBlocked ? ["contract_unconfirmed" as const] : gate.blockingReasons).map((reason) => (
              <span key={reason} style={mutedSmallStyle}>· {blockReasonLabel[reason]}</span>
            ))}
          </div>
          <div style={mutedSmallStyle}>
            차단 시에도 SLA와 임차인 에스컬레이션 출구를 함께 안내해 보증금 검토가 무기한 멈추지 않게 합니다.
          </div>
        </Card>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-01"]} variant="ghost">리포트 근거 보기</LinkButton>
        <LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-03"]} variant="secondary">이의 처리</LinkButton>
        <DisabledButton>정산안 저장</DisabledButton>
        <DisabledButton>임차인에게 전달</DisabledButton>
      </div>
    </PageStack>
  );
}
