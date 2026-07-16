"use client";

import { useReducer, useState } from "react";
import type {
  ManagerAssistantMode,
  ManagerAssistantTranscriptEntry,
  ManagerCopilotChatResponse,
} from "@roomlog/types";
import { requestManagerCopilotChat } from "../../../lib/manager-copilot-api";
import {
  initialManagerAssistantSessionState,
  reduceManagerAssistantSession,
  toManagerCopilotMessages,
  type ManagerAssistantSessionEvent,
} from "./manager-assistant-session";

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

export function useManagerAssistantSession() {
  const [state, dispatch] = useReducer(
    reduceManagerAssistantSession,
    initialManagerAssistantSessionState,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function appendEntry(entry: ManagerAssistantTranscriptEntry) {
    dispatch({ type: "append", entry });
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
    setNotice(status.notice);

    if (response.mode === "not_configured") {
      dispatch({ type: "set_pending_action", pendingAction: null });
      return;
    }

    for (const event of copilotResponseEvents(response)) {
      dispatch(event);
    }
  }

  async function submitText(content: string) {
    const trimmed = content.trim();
    if (!trimmed || busy || notice || state.pendingAction) return false;

    const userEntry: ManagerAssistantTranscriptEntry = {
      id: createEntryId(),
      kind: "message",
      role: "user",
      content: trimmed,
    };
    const nextEntries = state.entries.concat(userEntry);
    appendEntry(userEntry);
    setBusy(true);

    try {
      const response = await requestManagerCopilotChat({
        messages: toManagerCopilotMessages(nextEntries),
      });
      applyCopilotResponse(response);
      return true;
    } catch (error) {
      appendSystemError(error, "AI 응답을 받지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function resolvePendingAction(kind: "confirm" | "cancel") {
    if (!state.pendingAction || busy) return;
    setBusy(true);

    try {
      const response = await requestManagerCopilotChat({
        messages: toManagerCopilotMessages(state.entries),
        ...(kind === "confirm"
          ? { confirmActionId: state.pendingAction.id }
          : { cancelActionId: state.pendingAction.id }),
      });
      applyCopilotResponse(response);
    } catch (error) {
      appendSystemError(error, "보류 작업을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function revisePendingDunning(messageText: string, channel: string) {
    const preview = state.pendingAction?.dunningPreview;
    if (!preview || busy) return;
    setBusy(true);

    try {
      const response = await requestManagerCopilotChat({
        messages: toManagerCopilotMessages(state.entries),
        intent: {
          type: "billing.send_dunning",
          source: "assistant",
          billId: preview.billId,
          prompt: `${preview.unitId}호 ${preview.billingMonth} 독촉 문구 수정`,
          channel,
          messageText,
        },
      });
      applyCopilotResponse(response);
    } catch (error) {
      appendSystemError(error, "독촉 문구를 수정하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return {
    ...state,
    busy,
    notice,
    inputDisabled: busy || Boolean(notice) || Boolean(state.pendingAction),
    selectMode(mode: ManagerAssistantMode) {
      dispatch({ type: "select_mode", mode });
    },
    submitText,
    confirmPendingAction: () => resolvePendingAction("confirm"),
    cancelPendingAction: () => resolvePendingAction("cancel"),
    revisePendingDunning,
    appendVoiceEntry: appendEntry,
    applyCopilotResponse,
    setPendingAction(pendingAction: typeof state.pendingAction) {
      dispatch({ type: "set_pending_action", pendingAction });
    },
  };
}

function createEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type ManagerAssistantSessionController = ReturnType<
  typeof useManagerAssistantSession
>;
