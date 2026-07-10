import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type { Ticket } from "@roomlog/types";
import {
  countDefectStatuses,
  defectDisplayStatus,
  filterDefectRows,
  formatDefectDate,
  formatDefectMoney,
  paginateDefectRows,
  ticketStatusGroup,
  type DefectDashboardRow,
} from "./ticket-dashboard-model";
import { MANAGER_DEFECT_DASHBOARD_DEMO_ROWS } from "./manager-defect-dashboard-demo";

const ticket = (id: string, status: Ticket["status"]): Ticket => ({
  id,
  type: "defect",
  unitId: "302",
  title: id,
  description: id,
  status,
  urgency: 3,
  createdAt: "2026-07-10T09:00:00+09:00",
  updatedAt: "2026-07-10T09:00:00+09:00",
});

describe("manager defect dashboard model", () => {
  const rows: DefectDashboardRow[] = [
    { ticket: ticket("waiting", "received") },
    {
      ticket: ticket("processing", "processing"),
      repair: {
        id: "r1",
        ticketId: "processing",
        stage: "scheduled",
        vendorName: "우주설비",
        scheduledAt: "2026-07-11T10:00:00+09:00",
        quoteAmount: 100000,
      },
    },
    { ticket: ticket("done", "resolved") },
    { ticket: ticket("cancelled", "cancelled") },
  ];

  it("groups ticket states into the requested status chips", () => {
    assert.equal(ticketStatusGroup("info_requested"), "waiting");
    assert.equal(ticketStatusGroup("processing"), "in_progress");
    assert.equal(ticketStatusGroup("resolved"), "completed");
    assert.equal(ticketStatusGroup("cancelled"), "cancelled");
  });

  it("derives the table display status from ticket and repair progress", () => {
    assert.equal(defectDisplayStatus({ ticket: ticket("done", "resolved") }), "completed");
    assert.equal(
      defectDisplayStatus({
        ticket: ticket("vendor", "reviewing"),
        repair: { id: "r-vendor", ticketId: "vendor", stage: "quoted" },
      }),
      "vendor_selected",
    );
    assert.equal(
      defectDisplayStatus({
        ticket: ticket("repairing", "processing"),
        repair: { id: "r-repairing", ticketId: "repairing", stage: "in_progress" },
      }),
      "incomplete",
    );
    assert.equal(
      defectDisplayStatus({ ticket: ticket("cancelled", "cancelled") }),
      "cancelled",
    );
  });

  it("counts and filters live rows without fabricating periodic rows", () => {
    assert.deepEqual(countDefectStatuses(rows), {
      all: 4,
      waiting: 1,
      in_progress: 1,
      completed: 1,
      cancelled: 1,
      periodic: 0,
    });
    assert.deepEqual(
      filterDefectRows(rows, {
        status: "periodic",
        worker: "all",
        building: "all",
        template: "all",
      }),
      [],
    );
    assert.deepEqual(
      filterDefectRows(rows, {
        status: "in_progress",
        worker: "우주설비",
        building: "all",
        template: "defect",
      }).map((row) => row.ticket.id),
      ["processing"],
    );
  });

  it("clamps pagination to a valid page", () => {
    assert.deepEqual(paginateDefectRows(rows, 9, 2), {
      page: 2,
      totalPages: 2,
      rows: rows.slice(2),
    });
  });

  it("filters rows by their displayed building name", () => {
    assert.deepEqual(
      filterDefectRows(MANAGER_DEFECT_DASHBOARD_DEMO_ROWS, {
        status: "all",
        worker: "all",
        building: "세움타워",
        template: "all",
      }).map((row) => row.ticket.id),
      ["demo-defect-01", "demo-defect-02", "demo-defect-06", "demo-defect-08"],
    );
  });

  it("formats scheduled dates and quote amounts without inventing missing values", () => {
    assert.equal(formatDefectDate("2026-07-11T10:00:00+09:00"), "07. 11. 오전 10:00");
    assert.equal(formatDefectDate(), "—");
    assert.equal(formatDefectMoney(100000), "100,000");
    assert.equal(formatDefectMoney(), "—");
  });
});
