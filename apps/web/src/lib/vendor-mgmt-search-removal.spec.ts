import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = join(fileURLToPath(new URL("../..", import.meta.url)));
const readWebSource = (...parts: string[]) => readFileSync(join(webRoot, ...parts), "utf8");

test("manager vendor search has no navigation, page, API, legacy redirect, or guidance entry point", () => {
  const navSource = readWebSource("src/lib/vendor-mgmt-nav.ts");
  const legacySource = readWebSource("src/app/manager/vendor-mgmt/03/page.tsx");
  const clientSource = readWebSource("src/lib/vendor-mgmt-api.ts");
  const actionsSource = readWebSource("src/app/manager/vendor-mgmt/actions.ts");
  const archiveSource = readWebSource("src/app/manager/vendor-mgmt/vendors/ManagerVendorArchiveControl.tsx");
  const ticketSource = readWebSource("src/app/manager/ticket/dash/04/page.tsx");
  const controllerSource = readFileSync(join(webRoot, "../api/src/roomlog/roomlog.controller.ts"), "utf8");
  const searchPage = join(webRoot, "src/app/manager/vendor-mgmt/search/page.tsx");

  assert.doesNotMatch(navSource, /업체 찾기|vendor-mgmt\/search/);
  assert.match(legacySource, /redirect\(MANAGER_VENDOR_MGMT_PATHS\.vendors\)/);
  assert.equal(existsSync(searchPage), false);
  assert.doesNotMatch(clientSource, /searchVendorCatalog|registerManagerVendor|manager\/vendor-mgmt\/search/);
  assert.doesNotMatch(actionsSource, /registerVendorAction|MANAGER_VENDOR_MGMT_PATHS\.search/);
  assert.doesNotMatch(controllerSource, /@(?:Get|Put)\("manager\/vendor-mgmt\/(?:search|vendors\/:vendorId\/registration)"\)/);
  assert.doesNotMatch(archiveSource, /업체 찾기/);
  assert.doesNotMatch(ticketSource, /업체 찾기/);
});
