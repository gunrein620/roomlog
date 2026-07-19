import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(
  join(process.cwd(), "src/app/manager/_components/ManagerCreditUtility.tsx"),
  "utf8",
);
const eventSource = readFileSync(
  join(process.cwd(), "src/lib/vendor-credit-events.ts"),
  "utf8",
);

test("refreshes the manager credit header when its credit balance changes over realtime", () => {
  assert.match(source, /getRealtimeSocket/);
  assert.match(source, /socket\.on\("manager:credit-updated", refreshFromWorkspace\)/);
  assert.match(source, /socket\.off\("manager:credit-updated", refreshFromWorkspace\)/);
  assert.match(source, /socket\.on\("connect", refreshFromWorkspace\)/);
  assert.match(source, /socket\.off\("connect", refreshFromWorkspace\)/);
});

test("pre-fills the credit top-up dialog from a shortfall request", () => {
  assert.match(eventSource, /openManagerCreditTopup\(amount\?: number\)/);
  assert.match(eventSource, /new CustomEvent\(OPEN_MANAGER_CREDIT_TOPUP_EVENT/);
  assert.match(source, /event\.detail\?\.amount/);
  assert.match(source, /setAmountText\(String\(amount\)\)/);
});
