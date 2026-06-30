export type RealtimeEventPayload = {
  type?: string;
  transcript?: string;
  text?: string;
  delta?: string;
  event_id?: string;
  item_id?: string;
  response_id?: string;
  item?: {
    id?: string;
  };
  response?: {
    id?: string;
  };
};

export type RealtimeConnectionOpenEvent = {
  type: "conversation.item.create" | "response.create";
  item?: {
    type: "message";
    role: "user";
    content: Array<{
      type: "input_text";
      text: string;
    }>;
  };
};

export type RealtimeTurnState = {
  userTranscript: string;
  assistantTranscript: string;
  userTranscriptDone: boolean;
  userSpeechStarted: boolean;
  responseDone: boolean;
  responseEventId: string;
};

export function buildRealtimeConnectionOpenEvents({
  createResponseAutomatically,
  sessionId,
  contextSummary,
  openingPrompt
}: {
  createResponseAutomatically: boolean;
  sessionId: string;
  contextSummary?: string;
  openingPrompt?: string;
}): RealtimeConnectionOpenEvent[] {
  const prompt = openingPrompt?.trim();

  if (createResponseAutomatically && !prompt) {
    return [];
  }

  const summary = contextSummary?.trim();
  const events: RealtimeConnectionOpenEvent[] = [];

  if (summary || prompt) {
    const contextText = [
      `Roomlog 상담 스레드 ${sessionId}의 연결 시작 맥락입니다.`,
      summary ? `현재 요약: ${summary}` : "",
      prompt ? `시작 지시: ${prompt}` : ""
    ]
      .filter(Boolean)
      .join(" ");

    events.push({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: contextText
          }
        ]
      }
    });
  }

  events.push({ type: "response.create" });

  return events;
}

export type RealtimeEventResult = {
  state: RealtimeTurnState;
  status?: string;
  userTranscript?: string;
  assistantTranscript?: string;
  shouldFlush: boolean;
  flushEventId: string;
};

export function emptyRealtimeTurnState(): RealtimeTurnState {
  return {
    userTranscript: "",
    assistantTranscript: "",
    userTranscriptDone: false,
    userSpeechStarted: false,
    responseDone: false,
    responseEventId: ""
  };
}

export function realtimeEventId(payload: RealtimeEventPayload) {
  return (
    payload.response_id ||
    payload.item_id ||
    payload.event_id ||
    payload.response?.id ||
    payload.item?.id ||
    ""
  );
}

export function applyRealtimeEventToTurn(
  currentState: RealtimeTurnState,
  payload: RealtimeEventPayload
): RealtimeEventResult {
  const type = payload.type ?? "";
  const state: RealtimeTurnState = { ...currentState };
  const result: RealtimeEventResult = {
    state,
    shouldFlush: false,
    flushEventId: ""
  };
  const isAssistantTranscriptDelta =
    type.includes("audio_transcript.delta") || type === "response.output_text.delta";
  const isAssistantTranscriptDone =
    type.includes("audio_transcript.done") || type === "response.output_text.done";

  if (type.includes("input_audio_transcription") && type.endsWith(".completed")) {
    const transcript = (payload.transcript || payload.text || "").trim();
    state.userTranscriptDone = true;

    if (transcript) {
      state.userTranscript = transcript;
      result.userTranscript = transcript;
      result.assistantTranscript = state.assistantTranscript;
      result.status = "세입자 음성 전사 수신됨";
    }
  } else if (isAssistantTranscriptDelta) {
    const delta = payload.delta || payload.text || "";

    if (delta) {
      state.assistantTranscript += delta;
      result.assistantTranscript = state.assistantTranscript;
    }
  } else if (isAssistantTranscriptDone) {
    const transcript = payload.transcript || payload.text || state.assistantTranscript;

    if (transcript) {
      state.assistantTranscript = transcript;
      result.assistantTranscript = transcript;
      result.status = "AI 응답 전사 완료";
    }
  } else if (type === "response.done") {
    state.responseDone = true;
    state.responseEventId = realtimeEventId(payload);
  } else if (type === "input_audio_buffer.speech_started") {
    if (state.responseDone && !state.userTranscriptDone) {
      state.assistantTranscript = "";
      state.responseDone = false;
      state.responseEventId = "";
    }

    state.userSpeechStarted = true;
    result.status = "세입자 음성이 감지되었습니다.";
  } else if (type === "input_audio_buffer.speech_stopped") {
    result.status = "음성 입력을 정리하는 중입니다.";
  } else if (type === "input_audio_buffer.timeout_triggered") {
    result.status = "잠시 말씀이 없어 AI가 확인 질문을 준비합니다.";
  }

  if (
    state.responseDone &&
    (state.userTranscriptDone || (!state.userSpeechStarted && state.assistantTranscript)) &&
    (state.userTranscript || state.assistantTranscript)
  ) {
    result.shouldFlush = true;
    result.flushEventId = state.responseEventId || realtimeEventId(payload);
  }

  return result;
}
