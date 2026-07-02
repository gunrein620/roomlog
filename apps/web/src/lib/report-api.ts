import type { ChatMessage, FaqQuestion, Report, ReportDelivery, ReportRecipient } from "@roomlog/types";
import {
  DEMO_CHAT_MESSAGES,
  DEMO_DELIVERY,
  DEMO_FAQ,
  DEMO_RECIPIENTS,
  DEMO_REPORT_ID,
  DEMO_REPORTS,
} from "./demo-report";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
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

export function getReportHub(): Promise<ReportHubData> {
  return tryFetch("/reports/manager", {
    reports: DEMO_REPORTS,
    recipients: DEMO_RECIPIENTS,
    faq: DEMO_FAQ,
  });
}

export function getReportCreateData(): Promise<ReportCreateData> {
  return tryFetch("/reports/manager/create", {
    recipients: DEMO_RECIPIENTS,
    recentReport: DEMO_REPORTS[0],
  });
}

export function getReport(id = DEMO_REPORT_ID): Promise<Report> {
  const fallback = DEMO_REPORTS.find((report) => report.id === id) ?? DEMO_REPORTS[0];
  return tryFetch(`/reports/manager/${id}`, fallback);
}

export function getReportDelivery(reportId = DEMO_REPORT_ID): Promise<ReportDelivery> {
  return tryFetch(`/reports/manager/${reportId}/delivery`, DEMO_DELIVERY);
}

export function getReportChat(): Promise<ReportChatData> {
  return tryFetch("/reports/manager/chat", {
    scopeLabel: "담당 건물 · 연남 스테이",
    messages: DEMO_CHAT_MESSAGES,
    faq: DEMO_FAQ,
  });
}

export function getReportFaq(): Promise<FaqQuestion[]> {
  return tryFetch("/reports/manager/faq", DEMO_FAQ);
}

