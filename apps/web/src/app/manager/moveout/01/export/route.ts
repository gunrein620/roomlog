import type { MoveoutRecordItem, ReportAuditEntry, WearAdjustmentAction, WearVerdict } from "@roomlog/types";
import { DEMO_MOVEOUT_ID } from "@/lib/demo-moveout";
import { getMoveout, getRecords, getReportAudit } from "@/lib/moveout-manager-api";

export const dynamic = "force-dynamic";

const sourceLabel: Record<MoveoutRecordItem["source"], string> = {
  movein_photo: "입주전 사진",
  defect: "하자",
  repair: "수리",
  payment: "납부",
  chat: "채팅",
  contract: "계약서",
};

const wearLabel: Record<WearVerdict, string> = {
  aging_likely: "노후·마모 가능",
  damage_possible: "훼손 추정",
  unclear: "확인 필요",
};

const actionLabel: Record<WearAdjustmentAction, string> = {
  keep: "유지",
  adjust: "조정",
  reinforce: "근거 보강",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const moveoutId = url.searchParams.get("id")?.trim() || DEMO_MOVEOUT_ID;
  const format = url.searchParams.get("format") === "csv" ? "csv" : "pdf";
  const [moveout, records, audit] = await Promise.all([
    getMoveout(moveoutId),
    getRecords(moveoutId),
    getReportAudit(moveoutId),
  ]);

  if (format === "csv") {
    return new Response(toCsv(records, audit), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="moveout-${moveout.id}-records.csv"`,
      },
    });
  }

  return new Response(toPrintHtml(moveout.unitId, records, audit), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="moveout-${moveout.id}-records-print.html"`,
    },
  });
}

function toCsv(records: MoveoutRecordItem[], audit: ReportAuditEntry[]) {
  const rows = [
    ["구분", "제목", "설명", "판정", "입주전 비교", "근거", "상세"],
    ...records.map((record) => [
      sourceLabel[record.source],
      record.title,
      record.description,
      record.wearVerdict ? wearLabel[record.wearVerdict] : "",
      record.moveinComparisonAvailable ? "가능" : "근거 없음",
      (record.evidenceUrls ?? []).join("\n"),
      detailText(record),
    ]),
    [],
    ["감사로그", "대상", "액션", "근거", "임차인 통지", "관리인", "시각"],
    ...audit.map((entry) => [
      "감사로그",
      entry.recordItemId,
      actionLabel[entry.action],
      entry.evidenceNote,
      entry.tenantNotified ? "있음" : "없음",
      entry.managerName,
      entry.at,
    ]),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
}

function toPrintHtml(unitId: string, records: MoveoutRecordItem[], audit: ReportAuditEntry[]) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(unitId)}호 퇴실 기록 리포트</title>
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 32px; }
    h1 { font-size: 24px; margin: 0 0 16px; }
    section { margin-top: 24px; }
    article { border: 1px solid currentColor; border-radius: 8px; padding: 12px; margin-top: 10px; break-inside: avoid; }
    .meta { font-size: 12px; opacity: 0.72; }
    img { max-width: 220px; max-height: 160px; object-fit: contain; border: 1px solid currentColor; border-radius: 6px; margin-top: 8px; }
    @media print { button { display: none; } body { margin: 18mm; } }
  </style>
</head>
<body>
  <button onclick="window.print()">PDF로 저장</button>
  <h1>${escapeHtml(unitId)}호 퇴실 기록 리포트</h1>
  <p>참고자료이며 최종 정산은 관리자 확인 후 확정됩니다.</p>
  <section>
    <h2>누적 기록</h2>
    ${records.map(recordHtml).join("")}
  </section>
  <section>
    <h2>감사로그</h2>
    ${audit.length ? audit.map(auditHtml).join("") : "<p>기록된 감사로그가 없습니다.</p>"}
  </section>
</body>
</html>`;
}

function recordHtml(record: MoveoutRecordItem) {
  const media = [
    ...(record.detail?.media?.map((item) => item.url) ?? []),
    ...(record.evidenceUrls ?? []),
  ];

  return `<article>
    <div class="meta">${escapeHtml(sourceLabel[record.source])} · ${escapeHtml(record.occurredAt?.slice(0, 10) ?? "날짜 없음")}</div>
    <h3>${escapeHtml(record.title)}</h3>
    <p>${escapeHtml(record.description)}</p>
    <p>${escapeHtml(record.wearVerdict ? wearLabel[record.wearVerdict] : "판정 없음")} · 입주전 비교 ${record.moveinComparisonAvailable ? "가능" : "근거 없음"}</p>
    <p>${escapeHtml(detailText(record))}</p>
    ${media.map((url) => `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(record.title)} 근거" />`).join("")}
  </article>`;
}

function auditHtml(entry: ReportAuditEntry) {
  return `<article>
    <div class="meta">${escapeHtml(entry.at.slice(0, 16).replace("T", " "))} · ${escapeHtml(entry.managerName)}</div>
    <h3>${escapeHtml(actionLabel[entry.action])} · ${escapeHtml(entry.recordItemId)}</h3>
    <p>${escapeHtml(entry.evidenceNote)}</p>
    <p>임차인 통지 기록: ${entry.tenantNotified ? "있음" : "없음"}</p>
  </article>`;
}

function detailText(record: MoveoutRecordItem) {
  const sectionText = (record.detailSections ?? [])
    .flatMap((section) => section.items.map((item) => `${section.label} - ${item.label}: ${item.value}`));
  const sourceDetailText = [
    record.detail?.summary,
    ...(record.detail?.chatMessages?.map((message) => `${message.senderLabel}: ${message.body}`) ?? []),
    ...(record.detail?.events?.map((event) => `${event.label}: ${event.note ?? event.status ?? ""}`) ?? []),
    ...(record.detail?.amounts?.map((amount) => `${amount.label}: ${amount.amount ?? `${amount.min ?? ""}~${amount.max ?? ""}`}`) ?? []),
    ...(record.detail?.clauses?.map((clause) => `${clause.title}: ${clause.body}`) ?? []),
  ].filter(Boolean);

  return [...sectionText, ...sourceDetailText].join("\n");
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

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
