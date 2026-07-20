import assert from "node:assert/strict";
import test from "node:test";
import { rentalReportCsv } from "./rental-report-csv";

test("임대 현황 CSV는 실제 수납액과 비율 원천값을 그대로 내보낸다", () => {
  const csv = rentalReportCsv({
    periodMonths: 6,
    points: [
      {
        month: "2026-07",
        collectedAmount: 275_000,
        repairCostAmount: 48_000,
        occupancyRate: 0.875,
        ticketResolutionRate: null
      }
    ]
  });

  assert.match(csv, /"실제 수납액\(원\)"/);
  assert.match(csv, /"2026-07","275000","48000","87.5",""/);
});
