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

  it("preserves announcement target, title, and body from voice tool calls", () => {
    assert.deepEqual(
      parseManagerRealtimeEvent(
        JSON.stringify({
          type: "response.function_call_arguments.done",
          call_id: "call-announcement",
          arguments: JSON.stringify({
            command: "messaging.send_announcement",
            text: "102호 에어컨 설치 공지",
            target: "관리자-세입자 플로우테스트2 102호",
            title: "102호 에어컨 설치 안내",
            body: "오늘 에어컨 설치 작업이 진행됩니다.",
          }),
        }),
      ),
      {
        kind: "command",
        callId: "call-announcement",
        input: {
          command: "messaging.send_announcement",
          text: "102호 에어컨 설치 공지",
          target: "관리자-세입자 플로우테스트2 102호",
          title: "102호 에어컨 설치 안내",
          body: "오늘 에어컨 설치 작업이 진행됩니다.",
        },
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
