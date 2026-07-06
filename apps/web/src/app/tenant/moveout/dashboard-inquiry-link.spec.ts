import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(__dirname, "00/page.tsx"), "utf8");

test("tenant moveout dashboard links contract uncertainty to manager inquiry", () => {
  assert.match(pageSource, /관리자 문의 필요/);
  assert.match(
    pageSource,
    /<Link[\s\S]*href=\{withMoveoutId\(MOVEOUT_ROUTES\["T-OUT-03"\], moveout\.id\)\}[\s\S]*<Badge>관리자 문의 필요<\/Badge>[\s\S]*<\/Link>/,
  );
});
