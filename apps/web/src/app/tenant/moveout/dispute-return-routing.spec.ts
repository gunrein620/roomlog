import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const recordsPageSource = readFileSync(join(__dirname, "01/page.tsx"), "utf8");
const settlementPageSource = readFileSync(join(__dirname, "03/page.tsx"), "utf8");
const disputePageSource = readFileSync(join(__dirname, "04/page.tsx"), "utf8");

test("tenant moveout disputes preserve whether the tenant entered from records or settlement", () => {
  assert.match(recordsPageSource, /from=records/);
  assert.match(settlementPageSource, /from=settlement/);
  assert.match(disputePageSource, /returnFrom/);
  assert.match(disputePageSource, /MOVEOUT_ROUTES\["T-OUT-03"\]/);
  assert.match(disputePageSource, /MOVEOUT_ROUTES\["T-OUT-01"\]/);
});
