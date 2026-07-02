import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  intakeModeOptions,
  idleRealtimeStatusForMode,
  intakeModeForSourceChannel,
  intakeSessionPayload,
  intakeModeConfig,
  messageInputModeForMode,
  realtimePurposeForMode
} from "./intake-mode";

describe("tenant intake modes", () => {
  it("maps chat, voice, and callbot modes to the API channels users actually start", () => {
    assert.deepEqual(
      intakeModeOptions.map((option) => option.mode),
      ["CHAT", "VOICE", "CALLBOT"]
    );
    assert.deepEqual(intakeSessionPayload("CHAT"), { sourceChannel: "REALTIME_CHAT" });
    assert.deepEqual(intakeSessionPayload("VOICE"), { sourceChannel: "VOICE_CHAT" });
    assert.deepEqual(intakeSessionPayload("CALLBOT"), { sourceChannel: "CALLBOT" });
  });

  it("uses callbot Realtime instructions only for callbot sessions", () => {
    assert.equal(realtimePurposeForMode("CHAT"), "TENANT_INTAKE");
    assert.equal(realtimePurposeForMode("VOICE"), "TENANT_INTAKE");
    assert.equal(realtimePurposeForMode("CALLBOT"), "CALLBOT_INTAKE");
  });

  it("keeps callbot sessions in callbot mode when opening a realtime connection", () => {
    assert.equal(intakeModeForSourceChannel("REALTIME_CHAT"), "CHAT");
    assert.equal(intakeModeForSourceChannel("VOICE_CHAT"), "VOICE");
    assert.equal(intakeModeForSourceChannel("CALLBOT"), "CALLBOT");
    assert.equal(intakeModeForSourceChannel("DIRECT_FORM"), "CHAT");
  });

  it("stores typed follow-up messages in callbot sessions as voice-context messages", () => {
    assert.equal(messageInputModeForMode("CHAT"), "CHAT");
    assert.equal(messageInputModeForMode("VOICE"), "VOICE");
    assert.equal(messageInputModeForMode("CALLBOT"), "VOICE");
  });

  it("gives each mode product-specific idle and connect copy", () => {
    assert.equal(idleRealtimeStatusForMode("CHAT"), "AI 채팅 상담 대기");
    assert.equal(idleRealtimeStatusForMode("VOICE"), "AI 음성 상담 대기");
    assert.equal(idleRealtimeStatusForMode("CALLBOT"), "AI 콜봇 통화 대기");
    assert.equal(intakeModeConfig("CALLBOT").connectLabel, "콜봇 통화 연결");
  });
});
