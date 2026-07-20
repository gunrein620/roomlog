"use client";

import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useEffect, useRef } from "react";
import {
  Bot,
  Headphones,
  MessageSquare,
  Mic,
  PhoneOff,
  Send,
  X,
} from "lucide-react";
import type { TenantAiAssistantController } from "./useTenantAiAssistant";
import {
  closeTenantAiAssistant,
  setTenantAiDraft,
  setTenantAiMode,
  useTenantAiAssistantStore,
  type TenantAiMode,
} from "./tenant-ai-assistant-store";
import { TenantVendorConnectionCard } from "./TenantVendorConnectionCard";
import { tenantVendorConnectionEligible } from "./tenant-vendor-connection";

export function TenantAiAssistantPanel({
  ai,
  onComplaintRefresh,
}: {
  ai: TenantAiAssistantController;
  onComplaintRefresh: () => void;
}) {
  const { mode, draft } = useTenantAiAssistantStore();
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [ai.messages.length, ai.busy]);

  const closeAssistant = () => {
    ai.voice.disconnect();
    closeTenantAiAssistant();
  };

  const selectMode = (nextMode: TenantAiMode) => {
    setTenantAiMode(nextMode);
    if (nextMode === "text") {
      ai.voice.disconnect();
      void ai.startTextSession();
      return;
    }
    setTenantAiDraft("");
  };

  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = draft.trim();
    if (!nextMessage || mode !== "text" || ai.busy) return;

    setTenantAiDraft("");
    void ai.submitText(nextMessage);
  };

  const submitFromKeyboard = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      ai.busy
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const startPushToTalk = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    ai.voice.startTalking();
  };

  const stopPushToTalk = () => {
    ai.voice.stopTalking();
  };

  const startPushToTalkFromKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;
    event.preventDefault();
    ai.voice.startTalking();
  };

  const stopPushToTalkFromKeyboard = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    ai.voice.stopTalking();
  };

  return (
    <aside
      id="tenant-ai-assistant-panel"
      className="tenant-ai-assistant-panel"
      aria-labelledby="tenant-ai-panel-title"
    >
      <header className="tenant-ai-assistant-panel__header">
        <span>
          <Bot aria-hidden="true" />
          <strong id="tenant-ai-panel-title">Woo-zu AI 비서</strong>
        </span>
        <button
          type="button"
          aria-label="AI 생활 도우미 닫기"
          onClick={closeAssistant}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <section className="manager-ai-conversation" aria-label="AI 생활 도우미 대화">
        <div
          ref={messagesRef}
          className="manager-ai-transcript"
          role="log"
          aria-live="polite"
        >
          {ai.messages.map((message) =>
            message.sender === "receipt" ? (
              <p key={message.id} className="manager-ai-receipt">
                {message.text}
              </p>
            ) : (
              <div
                key={message.id}
                className={`manager-ai-message manager-ai-message--${
                  message.sender === "tenant" ? "user" : message.sender
                }`}
              >
                {message.sender !== "tenant" ? (
                  <span className="manager-ai-message__avatar" aria-hidden="true">
                    <Bot />
                  </span>
                ) : null}
                <p>{message.text}</p>
              </div>
            ),
          )}
          {ai.filedComplaint &&
          tenantVendorConnectionEligible(
            ai.filedComplaint.responsibilityHint,
          ) ? (
            <TenantVendorConnectionCard
              complaintId={ai.filedComplaint.id}
              onRequested={onComplaintRefresh}
            />
          ) : null}
        </div>

        {mode === "text" ? (
          <form className="manager-ai-composer" onSubmit={submitMessage}>
            <label>
              <span>대화 입력</span>
              <textarea
                value={draft}
                rows={3}
                disabled={ai.busy}
                placeholder={
                  ai.busy
                    ? "AI 응답을 기다리는 중..."
                    : "불편한 점을 알려주세요"
                }
                onChange={(event) => setTenantAiDraft(event.target.value)}
                onKeyDown={submitFromKeyboard}
              />
            </label>
            <button
              type="submit"
              aria-label="AI 생활 도우미에 메시지 전송"
              disabled={ai.busy || !draft.trim()}
            >
              <Send aria-hidden="true" />
              <span>{ai.busy ? "전송 중" : "전송"}</span>
            </button>
          </form>
        ) : (
          <div className="manager-ai-voice-controls">
            <p role="status" aria-live="polite">
              <span
                className={`manager-ai-voice-status manager-ai-voice-status--${ai.voice.status}`}
              />
              {ai.voice.statusLabel}
            </p>
            {ai.voice.status === "connected" ? (
              <>
                <button
                  type="button"
                  className="manager-ai-push-to-talk"
                  aria-pressed={ai.voice.isTalking}
                  onPointerDown={startPushToTalk}
                  onPointerUp={stopPushToTalk}
                  onPointerCancel={stopPushToTalk}
                  onLostPointerCapture={stopPushToTalk}
                  onKeyDown={startPushToTalkFromKeyboard}
                  onKeyUp={stopPushToTalkFromKeyboard}
                  onBlur={stopPushToTalk}
                >
                  <Mic aria-hidden="true" />
                  {ai.voice.isTalking ? "말하는 중…" : "Push to Talk"}
                </button>
                <button
                  type="button"
                  className="is-disconnect"
                  onClick={ai.voice.disconnect}
                >
                  <PhoneOff aria-hidden="true" />
                  통화 종료
                </button>
              </>
            ) : ai.voice.status === "connecting" ? (
              <button
                type="button"
                className="is-disconnect"
                onClick={ai.voice.disconnect}
              >
                <PhoneOff aria-hidden="true" />
                통화 종료
              </button>
            ) : (
              <button type="button" onClick={() => void ai.voice.connect()}>
                <Mic aria-hidden="true" />
                통화 시작
              </button>
            )}
            <small>
              {ai.voice.status === "connected"
                ? "버튼을 누르고 있는 동안만 음성이 전달됩니다."
                : "통화 시작을 누른 뒤 마이크 권한을 허용해 주세요."}
            </small>
          </div>
        )}

        <div className="manager-ai-mode-toggle" aria-label="AI 상담 모드 전환">
          <button
            type="button"
            aria-pressed={mode === "text"}
            onClick={() => selectMode("text")}
          >
            <MessageSquare aria-hidden="true" />
            텍스트
          </button>
          <button
            type="button"
            aria-pressed={mode === "call"}
            onClick={() => selectMode("call")}
          >
            <Headphones aria-hidden="true" />
            음성
          </button>
        </div>
      </section>
    </aside>
  );
}
