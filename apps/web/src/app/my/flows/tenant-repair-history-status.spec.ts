import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(process.cwd(), "src/app/my/flows/TenantMyPage.tsx"), "utf8");

test("tenant repair history reduces ticket and repair states to 접수, 진행중, 완료", () => {
  assert.match(pageSource, /RECEIVED:\s*"접수"/);
  assert.match(pageSource, /VENDOR_ASSIGNED:\s*"접수"/);
  assert.match(pageSource, /REPAIR_IN_PROGRESS:\s*"진행중"/);
  assert.match(pageSource, /COMPLETION_REPORTED:\s*"진행중"/);
  assert.match(pageSource, /COMPLETED:\s*"완료"/);
  assert.match(pageSource, /"수리중":\s*"진행중"/);
  assert.match(pageSource, /status:\s*tenantRepairHistoryStatus\(item\)/);
});
