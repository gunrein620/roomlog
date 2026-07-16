import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const uiSource = readFileSync(
  join(__dirname, "../app/manager/ticket/_components/ticket-manager-ui.tsx"),
  "utf8",
);
const statusBadgesSource = uiSource.slice(
  uiSource.indexOf("export function StatusBadges"),
  uiSource.indexOf("export function ResponsibilityCard"),
);

describe("manager ticket repair status badge", () => {
  it("renders the in-progress repair state as 수리중 without a duplicated prefix", () => {
    assert.match(statusBadgesSource, /repair\?\.stage === "in_progress"/);
    assert.match(statusBadgesSource, /"수리중"/);
    assert.doesNotMatch(statusBadgesSource, /<Badge>수리 \{repair \?/);
  });
});
