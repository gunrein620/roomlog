"use client";

import type {
  ManagerAssistantMode,
  ManagerAssistantTranscriptEntry,
  ManagerCopilotChatResponse,
  ManagerCopilotPendingAction,
} from "@roomlog/types";
import { requestManagerCopilotChat } from "../../../lib/manager-copilot-api";
import {
  managerAssistantPendingTextCommand,
  toManagerCopilotMessages,
  type ManagerAssistantSessionEvent,
} from "./manager-assistant-session";
import {
  dispatchManagerAssistantEvent,
  getManagerAssistantState,
  setManagerAssistantBusy,
  setManagerAssistantNotice,
  useManagerAssistantStore,
} from "./manager-assistant-store";

type MakeId = () => string;

export function copilotResponseEvents(
  response: ManagerCopilotChatResponse,
  makeId: MakeId = createEntryId,
): ManagerAssistantSessionEvent[] {
  const events: ManagerAssistantSessionEvent[] = [
    {
      type: "append",
      entry: {
        id: makeId(),
        kind: "message",
        role: "assistant",
        content: response.reply,
      },
    },
    {
      type: "set_pending_action",
      pendingAction: response.pendingAction ?? null,
    },
  ];

  for (const receipt of response.receipts ?? []) {
    events.push({
      type: "append",
      entry: {
        id: makeId(),
        kind: "receipt",
        receiptKind: receipt.kind,
        summary: receipt.summary,
      },
    });
  }

  return events;
}

export function copilotResponseStatus(response: ManagerCopilotChatResponse): {
  inputDisabled: boolean;
  notice: string | null;
} {
  if (response.mode === "not_configured") {
    return { inputDisabled: true, notice: response.reply };
  }

  return { inputDisabled: false, notice: null };
}

// 아래 플로우들은 전역 스토어만 읽고 쓰므로 모듈 스코프에 둔다 —
// 요청 도중 패널이 리마운트/언마운트돼도 응답이 스토어에 정상 착지한다.

function appendEntry(entry: ManagerAssistantTranscriptEntry) {
  dispatchManagerAssistantEvent({ type: "append", entry });
}

function appendSystemError(error: unknown, fallback: string) {
  appendEntry({
    id: createEntryId(),
    kind: "message",
    role: "system",
    content: error instanceof Error ? error.message : fallback,
  });
}

function applyCopilotResponse(response: ManagerCopilotChatResponse) {
  const status = copilotResponseStatus(response);
  setManagerAssistantNotice(status.notice);

  if (response.mode === "not_configured") {
    dispatchManagerAssistantEvent({ type: "set_pending_action", pendingAction: null });
    return;
  }

  for (const event of copilotResponseEvents(response)) {
    dispatchManagerAssistantEvent(event);
  }
}

async function submitText(content: string) {
  const state = getManagerAssistantState();
  const trimmed = content.trim();
  if (!trimmed || state.busy || state.notice) return false;

  const pendingCommand = state.pendingAction
    ? managerAssistantPendingTextCommand(trimmed)
    : null;
  if (state.pendingAction && pendingCommand !== "confirm") return false;

  const userEntry: ManagerAssistantTranscriptEntry = {
    id: createEntryId(),
    kind: "message",
    role: "user",
    content: trimmed,
  };
  const nextEntries = state.entries.concat(userEntry);
  appendEntry(userEntry);
  setManagerAssistantBusy(true);

  try {
    const response = await requestManagerCopilotChat({
      messages: toManagerCopilotMessages(nextEntries),
      ...(state.pendingAction
        ? { confirmActionId: state.pendingAction.id }
        : {}),
    });
    applyCopilotResponse(response);
    return true;
  } catch (error) {
    appendSystemError(error, "AI 응답을 받지 못했습니다.");
    return false;
  } finally {
    setManagerAssistantBusy(false);
  }
}

export function useManagerAssistantSession() {
  const store = useManagerAssistantStore();

  return {
    stage: store.stage,
    mode: store.mode,
    entries: store.entries,
    pendingAction: store.pendingAction,
    busy: store.busy,
    notice: store.notice,
    inputDisabled: store.busy || Boolean(store.notice),
    selectMode(mode: ManagerAssistantMode) {
      dispatchManagerAssistantEvent({ type: "select_mode", mode });
    },
    submitText,
    appendVoiceEntry: appendEntry,
    applyCopilotResponse,
    setPendingAction(pendingAction: ManagerCopilotPendingAction | null) {
      dispatchManagerAssistantEvent({ type: "set_pending_action", pendingAction });
    },
  };
}

function createEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type ManagerAssistantSessionController = ReturnType<
  typeof useManagerAssistantSession
>;
