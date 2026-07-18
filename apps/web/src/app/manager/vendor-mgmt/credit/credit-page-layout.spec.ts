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

test("starts the credit page with payment policy instead of settlement overview", () => {
  assert.doesNotMatch(pageSource, /VendorScreenHeader/);
  assert.doesNotMatch(pageSource, /업체 정산/);
  assert.doesNotMatch(workspaceSource, /summaryStrip/);
  assert.doesNotMatch(workspaceSource, /현재 크레딧/);
  assert.match(workspaceSource, /자동결제 정책/);
  assert.match(workspaceSource, /업체 지급 요청/);
});
