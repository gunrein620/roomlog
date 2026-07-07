import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(join(root, "src/app/manager/home/00/page.tsx"), "utf8");
const tabsSource = readFileSync(join(root, "src/app/manager/home/00/ManagerHomeTabs.tsx"), "utf8");

test("manager home AI tab routes to the realtime agent page", () => {
  assert.match(pageSource, /realtimeAgentHref=\{MANAGER_CROSS\.realtimeAgent\}/);
  assert.match(tabsSource, /realtimeAgentHref: string/);
  assert.match(tabsSource, /href=\{realtimeAgentHref\}/);
  assert.match(tabsSource, />AI agent</);
  assert.doesNotMatch(tabsSource, /AI 관리자 준비 중/);
});
