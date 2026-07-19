"use client";

// AI 비서 대화의 전역 상태. ManagerAppShell은 공유 레이아웃이 아니라 도메인마다
// 마운트되므로(billing·contract 등은 page 단위) 컴포넌트 로컬 상태로는 탭 이동 시
// 대화가 사라진다. tour-upload-store와 같은 모듈 스코프 싱글턴 + useSyncExternalStore
// 구독으로 트랜스크립트·보류 작업·패널 열림 상태를 리마운트와 무관하게 유지한다.
// copilot 요청 플로우도 모듈 뮤테이터로 상태를 쓰므로 요청 중 이동해도 응답이 착지한다.

import { useSyncExternalStore } from "react";
import {
  initialManagerAssistantSessionState,
  reduceManagerAssistantSession,
  type ManagerAssistantSessionEvent,
  type ManagerAssistantSessionState,
} from "./manager-assistant-session";

export interface ManagerAssistantStoreState extends ManagerAssistantSessionState {
  /** 사이드패널 열림 여부 — 라우트 이동에도 유지된다. */
  open: boolean;
  busy: boolean;
  notice: string | null;
  /** 전송 전 입력 초안 — 패널 리마운트에도 잃지 않는다. */
  draft: string;
}

const INITIAL_STATE: ManagerAssistantStoreState = Object.freeze({
  ...initialManagerAssistantSessionState,
  open: false,
  busy: false,
  notice: null,
  draft: "",
});

let state: ManagerAssistantStoreState = INITIAL_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<ManagerAssistantStoreState>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ManagerAssistantStoreState {
  return state;
}

/** SSR 스냅샷은 항상 닫힌 초기 상태 (대화는 클라이언트에만 있다). */
function getServerSnapshot(): ManagerAssistantStoreState {
  return INITIAL_STATE;
}

export function useManagerAssistantStore(): ManagerAssistantStoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 비동기 플로우가 최신 상태를 읽을 때 사용 — 컴포넌트가 언마운트돼도 유효하다. */
export function getManagerAssistantState(): ManagerAssistantStoreState {
  return state;
}

export function openManagerAssistant() {
  setState({ open: true });
}

export function closeManagerAssistant() {
  setState({ open: false });
}

export function dispatchManagerAssistantEvent(event: ManagerAssistantSessionEvent) {
  setState(reduceManagerAssistantSession(state, event));
}

export function setManagerAssistantBusy(busy: boolean) {
  setState({ busy });
}

export function setManagerAssistantNotice(notice: string | null) {
  setState({ notice });
}

export function setManagerAssistantDraft(draft: string) {
  setState({ draft });
}
