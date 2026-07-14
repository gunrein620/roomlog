import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  managerPushToTalkEnabled,
  managerRealtimeStatusLabel,
  microphoneErrorMessage,
  setManagerAudioTracksEnabled,
} from "./useManagerRealtimeSession";

describe("manager realtime session labels", () => {
  it("shows listening and responding activity for connected calls", () => {
    assert.equal(managerRealtimeStatusLabel("connected", "idle"), "연결됨");
    assert.equal(managerRealtimeStatusLabel("connected", "listening"), "듣는 중");
    assert.equal(managerRealtimeStatusLabel("connected", "responding"), "AI 응답 중");
  });

  it("turns microphone errors into actionable Korean guidance", () => {
    assert.match(microphoneErrorMessage("NotAllowedError"), /마이크 권한이 거부/);
    assert.match(microphoneErrorMessage("NotFoundError"), /마이크 장치/);
    assert.match(microphoneErrorMessage("NotReadableError"), /다른 앱/);
  });

  it("keeps microphone tracks muted until push-to-talk starts", () => {
    const tracks = [{ enabled: true }, { enabled: true }];
    const stream = { getAudioTracks: () => tracks };

    assert.equal(setManagerAudioTracksEnabled(stream, false), false);
    assert.deepEqual(tracks.map((track) => track.enabled), [false, false]);

    assert.equal(setManagerAudioTracksEnabled(stream, true), true);
    assert.deepEqual(tracks.map((track) => track.enabled), [true, true]);
  });

  it("allows push-to-talk transmission only for a connected session", () => {
    assert.equal(managerPushToTalkEnabled("connected"), true);
    assert.equal(managerPushToTalkEnabled("connecting"), false);
    assert.equal(managerPushToTalkEnabled("idle"), false);
    assert.equal(managerPushToTalkEnabled("error"), false);
  });
});
