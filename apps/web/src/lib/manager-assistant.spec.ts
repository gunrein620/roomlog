import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_MANAGER_PROMPT_LENGTH,
  managerAgentHref,
  normalizeManagerPrompt,
} from "./manager-assistant";

describe("manager assistant prompt", () => {
  it("trims and limits prompts", () => {
    assert.equal(normalizeManagerPrompt("  수납 현황 알려줘  "), "수납 현황 알려줘");
    assert.equal(normalizeManagerPrompt("가".repeat(1200)).length, MAX_MANAGER_PROMPT_LENGTH);
  });

  it("creates an encoded prefill URL without an execution flag", () => {
    assert.equal(
      managerAgentHref("  411호 연체 내역?  "),
      "/manager/agent/realtime?prompt=411%ED%98%B8+%EC%97%B0%EC%B2%B4+%EB%82%B4%EC%97%AD%3F",
    );
    assert.equal(managerAgentHref("   "), "/manager/agent/realtime");
    assert.doesNotMatch(managerAgentHref("보내줘"), /submit|execute|send/);
  });
});
