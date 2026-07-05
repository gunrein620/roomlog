import type {
  AuditLogEntry,
  ChatAnswer,
  ChatMessage,
  FaqQuestion,
  Report,
  ReportDelivery,
  ReportRecipient,
} from "@roomlog/types";
import {
  DEMO_CHAT_MESSAGES,
  DEMO_DELIVERY,
  DEMO_FAQ,
  DEMO_RECIPIENTS,
  DEMO_REPORT_ID,
  DEMO_REPORTS,
} from "./demo-report";
import { serverFetch } from "./server-api";

type CreateManagerReportInput = Pick<Report, "period" | "periodLabel" | "periodStart" | "periodEnd" | "scope"> & {
  recipient?: ReportRecipient;
};

type ManagerReportExternalShare = {
  id: string;
  token: string;
};

type ManagerReportAuditLogEntry = {
  action: string;
  actorLabel: string;
  at: string;
  detail?: string;
};

export const reportPaths = {
  reports: () => "/manager/reports",
  report: (reportId: string) => `/manager/reports/${encodeURIComponent(reportId)}`,
  sourceReferences: (reportId: string) => `/manager/reports/${encodeURIComponent(reportId)}/source-references`,
  chat: (reportId: string) => `/manager/reports/${encodeURIComponent(reportId)}/chat`,
  externalShares: (reportId: string) => `/manager/reports/${encodeURIComponent(reportId)}/external-shares`,
  auditLog: (reportId: string) => `/manager/reports/${encodeURIComponent(reportId)}/audit-log`,
  externalReport: (shareToken: string) => `/reports/external/${encodeURIComponent(shareToken)}`,
} as const;

const defaultReportInput: CreateManagerReportInput = {
  period: "month",
  periodLabel: "2026년 6월",
  periodStart: "2026-06-01T00:00:00+09:00",
  periodEnd: "2026-06-30T23:59:59+09:00",
  scope: {
    buildingId: "정글빌라",
    buildingName: "정글빌라",
  },
  recipient: DEMO_RECIPIENTS[0],
};

async function apiOrFallback<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!shouldUseReportDemoFallback()) {
      throw error;
    }

    if (process.env.NODE_ENV !== "test") {
      console.warn(`[report-api] using demo fallback: ${errorMessage(error)}`);
    }
    return fallback;
  }
}

function shouldUseReportDemoFallback(): boolean {
  if (process.env.ROOMLOG_REPORT_DEMO_FALLBACK === "true") {
    return true;
  }

  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ReportHubData {
  reports: Report[];
  recipients: ReportRecipient[];
  faq: FaqQuestion[];
}

export interface ReportCreateData {
  recipients: ReportRecipient[];
  recentReport: Report;
}

export interface ReportChatData {
  scopeLabel: string;
  messages: ChatMessage[];
  faq: FaqQuestion[];
}

export async function getReportHub(): Promise<ReportHubData> {
  return apiOrFallback(async () => {
    const reports = await fetchReports();

    return {
      reports,
      recipients: recipientsFor(reports[0]),
      faq: DEMO_FAQ,
    };
  }, {
    reports: DEMO_REPORTS,
    recipients: DEMO_RECIPIENTS,
    faq: DEMO_FAQ,
  });
}

export async function getReportCreateData(): Promise<ReportCreateData> {
  return apiOrFallback(async () => {
    const reports = await fetchReports();
    const recentReport = reports[0] ? await getReportDetail(reports[0].id) : DEMO_REPORTS[0];

    return {
      recipients: recipientsFor(recentReport),
      recentReport,
    };
  }, {
    recipients: DEMO_RECIPIENTS,
    recentReport: DEMO_REPORTS[0],
  });
}

export function getReport(id = DEMO_REPORT_ID): Promise<Report> {
  const fallback = DEMO_REPORTS.find((report) => report.id === id) ?? DEMO_REPORTS[0];
  return apiOrFallback(() => getCurrentReport(id), fallback);
}

export function getReportDelivery(reportId = DEMO_REPORT_ID): Promise<ReportDelivery> {
  return apiOrFallback(async () => {
    const report = await getCurrentReport(reportId);
    const auditLog = await fetchDeliveryAuditLog(report.id, []);

    return {
      reportId: report.id,
      format: "link",
      masked: true,
      recipient: report.recipient ?? DEMO_RECIPIENTS[0],
      auditLog,
    };
  }, DEMO_DELIVERY);
}

export function getReportChat(reportId = DEMO_REPORT_ID): Promise<ReportChatData> {
  return apiOrFallback(async () => {
    const report = await getCurrentReport(reportId);
    const question = DEMO_FAQ[0]?.query ?? "이번 달 미납 세대 알려줘";
    const answer = await serverFetch<ChatAnswer>(reportPaths.chat(report.id), {
      method: "POST",
      body: JSON.stringify({ question }),
    });

    return {
      scopeLabel: `담당 건물 · ${report.scope.buildingName}`,
      messages: [
        {
          id: `${answer.id}-question`,
          role: "user",
          text: question,
        },
        {
          id: answer.id,
          role: "assistant",
          text: "",
          answer,
        },
      ],
      faq: DEMO_FAQ,
    };
  }, {
    scopeLabel: "담당 건물 · 연남 스테이",
    messages: DEMO_CHAT_MESSAGES,
    faq: DEMO_FAQ,
  });
}

export function createReportExternalShare(
  reportId: string,
  recipientName: string
): Promise<ManagerReportExternalShare> {
  return serverFetch<ManagerReportExternalShare>(reportPaths.externalShares(reportId), {
    method: "POST",
    body: JSON.stringify({ recipientName }),
  });
}

export function getReportFaq(): Promise<FaqQuestion[]> {
  return Promise.resolve(DEMO_FAQ);
}

export function createManagerReport(input: CreateManagerReportInput = defaultReportInput): Promise<Report> {
  return serverFetch<Report>(reportPaths.reports(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

async function fetchReports(): Promise<Report[]> {
  return serverFetch<Report[]>(reportPaths.reports());
}

async function getCurrentReport(reportId?: string): Promise<Report> {
  if (reportId && reportId !== DEMO_REPORT_ID) {
    return getReportDetail(reportId);
  }

  const reports = await fetchReports();
  const report = reports[0];

  if (!report) {
    throw new Error("No manager report is available.");
  }

  return getReportDetail(report.id);
}

async function getReportDetail(reportId: string): Promise<Report> {
  const [report] = await Promise.all([
    serverFetch<Report>(reportPaths.report(reportId)),
    serverFetch<unknown[]>(reportPaths.sourceReferences(reportId)),
  ]);

  return report;
}
function recipientsFor(report?: Report): ReportRecipient[] {
  if (!report?.recipient) {
    return DEMO_RECIPIENTS;
  }

  return [
    report.recipient,
    ...DEMO_RECIPIENTS.filter((recipient) => recipient.id !== report.recipient?.id),
  ];
}

async function fetchDeliveryAuditLog(reportId: string, fallback: AuditLogEntry[]): Promise<AuditLogEntry[]> {
  const auditLog = await serverFetch<ManagerReportAuditLogEntry[]>(reportPaths.auditLog(reportId));

  if (auditLog.length === 0) {
    return fallback;
  }

  return auditLog.map((entry) => ({
    action: auditActionLabel(entry.action),
    actor: entry.actorLabel,
    at: entry.at,
    detail: entry.detail,
  }));
}

function auditActionLabel(action: string): string {
  switch (action) {
    case "external_share_created":
      return "외부 공유 생성";
    case "external_share_viewed":
      return "외부 공유 조회";
    case "external_share_revoked":
      return "외부 공유 폐기";
    default:
      return action;
  }
}
