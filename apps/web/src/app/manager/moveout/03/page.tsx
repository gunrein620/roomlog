import { redirect } from "next/navigation";
import { Card } from "@roomlog/ui";
import { getManagerSettlement, respondDispute } from "@/lib/moveout-manager-api";
import { DEMO_MOVEOUT_ID } from "@/lib/demo-moveout";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";
import {
  DisputeQueue,
  InputLike,
  LinkButton,
  MetricCard,
  PageStack,
  ScreenHeader,
  Section,
  grid2Style,
  grid3Style,
  mutedSmallStyle,
  rowStyle,
  wonRange,
} from "../_components";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string; selectedDisputeId?: string; sent?: string; error?: string }>;

async function respondDisputeAction(formData: FormData) {
  "use server";

  const moveoutId = String(formData.get("moveoutId") ?? DEMO_MOVEOUT_ID);
  const selectedDisputeId = String(formData.get("selectedDisputeId") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const kind = String(formData.get("kind") ?? "explain") as "accept" | "adjust" | "explain";
  const reflect = String(formData.get("reflect") ?? "none") as "report" | "settlement" | "none";
  const nextQuery = new URLSearchParams({ id: moveoutId });

  if (selectedDisputeId) {
    nextQuery.set("selectedDisputeId", selectedDisputeId);
  }

  if (!selectedDisputeId || !message) {
    nextQuery.set("error", "missing-response");
    redirect(`${MANAGER_MOVEOUT_ROUTES["M-OUT-03"]}?${nextQuery.toString()}`);
  }

  await respondDispute(moveoutId, { disputeId: selectedDisputeId, kind, message, reflect });
  const sent = reflect === "settlement" ? "settlement-reflected" : "answered";
  nextQuery.set("sent", sent);

  redirect(`${MANAGER_MOVEOUT_ROUTES["M-OUT-03"]}?${nextQuery.toString()}`);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id, selectedDisputeId, sent, error } = await searchParams;
  const moveoutId = id ?? DEMO_MOVEOUT_ID;
  const review = await getManagerSettlement(moveoutId);
  const waiting = review.disputes.filter((dispute) => dispute.status !== "resolved" && dispute.status !== "confirmed").length;
  const breached = review.disputes.filter((dispute) => dispute.slaBreached).length;
  const targetDisputeId = selectedDisputeId ?? review.disputes[0]?.id ?? "";
  const selected = review.disputes.find((dispute) => dispute.id === targetDisputeId) ?? review.disputes[0];
  const selectedDeduction = selected?.targetItemId
    ? review.settlement.deductions.find((deduction) => deduction.id === selected.targetItemId)
    : undefined;
  const responseNotice =
    sent === "settlement-reflected"
      ? "응답을 발송하고 예상 정산 차감 후보에 반영했습니다."
      : sent === "answered"
        ? "응답을 발송했습니다."
        : undefined;

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-OUT-03"
        title="이의·정정 처리 큐"
        desc="임차인 이의를 수신, 원본과 대조, 응답하고 리포트 또는 예상 정산안에 반영합니다."
        actions={<LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-00"]} variant="ghost">대시보드로</LinkButton>}
      />

      <section style={grid3Style}>
        <MetricCard label="대기" value={`${waiting}건`} note="응답 또는 반영 필요" />
        <MetricCard label="SLA 경과" value={`${breached}건`} note="무응답 출구 안내 필요" />
        <MetricCard label="모바일 허용" value="응답 가능" note="금액 조정은 데스크탑에서 처리" />
      </section>

      {responseNotice ? (
        <Card style={{ border: "1.5px solid var(--primary)", background: "var(--surface-container-high)", fontWeight: 850 }}>
          {responseNotice}
        </Card>
      ) : null}
      {error === "missing-response" ? (
        <Card style={{ border: "1.5px solid var(--error)", color: "var(--error)", fontWeight: 850 }}>
          처리 대상과 응답 내용을 모두 입력해야 합니다.
        </Card>
      ) : null}

      <Section title="이의 큐">
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <form>
            <input type="hidden" name="id" value={moveoutId} />
            <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
              <label style={fieldLabelStyle}>
                처리 대상 선택
                <select
                  name="selectedDisputeId"
                  defaultValue={selected?.id ?? ""}
                  disabled={review.disputes.length === 0}
                  style={selectStyle}
                >
                  {review.disputes.map((dispute) => (
                    <option key={dispute.id} value={dispute.id}>
                      {dispute.targetLabel} · {dispute.slaBreached ? "SLA 경과" : "SLA 정상"}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={review.disputes.length === 0} style={secondaryActionStyle}>
                원본 대조 열기
              </button>
            </Card>
          </form>
          <DisputeQueue disputes={review.disputes} />
        </div>
      </Section>

      <Section title="원본 대조">
        <div style={grid2Style}>
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={{ fontWeight: 850 }}>대상 항목</div>
            <div style={rowStyle}>
              <span>{selected?.targetLabel ?? "미해소 이의 없음"}</span>
              <span>{selected ? (selected.slaBreached ? "SLA 경과" : "SLA 정상") : "—"}</span>
            </div>
            <div style={mutedSmallStyle}>{selected?.reason ?? "현재 대조할 미해소 이의가 없습니다."}</div>
          </Card>
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={{ fontWeight: 850 }}>원본 근거</div>
            {selectedDeduction ? (
              <>
                <div style={rowStyle}>
                  <span>{selectedDeduction.label}</span>
                  <span>{wonRange(selectedDeduction.estimatedMin, selectedDeduction.estimatedMax)}</span>
                </div>
                <div style={mutedSmallStyle}>
                  {selectedDeduction.evidenceNote} · {selectedDeduction.needsConfirmation ? "확인 필요" : "확인 해소"}
                </div>
              </>
            ) : (
              <div style={mutedSmallStyle}>
                리포트 근거와 예상 정산안 근거를 같은 출처로 대조합니다. 관리인이 보는 근거는 임차인도 동일하게 열람합니다.
              </div>
            )}
          </Card>
        </div>
      </Section>

      <Section title="응답 작성">
        {selected ? (
          <form action={respondDisputeAction}>
            <input type="hidden" name="moveoutId" value={moveoutId} />
            <input type="hidden" name="selectedDisputeId" value={selected.id} />
            <Card style={{ display: "grid", gap: "var(--space-md)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-sm)" }}>
                <label style={fieldLabelStyle}>
                  판단
                  <select name="kind" defaultValue="explain" style={selectStyle}>
                    <option value="accept">인정</option>
                    <option value="adjust">조정</option>
                    <option value="explain">사유 회신</option>
                  </select>
                </label>
                <label style={fieldLabelStyle}>
                  반영 옵션
                  <select name="reflect" defaultValue="none" style={selectStyle}>
                    <option value="report">리포트</option>
                    <option value="settlement">정산</option>
                    <option value="none">없음</option>
                  </select>
                </label>
                <InputLike label="다음 상태" value="관리자 응답 → 임차인 확인" />
              </div>
              <input
                name="message"
                aria-label="이의 응답 내용"
                placeholder="응답 내용과 근거를 입력하세요"
                style={inputStyle}
              />
              <div style={mutedSmallStyle}>
                사유 없이 거절하지 않습니다. 인정 또는 조정 시 어떤 근거를 반영했는지 함께 남기고 감사로그에 연결합니다.
              </div>
              <button type="submit" style={primaryActionStyle}>
                응답 발송
              </button>
            </Card>
          </form>
        ) : (
          <Card style={{ color: "var(--on-surface-variant)" }}>처리할 이의가 없습니다.</Card>
        )}
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <LinkButton href={`${MANAGER_MOVEOUT_ROUTES["M-OUT-01"]}?id=${moveoutId}`} variant="secondary">리포트 원본</LinkButton>
        <LinkButton href={`${MANAGER_MOVEOUT_ROUTES["M-OUT-02"]}?id=${moveoutId}`} variant="secondary">정산 원본</LinkButton>
      </div>
    </PageStack>
  );
}

const fieldLabelStyle = {
  display: "grid",
  gap: "var(--space-xs)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
} as const;

const selectStyle = {
  minHeight: "var(--touch-target)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  padding: "0 12px",
  background: "var(--surface-container-lowest)",
  font: "inherit",
} as const;

const inputStyle = {
  minHeight: "var(--touch-target)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  padding: "0 12px",
  background: "var(--surface-container-lowest)",
  font: "inherit",
} as const;

const primaryActionStyle = {
  minHeight: "var(--touch-target)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 16px",
  borderRadius: "var(--radius-btn)",
  border: "none",
  background: "var(--primary)",
  color: "var(--on-primary)",
  fontWeight: 800,
  cursor: "pointer",
} as const;

const secondaryActionStyle = {
  minHeight: "var(--touch-target)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 16px",
  borderRadius: "var(--radius-btn)",
  border: "1.5px solid var(--primary)",
  background: "transparent",
  color: "var(--primary)",
  fontWeight: 800,
  cursor: "pointer",
} as const;
