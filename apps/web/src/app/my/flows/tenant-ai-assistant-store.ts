"use client";

import { useSyncExternalStore } from "react";
import type {
  TenantIntakeDraft,
  TenantIntakeResponsibilityHint,
} from "@/lib/tenant-intake-api";

export type TenantAiMode = "text" | "call";

export type TenantAiChatMessage = {
  id: string;
  sender: "assistant" | "tenant" | "system" | "receipt";
  text: string;
};

export interface TenantAiAssistantStoreState {
  open: boolean;
  mode: TenantAiMode;
  messages: TenantAiChatMessage[];
  draft: string;
  sessionId: string | null;
  draftForRequest: TenantIntakeDraft | null;
  draftFormOpen: boolean;
  filedComplaint: {
    id: string;
    responsibilityHint?: TenantIntakeResponsibilityHint;
  } | null;
  busy: boolean;
}

const TENANT_AI_GREETING =
  "안녕하세요! 우주(Woo-zu) AI 어시스턴트입니다. 생활 중 불편한 점을 알려주시면 정리해서 관리자에게 접수까지 도와드릴게요.";

export const initialTenantAiAssistantState: TenantAiAssistantStoreState = Object.freeze<TenantAiAssistantStoreState>({
  open: false,
  mode: "text",
  messages: [
    {
      id: "tenant-ai-welcome",
      sender: "assistant",
      text: TENANT_AI_GREETING,
    },
  ],
  draft: "",
  sessionId: null,
  draftForRequest: null,
  draftFormOpen: false,
  filedComplaint: null,
  busy: false,
});

const STORAGE_KEY = "tenant-ai-assistant-session-v1";

export function parseTenantAiAssistantState(
  raw: string | null,
): TenantAiAssistantStoreState {
  if (!raw) return initialTenantAiAssistantState;

  try {
    const saved = JSON.parse(raw) as Partial<TenantAiAssistantStoreState>;
    if (!Array.isArray(saved.messages)) return initialTenantAiAssistantState;

    return {
      ...initialTenantAiAssistantState,
      ...saved,
      open: saved.open === true,
      mode: saved.mode === "call" ? "call" : "text",
      messages: saved.messages.filter(isTenantAiChatMessage),
      draft: typeof saved.draft === "string" ? saved.draft : "",
      sessionId: typeof saved.sessionId === "string" ? saved.sessionId : null,
      busy: false,
    };
  } catch {
    return initialTenantAiAssistantState;
  }
}

function isTenantAiChatMessage(value: unknown): value is TenantAiChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<TenantAiChatMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.text === "string" &&
    ["assistant", "tenant", "system", "receipt"].includes(message.sender ?? "")
  );
}

function restoreState() {
  if (typeof window === "undefined") return initialTenantAiAssistantState;
  try {
    return parseTenantAiAssistantState(window.sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return initialTenantAiAssistantState;
  }
}

function persistState(next: TenantAiAssistantStoreState) {
  if (typeof window === "undefined") return;
  try {
    const { busy: _busy, ...persistable } = next;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // 저장할 수 없는 브라우저에서도 현재 메모리 세션은 유지한다.
  }
}

let state = restoreState();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<TenantAiAssistantStoreState>) {
  state = { ...state, ...patch };
  persistState(state);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return initialTenantAiAssistantState;
}

export function useTenantAiAssistantStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function getTenantAiAssistantState() {
  return state;
}

export function openTenantAiAssistant() {
  setState({ open: true, mode: "text" });
}

export function closeTenantAiAssistant() {
  setState({ open: false });
}

export function setTenantAiMode(mode: TenantAiMode) {
  setState({ mode });
}

export function setTenantAiDraft(draft: string) {
  setState({ draft });
}

export function setTenantAiBusy(busy: boolean) {
  setState({ busy });
}

export function setTenantAiSessionId(sessionId: string | null) {
  setState({ sessionId });
}

export function appendTenantAiMessage(
  sender: TenantAiChatMessage["sender"],
  text: string,
) {
  const trimmed = text.trim();
  if (!trimmed) return;
  setState({
    messages: state.messages.concat({
      id: createMessageId(),
      sender,
      text: trimmed,
    }),
  });
}

export function setTenantAiDraftForRequest(draftForRequest: TenantIntakeDraft | null) {
  setState({ draftForRequest });
}

export function consumeTenantAiDraftForRequest() {
  setState({ draftForRequest: null });
}

export function markTenantAiDraftFormOpen(draftFormOpen: boolean) {
  setState({ draftFormOpen });
}

export function setTenantAiFiledComplaint(
  filedComplaint: TenantAiAssistantStoreState["filedComplaint"],
) {
  setState({ filedComplaint });
}

function createMessageId() {
  return `tenant-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
