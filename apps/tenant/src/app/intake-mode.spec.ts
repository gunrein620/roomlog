import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  intakeModeOptions,
  idleRealtimeStatusForMode,
  intakeModeForSourceChannel,
  intakeSessionPayload,
  intakeModeConfig,
  messageInputModeForMode,
  realtimeOpeningPromptForMode,
  realtimeOpeningPromptForSourceChannel,
  realtimePurposeForMode
} from "./intake-mode";

describe("tenant intake modes", () => {
  it("maps chat, voice, and callbot modes to the API channels users actually start", () => {
    assert.deepEqual(
      intakeModeOptions.map((option) => option.mode),
      ["CHAT", "VOICE", "CALLBOT"]
    );
    assert.deepEqual(intakeSessionPayload("CHAT"), {
      sourceChannel: "REALTIME_CHAT",
      reuseEmpty: true
    });
    assert.deepEqual(intakeSessionPayload("VOICE"), {
      sourceChannel: "VOICE_CHAT",
      reuseEmpty: true
    });
    assert.deepEqual(intakeSessionPayload("CALLBOT"), {
      sourceChannel: "CALLBOT",
      reuseEmpty: true
    });
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

  it("asks realtime sessions to start with mode-specific 상담 copy", () => {
    assert.match(realtimeOpeningPromptForMode("VOICE"), /AI 음성 상담/);
    assert.match(realtimeOpeningPromptForMode("VOICE"), /한 번에 하나씩/);
    assert.match(realtimeOpeningPromptForMode("CALLBOT"), /AI 콜봇/);
    assert.match(realtimeOpeningPromptForMode("CALLBOT"), /통화가 연결되면/);
  });

  it("derives realtime opening copy from the active session source channel", () => {
    assert.match(realtimeOpeningPromptForSourceChannel("CALLBOT"), /AI 콜봇/);
    assert.match(realtimeOpeningPromptForSourceChannel("VOICE_CHAT"), /AI 음성 상담/);
    assert.match(realtimeOpeningPromptForSourceChannel("REALTIME_CHAT"), /채팅 상담/);
  });
});
