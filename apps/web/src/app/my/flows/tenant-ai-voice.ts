// 세입자 AI 음성 상담 — Realtime 이벤트를 패널 말풍선/활동 상태/턴 저장으로 변환하는 순수 로직.
// WebRTC 배선(useTenantAiAssistant)과 분리해 단위 테스트 가능하게 유지한다.
// 활동/라벨 규칙은 관리자 비서(manager-realtime-events + useManagerRealtimeSession)와 동일하게 맞춘다.
import {
  applyRealtimeEventToTurn,
  emptyRealtimeTurnState,
  type RealtimeEventPayload,
  type RealtimeTurnState,
} from "../../tenant/realtime-events";

export type TenantVoiceConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "not_configured"
  | "error";

export type TenantVoiceActivity = "idle" | "listening" | "responding";

export type TenantVoiceTurnUpdate = {
  state: RealtimeTurnState;
  tenantTranscript?: string;
  assistantTranscript?: string;
  activity?: TenantVoiceActivity;
  flush?: {
    eventId: string;
    userTranscript: string;
    assistantTranscript: string;
  };
};

// 한 Realtime 이벤트를 화면 반영 단위로 해석한다.
// - 세입자 전사 완료 → tenantTranscript 말풍선 추가
// - AI 전사 완료 → assistantTranscript 말풍선 추가
// - 활동 전환(듣는 중/응답 중) → activity
// - 턴 완료 → flush(서버 기록: /realtime/turns)
export function applyTenantVoiceEvent(
  currentState: RealtimeTurnState,
  payload: RealtimeEventPayload,
): TenantVoiceTurnUpdate {
  const result = applyRealtimeEventToTurn(currentState, payload);
  const type = payload.type ?? "";
  const update: TenantVoiceTurnUpdate = { state: result.state };

  if (type === "input_audio_buffer.speech_started") {
    update.activity = "listening";
  } else if (type === "response.created") {
    update.activity = "responding";
  } else if (type === "response.done" || type === "input_audio_buffer.speech_stopped") {
    update.activity = "idle";
  }

  if (result.userTranscript) {
    update.tenantTranscript = result.userTranscript;
  }

  const isAssistantDone =
    type.includes("audio_transcript.done") || type === "response.output_text.done";
  if (isAssistantDone && result.assistantTranscript) {
    update.assistantTranscript = result.assistantTranscript;
  }

  if (result.shouldFlush) {
    update.flush = {
      eventId: result.flushEventId,
      userTranscript: result.state.userTranscript,
      assistantTranscript: result.state.assistantTranscript,
    };
    update.state = emptyRealtimeTurnState();
  }

  return update;
}

// 관리자 비서의 managerRealtimeStatusLabel과 동일한 문구 규칙.
export function tenantVoiceStatusLabel(
  status: TenantVoiceConnectionState,
  activity: TenantVoiceActivity,
): string {
  if (status === "connecting") return "연결 중";
  if (status === "not_configured") return "API 키 필요";
  if (status === "error") return "연결 오류";
  if (status !== "connected") return "연결 준비";
  if (activity === "listening") return "듣는 중";
  if (activity === "responding") return "AI 응답 중";
  return "연결됨";
}
