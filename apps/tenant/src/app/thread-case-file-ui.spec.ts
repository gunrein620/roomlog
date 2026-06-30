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

  it("wires case file actions to composer, photo input, and finalize flows", () => {
    assert.match(pageSource, /className="case-file-actions"/);
    assert.match(pageSource, /handleCaseFileAction\(action\)/);
    assert.match(pageSource, /ref=\{photoInputRef\}/);
    assert.match(pageSource, /photoInputRef\.current\?\.click\(\)/);
    assert.match(pageSource, /void finalizeSession\(\)/);
    assert.match(pageSource, /seedComposerFromQuestion\(action\.label\)/);
  });

  it("renders first-consultation onboarding before the first AI thread starts", () => {
    assert.match(pageSource, /firstConsultationOnboarding/);
    assert.match(pageSource, /aria-label="첫 AI 상담 준비"/);
    assert.match(pageSource, /sessions\.length === 0/);
    assert.match(pageSource, /void startSession\(prompt\)/);
  });
});
