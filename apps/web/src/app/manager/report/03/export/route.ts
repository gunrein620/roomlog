import type { AuditLogEntry, Report, ReportDelivery, ReportSection } from "@roomlog/types";
import { DEMO_REPORT_ID } from "@/lib/demo-report";
import { getReport, getReportDelivery } from "@/lib/report-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reportId = url.searchParams.get("id")?.trim() || DEMO_REPORT_ID;
  const format = url.searchParams.get("format") === "csv" ? "csv" : "pdf";
  const report = await getReport(reportId);
  const delivery = await getReportDelivery(report.id);

  if (format === "csv") {
    return new Response(toCsv(report, delivery), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="manager-report-${report.id}.csv"`,
      },
    });
  }

  return new Response(toPrintHtml(report, delivery), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="manager-report-${report.id}-print.html"`,
    },
  });
}

function toCsv(report: Report, delivery: ReportDelivery) {
  const rows = [
    ["기간", "범위", "기준시점", "상태", "수신자"],
    [
      report.periodLabel,
      scopeText(report),
      report.snapshotAt,
      report.status,
      delivery.recipient.name,
    ],
    [],
    ["요약"],
    [report.summary],
    [],
    ["섹션", "요약", "출처", "근거", "KPI"],
    ...report.sections.map((section) => [
      section.title,
      section.summary,
      section.source.label,
      section.source.basis,
      kpiText(section),
    ]),
    [],
    ["다음 조치", "유형", "대상", "기간", "메모"],
    ...report.nextActions.map((action) => [
      action.label,
      action.actionType,
      action.payload.unitIds?.join("\n") ?? "",
      action.payload.periodLabel ?? "",
      action.payload.note ?? "",
    ]),
    [],
    ["감사로그", "수행자", "상세", "시각"],
    ...delivery.auditLog.map((entry) => [
      entry.action,
      entry.actor,
      entry.detail ?? "",
      entry.at,
    ]),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
}

function toPrintHtml(report: Report, delivery: ReportDelivery) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.periodLabel)} 관리 리포트</title>
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 32px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    section { margin-top: 24px; }
    article { border: 1px solid currentColor; border-radius: 8px; padding: 12px; margin-top: 10px; break-inside: avoid; }
    .meta { font-size: 12px; opacity: 0.72; }
    @media print { button { display: none; } body { margin: 18mm; } }
  </style>
</head>
<body>
  <button onclick="window.print()">PDF로 저장</button>
  <h1>${escapeHtml(report.periodLabel)} 관리 리포트</h1>
  <p>${escapeHtml(scopeText(report))} · 기준시점 ${escapeHtml(report.snapshotAt)}</p>
  <p>${escapeHtml(report.disclaimer)}</p>
  <section>
    <h2>핵심 요약</h2>
    <p>${escapeHtml(report.summary)}</p>
  </section>
  <section>
    <h2>섹션별 근거</h2>
    ${report.sections.map(sectionHtml).join("")}
  </section>
  <section>
    <h2>다음 조치</h2>
    ${report.nextActions.map((action) => `<article><h3>${escapeHtml(action.label)}</h3><p>${escapeHtml(action.payload.note ?? "원본 행 대조 후 확정합니다.")}</p></article>`).join("")}
  </section>
  <section>
    <h2>보고·감사</h2>
    <p>수신자: ${escapeHtml(delivery.recipient.name)} · 마스킹: ${delivery.masked ? "적용" : "확인 필요"}</p>
    ${delivery.auditLog.length ? delivery.auditLog.map(auditHtml).join("") : "<p>기록된 감사 로그가 없습니다.</p>"}
  </section>
</body>
</html>`;
}

function sectionHtml(section: ReportSection) {
  return `<article>
    <div class="meta">${escapeHtml(section.source.label)} · ${escapeHtml(section.source.drilldownScreenId)}</div>
    <h3>${escapeHtml(section.title)}</h3>
    <p>${escapeHtml(section.summary)}</p>
    <p>${escapeHtml(section.source.basis)}</p>
    <p>${escapeHtml(kpiText(section))}</p>
  </article>`;
}

function auditHtml(entry: AuditLogEntry) {
  return `<article>
    <div class="meta">${escapeHtml(entry.at)}</div>
    <h3>${escapeHtml(entry.action)}</h3>
    <p>${escapeHtml(entry.actor)} · ${escapeHtml(entry.detail ?? "")}</p>
  </article>`;
}

function scopeText(report: Report) {
  const units = report.scope.unitIds?.length ? ` · ${report.scope.unitIds.join(", ")}호` : "";
  return `${report.scope.buildingName}${units}`;
}

function kpiText(section: ReportSection) {
  return section.kpis?.map((kpi) => `${kpi.label} ${kpi.value}`).join("\n") ?? "";
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
