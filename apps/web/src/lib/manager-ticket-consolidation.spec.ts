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
  const actionMenu = source("src/app/manager/ticket/dash/00/TicketActionMenu.tsx");
  const detailDialog = source("src/app/manager/ticket/dash/00/TicketDetailDialog.tsx");
  const paymentPage = source("src/app/manager/ticket/dash/05/page.tsx");

  assert.doesNotMatch(ui, /"03": "\/manager\/ticket\/dash\/03"/);
  assert.doesNotMatch(ui, /"04": "\/manager\/ticket\/dash\/04"/);
  assert.doesNotMatch(nav, /M-DASH-03/);
  assert.doesNotMatch(nav, /M-DASH-04/);
  assert.doesNotMatch(actionMenu, /업체 선정·견적/);
  assert.doesNotMatch(detailDialog, /업체 선정·견적/);
  assert.doesNotMatch(paymentPage, /업체 배정·견적으로/);
});
