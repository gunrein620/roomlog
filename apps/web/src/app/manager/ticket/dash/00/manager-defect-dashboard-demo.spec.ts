import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { MANAGER_DEFECT_DASHBOARD_DEMO_ROWS } from "./manager-defect-dashboard-demo";

describe("manager defect dashboard demo rows", () => {
  it("provides ten clearly labelled dashboard-only demo rows", () => {
    assert.equal(MANAGER_DEFECT_DASHBOARD_DEMO_ROWS.length, 10);
    assert.equal(
      MANAGER_DEFECT_DASHBOARD_DEMO_ROWS.every((row) =>
        row.ticket.title.startsWith("더미 · "),
      ),
      true,
    );
    assert.equal(
      new Set(MANAGER_DEFECT_DASHBOARD_DEMO_ROWS.map((row) => row.ticket.id)).size,
      10,
    );
    assert.equal(
      MANAGER_DEFECT_DASHBOARD_DEMO_ROWS.every((row) => row.isDemo === true),
      true,
    );
  });
});
