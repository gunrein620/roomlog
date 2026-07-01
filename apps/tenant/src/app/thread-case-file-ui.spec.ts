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

  it("renders stored thread provenance before the case file", () => {
    const provenanceIndex = pageSource.indexOf('aria-label="상담 스레드 기록"');
    const caseFileIndex = pageSource.indexOf('aria-label="AI 케이스 파일"');

    assert.ok(provenanceIndex > -1, "expected stored thread provenance");
    assert.ok(caseFileIndex > -1, "expected an AI case file region");
    assert.ok(provenanceIndex < caseFileIndex, "thread provenance should orient the case file");
    assert.match(pageSource, /threadProvenance\(selectedSession\)/);
  });

  it("binds the active AI question to the composer guidance", () => {
    const guidanceIndex = pageSource.indexOf('aria-label="AI 답변 안내"');
    const composerIndex = pageSource.indexOf('className="composer"');

    assert.ok(guidanceIndex > -1, "expected composer guidance near the chat input");
    assert.ok(composerIndex > -1, "expected the consultation composer");
    assert.ok(guidanceIndex < composerIndex, "guidance should appear before the composer");
    assert.match(pageSource, /consultationComposerGuidance\(selectedSession\)/);
    assert.match(pageSource, /placeholder=\{selectedComposerGuidance\.placeholder\}/);
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
    assert.match(pageSource, /void startSessionWithMessage\(prompt\)/);
    assert.match(pageSource, /async function startSessionWithMessage\(starterText: string\)/);
    assert.match(pageSource, /messageText: starterText\.trim\(\)/);
    assert.match(pageSource, /\/messages`/);
  });

  it("renders assistant quick replies as one-click AI follow-ups", () => {
    assert.match(pageSource, /className="quick-replies"/);
    assert.match(pageSource, /aria-label="빠른 답변 선택"/);
    assert.match(pageSource, /onClick=\{\(\) => void onQuickReply\?\.\(reply\)\}/);
    assert.match(pageSource, /sendQuickReply\(reply\)/);
    assert.match(pageSource, /messageText: reply\.trim\(\)/);
  });

  it("passes selected photos into realtime turn persistence for voice consultations", () => {
    assert.match(pageSource, /photoFilesRef/);
    assert.match(pageSource, /uploadedRealtimeAttachments/);
    assert.match(pageSource, /uploadedRealtimeAttachments\.map\(\(attachment\) => attachment\.fileUrl\)/);
    assert.match(pageSource, /attachmentUrls/);
    assert.match(pageSource, /setPhotoFiles\(\[\]\)/);
  });

  it("attempts auto finalization after AI updates a ready consultation", () => {
    assert.match(pageSource, /shouldAutoFinalizeConsultation/);
    assert.match(pageSource, /maybeAutoFinalizeSession\(result\.session\)/);
    assert.match(pageSource, /autoFinalizedSessionIdsRef/);
  });

  it("attempts auto finalization when a selected consultation is loaded ready", () => {
    assert.match(pageSource, /maybeAutoFinalizeSession\(selectedSession\)/);
    assert.match(pageSource, /selectedSession\?\.draft\.photoAnalysis\.attachmentUrls\.join/);
  });

  it("refreshes complaints when the API finalizes a handoff command directly", () => {
    assert.match(pageSource, /handleServerFinalizedSession\(result\.session/);
    assert.match(pageSource, /상담 내용이 민원 티켓으로 접수되었습니다/);
  });

  it("offers a tenant consultation history reset action for demos", () => {
    assert.match(pageSource, /상담내역 초기화/);
    assert.match(pageSource, /resetConsultationHistory/);
    assert.match(pageSource, /\/tenant\/consultations\/reset/);
    assert.match(pageSource, /정보 \{summary\.collectedSlotCount\}\/5/);
  });
});
