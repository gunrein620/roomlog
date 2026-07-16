import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const uiSource = readFileSync(
  join(__dirname, "../app/manager/ticket/_components/ticket-manager-ui.tsx"),
  "utf8",
);
const ticketHeaderSource = uiSource.slice(
  uiSource.indexOf("export function TicketHeader"),
  uiSource.indexOf("export function StatusBadges"),
);
const detailPageSource = readFileSync(
  join(__dirname, "../app/manager/ticket/dash/01/page.tsx"),
  "utf8",
);

describe("manager ticket header", () => {
  it("shows only the unit label below the screen title", () => {
    assert.match(ticketHeaderSource, /\{ticket\.unitId\}호/);
    assert.doesNotMatch(ticketHeaderSource, /ticket\.id|ticket\.title/);
  });

  it("shows the real building and unit on the defect detail screen", () => {
    assert.match(ticketHeaderSource, /ticket\.buildingName/);
    assert.match(ticketHeaderSource, /\/ \$\{ticket\.unitId\}호/);
    assert.match(detailPageSource, /showBuildingName/);
  });
});
