import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(__dirname, "report-api.ts"), "utf8");

test("report API is wired to authenticated manager report backend endpoints", () => {
  assert.match(source, /from "\.\/server-api"/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_API_URL/);
  assert.doesNotMatch(source, /\/reports\/manager/);
  assert.match(source, /manager\/reports/);
  assert.match(source, /source-references/);
  assert.match(source, /external-shares/);
  assert.match(source, /audit-log/);
  assert.match(source, /reports\/external/);
  assert.match(source, /serverFetch<Report\[\]>\(reportPaths\.reports\(\)\)/);
});

test("report demo fallback is disabled in production unless explicitly enabled", () => {
  assert.match(source, /ROOMLOG_REPORT_DEMO_FALLBACK/);
  assert.match(source, /process\.env\.NODE_ENV === "production"/);
  assert.match(source, /throw error/);
});

test("report reads do not create reports as a hidden side effect", () => {
  assert.doesNotMatch(source, /fetchOrCreateReports/);
  assert.doesNotMatch(source, /createDefaultReport/);
  assert.match(source, /export function createManagerReport/);
});

test("report delivery reads do not create or view external shares", () => {
  const deliverySource = source.slice(
    source.indexOf("export function getReportDelivery"),
    source.indexOf("export function getReportChat"),
  );

  assert.doesNotMatch(deliverySource, /method: "POST"/);
  assert.doesNotMatch(deliverySource, /externalReport/);
  assert.match(deliverySource, /fetchDeliveryAuditLog/);
  assert.match(source, /export function createReportExternalShare/);
});
