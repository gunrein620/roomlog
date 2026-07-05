/**
 * 룸로그 셸 — 관리인 리포트(M-RPT) 화면ID → 라우트 매핑.
 * 스펙: roomlog_screens_report.md. 리포트는 임대인 보고용이고, 챗봇은 조회·초안까지만 담당한다.
 */

import type { ChatDraftSuggestion, ReportNextAction, ReportSource } from "@roomlog/types";

export const MANAGER_REPORT_ROUTES = {
  "M-RPT-00": "/manager/report/00",
  "M-RPT-01": "/manager/report/01",
  "M-RPT-02": "/manager/report/02",
  "M-RPT-03": "/manager/report/03",
  "M-RPT-04": "/manager/report/04",
  "M-RPT-05": "/manager/report/05",
  "M-RPT-E0": "/manager/report/e0",
} as const;

export type ManagerReportScreenId = keyof typeof MANAGER_REPORT_ROUTES;
export type ManagerReportRoute = (typeof MANAGER_REPORT_ROUTES)[ManagerReportScreenId];

export const MANAGER_REPORT_START = MANAGER_REPORT_ROUTES["M-RPT-00"];

export function routeFor(id: ManagerReportScreenId): ManagerReportRoute {
  return MANAGER_REPORT_ROUTES[id];
}

export function reportHref(id: ManagerReportScreenId, reportId?: string, question?: string): string {
  const route = routeFor(id);
  const params = new URLSearchParams();

  if (reportId) {
    params.set("id", reportId);
  }

  if (question?.trim()) {
    params.set("question", question.trim());
  }

  const query = params.toString();

  return query ? `${route}?${query}` : route;
}

export function sourceHref(source: ReportSource): string {
  switch (source.drilldownScreenId) {
    case "M-BILL-04":
      return "/manager/billing/overdue";
    case "M-BILL-05":
      return "/manager/billing/dunning/bill-2026-07-401";
    case "M-MSG-00":
      return "/manager/messaging/00";
    case "M-DASH-00":
      return "/manager/ticket/dash/00";
    case "M-COST-03":
      return "/manager/cost/03";
    case "M-OUT-01":
    case "M-DOC-03":
      return "/manager/home/03";
    case "M-HOME-02":
      return "/manager/home/02";
    default:
      return MANAGER_REPORT_ROUTES["M-RPT-00"];
  }
}

export function actionHref(action: ReportNextAction | ChatDraftSuggestion): string {
  void action;
  return "/manager/messaging/00";
}
