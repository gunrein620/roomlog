import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const modalSource = readFileSync(
  join(root, "src/app/my/flows/TenantPaymentHistoryModal.tsx"),
  "utf8",
);
const cssSource = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("confirmed payment modal fetches six months and supports bounded retry states", () => {
  assert.match(modalSource, /paymentHistoryPresetRange\(6\)/);
  assert.match(modalSource, /\/api\/tenant\/bills\/history/);
  assert.match(modalSource, /toTenantPaymentHistory/);
  assert.match(modalSource, /confirmedPaymentLogs/);
  assert.match(modalSource, /확정된 납부 내역이 없습니다\./);
  assert.match(modalSource, /다시 시도/);
});

test("confirmed payment modal exposes accessible close behavior", () => {
  assert.match(modalSource, /role="dialog"/);
  assert.match(modalSource, /aria-modal="true"/);
  assert.match(modalSource, /aria-labelledby="tenant-payment-history-title"/);
  assert.match(modalSource, /event\.key === "Escape"/);
  assert.match(modalSource, /closeButtonRef\.current\?\.focus\(\)/);
});

test("confirmed payment modal styles use tokens instead of raw hex", () => {
  const modalCss = cssSource.match(
    /\.tenant-payment-history-backdrop\s*\{[\s\S]*?\.tenant-payment-history-retry\s*\{[\s\S]*?\}/,
  )?.[0];

  assert.ok(modalCss);
  assert.doesNotMatch(modalCss, /#[\da-f]{3,8}/i);
});
