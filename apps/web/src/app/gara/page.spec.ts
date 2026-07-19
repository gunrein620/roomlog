import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pagePath = path.join(process.cwd(), "src/app/gara/page.tsx");

test("/gara renders registered vendors with payout request controls", () => {
  assert.equal(existsSync(pagePath), true, `${pagePath} must exist`);

  const source = readFileSync(pagePath, "utf8");
  assert.match(source, /title:\s*"Gara \| 룸로그"/);
  assert.match(source, /listManagerVendors/);
  assert.match(source, /getManagerCreditAccount/);
  assert.match(source, /GaraPayoutWorkspace/);
  assert.doesNotMatch(source, /ManagerAppShell/);
});
