import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const headerSource = read("src/app/manager/billing/BillingWorkspaceHeader.tsx");
const styleSource = read("src/app/manager/billing/billing-workspace.module.css");

test("header controls align to the right when no heading is rendered", () => {
  assert.match(headerSource, /styles\.headerControlsEnd/);
  assert.match(styleSource, /\.headerControlsEnd\s*\{[\s\S]*?margin-left:\s*auto;/);
});
