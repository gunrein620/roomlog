import { redirect } from "next/navigation";
import { createManagerReport, getReportCreateData } from "@/lib/report-api";
import { MANAGER_REPORT_ROUTES } from "@/lib/report-nav";
import type { ReportRecipient } from "@roomlog/types";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import { Grid, LinkButton, PageStack, ScreenHeader, Section, formatDateTime } from "../_components";

export const dynamic = "force-dynamic";

const sections = ["납부 현황", "민원·처리", "지출·수리비", "호실·공실", "실시간 지표", "계약 변동", "장기 리스크", "임대인 메모", "다음 조치"];

async function createReportAction(formData: FormData) {
  "use server";

  const report = await createManagerReport({
    period: readReportPeriod(formData.get("period")),
    periodLabel: readRequiredFormValue(formData, "periodLabel"),
    periodStart: readDateTimeFormValue(formData, "periodStart"),
    periodEnd: readDateTimeFormValue(formData, "periodEnd"),
    scope: {
      buildingId: readRequiredFormValue(formData, "buildingId"),
      buildingName: readRequiredFormValue(formData, "buildingName"),
      unitIds: readCsvFormValue(formData, "unitIds"),
    },
    recipient: await readReportRecipient(formData.get("recipientId")),
  });
  redirect(`${MANAGER_REPORT_ROUTES["M-RPT-02"]}?id=${encodeURIComponent(report.id)}`);
}

export default async function Page() {
  const { recipients, recentReport } = await getReportCreateData();

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-RPT-01"
        title="새 리포트 생성"
        subtitle="기간·범위·섹션·임대인 수신자를 정해 생성 시점 스냅샷을 만듭니다."
        actions={<LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-00"]} variant="secondary">허브로</LinkButton>}
      />

      <form action={createReportAction}>
        <div style={{ display: "grid", gap: "var(--space-lg)" }}>
          <Grid>
            <Card style={{ display: "grid", gap: "var(--space-md)" }}>
              <h2 style={cardTitleStyle}>기간</h2>
              <label style={fieldStyle}>
                <span style={labelStyle}>리포트 단위</span>
                <select name="period" defaultValue={recentReport.period} style={selectStyle} aria-label="리포트 단위">
                  <option value="week">주간</option>
                  <option value="month">월간</option>
                  <option value="quarter">분기</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>기간 라벨</span>
                <Input name="periodLabel" defaultValue={recentReport.periodLabel} required />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-sm)" }}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>시작</span>
                  <Input name="periodStart" type="datetime-local" defaultValue={toDateTimeLocalInput(recentReport.periodStart)} required />
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>종료</span>
                  <Input name="periodEnd" type="datetime-local" defaultValue={toDateTimeLocalInput(recentReport.periodEnd)} required />
                </label>
              </div>
            </Card>

            <Card style={{ display: "grid", gap: "var(--space-md)" }}>
              <h2 style={cardTitleStyle}>담당 스코프</h2>
              <label style={fieldStyle}>
                <span style={labelStyle}>건물명</span>
                <Input name="buildingName" defaultValue={recentReport.scope.buildingName} required />
              </label>
              <input type="hidden" name="buildingId" value={recentReport.scope.buildingId} />
              <input type="hidden" name="unitIds" value={recentReport.scope.unitIds?.join(",") ?? ""} />
              <div style={mutedStyle}>조회·목록·드릴다운·내보내기는 서버 담당 건물 범위로 제한합니다.</div>
            </Card>

            <Card style={{ display: "grid", gap: "var(--space-md)" }}>
              <h2 style={cardTitleStyle}>보고 수신자</h2>
              <label style={fieldStyle}>
                <span style={labelStyle}>수신자</span>
                <select name="recipientId" defaultValue={recentReport.recipient?.id ?? recipients[0]?.id} style={selectStyle} aria-label="보고 수신자">
                  {recipients.map((recipient) => (
                    <option key={recipient.id} value={recipient.id}>
                      {recipient.name} · {recipient.delivery === "external" ? "외부 전달" : "계정 전달"}
                    </option>
                  ))}
                </select>
              </label>
              {recipients.map((recipient) => (
                <div key={recipient.id} style={rowStyle}>
                  <span>{recipient.name}</span>
                  <Badge emphasis={recipient.delivery === "external"}>{recipient.delivery === "external" ? "외부 전달" : "계정 전달"}</Badge>
                </div>
              ))}
            </Card>
          </Grid>

          <Section title="포함 섹션">
            <Grid min={180}>
              {sections.map((section) => (
                <Card key={section} style={{ minHeight: 72, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
                  <span style={{ fontWeight: 800 }}>{section}</span>
                  <Badge>포함</Badge>
                </Card>
              ))}
            </Grid>
          </Section>

          <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-lg)", alignItems: "center", background: "var(--surface-container-high)" }}>
            <div>
              <div style={{ fontWeight: 850 }}>기준시점 미리보기</div>
              <div style={mutedStyle}>{formatDateTime(recentReport.snapshotAt)} 시점 원본 기준으로 생성합니다. 리포트 미납액은 스냅샷이며, 독촉은 M-BILL에서 실시간 대조합니다.</div>
            </div>
          <Button type="submit">리포트 생성</Button>
          </Card>
        </div>
      </form>
    </PageStack>
  );
}

function readReportPeriod(value: FormDataEntryValue | null) {
  const period = String(value ?? "");

  if (period === "week" || period === "month" || period === "quarter") {
    return period;
  }

  return "month";
}

function readRequiredFormValue(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();

  if (!value) {
    throw new Error(`Missing manager report form value: ${name}`);
  }

  return value;
}

function readDateTimeFormValue(formData: FormData, name: string) {
  const value = readRequiredFormValue(formData, name);

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return `${value}:00+09:00`;
  }

  return value;
}

function readCsvFormValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function readReportRecipient(value: FormDataEntryValue | null): Promise<ReportRecipient | undefined> {
  const recipientId = String(value ?? "").trim();
  const { recipients } = await getReportCreateData();

  return recipients.find((recipient) => recipient.id === recipientId) ?? recipients[0];
}

function toDateTimeLocalInput(iso: string) {
  return iso.replace(/([+-]\d\d:\d\d|Z)$/, "").slice(0, 16);
}

const cardTitleStyle = { margin: 0, fontSize: "var(--fs-subtitle)", fontWeight: 850 } as const;
const fieldStyle = { display: "grid", gap: "var(--space-xs)" } as const;
const labelStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", fontWeight: 800 } as const;
const mutedStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" } as const;
const rowStyle = { display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center", padding: "var(--space-sm) 0", borderBottom: "1px solid var(--border)" } as const;
const selectStyle = {
  minHeight: 44,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  padding: "0 var(--space-md)",
  font: "inherit",
} as const;
