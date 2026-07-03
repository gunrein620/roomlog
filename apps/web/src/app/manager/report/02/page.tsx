import { getReport } from "@/lib/report-api";
import { MANAGER_REPORT_ROUTES, sourceHref } from "@/lib/report-nav";
import { Card } from "@roomlog/ui";
import { KpiRow, LinkButton, NextActionList, PageStack, ScreenHeader, Section, SourceLink, TrustNotice, formatDateTime, scopeText } from "../_components";

export const dynamic = "force-dynamic";

export default async function Page() {
  const report = await getReport();

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-RPT-02"
        title={`${report.periodLabel} 운영 리포트`}
        subtitle={`${scopeText(report)} · 기준시점 ${formatDateTime(report.snapshotAt)} 스냅샷`}
        actions={
          <>
            <LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-04"]} variant="secondary">챗봇으로 묻기</LinkButton>
            <LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-03"]}>임대인 보고로</LinkButton>
          </>
        }
      />

      <TrustNotice>{report.disclaimer}</TrustNotice>

      <Section title="핵심 요약">
        <Card style={{ lineHeight: "var(--lh-body)", fontSize: "var(--fs-body)" }}>{report.summary}</Card>
      </Section>

      <Section title="다음 조치">
        <NextActionList actions={report.nextActions} />
      </Section>

      <Section title="섹션별 근거">
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {report.sections.map((section, index) => (
            <details key={section.key} open={index < 2} style={detailsStyle}>
              <summary style={summaryStyle}>
                <span>{section.title}</span>
                <SourceLink source={section.source} />
              </summary>
              <div style={{ display: "grid", gap: "var(--space-md)", padding: "0 var(--space-md) var(--space-md)" }}>
                <p style={{ margin: 0, color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>{section.summary}</p>
                <KpiRow kpis={section.kpis} />
                <a href={sourceHref(section.source)} style={basisLinkStyle}>
                  {section.source.basis}
                </a>
              </div>
            </details>
          ))}
        </div>
      </Section>
    </PageStack>
  );
}

const detailsStyle = { border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-container-lowest)" } as const;
const summaryStyle = { display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center", padding: "var(--space-md)", cursor: "pointer", fontWeight: 850 } as const;
const basisLinkStyle = { color: "var(--primary)", textDecoration: "none", fontSize: "var(--fs-caption)", fontWeight: 800 } as const;
