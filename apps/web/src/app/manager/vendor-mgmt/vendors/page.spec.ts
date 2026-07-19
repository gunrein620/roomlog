import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(process.cwd(), "src/app/manager/vendor-mgmt/vendors/page.tsx"), "utf8");
const componentSource = readFileSync(join(process.cwd(), "src/app/manager/vendor-mgmt/_components.tsx"), "utf8");
const actionsSource = readFileSync(join(process.cwd(), "src/app/manager/vendor-mgmt/actions.ts"), "utf8");
const apiClientSource = readFileSync(join(process.cwd(), "src/lib/vendor-mgmt-api.ts"), "utf8");
const apiControllerSource = readFileSync(
  join(process.cwd(), "../api/src/roomlog/roomlog.controller.ts"),
  "utf8",
);
const dialogPath = join(
  process.cwd(),
  "src/app/manager/vendor-mgmt/vendors/ManagerVendorRegistrationDialog.tsx",
);
const dialogSource = existsSync(dialogPath) ? readFileSync(dialogPath, "utf8") : "";
const dialogStylesPath = join(
  process.cwd(),
  "src/app/manager/vendor-mgmt/vendors/ManagerVendorRegistrationDialog.module.css",
);
const dialogStylesSource = existsSync(dialogStylesPath)
  ? readFileSync(dialogStylesPath, "utf8")
  : "";

test("manager vendor list opens registration in a modal instead of navigating", () => {
  assert.match(pageSource, /import \{ ManagerVendorRegistrationDialog \}/);
  assert.match(pageSource, /actions=\{<ManagerVendorRegistrationDialog disabled=\{result\.source === "DEMO"\} \/>\}/);
  assert.doesNotMatch(
    pageSource,
    /<LinkButton href=\{MANAGER_VENDOR_MGMT_PATHS\.search\}>업체 등록<\/LinkButton>/,
  );
});

test("manager vendor list does not expose an archive control", () => {
  assert.doesNotMatch(pageSource, /ManagerVendorArchiveControl/);
  assert.doesNotMatch(pageSource, /renderManagement=/);
});

test("manager vendor list omits explanatory copy from the list header and count section", () => {
  assert.doesNotMatch(pageSource, /운영팀이 검증한 업체 중 직접 등록한 협력업체와 진행 중인 작업을 관리합니다/);
  assert.doesNotMatch(pageSource, /계정 연결과 운영 검증이 모두 완료된 업체만 하자 작업에 배정할 수 있습니다/);
});

test("manager vendor table does not expose account verification", () => {
  assert.doesNotMatch(componentSource, /계정·검증/);
  assert.doesNotMatch(componentSource, /accountStatusLabel\[vendor\.accountStatus\]/);
});

test("registration dialog is accessible and submits all private vendor fields", () => {
  assert.equal(existsSync(dialogPath), true);
  assert.match(dialogSource, /dialogRef\.current\?\.showModal\(\)/);
  assert.match(dialogSource, /aria-labelledby=\{titleId\}/);
  assert.match(dialogSource, /aria-describedby=\{descriptionId\}/);
  assert.match(dialogSource, /event\.currentTarget === event\.target/);
  for (const field of ["businessName", "phone", "accountNumber"]) {
    assert.match(dialogSource, new RegExp(`name="${field}"`));
  }
  assert.match(dialogSource, /action=\{formAction\}/);
  assert.match(dialogSource, /role="alert"/);
  assert.match(dialogSource, /pending \? "등록 중…" : "등록"/);
  assert.match(dialogSource, /formRef\.current\?\.reset\(\)/);
  assert.match(dialogSource, /dialogRef\.current\?\.close\(\)/);
  assert.match(dialogSource, /router\.refresh\(\)/);
  assert.equal(existsSync(dialogStylesPath), true);
  assert.doesNotMatch(dialogStylesSource, /#[\da-f]{3,8}|rgba?\(/i);
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
  assert.equal(
    (apiClientSource.match(/export function createManagerVendor/g) ?? []).length,
    1,
  );

  assert.match(actionsSource, /export async function createManualVendorAction/);
  for (const field of ["businessName", "phone", "accountNumber"]) {
    assert.match(actionsSource, new RegExp(`requiredFormString\\(formData, "${field}"\\)`));
  }
  assert.match(actionsSource, /await createManagerVendor\(/);
  assert.match(actionsSource, /revalidatePath\(MANAGER_VENDOR_MGMT_PATHS\.vendors\)/);
  assert.match(actionsSource, /managerMutationSuccess\("업체를 등록했습니다\."\)/);
  assert.doesNotMatch(actionsSource, /}\s*_previousState: ManagerMutationState/);
});
