import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function pageSource(page: "success" | "fail"): string {
  const pagePath = path.join(process.cwd(), `src/app/gara/payment/${page}/page.tsx`);
  assert.equal(existsSync(pagePath), true, `${pagePath} must exist`);
  return readFileSync(pagePath, "utf8");
}

test("Gara payment success callback confirms through the Gara checkout helper and returns to Gara", () => {
  const successSource = pageSource("success");

  assert.match(successSource, /confirmGaraVendorCreditCheckoutServer/);
  assert.match(successSource, /@\/lib\/gara-credit-server-api/);
  assert.doesNotMatch(successSource, /@\/lib\/gara-credit-api/);
  assert.match(successSource, /redirect\(withCallbackMarker\("\/gara"/);
  assert.doesNotMatch(successSource, /getManagerCreditTopup/);
  assert.doesNotMatch(successSource, /confirmManagerCreditTopup/);
  assert.doesNotMatch(successSource, /normalizeManagerReturnPath/);
});

test("Gara payment fail callback cancels only READY orders through Gara helpers and returns to Gara", () => {
  const failSource = pageSource("fail");

  assert.match(failSource, /getGaraVendorCreditCheckoutServer/);
  assert.match(failSource, /order\.status === "READY"/);
  assert.match(failSource, /cancelGaraVendorCreditCheckoutServer/);
  assert.match(failSource, /@\/lib\/gara-credit-server-api/);
  assert.doesNotMatch(failSource, /@\/lib\/gara-credit-api/);
  assert.match(failSource, /redirect\(withCallbackMarker\("\/gara"/);
  assert.doesNotMatch(failSource, /getManagerCreditTopup/);
  assert.doesNotMatch(failSource, /cancelManagerCreditTopup/);
  assert.doesNotMatch(failSource, /normalizeManagerReturnPath/);
});

test("Gara callbacks retain every credit-topup status marker and order ID", () => {
  for (const page of ["success", "fail"] as const) {
    const source = pageSource(page);
    for (const marker of ["approved", "reconciliation_required", "cancelled", "failed"]) {
      assert.match(source, new RegExp(`"${marker}"`));
    }
    assert.match(source, /creditTopupOrderId/);
  }
});
