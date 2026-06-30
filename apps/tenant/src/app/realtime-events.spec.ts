import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  applyRealtimeEventToTurn,
  buildRealtimeConnectionOpenEvents,
  emptyRealtimeTurnState
} from "./realtime-events";

describe("tenant realtime events", () => {
  it("does not request an opening response when server VAD already creates responses", () => {
    const events = buildRealtimeConnectionOpenEvents({
      createResponseAutomatically: true,
      sessionId: "session_voice",
      contextSummary: "기존 접수 초안 요약"
    });

    assert.deepEqual(events, []);
  });

  it("can request a contextual opening response while keeping automatic VAD responses", () => {
    const events = buildRealtimeConnectionOpenEvents({
      createResponseAutomatically: true,
      sessionId: "session_callbot",
      contextSummary: "301호 화장실 천장 누수 / 사진 필요",
      openingPrompt: "통화가 연결되면 Roomlog 콜봇으로 짧게 인사하고 증상부터 확인하세요."
    });

    assert.equal(events.length, 2);
    assert.equal(events[0].type, "conversation.item.create");
    assert.match(
      events[0].item?.content[0]?.text ?? "",
      /Roomlog 상담 스레드 session_callbot/
    );
    assert.match(events[0].item?.content[0]?.text ?? "", /301호 화장실 천장 누수/);
    assert.match(events[0].item?.content[0]?.text ?? "", /짧게 인사/);
    assert.deepEqual(events[1], { type: "response.create" });
  });

  it("waits for late user transcription before flushing a completed response", () => {
    let state = emptyRealtimeTurnState();

    let result = applyRealtimeEventToTurn(state, {
      type: "input_audio_buffer.speech_started"
    });
    state = result.state;

    result = applyRealtimeEventToTurn(state, {
      type: "response.output_audio_transcript.delta",
      delta: "관리자 확인을 위해 접수 초안을 정리하겠습니다."
    });
    state = result.state;
    assert.equal(result.shouldFlush, false);

    result = applyRealtimeEventToTurn(state, {
      type: "response.done",
      response: { id: "resp_late_user" }
    });
    state = result.state;
    assert.equal(result.shouldFlush, false);

    result = applyRealtimeEventToTurn(state, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_user_late",
      transcript: "301호 화장실 천장에서 물이 떨어집니다."
    });

    assert.equal(result.shouldFlush, true);
    assert.equal(result.flushEventId, "resp_late_user");
    assert.equal(result.state.userTranscript, "301호 화장실 천장에서 물이 떨어집니다.");
    assert.equal(
      result.state.assistantTranscript,
      "관리자 확인을 위해 접수 초안을 정리하겠습니다."
    );
  });

  it("flushes an assistant-only opening response without mixing it into the next user transcript", () => {
    let state = emptyRealtimeTurnState();

    let result = applyRealtimeEventToTurn(state, {
      type: "response.output_audio_transcript.delta",
      delta: "현재 상담 스레드 내용을 확인했습니다."
    });
    state = result.state;

    result = applyRealtimeEventToTurn(state, {
      type: "response.done",
      response_id: "resp_opening_summary"
    });
    state = result.state;

    assert.equal(result.shouldFlush, true);
    assert.equal(result.flushEventId, "resp_opening_summary");
    assert.equal(result.state.userTranscript, "");
    assert.equal(result.state.assistantTranscript, "현재 상담 스레드 내용을 확인했습니다.");

    result = applyRealtimeEventToTurn(state, {
      type: "input_audio_buffer.speech_started"
    });
    state = result.state;

    result = applyRealtimeEventToTurn(state, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_user_after_opening",
      transcript: "301호 화장실 천장에서 물이 떨어집니다."
    });

    assert.equal(result.shouldFlush, false);
    assert.equal(result.state.userTranscript, "301호 화장실 천장에서 물이 떨어집니다.");
    assert.equal(result.state.assistantTranscript, "");
  });

  it("persists text-only realtime responses using GA output text events", () => {
    let state = emptyRealtimeTurnState();

    let result = applyRealtimeEventToTurn(state, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_user_text_response",
      transcript: "현관 도어락이 잠기지 않습니다."
    });
    state = result.state;

    result = applyRealtimeEventToTurn(state, {
      type: "response.output_text.delta",
      delta: "문 잠김 문제라 안전 확인이 필요합니다."
    });
    state = result.state;

    result = applyRealtimeEventToTurn(state, {
      type: "response.done",
      response_id: "resp_text_only"
    });

    assert.equal(result.shouldFlush, true);
    assert.equal(result.flushEventId, "resp_text_only");
    assert.equal(result.state.userTranscript, "현관 도어락이 잠기지 않습니다.");
    assert.equal(result.state.assistantTranscript, "문 잠김 문제라 안전 확인이 필요합니다.");
  });

  it("keeps compatibility with audio transcript events that omit the output segment", () => {
    let state = emptyRealtimeTurnState();

    let result = applyRealtimeEventToTurn(state, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_user_audio_response",
      transcript: "주방 싱크대 아래에서 물이 샙니다."
    });
    state = result.state;

    result = applyRealtimeEventToTurn(state, {
      type: "response.audio_transcript.delta",
      delta: "싱크대 하부 누수로 접수하겠습니다."
    });
    state = result.state;

    result = applyRealtimeEventToTurn(state, {
      type: "response.done",
      response_id: "resp_legacy_audio"
    });

    assert.equal(result.shouldFlush, true);
    assert.equal(result.flushEventId, "resp_legacy_audio");
    assert.equal(result.state.assistantTranscript, "싱크대 하부 누수로 접수하겠습니다.");
  });

  it("surfaces speech detection events as realtime conversation status", () => {
    let state = emptyRealtimeTurnState();

    let result = applyRealtimeEventToTurn(state, {
      type: "input_audio_buffer.speech_started"
    });
    state = result.state;
    assert.equal(result.status, "세입자 음성이 감지되었습니다.");
    assert.equal(result.shouldFlush, false);

    result = applyRealtimeEventToTurn(state, {
      type: "input_audio_buffer.speech_stopped"
    });
    state = result.state;
    assert.equal(result.status, "음성 입력을 정리하는 중입니다.");
    assert.equal(result.shouldFlush, false);

    result = applyRealtimeEventToTurn(state, {
      type: "input_audio_buffer.timeout_triggered"
    });
    assert.equal(result.status, "잠시 말씀이 없어 AI가 확인 질문을 준비합니다.");
    assert.equal(result.shouldFlush, false);
  });
});
