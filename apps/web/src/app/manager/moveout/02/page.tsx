import { redirect } from "next/navigation";
import { Card } from "@roomlog/ui";
import {
  adjustDeduction,
  completeReview,
  getManagerSettlement,
  getMoveout,
  getReportAudit,
} from "@/lib/moveout-manager-api";
import { DEMO_MOVEOUT_ID } from "@/lib/demo-moveout";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";
import {
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

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string }>;

async function completeReviewAction(formData: FormData) {
  "use server";

  const moveoutId = String(formData.get("moveoutId") ?? DEMO_MOVEOUT_ID);
  const overrideReason = String(formData.get("overrideReason") ?? "").trim();
  const overrideSla = formData.get("overrideSla") === "true";

  await completeReview(moveoutId, {
    acknowledgeEvidence: true,
    overrideSla,
    overrideReason: overrideReason || undefined,
  });
  redirect(`${MANAGER_MOVEOUT_ROUTES["M-OUT-02"]}?id=${encodeURIComponent(moveoutId)}`);
}

function optionalAmount(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();

  if (!text) {
    return undefined;
  }

  return Number(text);
}

async function adjustDeductionAction(formData: FormData) {
  "use server";

  const moveoutId = String(formData.get("moveoutId") ?? DEMO_MOVEOUT_ID);
  const deductionId = String(formData.get("deductionId") ?? "").trim();

  if (!deductionId) {
    redirect(`${MANAGER_MOVEOUT_ROUTES["M-OUT-02"]}?id=${encodeURIComponent(moveoutId)}&error=missing-deduction`);
  }

  await adjustDeduction(moveoutId, {
    deductionId,
    estimatedMin: optionalAmount(formData.get(`estimatedMin-${deductionId}`)),
    estimatedMax: optionalAmount(formData.get(`estimatedMax-${deductionId}`)),
    resolveConfirmation: formData.get(`resolveConfirmation-${deductionId}`) === "true",
    note: String(formData.get(`note-${deductionId}`) ?? "").trim() || undefined,
  });
  redirect(`${MANAGER_MOVEOUT_ROUTES["M-OUT-02"]}?id=${encodeURIComponent(moveoutId)}&adjusted=1`);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const moveoutId = id ?? DEMO_MOVEOUT_ID;
  const [moveout, review, audit] = await Promise.all([
    getMoveout(moveoutId),
    getManagerSettlement(moveoutId),
    getReportAudit(moveoutId),
  ]);
  const { settlement, gate } = review;
  const contractBlocked = !moveout.contractConfirmed;
  const latestAudit = audit[0];

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
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {settlement.deductions.map((deduction) => (
            <form key={deduction.id} action={adjustDeductionAction}>
              <input type="hidden" name="moveoutId" value={moveoutId} />
              <input type="hidden" name="deductionId" value={deduction.id} />
              <Card style={{ display: "grid", gap: "var(--space-md)" }}>
                <div style={rowStyle}>
                  <div>
                    <div style={{ fontWeight: 850 }}>{deduction.label}</div>
                    <div style={mutedSmallStyle}>{deduction.evidenceNote}</div>
                  </div>
                  <StatusBadge status={deduction.needsConfirmation ? "reviewing" : settlement.status} />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: "var(--space-sm)",
                    alignItems: "end",
                  }}
                >
                  <label style={{ display: "grid", gap: "var(--space-xs)", fontSize: "var(--fs-caption)", fontWeight: 800 }}>
                    하한
                    <input
                      name={`estimatedMin-${deduction.id}`}
                      type="number"
                      min={0}
                      defaultValue={deduction.estimatedMin}
                      aria-label={`${deduction.label} 차감 하한`}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "var(--space-xs)", fontSize: "var(--fs-caption)", fontWeight: 800 }}>
                    상한
                    <input
                      name={`estimatedMax-${deduction.id}`}
                      type="number"
                      min={0}
                      defaultValue={deduction.estimatedMax}
                      aria-label={`${deduction.label} 차감 상한`}
                      style={inputStyle}
                    />
                  </label>
                  <label
                    style={{
                      minHeight: "var(--touch-target)",
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-xs)",
                      fontSize: "var(--fs-caption)",
                      fontWeight: 800,
                    }}
                  >
                    <input
                      type="checkbox"
                      name={`resolveConfirmation-${deduction.id}`}
                      value="true"
                      defaultChecked={!deduction.needsConfirmation}
                    />
                    확인필요 해소
                  </label>
                  <button type="submit" style={secondaryActionStyle}>
                    금액 조정 저장
                  </button>
                </div>
                <input
                  name={`note-${deduction.id}`}
                  aria-label={`${deduction.label} 조정 메모`}
                  placeholder="조정 사유 메모"
                  style={inputStyle}
                />
                <div style={mutedSmallStyle}>
                  현재 예상 범위 {wonRange(deduction.estimatedMin, deduction.estimatedMax)}. 저장 후 반환액 범위가 다시 계산됩니다.
                </div>
              </Card>
            </form>
          ))}
        </div>
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

      {gate.overrideAvailable && !contractBlocked ? (
        <Section title="SLA override 통지·감사로그">
          <div style={grid2Style}>
            <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
              <div style={{ fontWeight: 850 }}>임차인 통지</div>
              <div style={mutedSmallStyle}>
                SLA override로 검토 완료를 진행하면 사유, 예상안 상태, 이의 미해소 사실을 임차인 알림과 메시징 기록에 남긴다는 전제로만 진행합니다.
              </div>
              <div style={rowStyle}>
                <span>통지 상태</span>
                <strong>필수</strong>
              </div>
            </Card>
            <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
              <div style={{ fontWeight: 850 }}>감사로그</div>
              {latestAudit ? (
                <>
                  <div style={mutedSmallStyle}>
                    {latestAudit.at.slice(0, 16).replace("T", " ")} · {latestAudit.managerName}
                  </div>
                  <div style={mutedSmallStyle}>{latestAudit.evidenceNote}</div>
                  <div style={rowStyle}>
                    <span>임차인 통지 기록</span>
                    <strong>{latestAudit.tenantNotified ? "있음" : "없음"}</strong>
                  </div>
                </>
              ) : (
                <div style={mutedSmallStyle}>
                  아직 기록된 감사로그가 없습니다. override 실행 시 사유와 통지 여부를 감사로그에 남겨야 합니다.
                </div>
              )}
            </Card>
          </div>
        </Section>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <LinkButton href={`${MANAGER_MOVEOUT_ROUTES["M-OUT-01"]}?id=${moveoutId}`} variant="ghost">리포트 근거 보기</LinkButton>
        <LinkButton href={`${MANAGER_MOVEOUT_ROUTES["M-OUT-03"]}?id=${moveoutId}`} variant="secondary">이의 처리</LinkButton>
        {gate.canComplete && !contractBlocked ? (
          <form action={completeReviewAction}>
            <input type="hidden" name="moveoutId" value={moveoutId} />
            <button
              type="submit"
              style={{
                minHeight: "var(--touch-target)",
                padding: "0 16px",
                borderRadius: "var(--radius-btn)",
                border: "none",
                background: "var(--primary)",
                color: "var(--on-primary)",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              검토 완료
            </button>
          </form>
        ) : gate.overrideAvailable && !contractBlocked ? (
          <form
            action={completeReviewAction}
            style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap", alignItems: "center" }}
          >
            <input type="hidden" name="moveoutId" value={moveoutId} />
            <input type="hidden" name="overrideSla" value="true" />
            <input
              name="overrideReason"
              aria-label="SLA override 사유"
              placeholder="SLA override 사유"
              style={{
                minHeight: "var(--touch-target)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-btn)",
                padding: "0 12px",
              }}
            />
            <button
              type="submit"
              style={{
                minHeight: "var(--touch-target)",
                padding: "0 16px",
                borderRadius: "var(--radius-btn)",
                border: "1.5px solid var(--primary)",
                background: "transparent",
                color: "var(--primary)",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              SLA override로 검토 완료
            </button>
          </form>
        ) : (
          <DisabledButton>검토 완료 차단</DisabledButton>
        )}
        <DisabledButton>임차인에게 전달</DisabledButton>
      </div>
    </PageStack>
  );
}

const inputStyle = {
  minHeight: "var(--touch-target)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  padding: "0 12px",
  background: "var(--surface-container-lowest)",
  font: "inherit",
} as const;

const secondaryActionStyle = {
  minHeight: "var(--touch-target)",
  padding: "0 16px",
  borderRadius: "var(--radius-btn)",
  border: "1.5px solid var(--primary)",
  background: "transparent",
  color: "var(--primary)",
  fontWeight: 800,
  cursor: "pointer",
} as const;
