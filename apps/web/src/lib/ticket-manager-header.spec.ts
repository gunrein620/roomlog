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

describe("manager ticket header", () => {
  it("shows only the unit label below the screen title", () => {
    assert.match(ticketHeaderSource, /\{ticket\.unitId\}호/);
    assert.doesNotMatch(ticketHeaderSource, /ticket\.id|ticket\.title/);
  });
});
