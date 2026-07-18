import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const navigationSource = readFileSync(
  join(process.cwd(), "src/lib/vendor-mgmt-nav.ts"),
  "utf8",
);

test("keeps vendor search out of the manager sidebar navigation", () => {
  assert.match(navigationSource, /label: "내 업체"/);
  assert.match(navigationSource, /label: "크레딧·결제"/);
  assert.doesNotMatch(
    navigationSource,
    /href: MANAGER_VENDOR_MGMT_PATHS\.search, label: "업체 찾기"/,
  );
});
