// 세입자 AI 음성 상담 — Realtime 이벤트를 패널 말풍선/상태/턴 저장으로 변환하는 순수 로직.
// WebRTC 배선(useTenantAiAssistant)과 분리해 단위 테스트 가능하게 유지한다.
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

export type TenantVoiceTurnUpdate = {
  state: RealtimeTurnState;
  tenantTranscript?: string;
  assistantTranscript?: string;
  statusNote?: string;
  flush?: {
    eventId: string;
    userTranscript: string;
    assistantTranscript: string;
  };
};

// 한 Realtime 이벤트를 화면 반영 단위로 해석한다.
// - 세입자 전사 완료 → tenantTranscript 말풍선 추가
// - AI 전사 완료 → assistantTranscript 말풍선 추가
// - 턴 완료 → flush(서버 기록: /realtime/turns)
export function applyTenantVoiceEvent(
  currentState: RealtimeTurnState,
  payload: RealtimeEventPayload,
): TenantVoiceTurnUpdate {
  const result = applyRealtimeEventToTurn(currentState, payload);
  const type = payload.type ?? "";
  const update: TenantVoiceTurnUpdate = { state: result.state };

  if (result.userTranscript) {
    update.tenantTranscript = result.userTranscript;
  }

  const isAssistantDone =
    type.includes("audio_transcript.done") || type === "response.output_text.done";
  if (isAssistantDone && result.assistantTranscript) {
    update.assistantTranscript = result.assistantTranscript;
  }

  if (result.status) {
    update.statusNote = result.status;
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

export function tenantVoiceStatusLabel(
  status: TenantVoiceConnectionState,
  statusNote?: string,
): string {
  if (status === "connecting") return "연결 중...";
  if (status === "not_configured") return "음성 상담을 사용하려면 서버에 AI 키 설정이 필요합니다.";
  if (status === "error") return "연결 오류 — 다시 통화를 시작해 주세요.";
  if (status !== "connected") return "통화 시작을 누르면 음성 상담이 연결됩니다.";
  return statusNote || "연결됨 — 편하게 말씀해 주세요.";
}
