import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(process.cwd(), "src/app/manager/vendor-mgmt/vendors/page.tsx"), "utf8");
const actionsSource = readFileSync(join(process.cwd(), "src/app/manager/vendor-mgmt/actions.ts"), "utf8");
const apiClientSource = readFileSync(join(process.cwd(), "src/lib/vendor-mgmt-api.ts"), "utf8");
const apiControllerSource = readFileSync(
  join(process.cwd(), "../api/src/roomlog/roomlog.controller.ts"),
  "utf8",
);

test("manager vendor list labels its search action as 업체 등록", () => {
  assert.match(
    pageSource,
    /<LinkButton href=\{MANAGER_VENDOR_MGMT_PATHS\.search\}>업체 등록<\/LinkButton>/,
  );
});

test("manual vendor creation uses the authenticated API and refreshes the manager list", () => {
  assert.match(apiControllerSource, /@Post\("manager\/vendor-mgmt\/vendors\/manual"\)/);
  assert.match(apiControllerSource, /rejectCallerIdentity\(body, \["managerId", "actorUserId"\]\)/);
  assert.match(apiControllerSource, /requireRole\(authorization, \["LANDLORD"\]\)/);
  assert.match(apiControllerSource, /createManual\(user\.id, body\)/);

  assert.match(apiClientSource, /export function createManagerVendor/);
  assert.match(apiClientSource, /`\/manager\/vendor-mgmt\/vendors\/manual`/);
  assert.match(apiClientSource, /method: "POST"/);
  assert.match(apiClientSource, /body: JSON\.stringify\(input\)/);

  assert.match(actionsSource, /export async function createManualVendorAction/);
  for (const field of ["businessName", "phone", "accountNumber"]) {
    assert.match(actionsSource, new RegExp(`requiredFormString\\(formData, "${field}"\\)`));
  }
  assert.match(actionsSource, /await createManagerVendor\(/);
  assert.match(actionsSource, /revalidatePath\(MANAGER_VENDOR_MGMT_PATHS\.vendors\)/);
  assert.match(actionsSource, /managerMutationSuccess\("업체를 등록했습니다\."\)/);
});
