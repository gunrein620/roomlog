import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const alertTilesSource = readFileSync(
  join(root, "src/app/manager/home/00/AlertStatTiles.tsx"),
  "utf8",
);
const todayTasksSource = readFileSync(
  join(root, "src/app/manager/home/00/TodayTasksCard.tsx"),
  "utf8",
);

test("labels the urgent ticket bucket as 민원·하자 in both dashboard surfaces", () => {
  assert.match(alertTilesSource, /key: "urgent", label: "민원·하자"/);
  assert.match(todayTasksSource, /urgent_ticket: "민원·하자"/);
});
