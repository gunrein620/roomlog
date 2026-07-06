import { redirect } from "next/navigation";
import { Card } from "@roomlog/ui";
import type { WearAdjustmentAction, WearVerdict } from "@roomlog/types";
import { adjustWearVerdict, getMoveout, getRecords, getReportAudit } from "@/lib/moveout-manager-api";
import { DEMO_MOVEOUT_ID } from "@/lib/demo-moveout";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";
import {
  LinkButton,
  NoticeBanner,
  PageStack,
  RecordRows,
  ScreenHeader,
  Section,
  grid2Style,
  grid3Style,
  MetricCard,
  actionLabel,
  mutedSmallStyle,
  rowStyle,
  wearLabel,
} from "../_components";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string }>;

function reportExportHref(format: "pdf" | "csv", moveoutId: string) {
  return `/manager/moveout/01/export?id=${encodeURIComponent(moveoutId)}&format=${format}`;
}

async function adjustWearVerdictAction(formData: FormData) {
  "use server";

  const moveoutId = String(formData.get("moveoutId") ?? DEMO_MOVEOUT_ID);
  const recordItemId = String(formData.get("recordItemId") ?? "").trim();
  const action = String(formData.get("action") ?? "reinforce") as WearAdjustmentAction;
  const toVerdictValue = String(formData.get(`toVerdict-${recordItemId}`) ?? "").trim();

  if (!recordItemId) {
    redirect(`${MANAGER_MOVEOUT_ROUTES["M-OUT-01"]}?id=${encodeURIComponent(moveoutId)}&error=missing-record`);
  }

  await adjustWearVerdict(moveoutId, {
    recordItemId,
    action,
    toVerdict: toVerdictValue ? (toVerdictValue as WearVerdict) : undefined,
    evidenceNote: String(formData.get(`evidenceNote-${recordItemId}`) ?? "").trim(),
    notifyTenant: formData.get(`notifyTenant-${recordItemId}`) === "true",
  });
  redirect(`${MANAGER_MOVEOUT_ROUTES["M-OUT-01"]}?id=${encodeURIComponent(moveoutId)}&adjusted=1`);
}

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
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {records.filter((record) => record.wearVerdict).map((record) => {
            const log = audit.find((entry) => entry.recordItemId === record.id);

            return (
              <form key={record.id} action={adjustWearVerdictAction}>
                <input type="hidden" name="moveoutId" value={moveoutId} />
                <input type="hidden" name="recordItemId" value={record.id} />
                <Card style={{ display: "grid", gap: "var(--space-md)" }}>
                  <div style={rowStyle}>
                    <div>
                      <div style={{ fontWeight: 850 }}>{record.title}</div>
                      <div style={mutedSmallStyle}>
                        {record.wearNote ?? "노후/마모와 훼손을 구분해 신중히 검토합니다."}
                      </div>
                    </div>
                    <span style={mutedSmallStyle}>{wearLabel[record.wearVerdict!]}</span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      gap: "var(--space-sm)",
                      alignItems: "end",
                    }}
                  >
                    <label style={fieldLabelStyle}>
                      조정 액션
                      <select name="action" defaultValue="reinforce" style={inputStyle}>
                        <option value="keep">{actionLabel.keep}</option>
                        <option value="adjust">{actionLabel.adjust}</option>
                        <option value="reinforce">{actionLabel.reinforce}</option>
                      </select>
                    </label>
                    <label style={fieldLabelStyle}>
                      조정 판정
                      <select name={`toVerdict-${record.id}`} defaultValue={record.wearVerdict} style={inputStyle}>
                        <option value="aging_likely">노후·마모 가능</option>
                        <option value="damage_possible">훼손 가능성</option>
                        <option value="unclear">확인 필요</option>
                      </select>
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
                      <input type="checkbox" name={`notifyTenant-${record.id}`} value="true" />
                      임차인 통지
                    </label>
                    <button type="submit" style={secondaryActionStyle}>
                      triage 저장
                    </button>
                  </div>
                  <input
                    name={`evidenceNote-${record.id}`}
                    aria-label={`${record.title} 조정 근거`}
                    placeholder="조정 근거와 임차인에게 보일 설명"
                    defaultValue={log?.evidenceNote ?? ""}
                    style={inputStyle}
                  />
                  <div style={mutedSmallStyle}>
                    입주전 비교 {record.moveinComparisonAvailable ? "가능" : "근거 없음"} · 통지와 근거 없이는 수정할 수 없습니다.
                  </div>
                </Card>
              </form>
            );
          })}
        </div>
      </Section>

      <Section title="입주전 비교와 내보내기">
        <div style={grid2Style}>
          <MetricCard label="입주전 비교" value={comparisons > 0 ? "근거 있음" : "근거 없음"} note="비교 근거가 없으면 별도 근거 없이 차감 후보를 강화하지 않습니다." />
          <MetricCard label="PDF/Excel" value="준비됨" note="데모 표면 · 리포트 근거와 감사로그 포함" />
        </div>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <LinkButton href={reportExportHref("pdf", moveoutId)} variant="secondary">PDF 내보내기</LinkButton>
        <LinkButton href={reportExportHref("csv", moveoutId)} variant="secondary">Excel 내보내기</LinkButton>
        <LinkButton href={`${MANAGER_MOVEOUT_ROUTES["M-OUT-03"]}?id=${moveoutId}`} variant="secondary">이의 확인</LinkButton>
        <LinkButton href={`${MANAGER_MOVEOUT_ROUTES["M-OUT-02"]}?id=${moveoutId}`}>예상 정산안 검토</LinkButton>
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
