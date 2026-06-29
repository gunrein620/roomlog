import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSessionConfig,
  buildClientSecretRequestBody,
  getRealtimeTools,
  REALTIME_INSTRUCTIONS,
  summarizeOpenAIError,
} from "../server.js";

test("buildSessionConfig creates the required realtime session", () => {
  const config = buildSessionConfig({
    REALTIME_MODEL: "gpt-realtime-test",
    REALTIME_VOICE: "cedar",
  });

  assert.equal(config.type, "realtime");
  assert.equal(config.model, "gpt-realtime-test");
  assert.deepEqual(config.output_modalities, ["audio"]);
  assert.equal(config.audio.output.voice, "cedar");
  assert.equal(config.audio.input.turn_detection.type, "semantic_vad");
  assert.equal(config.tool_choice, "auto");
  assert.equal(config.instructions, REALTIME_INSTRUCTIONS);
  assert.deepEqual(
    config.tools.map((tool) => tool.name),
    ["check_contract_clause", "create_defect_ticket", "request_vendor_quote"],
  );
});

test("buildClientSecretRequestBody wraps the realtime session for ephemeral tokens", () => {
  const body = buildClientSecretRequestBody({
    REALTIME_MODEL: "gpt-realtime-test",
    REALTIME_VOICE: "cedar",
  });

  assert.equal(body.session.type, "realtime");
  assert.equal(body.session.model, "gpt-realtime-test");
  assert.equal(body.session.audio.output.voice, "cedar");
  assert.deepEqual(
    body.session.tools.map((tool) => tool.name),
    ["check_contract_clause", "create_defect_ticket", "request_vendor_quote"],
  );
});

test("getRealtimeTools exposes strict object parameter schemas", () => {
  for (const tool of getRealtimeTools()) {
    assert.equal(tool.type, "function");
    assert.equal(tool.parameters.type, "object");
    assert.equal(tool.parameters.additionalProperties, false);
    assert.ok(Array.isArray(tool.parameters.required));
    assert.ok(tool.parameters.required.length > 0);
  }
});

test("summarizeOpenAIError hides long HTML bodies from the browser", () => {
  const html = `<!DOCTYPE html><html><head><title>api.openai.com | 504: Gateway time-out</title></head><body>${"x".repeat(2000)}</body></html>`;
  const summary = summarizeOpenAIError({
    status: 504,
    statusText: "Gateway Timeout",
    contentType: "text/html; charset=UTF-8",
    body: html,
    requestId: "rt_123",
    elapsedMs: 31000,
  });

  assert.match(summary, /504 Gateway Timeout/);
  assert.match(summary, /request rt_123/);
  assert.match(summary, /31000ms/);
  assert.doesNotMatch(summary, /<!DOCTYPE html>/);
  assert.ok(summary.length < 500);
});
