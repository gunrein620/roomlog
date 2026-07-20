"use client";

import { useEffect } from "react";
import type {
  ManagerAssistantMode,
  ManagerAssistantTranscriptEntry,
  ManagerCopilotChatResponse,
  ManagerCopilotPendingAction,
} from "@roomlog/types";
import {
  requestManagerCopilotChat,
  requestManagerCurrentConfirmation,
} from "../../../lib/manager-copilot-api";
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
  options: { includeReply?: boolean } = {},
): ManagerAssistantSessionEvent[] {
  const events: ManagerAssistantSessionEvent[] = [];
  if (options.includeReply !== false) {
    events.push({
      type: "append",
      entry: {
        id: makeId(),
        kind: "message",
        role: "assistant",
        content: response.reply,
      },
    });
  }
  events.push({
    type: "set_pending_action",
    pendingAction: response.pendingAction ?? null,
  });

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

function applyCopilotResponse(
  response: ManagerCopilotChatResponse,
  options: { includeReply?: boolean } = {},
) {
  const status = copilotResponseStatus(response);
  setManagerAssistantNotice(status.notice);

  if (response.mode === "not_configured") {
    dispatchManagerAssistantEvent({ type: "set_pending_action", pendingAction: null });
    return;
  }

  for (const event of copilotResponseEvents(response, createEntryId, options)) {
    dispatchManagerAssistantEvent(event);
  }
}

async function submitText(content: string) {
  const state = getManagerAssistantState();
  const trimmed = content.trim();
  if (!trimmed || state.busy || state.notice) return false;

  let pendingAction = state.pendingAction;
  const pendingCommand = pendingAction
    ? managerAssistantPendingTextCommand(trimmed)
    : null;
  if (pendingAction && pendingCommand !== "confirm") return false;

  if (pendingAction) {
    try {
      const serverPending = await requestManagerCurrentConfirmation();
      pendingAction =
        serverPending?.id === pendingAction.id ? pendingAction : serverPending;
      dispatchManagerAssistantEvent({
        type: "set_pending_action",
        pendingAction,
      });
      if (!pendingAction) {
        appendSystemError(
          undefined,
          "확인 대기 중인 발송이 없습니다. 대상을 포함해 다시 요청해 주세요.",
        );
        return false;
      }
    } catch {
      // 확인 조회가 일시 실패하면 화면에 보존된 ID로 기존 요청을 이어간다.
    }
  }

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
      ...(pendingAction
        ? { confirmActionId: pendingAction.id }
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

  useEffect(() => {
    let active = true;

    void requestManagerCurrentConfirmation()
      .then((serverPending) => {
        if (!active) return;
        const localPending = getManagerAssistantState().pendingAction;
        dispatchManagerAssistantEvent({
          type: "set_pending_action",
          pendingAction:
            serverPending && localPending?.id === serverPending.id
              ? localPending
              : serverPending,
        });
      })
      .catch(() => {
        // 일시적인 조회 실패 때는 세션에 남아 있는 확인 정보를 유지한다.
      });

    return () => {
      active = false;
    };
  }, []);

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
