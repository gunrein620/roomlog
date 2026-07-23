import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(
  join(root, "src/app/my/flows/TenantMyPage.tsx"),
  "utf8",
);
const modalSource = readFileSync(
  join(root, "src/app/my/flows/TenantPaymentHistoryModal.tsx"),
  "utf8",
);
const cssSource = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("tenant residence actions place the payment history trigger below the existing buttons", () => {
  assert.match(
    pageSource,
    /tenant-residence-actions[\s\S]*?임대차 계약서 보기[\s\S]*?임대인에게 문의하기[\s\S]*?tenant-payment-history-button[\s\S]*?납부 내역/,
  );
  assert.match(pageSource, /setIsPaymentHistoryOpen\(true\)/);
  assert.match(pageSource, /aria-haspopup="dialog"/);
  assert.match(pageSource, /aria-controls="tenant-payment-history-dialog"/);
  assert.match(
    cssSource,
    /\.tenant-payment-history-button\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/,
  );
});

test("tenant my page mounts the payment history modal and restores trigger focus on close", () => {
  assert.match(pageSource, /TenantPaymentHistoryModal/);
  assert.match(
    pageSource,
    /setIsPaymentHistoryOpen\(false\)[\s\S]*?paymentHistoryButtonRef\.current\?\.focus\(\)/,
  );
  assert.match(
    pageSource,
    /isPaymentHistoryOpen[\s\S]*?<TenantPaymentHistoryModal onClose=\{closePaymentHistory\}/,
  );
  assert.match(modalSource, /id="tenant-payment-history-dialog"/);
});
