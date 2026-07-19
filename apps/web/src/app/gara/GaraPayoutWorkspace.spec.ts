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

test("Gara starts checkout for only the selected row and a positive integer amount", () => {
  const source = readFileSync(workspacePath, "utf8");

  assert.match(source, /createGaraVendorCreditCheckout/);
  assert.match(source, /managerVendorId:\s*vendor\.id/);
  assert.match(
    source,
    /amount,[\s\S]*creationKey:\s*crypto\.randomUUID\(\)/,
  );
  assert.match(source, /\^\\d\+\$/);
  assert.match(source, /requestManagerCardPayment/);
  assert.match(source, /\/gara\/payment\/success/);
  assert.match(source, /\/gara\/payment\/fail/);
});

test("Gara cancels the created checkout when Toss launch fails", () => {
  const source = readFileSync(workspacePath, "utf8");

  assert.match(source, /cancelGaraVendorCreditCheckout/);
  assert.match(source, /createdCheckout\.order\.orderId/);
  assert.doesNotMatch(source, /createGaraPayoutAction/);
  assert.doesNotMatch(source, /useActionState/);
});
