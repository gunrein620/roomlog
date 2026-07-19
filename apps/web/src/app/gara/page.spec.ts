import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const pagePath = path.join(process.cwd(), "src/app/gara/page.tsx");

test("/gara reads every public vendor credit without a manager login", () => {
  assert.equal(existsSync(pagePath), true, `${pagePath} must exist`);

  const source = readFileSync(pagePath, "utf8");
  assert.match(source, /title:\s*"Gara \| 룸로그"/);
  assert.match(source, /GaraVendorCreditPublicView/);
  assert.match(source, /serverFetch<GaraVendorCreditPublicView\[]>\("\/gara\/vendors"\)/);
  assert.match(source, /GaraPayoutWorkspace/);
  assert.doesNotMatch(source, /requireUser/);
  assert.doesNotMatch(source, /listManagerVendors/);
  assert.doesNotMatch(source, /getManagerCreditAccount/);
  assert.doesNotMatch(source, /ManagerAppShell/);
});
