import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closeManagerRealtimeResources,
  parseManagerRealtimeEvent,
} from "./manager-realtime-events";

describe("manager realtime event parser", () => {
  it("parses manager and assistant transcript events", () => {
    assert.deepEqual(
      parseManagerRealtimeEvent(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "이번 달 수납 현황 알려줘",
        }),
      ),
      {
        kind: "transcript",
        role: "user",
        content: "이번 달 수납 현황 알려줘",
      },
    );
    assert.deepEqual(
      parseManagerRealtimeEvent(
        JSON.stringify({
          type: "response.output_audio_transcript.done",
          transcript: "수납률은 92%입니다.",
        }),
      ),
      {
        kind: "transcript",
        role: "assistant",
        content: "수납률은 92%입니다.",
      },
    );
  });

  it("parses function call arguments without executing them", () => {
    assert.deepEqual(
      parseManagerRealtimeEvent(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          call_id: "call-1",
          arguments: JSON.stringify({
            command: "billing.send_dunning",
            text: "411호 독촉",
          }),
        }),
      ),
      {
        kind: "command",
        callId: "call-1",
        input: { command: "billing.send_dunning", text: "411호 독촉" },
      },
    );
  });

  it("maps speech and response lifecycle events to activity", () => {
    assert.deepEqual(
      parseManagerRealtimeEvent(
        JSON.stringify({ type: "input_audio_buffer.speech_started" }),
      ),
      { kind: "activity", activity: "listening" },
    );
    assert.deepEqual(
      parseManagerRealtimeEvent(JSON.stringify({ type: "response.created" })),
      { kind: "activity", activity: "responding" },
    );
    assert.deepEqual(
      parseManagerRealtimeEvent(JSON.stringify({ type: "response.done" })),
      { kind: "activity", activity: "idle" },
    );
  });
});

describe("manager realtime cleanup", () => {
  it("closes channel and peer and stops every media track", () => {
    let channelClosed = false;
    let peerClosed = false;
    let stopped = 0;

    closeManagerRealtimeResources({
      channel: { close: () => { channelClosed = true; } },
      peer: { close: () => { peerClosed = true; } },
      stream: {
        getTracks: () => [
          { stop: () => { stopped += 1; } },
          { stop: () => { stopped += 1; } },
        ],
      },
    });

    assert.equal(channelClosed, true);
    assert.equal(peerClosed, true);
    assert.equal(stopped, 2);
  });
});
