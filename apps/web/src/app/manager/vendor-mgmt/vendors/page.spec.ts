import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(process.cwd(), "src/app/manager/vendor-mgmt/vendors/page.tsx"), "utf8");

test("manager vendor list labels its search action as 업체 등록", () => {
  assert.match(
    pageSource,
    /<LinkButton href=\{MANAGER_VENDOR_MGMT_PATHS\.search\}>업체 등록<\/LinkButton>/,
  );
});
