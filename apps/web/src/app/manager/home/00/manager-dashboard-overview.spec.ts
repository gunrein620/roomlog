import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  managerDashboardTicketHref,
  selectManagerCurrentTickets,
} from "./manager-dashboard-overview";

const root = process.cwd();

test("current work selects urgent tickets first while preserving each group's order", () => {
  const selected = selectManagerCurrentTickets([
    { id: "normal-1", title: "일반 첫째", unitId: "101호", statusLabel: "접수", urgent: false },
    { id: "urgent-1", title: "긴급 첫째", unitId: "201호", statusLabel: "처리 중", urgent: true },
    { id: "normal-2", title: "일반 둘째", unitId: "102호", statusLabel: "검토중", urgent: false },
    { id: "urgent-2", title: "긴급 둘째", unitId: "202호", statusLabel: "정보 요청", urgent: true },
    { id: "normal-3", title: "일반 셋째", unitId: "103호", statusLabel: "접수", urgent: false },
  ]);

  assert.deepEqual(selected.map((ticket) => ticket.id), ["urgent-1", "urgent-2", "normal-1"]);
});

test("current work links each row to the encoded contextual ticket route", () => {
  assert.equal(
    managerDashboardTicketHref("ticket /?&한글"),
    "/manager/ticket/dash/01?id=ticket+%2F%3F%26%ED%95%9C%EA%B8%80",
  );

  const componentSource = readFileSync(
    join(root, "src/app/manager/home/00/ManagerDashboardOverview.tsx"),
    "utf8",
  );
  const helperSource = readFileSync(
    join(root, "src/app/manager/home/00/manager-dashboard-overview.ts"),
    "utf8",
  );
  const linkedRow = componentSource.match(/<Link key=\{ticket.id\}[\s\S]*?<\/Link>/);

  assert.match(componentSource, /selectManagerCurrentTickets\(tickets\)/);
  assert.ok(linkedRow);
  assert.match(linkedRow[0], /managerDashboardTicketHref\(ticket.id\)/);
  assert.match(linkedRow[0], /\{ticket.title\}/);
  assert.match(linkedRow[0], /\{ticket.unitId\}/);
  assert.match(linkedRow[0], /\{ticket.statusLabel\}/);
  assert.match(helperSource, /MANAGER_TICKET_ROUTES\["M-DASH-01"\]/);
});
