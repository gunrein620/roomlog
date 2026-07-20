"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Headphones, MessageSquare, Mic, PhoneOff, Send, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { MANAGER_BILLING_ROUTES } from "@/lib/billing-manager-nav";
import {
  MAX_MANAGER_PROMPT_LENGTH,
  managerAgentHref,
  type ManagerAssistantBriefingItem,
} from "@/lib/manager-assistant";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { MANAGER_TICKET_ROUTES } from "@/lib/ticket-manager-nav";
import { ManagerAssistantActionCard } from "./ManagerAssistantActionCard";
import { shouldManagerAssistantStickToBottom } from "./manager-assistant-scroll";
import {
  closeManagerAssistant,
  openManagerAssistant,
  setManagerAssistantDraft,
  useManagerAssistantStore,
} from "./manager-assistant-store";
import { useManagerAssistantSession } from "./useManagerAssistantSession";
import { useManagerRealtimeSession } from "./useManagerRealtimeSession";

export interface ManagerAssistantPanelProps {
  managerName?: string;
  contextLabel?: string;
  briefing?: readonly ManagerAssistantBriefingItem[];
}

export interface ManagerAssistantLauncherProps extends ManagerAssistantPanelProps {}

const quickLinks = [
  { label: "티켓 대시보드 확인", href: MANAGER_TICKET_ROUTES["M-DASH-00"] },
  { label: "연체 현황 확인", href: MANAGER_BILLING_ROUTES.overdue },
  { label: "공지 초안 작성", href: MANAGER_MESSAGING_ROUTES["M-MSG-01"] },
] as const;

export function ManagerAssistantPanel({
  managerName = "관리자",
  contextLabel = "현재 관리자 화면",
  briefing = [],
}: ManagerAssistantPanelProps) {
  const router = useRouter();
  const promptId = useId();
  const [prompt, setPrompt] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(managerAgentHref(prompt));
  }

  return (
    <section className="manager-assistant" aria-label="ROOMLOG AI 관리 비서">
      <header className="manager-assistant__intro">
        <span className="manager-assistant__eyebrow">ROOMLOG AI</span>
        <h2>{managerName}님, 무엇을 함께 살펴볼까요?</h2>
        <p>{contextLabel} 맥락을 바탕으로 확인할 항목과 초안을 정리합니다.</p>
      </header>

      {briefing.length ? (
        <div className="manager-assistant__briefing" aria-label="오늘의 브리핑">
          <strong>오늘의 브리핑</strong>
          {briefing.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={item.tone === "attention" ? "is-attention" : undefined}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="manager-assistant__quick" aria-label="바로가기">
        <strong>원천 화면 바로가기</strong>
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </div>

      <form className="manager-assistant__form" onSubmit={handleSubmit}>
        <label htmlFor={promptId}>AI 관리 비서에게 물어볼 내용</label>
        <textarea
          id={promptId}
          name="manager-assistant-prompt"
          value={prompt}
          maxLength={MAX_MANAGER_PROMPT_LENGTH}
          placeholder="예: 411호 연체 내역을 요약해 줘"
          onChange={(event) => setPrompt(event.target.value)}
        />
        <button type="submit" className="manager-assistant__submit">
          <Send aria-hidden="true" />
          <span>AI 비서에서 이어서 묻기</span>
        </button>
      </form>

      <Link className="manager-assistant__voice" href="/manager/agent/realtime">
        <Mic aria-hidden="true" />
        <span>실시간 음성 비서 열기</span>
      </Link>
      <p className="manager-assistant__notice">
        AI 제안은 초안입니다. 발송·결제·확정은 원천 화면에서 직접 확인합니다.
      </p>
    </section>
  );
}

// 플로팅 FAB — 패널 열림 상태는 전역 스토어에 있어 라우트 이동에도 유지된다.
export function ManagerAssistantLauncher(_props: ManagerAssistantLauncherProps) {
  const { open } = useManagerAssistantStore();
  if (open) return null;

  return (
    <div className="manager-assistant-launcher-frame">
      <div className="manager-assistant-launcher-frame__inner">
        <button
          type="button"
          className="manager-assistant-launcher"
          aria-label="AI 관리 비서 열기"
          aria-expanded={open}
          aria-controls="manager-assistant-panel"
          onClick={openManagerAssistant}
        >
          <Bot aria-hidden="true" />
          <span>AI 비서</span>
        </button>
      </div>
    </div>
  );
}

// 우측 사이드패널(스플릿 뷰) — 기존 모달 다이얼로그의 채팅 UI를 그대로 옮겼다.
// 대화·모드·초안은 스토어가 들고 있으므로 패널이 리마운트돼도 이어진다.
export function ManagerAssistantSidePanel(_props: ManagerAssistantPanelProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const session = useManagerAssistantSession();
  const realtime = useManagerRealtimeSession({
    appendEntry: session.appendVoiceEntry,
    applyCopilotResponse: session.applyCopilotResponse,
  });
  const stopTalkingRef = useRef(realtime.stopTalking);
  stopTalkingRef.current = realtime.stopTalking;
  const draft = useManagerAssistantStore().draft;

  useEffect(() => {
    const stopTalking = () => stopTalkingRef.current();
    const stopTalkingWhenHidden = () => {
      if (document.hidden) stopTalking();
    };

    window.addEventListener("blur", stopTalking);
    document.addEventListener("visibilitychange", stopTalkingWhenHidden);
    return () => {
      window.removeEventListener("blur", stopTalking);
      document.removeEventListener("visibilitychange", stopTalkingWhenHidden);
      stopTalking();
    };
  }, []);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
  }, [session.stage, session.mode]);

  useEffect(() => {
    if (session.stage !== "conversation" || !shouldStickToBottomRef.current) return;

    const frame = window.requestAnimationFrame(scrollTranscriptToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [
    session.entries.length,
    session.pendingAction,
    session.notice,
    session.stage,
    session.mode,
  ]);

  function updateTranscriptStickiness() {
    const transcript = transcriptRef.current;
    if (!transcript) return;

    shouldStickToBottomRef.current = shouldManagerAssistantStickToBottom(transcript);
  }

  function scrollTranscriptToBottom() {
    const transcript = transcriptRef.current;
    if (!transcript) return;

    transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
  }

  function closeAssistant() {
    realtime.disconnect();
    closeManagerAssistant();
  }

  // 모달 시절의 Esc 닫기와 동일한 동작을 패널에서도 유지한다.
  const closeAssistantRef = useRef(closeAssistant);
  closeAssistantRef.current = closeAssistant;
  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") closeAssistantRef.current();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  function selectMode(mode: "text" | "voice") {
    if (mode === "text") realtime.disconnect();
    session.selectMode(mode);
  }

  async function submitTextMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = await session.submitText(draft);
    if (submitted) setManagerAssistantDraft("");
  }

  function submitTextFromKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      session.inputDisabled
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function startPushToTalk(event: PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    realtime.startTalking();
  }

  function stopPushToTalk() {
    realtime.stopTalking();
  }

  function startPushToTalkFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.repeat || (event.key !== " " && event.key !== "Enter")) return;
    event.preventDefault();
    realtime.startTalking();
  }

  function stopPushToTalkFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    realtime.stopTalking();
  }

  return (
    <aside
      id="manager-assistant-panel"
      className="manager-assistant-panel"
      aria-labelledby="manager-assistant-panel-title"
    >
      <header className="manager-assistant-panel__header">
        <span className="manager-assistant-panel__brand">
          <Bot aria-hidden="true" />
          <strong id="manager-assistant-panel-title">Woo-zu AI 비서</strong>
        </span>
          <button
            type="button"
            aria-label="AI 관리 비서 닫기"
            onClick={closeAssistant}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <section className="manager-ai-conversation" aria-label="AI 관리 비서 대화">
            <div
              ref={transcriptRef}
              className="manager-ai-transcript"
              role="log"
              aria-live="polite"
              onScroll={updateTranscriptStickiness}
            >
              {session.entries.length ? (
                session.entries.map((entry) =>
                  entry.kind === "receipt" ? (
                    <p key={entry.id} className="manager-ai-receipt">
                      실행 완료 · {entry.summary}
                    </p>
                  ) : (
                    <div
                      key={entry.id}
                      className={`manager-ai-message manager-ai-message--${entry.role}`}
                    >
                      {entry.role !== "user" ? (
                        <span className="manager-ai-message__avatar" aria-hidden="true">
                          <Bot />
                        </span>
                      ) : null}
                      <p>{entry.content}</p>
                    </div>
                  ),
                )
              ) : (
                <div className="manager-ai-message manager-ai-message--assistant">
                  <span className="manager-ai-message__avatar" aria-hidden="true">
                    <Bot />
                  </span>
                  <p>
                    {session.mode === "text"
                      ? "텍스트로 처리할 관리 업무를 입력해 주세요."
                      : "통화 시작을 누르면 음성으로 관리 업무를 처리할 수 있습니다."}
                  </p>
                </div>
              )}
              {session.pendingAction ? (
                <ManagerAssistantActionCard
                  action={session.pendingAction}
                  busy={session.busy}
                  onConfirm={session.confirmPendingAction}
                  onCancel={session.cancelPendingAction}
                  onReviseDunning={session.revisePendingDunning}
                />
              ) : null}
            </div>
            {session.notice ? (
              <p className="manager-ai-notice" role="status">
                {session.notice}
              </p>
            ) : null}
            {session.mode === "text" ? (
              <form className="manager-ai-composer" onSubmit={submitTextMessage}>
                <label>
                  <span>대화 입력</span>
                  <textarea
                    value={draft}
                    rows={3}
                    maxLength={MAX_MANAGER_PROMPT_LENGTH}
                    disabled={session.inputDisabled}
                    placeholder={
                      session.pendingAction
                        ? "발송하거나 취소한 뒤 대화를 이어가세요"
                        : session.notice
                          ? "AI 설정 후 사용할 수 있습니다"
                          : "처리할 관리 업무를 입력하세요"
                    }
                    onChange={(event) => setManagerAssistantDraft(event.target.value)}
                    onKeyDown={submitTextFromKeyboard}
                  />
                </label>
                <button
                  type="submit"
                  aria-label="AI 관리 비서에 메시지 전송"
                  disabled={session.inputDisabled || !draft.trim()}
                >
                  <Send aria-hidden="true" />
                  <span>{session.busy ? "전송 중" : "전송"}</span>
                </button>
              </form>
            ) : (
              <div className="manager-ai-voice-controls">
                <p role="status" aria-live="polite">
                  <span className={`manager-ai-voice-status manager-ai-voice-status--${realtime.status}`} />
                  {realtime.statusLabel}
                </p>
                {realtime.status === "connected" ? (
                  <>
                    <button
                      type="button"
                      className="manager-ai-push-to-talk"
                      aria-pressed={realtime.isTalking}
                      onPointerDown={startPushToTalk}
                      onPointerUp={stopPushToTalk}
                      onPointerCancel={stopPushToTalk}
                      onLostPointerCapture={stopPushToTalk}
                      onKeyDown={startPushToTalkFromKeyboard}
                      onKeyUp={stopPushToTalkFromKeyboard}
                      onBlur={stopPushToTalk}
                    >
                      <Mic aria-hidden="true" />
                      {realtime.isTalking ? "말하는 중…" : "Push to Talk"}
                    </button>
                    <button type="button" className="is-disconnect" onClick={realtime.disconnect}>
                      <PhoneOff aria-hidden="true" />
                      통화 종료
                    </button>
                  </>
                ) : realtime.status === "connecting" ? (
                  <button type="button" className="is-disconnect" onClick={realtime.disconnect}>
                    <PhoneOff aria-hidden="true" />
                    통화 종료
                  </button>
                ) : (
                  <button type="button" onClick={realtime.connect}>
                    <Mic aria-hidden="true" />
                    통화 시작
                  </button>
                )}
                <small>
                  {realtime.status === "connected"
                    ? "버튼을 누르고 있는 동안만 음성이 전달됩니다."
                    : "통화 시작을 누른 뒤 마이크 권한을 허용해 주세요."}
                </small>
              </div>
            )}
            <div className="manager-ai-mode-toggle" aria-label="AI 상담 모드 전환">
              <button
                type="button"
                aria-pressed={session.mode === "text"}
                onClick={() => selectMode("text")}
              >
                <MessageSquare aria-hidden="true" />
                텍스트
              </button>
              <button
                type="button"
                aria-pressed={session.mode === "voice"}
                onClick={() => selectMode("voice")}
              >
                <Headphones aria-hidden="true" />
                음성
              </button>
            </div>
          </section>
    </aside>
  );
}
