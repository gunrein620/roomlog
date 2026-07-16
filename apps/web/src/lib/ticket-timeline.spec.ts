import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildTicketTimeline } from "./ticket-timeline";

const reached = (input: Parameters<typeof buildTicketTimeline>[0]) =>
  buildTicketTimeline(input).map((item) => item.reached);

describe("manager ticket timeline", () => {
  it("fills reception and available AI analysis for a newly received ticket", () => {
    assert.deepEqual(
      reached({ ticketStatus: "received", hasAnalysis: true }),
      [true, true, false, false],
    );
  });

  it("fills the manager review stage once review has started", () => {
    assert.deepEqual(
      reached({ ticketStatus: "reviewing", hasAnalysis: true }),
      [true, true, true, false],
    );
  });

  it("fills vendor sync only when processing has repair data", () => {
    assert.deepEqual(
      reached({
        ticketStatus: "processing",
        hasAnalysis: true,
        repairStage: "vendor_assigned",
      }),
      [true, true, true, true],
    );
    assert.deepEqual(
      reached({ ticketStatus: "processing", hasAnalysis: true }),
      [true, true, true, false],
    );
  });

  it("renders both filled and outlined token-based markers", () => {
    const source = readFileSync(
      join(
        __dirname,
        "../app/manager/ticket/_components/ticket-manager-ui.tsx",
      ),
      "utf8",
    );

    assert.match(source, /background: item\.reached/);
    assert.match(source, /var\(--surface-container-lowest\)/);
    assert.match(source, /border: `1\.5px solid var\(--primary\)`/);
    assert.match(source, /aria-label=.*미진행/);
  });
});
