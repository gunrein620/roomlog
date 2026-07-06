import { redirect } from "next/navigation";
import { createReportExternalShare, getReport, getReportDelivery } from "@/lib/report-api";
import { MANAGER_REPORT_ROUTES, reportHref } from "@/lib/report-nav";
import { Badge, Button, Card } from "@roomlog/ui";
import { Grid, LinkButton, PageStack, ScreenHeader, Section, formatDateTime } from "../_components";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string }>;

function reportExportHref(format: "pdf" | "csv", reportId: string) {
  return `/manager/report/03/export?id=${encodeURIComponent(reportId)}&format=${format}`;
}

async function createExternalShareAction(formData: FormData) {
  "use server";

  const reportId = String(formData.get("reportId") ?? "");
  const recipientName = String(formData.get("recipientName") ?? "").trim();

  if (!reportId) {
    redirect(MANAGER_REPORT_ROUTES["M-RPT-00"]);
  }

  await createReportExternalShare(reportId, recipientName);
  redirect(reportHref("M-RPT-03", reportId));
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const report = await getReport(id);
  const delivery = await getReportDelivery(report.id);

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-RPT-03"
        title="임대인 보고·내보내기"
        subtitle={`${report.periodLabel} · ${delivery.recipient.name}`}
        actions={<LinkButton href={reportHref("M-RPT-02", report.id)} variant="secondary">상세로</LinkButton>}
      />

      <Grid>
        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <h2 style={cardTitleStyle}>형식</h2>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <LinkButton href={reportExportHref("pdf", report.id)} variant="secondary">PDF 내보내기</LinkButton>
            <LinkButton href={reportExportHref("csv", report.id)} variant="secondary">Excel 내보내기</LinkButton>
            <Badge emphasis>링크 전달</Badge>
          </div>
        </Card>
        <Card style={{ display: "grid", gap: "var(--space-md)", border: "1.5px solid var(--primary)" }}>
          <h2 style={cardTitleStyle}>마스킹</h2>
          <Badge emphasis>{delivery.masked ? "외부 공유 마스킹 강제" : "재확인 게이트 필요"}</Badge>
          <div style={mutedStyle}>임차인 실명·계좌·연락처는 외부 공유 시 기본 포함하지 않습니다.</div>
        </Card>
        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <h2 style={cardTitleStyle}>수신자</h2>
          <div style={{ fontWeight: 850 }}>{delivery.recipient.name}</div>
          <div style={mutedStyle}>{delivery.recipient.delivery === "external" ? "외부 전달" : "룸로그 계정 전달"}</div>
        </Card>
      </Grid>

      <Section title="권한·책임 확인">
        <Card style={{ lineHeight: "var(--lh-body)", background: "var(--surface-container-high)" }}>
          이 화면은 보고 전달과 내보내기 확정만 처리합니다. 독촉·공지 발송은 하지 않으며, 금액성 후속 조치는 M-BILL 원본 행 대조 뒤 확정합니다.
        </Card>
      </Section>

      <Section title="감사 로그">
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {delivery.auditLog.map((entry) => (
            <Card key={`${entry.action}-${entry.at}`} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-md)", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 850 }}>{entry.action}</div>
                <div style={mutedStyle}>{entry.actor} · {entry.detail}</div>
              </div>
              <Badge>{formatDateTime(entry.at)}</Badge>
            </Card>
          ))}
        </div>
      </Section>

      <Card style={{ display: "flex", justifyContent: "flex-end" }}>
        <form action={createExternalShareAction}>
          <input type="hidden" name="reportId" value={report.id} />
          <input type="hidden" name="recipientName" value={delivery.recipient.name} />
          <Button type="submit">마스킹 공유 링크 생성</Button>
        </form>
      </Card>
    </PageStack>
  );
}

const cardTitleStyle = { margin: 0, fontSize: "var(--fs-subtitle)", fontWeight: 850 } as const;
const mutedStyle = { color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" } as const;
