import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_MANAGER_PROMPT_LENGTH,
  isDialogBackdropPoint,
  managerAgentHref,
  normalizeManagerPrompt,
} from "./manager-assistant";

describe("manager assistant prompt", () => {
  it("trims and limits prompts", () => {
    assert.equal(normalizeManagerPrompt("  수납 현황 알려줘  "), "수납 현황 알려줘");
    assert.equal(normalizeManagerPrompt("가".repeat(1200)).length, MAX_MANAGER_PROMPT_LENGTH);
  });

  it("selects the first non-empty repeated query prompt and normalizes it", () => {
    assert.equal(
      normalizeManagerPrompt(["   ", "  첫 번째 질문  ", "두 번째 질문"]),
      "첫 번째 질문",
    );
    assert.equal(normalizeManagerPrompt([]), "");
  });

  it("creates an encoded prefill URL without an execution flag", () => {
    assert.equal(
      managerAgentHref("  411호 연체 내역?  "),
      "/manager/agent/realtime?prompt=411%ED%98%B8+%EC%97%B0%EC%B2%B4+%EB%82%B4%EC%97%AD%3F",
    );
    assert.equal(managerAgentHref("   "), "/manager/agent/realtime");
    assert.doesNotMatch(managerAgentHref("보내줘"), /submit|execute|send/);
  });

  it("distinguishes true backdrop points from the dialog rectangle", () => {
    const bounds = { left: 10, right: 110, top: 20, bottom: 220 };

    for (const point of [
      { clientX: 50, clientY: 100 },
      { clientX: 10, clientY: 20 },
      { clientX: 110, clientY: 220 },
    ]) {
      assert.equal(isDialogBackdropPoint(point, bounds), false, JSON.stringify(point));
    }

    for (const point of [
      { clientX: 9, clientY: 100 },
      { clientX: 111, clientY: 100 },
      { clientX: 50, clientY: 19 },
      { clientX: 50, clientY: 221 },
    ]) {
      assert.equal(isDialogBackdropPoint(point, bounds), true, JSON.stringify(point));
    }
  });
});
