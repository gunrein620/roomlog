import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const workspacePath = path.join(
  process.cwd(),
  "src/app/gara/GaraPayoutWorkspace.tsx",
);

test("Gara shows linked accounts and each vendor cumulative credit", () => {
  const source = readFileSync(workspacePath, "utf8");

  assert.match(source, />연결 계정</);
  assert.match(source, />잔액</);
  assert.match(source, /vendor\.linkedAccount\.name/);
  assert.match(source, /vendor\.linkedAccount\.email/);
  assert.match(source, /vendor\.cumulativeCredit/);
});

test("Gara sends a payout request for only the selected row and a positive integer amount", () => {
  const source = readFileSync(workspacePath, "utf8");

  assert.match(source, /createGaraVendorPayoutRequest/);
  assert.match(source, /managerVendorId:\s*vendor\.id/);
  assert.match(
    source,
    /amount,[\s\S]*idempotencyKey:\s*crypto\.randomUUID\(\)/,
  );
  assert.match(source, /\^\\d\+\$/);
  assert.match(source, />발송</);
});

test("Gara never launches a Toss checkout or immediately debits credit", () => {
  const source = readFileSync(workspacePath, "utf8");

  assert.doesNotMatch(source, /requestManagerCardPayment/);
  assert.doesNotMatch(source, /createTossWidgets/);
  assert.doesNotMatch(source, /vendor-credit-checkouts/);
});
