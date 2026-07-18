import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const panelSource = readFileSync(
  join(root, "src/app/my/flows/TenantVendorWorkflowPanel.tsx"),
  "utf8",
);
const checkoutSource = readFileSync(
  join(
    root,
    "src/app/tenant/repair-payment/[paymentRequestId]/TenantRepairPaymentCheckout.tsx",
  ),
  "utf8",
);

test("tenant vendor workflow opens repair payment checkout inside the detail sheet", () => {
  assert.match(panelSource, /TenantRepairPaymentCheckout/);
  assert.match(panelSource, /setPaymentCheckoutOpen\(true\)/);
  assert.match(panelSource, /embedded/);
  assert.match(panelSource, /onClose=/);
  assert.match(panelSource, /await loadWorkflow\(\)/);
  assert.doesNotMatch(panelSource, /href=\{`\/tenant\/repair-payment\//);
});

test("embedded repair checkout closes in place and stores the living return path", () => {
  assert.match(checkoutSource, /embedded\?: boolean/);
  assert.match(checkoutSource, /onClose\?: \(\) => void/);
  assert.match(checkoutSource, /embedded && onClose/);
  assert.match(checkoutSource, /type="button"[\s\S]*onClick=\{onClose\}/);
  assert.match(checkoutSource, /returnUrl\.searchParams\.set\("complaintId", complaintId\)/);
  assert.match(checkoutSource, /returnUrl\.searchParams\.delete\("repairPayment"\)/);
  assert.match(
    checkoutSource,
    /const returnPath = `\$\{window\.location\.pathname\}\$\{returnUrl\.search\}/,
  );
});
