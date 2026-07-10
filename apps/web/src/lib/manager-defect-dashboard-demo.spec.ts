import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MANAGER_DEFECT_DASHBOARD_DEMO_RECORDS,
  managerDefectDashboardDemoRecord,
} from "./manager-defect-dashboard-demo";

const managerApiSource = readFileSync(join(__dirname, "ticket-manager-api.ts"), "utf8");

describe("manager defect dashboard shared demo records", () => {
  it("resolves every dashboard demo id to matching detail data", () => {
    assert.equal(MANAGER_DEFECT_DASHBOARD_DEMO_RECORDS.length, 50);
    assert.equal(
      MANAGER_DEFECT_DASHBOARD_DEMO_RECORDS.at(-1)?.ticket.id,
      "demo-defect-50",
    );

    for (const record of MANAGER_DEFECT_DASHBOARD_DEMO_RECORDS) {
      const resolved = managerDefectDashboardDemoRecord(record.ticket.id);

      assert.equal(resolved?.ticket.id, record.ticket.id);
      assert.equal(resolved?.analysis.ticketId, record.ticket.id);
      assert.equal(resolved?.repair.ticketId, record.ticket.id);
    }
  });

  it("uses the shared record for every manager detail read", () => {
    assert.equal(
      (managerApiSource.match(/managerDefectDashboardDemoRecord\(/g) ?? []).length,
      3,
    );
  });
});
