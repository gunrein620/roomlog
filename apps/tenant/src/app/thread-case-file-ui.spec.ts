import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("tenant thread case file UI", () => {
  it("renders the AI case file above realtime controls in the selected thread", () => {
    const caseFileIndex = pageSource.indexOf('aria-label="AI 케이스 파일"');
    const realtimeIndex = pageSource.indexOf('aria-label="Realtime 음성 상담"');

    assert.ok(caseFileIndex > -1, "expected an AI case file region");
    assert.ok(realtimeIndex > -1, "expected realtime controls");
    assert.ok(caseFileIndex < realtimeIndex, "case file should appear before realtime controls");
    assert.match(pageSource, /threadCaseFile\(selectedSession\)/);
  });
});
