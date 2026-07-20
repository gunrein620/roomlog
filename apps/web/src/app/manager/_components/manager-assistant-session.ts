import type {
  ManagerAssistantMode,
  ManagerAssistantTranscriptEntry,
  ManagerCopilotChatMessage,
  ManagerCopilotPendingAction,
} from "@roomlog/types";

export interface ManagerAssistantSessionState {
  stage: "choose" | "conversation";
  mode: ManagerAssistantMode;
  entries: ManagerAssistantTranscriptEntry[];
  pendingAction: ManagerCopilotPendingAction | null;
}

export type ManagerAssistantSessionEvent =
  | { type: "select_mode"; mode: ManagerAssistantMode }
  | { type: "append"; entry: ManagerAssistantTranscriptEntry }
  | {
      type: "set_pending_action";
      pendingAction: ManagerCopilotPendingAction | null;
    };

// 모드 선택 단계 없이 바로 텍스트 채팅으로 연다 — 음성 전환은 대화 화면 하단 토글로.
export const initialManagerAssistantSessionState: ManagerAssistantSessionState = {
  stage: "conversation",
  mode: "text",
  entries: [],
  pendingAction: null,
};

export function managerAssistantPendingTextCommand(
  value: string,
): "confirm" | null {
  return /^(승인|진행해)$/.test(value.trim()) ? "confirm" : null;
}

export function reduceManagerAssistantSession(
  state: ManagerAssistantSessionState,
  event: ManagerAssistantSessionEvent,
): ManagerAssistantSessionState {
  if (event.type === "select_mode") {
    return { ...state, stage: "conversation", mode: event.mode };
  }

  if (event.type === "append") {
    return { ...state, entries: state.entries.concat(event.entry) };
  }

  return { ...state, pendingAction: event.pendingAction };
}

export function toManagerCopilotMessages(
  entries: readonly ManagerAssistantTranscriptEntry[],
): ManagerCopilotChatMessage[] {
  return entries.flatMap((entry) => {
    if (
      entry.kind !== "message" ||
      entry.localOnly ||
      (entry.role !== "user" && entry.role !== "assistant")
    ) {
      return [];
    }

    return [{ role: entry.role, content: entry.content }];
  });
}
