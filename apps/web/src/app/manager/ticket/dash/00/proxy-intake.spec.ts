import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const apiPath = join(root, "src/lib/ticket-manager-api.ts");
const actionsPath = join(root, "src/app/manager/ticket/dash/00/actions.ts");
const dialogPath = join(root, "src/app/manager/ticket/dash/00/ManagerProxyIntakeDialog.tsx");
const dashboardPath = join(root, "src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx");
const pagePath = join(root, "src/app/manager/ticket/dash/00/page.tsx");
const cssPath = join(root, "src/app/manager/ticket/dash/00/proxy-intake.module.css");
const behaviorPath = join(root, "src/app/manager/ticket/dash/00/proxy-intake-behavior.ts");

test("manager proxy intake is wired from the dashboard through a server action", () => {
  assert.equal(existsSync(actionsPath), true, actionsPath);
  assert.equal(existsSync(dialogPath), true, dialogPath);
  assert.equal(existsSync(cssPath), true, cssPath);
  assert.equal(existsSync(behaviorPath), true, behaviorPath);

  const apiSource = readFileSync(apiPath, "utf8");
  const actionsSource = readFileSync(actionsPath, "utf8");
  const dialogSource = readFileSync(dialogPath, "utf8");
  const dashboardSource = readFileSync(dashboardPath, "utf8");
  const pageSource = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync(cssPath, "utf8");

  assert.match(apiSource, /listManagerProxyIntakeRooms/);
  assert.match(apiSource, /createManagerProxyIntake/);
  assert.match(apiSource, /\/manager\/proxy-intake\/rooms/);
  assert.match(apiSource, /\/manager\/tickets\/proxy-intake/);
  assert.match(apiSource, /tenants:\s*ManagerProxyIntakeTenant\[\]/);
  assert.match(apiSource, /tenantId:\s*string/);
  assert.match(apiSource, /name:\s*string/);
  assert.match(apiSource, /hasTenant:\s*boolean/);
  assert.match(apiSource, /clientRequestId\?:\s*string/);
  assert.match(actionsSource, /createManagerProxyIntakeAction/);
  assert.match(actionsSource, /requireUser\("LANDLORD"/);
  assert.match(actionsSource, /revalidatePath/);
  assert.match(dialogSource, /호실 선택/);
  assert.match(dialogSource, /연결 세입자/);
  assert.match(dialogSource, /selectedRoom\?\.tenants\.length === 1/);
  assert.match(dialogSource, /selectedRoom\.tenants\.length > 1/);
  assert.match(dialogSource, /name="tenantId"/);
  assert.match(dialogSource, /세입자를 선택해 주세요/);
  assert.match(dialogSource, /연결된 세입자가 없는 호실/);
  for (const field of ["title", "description", "location", "occurredAt", "availableTimes"]) {
    assert.match(dialogSource, new RegExp(`name="${field}"`));
  }
  assert.match(dialogSource, /긴급도/);
  assert.match(dialogSource, /방문 가능 시간/);
  assert.match(dialogSource, /전화/);
  assert.match(dialogSource, /문자/);
  assert.match(dialogSource, /대면/);
  assert.match(dialogSource, /type="file"/);
  assert.match(dialogSource, /\/api\/tenant\/uploads/);
  assert.match(dialogSource, /COMPLAINT_PHOTO/);
  assert.match(dialogSource, /attachmentUrls/);
  assert.match(dialogSource, /buildManagerProxyIntakePayload/);
  assert.match(dialogSource, /resolveProxyIntakeUploadUrl/);
  assert.match(dialogSource, /initialFocusRef\.current\?\.focus\(\)/);
  assert.match(dialogSource, /previousFocusRef\.current\?\.focus\(\)/);
  assert.match(dialogSource, /nextProxyIntakeFocusIndex/);
  assert.match(dialogSource, /event\.key !== "Tab"/);
  assert.match(
    dialogSource,
    /if \(event\.key === "Escape"\) \{[\s\S]{0,160}close\(\)/,
  );
  assert.doesNotMatch(dialogSource, /<option[^>]*disabled=\{!room\.hasTenant\}/);
  assert.match(
    dialogSource,
    /if \(!result\.ok\)[\s\S]*setError\(result\.error\)/,
  );
  assert.match(dialogSource, /router\.refresh\(\)/);
  assert.match(dialogSource, /role="alert"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /clientRequestId/);
  assert.match(dialogSource, /uploadedAttachmentUrlsRef/);
  assert.match(dialogSource, /createProxyIntakeClientRequestId/);
  assert.match(dialogSource, /buildManagerProxyIntakePayload/);
  assert.match(dashboardSource, /ManagerProxyIntakeDialog/);
  assert.match(dashboardSource, />대리 접수</);
  assert.match(dashboardSource, /disabled=\{proxyIntakeRooms\.length === 0\}/);
  assert.match(dashboardSource, /대리 접수 가능한 호실이 없습니다/);
  assert.match(pageSource, /listManagerProxyIntakeRooms/);
  assert.match(pageSource, /proxyIntakeRooms=/);

  assert.match(cssSource, /var\(--/);
  assert.doesNotMatch(cssSource, /#[\da-f]{3,8}/i);
});
