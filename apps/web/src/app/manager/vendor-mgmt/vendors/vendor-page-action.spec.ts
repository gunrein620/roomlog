import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/manager/vendor-mgmt/vendors/page.tsx"),
  "utf8",
);

test("labels the my-vendors action as vendor registration", () => {
  assert.match(
    pageSource,
    /actions=\{<LinkButton href=\{MANAGER_VENDOR_MGMT_PATHS\.search\}>업체 등록<\/LinkButton>\}/,
  );
  assert.doesNotMatch(
    pageSource,
    /actions=\{<LinkButton href=\{MANAGER_VENDOR_MGMT_PATHS\.search\}>업체 찾기<\/LinkButton>\}/,
  );
});
