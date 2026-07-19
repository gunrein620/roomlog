import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(
  join(root, "src/app/my/flows/TenantMyPage.tsx"),
  "utf8",
);
const cssSource = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("tenant detail preserves manager proxy source and displays a transparency badge", () => {
  assert.match(pageSource, /sourceChannel\?: string/);
  assert.match(pageSource, /sourceChannel: item\.sourceChannel/);
  assert.match(pageSource, /selectedRepairRequest\.sourceChannel === "MANAGER_PROXY"/);
  assert.match(pageSource, />관리자 대리 접수</);

  const badgeCss = cssSource.match(
    /\.tenant-manager-proxy-badge\s*\{[\s\S]*?\}/,
  )?.[0];
  assert.ok(badgeCss);
  assert.doesNotMatch(badgeCss, /#[\da-f]{3,8}/i);
});
