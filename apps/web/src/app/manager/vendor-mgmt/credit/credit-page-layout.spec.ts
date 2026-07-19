import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/manager/vendor-mgmt/credit/page.tsx"),
  "utf8",
);
const workspaceSource = readFileSync(
  join(process.cwd(), "src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx"),
  "utf8",
);
const garaPayoutSection = workspaceSource.slice(
  workspaceSource.indexOf("{workspace.garaPayoutRequests.map"),
  workspaceSource.indexOf("{workspace.paymentRequests.map"),
);

test("starts the credit page with payment policy instead of settlement overview", () => {
  assert.doesNotMatch(pageSource, /VendorScreenHeader/);
  assert.doesNotMatch(pageSource, /업체 정산/);
  assert.doesNotMatch(workspaceSource, /summaryStrip/);
  assert.doesNotMatch(workspaceSource, /현재 크레딧/);
  assert.doesNotMatch(workspaceSource, /충전 내역/);
  assert.doesNotMatch(workspaceSource, /topupOrders/);
  assert.match(workspaceSource, /자동결제 정책/);
  assert.match(workspaceSource, /업체 지급 요청/);
  assert.match(workspaceSource, /garaPayoutRequests/);
  assert.match(workspaceSource, /getRealtimeSocket/);
  assert.match(workspaceSource, /gara:payout-updated/);
  assert.match(workspaceSource, /manager:credit-updated/);
  assert.match(workspaceSource, /socket\.on\("manager:credit-updated", refreshWorkspace\)/);
  assert.match(workspaceSource, /socket\.off\("manager:credit-updated", refreshWorkspace\)/);
  assert.doesNotMatch(workspaceSource, /<h2>Gara 업체 지급 요청<\/h2>/);
});

test("keeps Gara payout cards focused on vendor, requested date, paid date, and amount", () => {
  assert.match(garaPayoutSection, /request\.vendorName/);
  assert.match(garaPayoutSection, /요청일/);
  assert.match(garaPayoutSection, /지급일/);
  assert.match(garaPayoutSection, /won\(request\.amount\)/);
  assert.doesNotMatch(garaPayoutSection, /request\.accountNumber/);
  assert.doesNotMatch(garaPayoutSection, /Gara 지급 요청/);
  assert.doesNotMatch(garaPayoutSection, /크레딧 지급 완료/);
});
