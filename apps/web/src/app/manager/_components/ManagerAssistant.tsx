"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Headphones, MessageSquare, Mic, Send, X } from "lucide-react";
import {
  useId,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { MANAGER_BILLING_ROUTES } from "@/lib/billing-manager-nav";
import {
  MAX_MANAGER_PROMPT_LENGTH,
  isDialogBackdropPoint,
  managerAgentHref,
  type ManagerAssistantBriefingItem,
} from "@/lib/manager-assistant";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { MANAGER_TICKET_ROUTES } from "@/lib/ticket-manager-nav";
import {
  initialManagerAssistantSessionState,
  reduceManagerAssistantSession,
} from "./manager-assistant-session";

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

export function ManagerAssistantLauncher({
  managerName,
  contextLabel,
  briefing = [],
}: ManagerAssistantLauncherProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [session, dispatch] = useReducer(
    reduceManagerAssistantSession,
    initialManagerAssistantSessionState,
  );

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (isDialogBackdropPoint(event, bounds)) event.currentTarget.close();
  }

  return (
    <>
      <div className="manager-assistant-launcher-frame">
        <div className="manager-assistant-launcher-frame__inner">
          <button
            type="button"
            className="manager-assistant-launcher"
            aria-label="AI 관리 비서 열기"
            aria-haspopup="dialog"
            aria-controls="manager-assistant-dialog"
            onClick={() => dialogRef.current?.showModal()}
          >
            <Bot aria-hidden="true" />
            <span>AI 비서</span>
          </button>
        </div>
      </div>
      <dialog
        ref={dialogRef}
        id="manager-assistant-dialog"
        className="manager-assistant-dialog"
        aria-labelledby="manager-assistant-dialog-title"
        onClick={closeOnBackdrop}
      >
        <header className="manager-assistant-dialog__header">
          <strong id="manager-assistant-dialog-title">AI 관리 비서</strong>
          <button
            type="button"
            aria-label="AI 관리 비서 닫기"
            onClick={() => dialogRef.current?.close()}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        {session.stage === "choose" ? (
          <section className="manager-ai-mode-picker" aria-label="AI 상담 모드 선택">
            <div className="manager-ai-mode-picker__copy">
              <span>ROOMLOG AI</span>
              <h2>{managerName ?? "관리자"}님, 상담 방식을 선택해 주세요</h2>
              <p>{contextLabel ?? "현재 관리자 화면"}의 업무 맥락을 이어서 처리합니다.</p>
            </div>
            {briefing.length ? (
              <p className="manager-ai-mode-picker__briefing">
                오늘 확인할 업무가 {briefing.length}개 있습니다.
              </p>
            ) : null}
            <div className="manager-ai-mode-cards">
              <button
                type="button"
                onClick={() => dispatch({ type: "select_mode", mode: "text" })}
              >
                <MessageSquare aria-hidden="true" />
                <strong>Text Chat</strong>
                <small>TEXT</small>
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "select_mode", mode: "voice" })}
              >
                <Headphones aria-hidden="true" />
                <strong>Voice Call</strong>
                <small>CALL</small>
              </button>
            </div>
          </section>
        ) : (
          <section className="manager-ai-conversation" aria-label="AI 관리 비서 대화">
            <div className="manager-ai-transcript" role="log" aria-live="polite">
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
            </div>
            <div className="manager-ai-mode-toggle" aria-label="AI 상담 모드 전환">
              <button
                type="button"
                aria-pressed={session.mode === "text"}
                onClick={() => dispatch({ type: "select_mode", mode: "text" })}
              >
                <MessageSquare aria-hidden="true" />
                텍스트
              </button>
              <button
                type="button"
                aria-pressed={session.mode === "voice"}
                onClick={() => dispatch({ type: "select_mode", mode: "voice" })}
              >
                <Headphones aria-hidden="true" />
                음성
              </button>
            </div>
          </section>
        )}
      </dialog>
    </>
  );
}
