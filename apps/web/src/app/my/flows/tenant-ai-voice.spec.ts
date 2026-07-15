import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { emptyRealtimeTurnState } from "../../tenant/realtime-events";
import { applyTenantVoiceEvent, tenantVoiceStatusLabel } from "./tenant-ai-voice";

describe("tenant ai voice turn mapping", () => {
  it("emits a tenant bubble when user transcription completes", () => {
    const update = applyTenantVoiceEvent(emptyRealtimeTurnState(), {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_user",
      transcript: "401호 보일러에서 소음이 심하게 납니다."
    });

    assert.equal(update.tenantTranscript, "401호 보일러에서 소음이 심하게 납니다.");
    assert.equal(update.assistantTranscript, undefined);
    assert.equal(update.flush, undefined);
  });

  it("emits an assistant bubble only when the transcript is done", () => {
    let state = emptyRealtimeTurnState();

    let update = applyTenantVoiceEvent(state, {
      type: "response.output_audio_transcript.delta",
      delta: "확인했습니다. "
    });
    state = update.state;
    assert.equal(update.assistantTranscript, undefined);

    update = applyTenantVoiceEvent(state, {
      type: "response.output_audio_transcript.done",
      transcript: "확인했습니다. 소음이 언제부터 시작됐나요?"
    });

    assert.equal(update.assistantTranscript, "확인했습니다. 소음이 언제부터 시작됐나요?");
  });

  it("maps speaking and responding events to activity like the manager assistant", () => {
    const listening = applyTenantVoiceEvent(emptyRealtimeTurnState(), {
      type: "input_audio_buffer.speech_started"
    });
    assert.equal(listening.activity, "listening");

    const responding = applyTenantVoiceEvent(emptyRealtimeTurnState(), {
      type: "response.created"
    });
    assert.equal(responding.activity, "responding");

    const idle = applyTenantVoiceEvent(emptyRealtimeTurnState(), {
      type: "input_audio_buffer.speech_stopped"
    });
    assert.equal(idle.activity, "idle");
  });

  it("flushes the completed turn once user and response are both done, then resets state", () => {
    let state = emptyRealtimeTurnState();

    state = applyTenantVoiceEvent(state, {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item_user",
      transcript: "욕실 배수구가 막혔어요."
    }).state;

    state = applyTenantVoiceEvent(state, {
      type: "response.output_audio_transcript.done",
      transcript: "사진을 한 장 보내주실 수 있을까요?"
    }).state;

    const update = applyTenantVoiceEvent(state, {
      type: "response.done",
      response: { id: "resp_flush" }
    });

    assert.ok(update.flush);
    assert.equal(update.flush.eventId, "resp_flush");
    assert.equal(update.flush.userTranscript, "욕실 배수구가 막혔어요.");
    assert.equal(update.flush.assistantTranscript, "사진을 한 장 보내주실 수 있을까요?");
    assert.deepEqual(update.state, emptyRealtimeTurnState());
  });
});

describe("tenant ai voice status label", () => {
  it("matches the manager assistant label rules", () => {
    assert.equal(tenantVoiceStatusLabel("connecting", "idle"), "연결 중");
    assert.equal(tenantVoiceStatusLabel("not_configured", "idle"), "API 키 필요");
    assert.equal(tenantVoiceStatusLabel("error", "idle"), "연결 오류");
    assert.equal(tenantVoiceStatusLabel("idle", "idle"), "연결 준비");
    assert.equal(tenantVoiceStatusLabel("connected", "listening"), "듣는 중");
    assert.equal(tenantVoiceStatusLabel("connected", "responding"), "AI 응답 중");
    assert.equal(tenantVoiceStatusLabel("connected", "idle"), "연결됨");
  });
});
