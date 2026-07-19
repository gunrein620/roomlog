import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const webRoot = path.resolve(process.cwd());

function source(relativePath: string) {
  return fs.readFileSync(path.join(webRoot, relativePath), "utf8");
}

test("manager ticket detail keeps registered vendor assignment on the single detail page", () => {
  const page = source("src/app/manager/ticket/dash/01/page.tsx");

  assert.match(page, /RegisteredVendorAssignment/);
  assert.doesNotMatch(page, /ManagerTicketChat/);
  assert.doesNotMatch(page, /DirectHandlingActions/);
  assert.doesNotMatch(page, /<Timeline/);
  assert.doesNotMatch(page, /답변 초안 생성/);
  assert.doesNotMatch(page, /ticketDashHref\("04"/);
});
test("obsolete reply draft and vendor estimate routes are removed from manager navigation", () => {
  const ui = source("src/app/manager/ticket/_components/ticket-manager-ui.tsx");
  const nav = source("src/lib/ticket-manager-nav.ts");
  const dashboard = source("src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx");
  const detailDialog = source("src/app/manager/ticket/dash/00/TicketDetailDialog.tsx");

  assert.doesNotMatch(ui, /"03": "\/manager\/ticket\/dash\/03"/);
  assert.doesNotMatch(ui, /"04": "\/manager\/ticket\/dash\/04"/);
  assert.doesNotMatch(nav, /M-DASH-03/);
  assert.doesNotMatch(nav, /M-DASH-04/);
  assert.doesNotMatch(dashboard, /업체 선정·견적/);
  assert.doesNotMatch(detailDialog, /업체 선정·견적/);
});

test("obsolete manager completion review route and every live link to it are removed", () => {
  const routeDirectory = path.join(webRoot, "src/app/manager/ticket/dash/05");
  const ui = source("src/app/manager/ticket/_components/ticket-manager-ui.tsx");
  const nav = source("src/lib/ticket-manager-nav.ts");
  const dashboard = source("src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx");
  const detailDialog = source("src/app/manager/ticket/dash/00/TicketDetailDialog.tsx");
  const mobilePayment = source("src/app/manager/ticket/call/04/page.tsx");
  const costDetail = source("src/app/manager/cost/03/page.tsx");
  const creditWorkspace = source("src/app/manager/vendor-mgmt/credit/CreditWorkspace.tsx");

  assert.equal(fs.existsSync(path.join(routeDirectory, "page.tsx")), false);
  assert.equal(fs.existsSync(path.join(routeDirectory, "actions.ts")), false);
  for (const liveSource of [ui, nav, dashboard, detailDialog, mobilePayment, costDetail, creditWorkspace]) {
    assert.doesNotMatch(
      liveSource,
      /\/manager\/ticket\/dash\/05|ticketDashHref\("05"|dashRoutes\["05"\]|M-DASH-05/,
    );
  }
  assert.doesNotMatch(dashboard, /결제·비용 승인/);
  assert.doesNotMatch(detailDialog, /결제·비용 승인/);
});
