import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const workspacePath = path.join(
  process.cwd(),
  "src/app/gara/GaraPayoutWorkspace.tsx",
);
const stylesPath = path.join(
  process.cwd(),
  "src/app/gara/GaraPayoutWorkspace.module.css",
);

test("Gara shows linked accounts and each vendor cumulative credit", () => {
  const source = readFileSync(workspacePath, "utf8");

  assert.match(source, />연결 계정</);
  assert.match(source, />잔액</);
  assert.match(source, /vendor\.linkedAccount\.name/);
  assert.match(source, /vendor\.linkedAccount\.email/);
  assert.match(source, /vendor\.cumulativeCredit/);
});

test("Gara sends a payout request for only the selected row and a positive integer amount", () => {
  const source = readFileSync(workspacePath, "utf8");

  assert.match(source, /createGaraVendorPayoutRequest/);
  assert.match(source, /managerVendorId:\s*vendor\.id/);
  assert.match(
    source,
    /amount,[\s\S]*idempotencyKey:\s*crypto\.randomUUID\(\)/,
  );
  assert.match(source, /\^\\d\+\$/);
  assert.match(source, />발송</);
});

test("Gara never launches a Toss checkout or immediately debits credit", () => {
  const source = readFileSync(workspacePath, "utf8");

  assert.doesNotMatch(source, /requestManagerCardPayment/);
  assert.doesNotMatch(source, /createTossWidgets/);
  assert.doesNotMatch(source, /vendor-credit-checkouts/);
});

test("Gara refreshes its public credit view when a payout websocket event arrives", () => {
  const source = readFileSync(workspacePath, "utf8");

  assert.match(source, /getGaraRealtimeSocket/);
  assert.match(source, /gara:payout-updated/);
  assert.match(source, /router\.refresh\(\)/);
});

test("Gara send button keeps its label on one line in a narrow table column", () => {
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(styles, /\.sendButton\s*\{[\s\S]*?white-space:\s*nowrap;/);
});

test("Gara developer tool lets every listed registration be archived", () => {
  const source = readFileSync(workspacePath, "utf8");
  const apiSource = readFileSync(
    path.join(process.cwd(), "src/lib/gara-credit-api.ts"),
    "utf8",
  );

  assert.match(source, /archiveGaraVendorRegistration/);
  assert.match(source, />삭제</);
  assert.match(source, /onArchive\(vendor\.id\)/);
  assert.match(source, /setVisibleVendors/);
  assert.doesNotMatch(source, /archivableVendorIds/);
  assert.match(apiSource, /\/api\/gara\/vendors\/\$\{encodeURIComponent\(managerVendorId\)\}/);
});
