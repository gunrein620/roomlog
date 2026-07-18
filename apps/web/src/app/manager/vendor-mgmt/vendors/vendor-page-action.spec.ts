import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readSource(path: string) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const pageSource = readSource(
  join(process.cwd(), "src/app/manager/vendor-mgmt/vendors/page.tsx"),
);
const dialogPath = join(
  process.cwd(),
  "src/app/manager/vendor-mgmt/vendors/ManagerVendorRegistrationDialog.tsx",
);
const dialogSource = readSource(dialogPath);
const actionsSource = readSource(
  join(process.cwd(), "src/app/manager/vendor-mgmt/actions.ts"),
);
const clientSource = readSource(join(process.cwd(), "src/lib/vendor-mgmt-api.ts"));
const controllerSource = readSource(
  join(process.cwd(), "../api/src/roomlog/roomlog.controller.ts"),
);

test("opens the direct vendor registration form and submits it through the manager API", () => {
  assert.match(pageSource, /import \{ ManagerVendorRegistrationDialog \}/);
  assert.match(
    pageSource,
    /actions=\{<ManagerVendorRegistrationDialog disabled=\{result\.source === "DEMO"\} \/>\}/,
  );
  assert.equal(existsSync(dialogPath), true);
  assert.match(dialogSource, /dialogRef\.current\?\.showModal\(\)/);
  assert.match(dialogSource, /협력업체 직접 등록/);
  for (const field of ["businessName", "phone", "accountNumber"]) {
    assert.match(dialogSource, new RegExp(`name="${field}"`));
  }
  assert.match(dialogSource, /action=\{formAction\}/);
  assert.match(actionsSource, /export async function createManualVendorAction/);
  assert.match(actionsSource, /await createManagerVendor\(/);
  assert.match(clientSource, /export function createManagerVendor/);
  assert.match(clientSource, /manager\/vendor-mgmt\/vendors\/manual/);
  assert.match(controllerSource, /@Post\("manager\/vendor-mgmt\/vendors\/manual"\)/);
});

test("does not expose an unlink control from the my-vendors list", () => {
  assert.doesNotMatch(pageSource, /ManagerVendorArchiveControl/);
  assert.doesNotMatch(pageSource, /renderManagement=/);
});
