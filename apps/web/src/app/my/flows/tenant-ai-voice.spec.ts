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
  it("maps connection states to tenant-facing labels", () => {
    assert.equal(tenantVoiceStatusLabel("connecting"), "연결 중...");
    assert.match(tenantVoiceStatusLabel("not_configured"), /AI 키 설정/);
    assert.match(tenantVoiceStatusLabel("error"), /다시 통화/);
    assert.match(tenantVoiceStatusLabel("idle"), /통화 시작/);
    assert.equal(tenantVoiceStatusLabel("connected"), "연결됨 — 편하게 말씀해 주세요.");
    assert.equal(tenantVoiceStatusLabel("connected", "AI 응답 전사 완료"), "AI 응답 전사 완료");
  });
});
