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

export const initialManagerAssistantSessionState: ManagerAssistantSessionState = {
  stage: "choose",
  mode: "text",
  entries: [],
  pendingAction: null,
};

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
