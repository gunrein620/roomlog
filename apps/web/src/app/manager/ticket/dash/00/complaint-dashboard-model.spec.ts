import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type { Ticket } from "@roomlog/types";
import {
  buildComplaintCalendar,
  buildComplaintDashboard,
  serializeComplaintDashboardCsv,
} from "./complaint-dashboard-model";
import type { DefectDashboardRow } from "./ticket-dashboard-model";

function complaint(
  id: string,
  createdAt: string,
  status: Ticket["status"],
  title: string,
): DefectDashboardRow {
  return {
    buildingName: "우주빌딩",
    ticket: {
      id,
      type: "complaint",
      unitId: "302",
      title,
      description: title,
      status,
      urgency: 3,
      createdAt,
      updatedAt: createdAt,
    },
  };
}

describe("complaint dashboard model", () => {
  const month = new Date("2026-07-01T00:00:00+09:00");
  const rows = [
    complaint("new", "2026-07-28T09:00:00+09:00", "processing", "주차 소음 민원"),
    complaint("old", "2026-07-02T09:00:00+09:00", "resolved", "수전 수리 요청"),
    complaint("previous", "2026-06-10T09:00:00+09:00", "received", "관리비 결제 문의"),
    {
      ...complaint("defect", "2026-07-20T09:00:00+09:00", "received", "누수 하자"),
      ticket: {
        ...complaint("defect", "2026-07-20T09:00:00+09:00", "received", "누수 하자").ticket,
        type: "defect" as const,
      },
    },
  ];

  it("summarizes only the selected month complaint rows", () => {
    const dashboard = buildComplaintDashboard(rows, month);

    assert.deepEqual(dashboard.summary, {
      total: 2,
      inProgress: 1,
      waiting: 0,
      completed: 1,
      change: 100,
    });
    assert.deepEqual(dashboard.recent.map((row) => row.ticket.id), ["new", "old"]);
    assert.deepEqual(
      dashboard.categories.map((category) => [category.id, category.count]),
      [["repair", 1], ["noise", 1], ["billing", 0], ["other", 0]],
    );
  });

  it("builds a six month trend and a CSV report", () => {
    const dashboard = buildComplaintDashboard(rows, month);

    assert.equal(dashboard.trend.length, 6);
    assert.deepEqual(dashboard.trend.at(-1), { label: "7월", count: 2, current: true });
    assert.match(serializeComplaintDashboardCsv(rows, month), /유형,내용,건물\/호실,접수일,상태/);
    assert.match(serializeComplaintDashboardCsv(rows, month), /소음 민원/);
    assert.doesNotMatch(serializeComplaintDashboardCsv(rows, month), /누수 하자/);
  });

  it("builds a six-week calendar and summarizes a selected day", () => {
    const days = buildComplaintCalendar(month);
    assert.equal(days.length, 42);
    assert.equal(days.filter((day) => day.inCurrentMonth).length, 31);

    const selectedDate = new Date("2026-07-28T12:00:00+09:00");
    const dashboard = buildComplaintDashboard(rows, month, selectedDate);

    assert.equal(dashboard.monthLabel, "2026.07.28");
    assert.equal(dashboard.summary.total, 1);
    assert.deepEqual(dashboard.recent.map((row) => row.ticket.id), ["new"]);
    assert.equal(dashboard.comparisonLabel, "전일 대비");
    assert.equal(dashboard.trend.at(-1)?.count, 2);
    assert.match(serializeComplaintDashboardCsv(rows, month, selectedDate), /소음 민원/);
    assert.doesNotMatch(serializeComplaintDashboardCsv(rows, month, selectedDate), /수전 수리 요청/);
  });
});
