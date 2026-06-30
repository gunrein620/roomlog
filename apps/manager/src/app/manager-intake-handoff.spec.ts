import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("manager intake handoff panel", () => {
  it("renders AI chat and voice intake handoff separately from generic ticket analysis", () => {
    const handoffIndex = pageSource.indexOf('aria-label="AI 상담 인계 기록"');
    const evidenceIndex = pageSource.indexOf('className="evidence"');

    assert.ok(handoffIndex > -1, "expected an AI intake handoff section");
    assert.ok(evidenceIndex > -1, "expected the generic AI evidence section");
    assert.ok(handoffIndex < evidenceIndex, "handoff should appear before generic evidence");
    assert.match(pageSource, /selectedTicket\.intakeHandoff/);
    assert.match(pageSource, /selectedTicket\.intakeHandoff\.channelLabel/);
    assert.match(pageSource, /selectedTicket\.intakeHandoff\.lastTenantMessage/);
    assert.match(pageSource, /selectedTicket\.intakeHandoff\.lastAssistantMessage/);
    assert.match(pageSource, /selectedTicket\.intakeHandoff\.attachmentUrls/);
  });
});
