"use client";

import { ArrowUpRight, Send, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import type {
  ManagerCopilotChatMessage as CopilotChatMessage,
  ManagerCopilotChatResponse as CopilotChatResponse,
} from "@roomlog/types";
import { ManagerAssistantActionCard } from "../../_components/ManagerAssistantActionCard";
import { requestManagerCopilotChat } from "../../../../lib/manager-copilot-api";
import type { BriefingInput } from "./briefing-input";
import { buildBriefing, buildPresetResponses } from "./copilot-briefing";

type MessageTranscriptEntry = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  localOnly?: boolean;
};

type ReceiptTranscriptEntry = {
  id: string;
  type: "receipt";
  kind: string;
  summary: string;
};

type TranscriptEntry = MessageTranscriptEntry | ReceiptTranscriptEntry;

export function CopilotPanel({ briefingInput }: { briefingInput: BriefingInput }): JSX.Element {
  const briefing = useMemo(() => buildBriefing(briefingInput), [briefingInput]);
  const [briefingLead, briefingRest] = useMemo(() => splitLeadSentence(briefing), [briefing]);
  const presets = useMemo(() => buildPresetResponses(briefingInput), [briefingInput]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notConfiguredMessage, setNotConfiguredMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<CopilotChatResponse["pendingAction"] | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const inputDisabled = sending || Boolean(notConfiguredMessage) || Boolean(pendingAction);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;

    transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
  }, [entries, pendingAction]);

  function appendEntry(entry: Omit<MessageTranscriptEntry, "id">) {
    setEntries((current) => current.concat({ ...entry, id: makeId(entry.role) }));
  }

  function appendReceipts(nextReceipts: NonNullable<CopilotChatResponse["receipts"]>) {
    setEntries((current) =>
      current.concat(
        nextReceipts.map((receipt) => ({
          ...receipt,
          type: "receipt" as const,
          id: makeId("receipt")
        }))
      )
    );
  }

  function applyCopilotResponse(response: CopilotChatResponse) {
    if (response.mode === "not_configured") {
      setNotConfiguredMessage(formatNotConfiguredNotice(response.reply));
      setPendingAction(null);
      return;
    }

    appendEntry({ role: "assistant", content: response.reply });
    setPendingAction(response.pendingAction ?? null);
    setNotConfiguredMessage(null);

    if (response.receipts?.length) {
      appendReceipts(response.receipts);
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inputDisabled) return;

    const content = draft.trim();
    if (!content) return;

    const nextEntries = entries.concat({ id: makeId("user"), role: "user", content });
    setEntries(nextEntries);
    setDraft("");
    setSending(true);
    setPendingAction(null);

    try {
      const response = await requestManagerCopilotChat({ messages: toChatMessages(nextEntries) });
      applyCopilotResponse(response);
    } catch (error) {
      appendEntry({ role: "system", content: error instanceof Error ? error.message : "네트워크 오류" });
    } finally {
      setSending(false);
    }
  }

  function selectPreset(label: string, response: string) {
    setEntries((current) =>
      current.concat(
        { id: makeId("user"), role: "user", content: label, localOnly: true },
        { id: makeId("assistant"), role: "assistant", content: response, localOnly: true }
      )
    );
  }

  function submitFromKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || inputDisabled) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  async function confirmPendingAction() {
    if (!pendingAction || sending) return;

    setSending(true);

    try {
      const response = await requestManagerCopilotChat({
        messages: toChatMessages(entries),
        confirmActionId: pendingAction.id
      });
      setPendingAction(null);
      applyCopilotResponse(response);
    } catch (error) {
      appendEntry({ role: "system", content: error instanceof Error ? error.message : "네트워크 오류" });
    } finally {
      setSending(false);
    }
  }

  async function cancelPendingAction() {
    if (!pendingAction || sending) return;
    setSending(true);

    try {
      const response = await requestManagerCopilotChat({
        messages: toChatMessages(entries),
        cancelActionId: pendingAction.id,
      });
      setPendingAction(null);
      applyCopilotResponse(response);
    } catch (error) {
      appendEntry({ role: "system", content: error instanceof Error ? error.message : "네트워크 오류" });
    } finally {
      setSending(false);
    }
  }

  async function revisePendingDunning(messageText: string, channel: string) {
    const preview = pendingAction?.dunningPreview;
    if (!preview || sending) return;
    setSending(true);

    try {
      const response = await requestManagerCopilotChat({
        messages: toChatMessages(entries),
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
      appendEntry({ role: "system", content: error instanceof Error ? error.message : "네트워크 오류" });
    } finally {
      setSending(false);
    }
  }

  function openCopilot() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    dialog.showModal();
    closeButtonRef.current?.focus();
  }

  function closeCopilot() {
    dialogRef.current?.close();
  }

  return (
    <>
      {/* 배너 전체가 하나의 버튼 — 브리핑 첫 문장이 헤드라인, AI 라벨은 ✦ 한 점으로 속삭인다 */}
      <button type="button" className="manager-copilot-briefing" onClick={openCopilot}>
        <span className="manager-copilot-briefing-copy">
          <span className="manager-copilot-briefing-eyebrow">✦ AI 브리핑</span>
          <strong>{briefingLead}</strong>
          {briefingRest ? <span className="manager-copilot-briefing-rest">{briefingRest}</span> : null}
        </span>
        <span className="manager-copilot-briefing-cta">
          AI와 처리하기
          <ArrowUpRight size={17} strokeWidth={2.4} aria-hidden="true" />
        </span>
      </button>

      <dialog
        ref={dialogRef}
        className="manager-copilot-dialog"
        aria-labelledby="copilot-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeCopilot();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          closeCopilot();
        }}
      >
        <header className="manager-copilot-dialog-header">
          <h2 id="copilot-dialog-title">AI 코파일럿</h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="AI 코파일럿 닫기"
            className="manager-copilot-close"
            onClick={closeCopilot}
          >
            <X size={20} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </header>

        <section className="manager-copilot-dialog-briefing" aria-label="AI 브리핑">
          <span className="manager-copilot-briefing-eyebrow">✦ 오늘의 브리핑</span>
          <p>{briefing}</p>
        </section>

        {notConfiguredMessage ? (
          <div role="status" style={noticeStyle}>
            {notConfiguredMessage}
          </div>
        ) : null}

        <section style={chatSectionStyle} aria-label="AI 코파일럿 대화">
          <div ref={transcriptRef} role="log" aria-live="polite" style={transcriptStyle}>
            {entries.map((entry) =>
              isReceiptEntry(entry) ? (
                <ReceiptEntry key={entry.id} receipt={entry} />
              ) : (
                <TranscriptBubble key={entry.id} entry={entry} />
              )
            )}

            {pendingAction ? (
              <ManagerAssistantActionCard
                action={pendingAction}
                busy={sending}
                onConfirm={confirmPendingAction}
                onCancel={cancelPendingAction}
                onReviseDunning={revisePendingDunning}
              />
            ) : null}
          </div>

          <section aria-label="빠른 응답" style={presetListStyle}>
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => selectPreset(preset.label, preset.response)}
                disabled={sending || Boolean(pendingAction)}
                style={presetButtonStyle}
              >
                {preset.label}
              </button>
            ))}
          </section>

          <form onSubmit={submitMessage} style={formStyle}>
            <label style={inputLabelStyle}>
              <span>대화 입력</span>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={submitFromKeyboard}
                disabled={inputDisabled}
                rows={3}
                placeholder={
                  pendingAction
                    ? "발송 확인 대기 중 — 발송하거나 취소하세요"
                    : notConfiguredMessage
                      ? "AI 설정 후 사용할 수 있습니다"
                      : "처리할 일을 입력하세요"
                }
                style={textAreaStyle}
              />
            </label>
            <button
              type="submit"
              disabled={inputDisabled || !draft.trim()}
              aria-label="AI 코파일럿에 메시지 전송"
              style={sendButtonStyle}
            >
              <Send size={17} strokeWidth={2.5} aria-hidden="true" />
              {sending ? "전송 중" : "전송"}
            </button>
          </form>
        </section>
      </dialog>
      <style>{`
        /* 밤하늘 배너 — 네비의 우주가 콘텐츠로 이어지는 단 하나의 지점.
           라이트 캔버스에서 가장 어두운 표면 = 시선이 착지하는 곳. */
        .manager-copilot-briefing {
          width: 100%;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-lg);
          border: 0;
          border-radius: var(--radius-md);
          text-align: left;
          cursor: pointer;
          color: #f4f1fd;
          background:
            radial-gradient(1.5px 1.5px at 12% 26%, rgba(255, 255, 255, 0.9), transparent 55%),
            radial-gradient(1px 1px at 36% 72%, rgba(214, 205, 255, 0.7), transparent 55%),
            radial-gradient(1.5px 1.5px at 55% 18%, rgba(255, 255, 255, 0.6), transparent 55%),
            radial-gradient(1px 1px at 74% 60%, rgba(214, 205, 255, 0.6), transparent 55%),
            radial-gradient(1px 1px at 90% 28%, rgba(255, 255, 255, 0.5), transparent 55%),
            radial-gradient(circle 320px at 104% 130%, rgba(242, 123, 169, 0.2), transparent 70%),
            radial-gradient(circle 280px at -4% -70%, rgba(102, 88, 214, 0.45), transparent 72%),
            linear-gradient(120deg, #2b2258 0%, #201a3f 55%, #2a2153 100%);
          box-shadow: 0 16px 40px rgba(22, 16, 54, 0.32);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .manager-copilot-briefing:hover {
          transform: translateY(-2px);
          box-shadow:
            0 22px 52px rgba(22, 16, 54, 0.4),
            0 0 32px rgba(160, 146, 255, 0.28);
        }

        .manager-copilot-briefing:active {
          transform: translateY(0);
        }

        .manager-workspace .manager-copilot-briefing:focus-visible {
          outline: 3px solid #ffffff;
          outline-offset: 2px;
        }

        .manager-copilot-briefing-copy {
          min-width: 0;
          display: grid;
          gap: var(--space-xs);
        }

        .manager-copilot-briefing-eyebrow {
          font-size: var(--fs-caption);
          line-height: var(--lh-caption);
          font-weight: 700;
          letter-spacing: 0.14em;
          background: linear-gradient(90deg, #a9b4ff, #f6a9cd);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .manager-copilot-briefing-copy > strong {
          font-size: var(--fs-subtitle);
          line-height: var(--lh-subtitle);
        }

        .manager-copilot-briefing-rest {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(244, 241, 253, 0.68);
          font-size: var(--fs-caption);
          line-height: var(--lh-caption);
        }

        .manager-copilot-briefing-cta {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-xs);
          padding: 0 var(--space-md);
          border-radius: var(--radius-full);
          background: #ffffff;
          color: #43338f;
          font-weight: 700;
          white-space: nowrap;
          transition: transform 0.18s ease;
        }

        .manager-copilot-briefing:hover .manager-copilot-briefing-cta {
          transform: translateX(2px);
        }

        .manager-copilot-dialog {
          position: fixed;
          inset: 0 0 0 auto;
          width: min(460px, 100vw);
          max-width: none;
          height: 100dvh;
          max-height: none;
          display: none;
          grid-template-rows: auto auto minmax(0, 1fr);
          gap: var(--space-md);
          margin: 0;
          padding: var(--space-lg);
          border: 0;
          border-left: 1px solid var(--border);
          background: var(--surface-container-lowest);
          color: var(--on-surface);
          box-shadow: var(--shadow);
        }

        .manager-copilot-dialog[open] {
          display: grid;
        }

        .manager-copilot-dialog::backdrop {
          background: color-mix(in srgb, var(--on-surface) 38%, transparent);
        }

        .manager-copilot-dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-md);
        }

        .manager-copilot-dialog-header h2 {
          margin: 0;
          font-size: var(--fs-title);
          line-height: var(--lh-title);
        }

        .manager-copilot-close {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          flex: none;
          padding: 0;
          border: 0;
          border-radius: var(--radius-btn);
          background: var(--surface-container);
          color: var(--on-surface);
        }

        /* 다이얼로그 속 브리핑도 배너와 같은 밤하늘 — 같은 목소리라는 시각 신호 */
        .manager-copilot-dialog-briefing {
          display: grid;
          gap: var(--space-xs);
          padding: var(--space-md);
          border-radius: var(--radius-md);
          background: linear-gradient(120deg, #2b2258 0%, #201a3f 60%, #2a2153 100%);
          color: rgba(244, 241, 253, 0.92);
        }

        .manager-copilot-dialog-briefing p {
          margin: 0;
          line-height: var(--lh-body);
        }

        @media (max-width: 620px) {
          .manager-copilot-briefing {
            grid-template-columns: minmax(0, 1fr);
          }

          .manager-copilot-briefing-cta {
            justify-self: start;
          }

          .manager-copilot-dialog {
            width: 100vw;
            padding: var(--space-md);
            border-left: 0;
          }

          .manager-copilot-dialog-briefing {
            display: none;
          }

          .manager-copilot-dialog[open] {
            grid-template-rows: auto minmax(0, 1fr);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .manager-copilot-dialog,
          .manager-copilot-dialog::backdrop {
            scroll-behavior: auto;
          }

          .manager-copilot-briefing,
          .manager-copilot-briefing-cta {
            transition: none;
          }

          .manager-copilot-briefing:hover {
            transform: none;
          }
        }
      `}</style>
    </>
  );
}

function TranscriptBubble({ entry }: { entry: MessageTranscriptEntry }) {
  const mine = entry.role === "user";
  const system = entry.role === "system";

  return (
    <div style={{ ...chatRowStyle, justifyItems: mine ? "end" : "start" }}>
      <div
        style={{
          ...chatBubbleStyle,
          background: mine ? "var(--primary)" : system ? "var(--error-container)" : "var(--surface-container)",
          color: mine ? "var(--on-primary)" : system ? "var(--on-error-container)" : "var(--on-surface)"
        }}
      >
        <span style={bubbleLabelStyle}>{entry.role === "user" ? "나" : system ? "알림" : "AI 코파일럿"}</span>
        <span>{entry.content}</span>
      </div>
    </div>
  );
}

function ReceiptEntry({ receipt }: { receipt: ReceiptTranscriptEntry }) {
  return (
    <div style={receiptStyle}>
      <span style={receiptMarkerStyle}>✓ 실행됨</span>
      <span>{receipt.summary}</span>
    </div>
  );
}

export function toChatMessages(entries: TranscriptEntry[]): CopilotChatMessage[] {
  return entries
    .filter(
      (entry): entry is MessageTranscriptEntry & CopilotChatMessage =>
        !isReceiptEntry(entry) && !entry.localOnly && (entry.role === "user" || entry.role === "assistant")
    )
    .map(({ role, content }) => ({ role, content }));
}

function isReceiptEntry(entry: TranscriptEntry): entry is ReceiptTranscriptEntry {
  return "type" in entry && entry.type === "receipt";
}

function formatNotConfiguredNotice(reply: string) {
  const message = reply.trim() || "AI 코파일럿이 아직 설정되지 않았습니다.";
  return `${message} 서버에 키 설정 후 새로고침하면 활성화됩니다.`;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 브리핑 첫 문장을 헤드라인으로, 나머지를 보조 줄로 나눈다. */
export function splitLeadSentence(text: string): [string, string] {
  const match = text.match(/^(.*?[.!?])\s+([\s\S]+)$/);
  if (!match) return [text, ""];
  return [match[1], match[2]];
}

const bubbleLabelStyle: CSSProperties = {
  fontSize: "var(--fs-caption)",
  fontWeight: 700,
  opacity: 0.78
};

const presetListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--space-xs)"
};

const presetButtonStyle: CSSProperties = {
  minHeight: 36,
  padding: "0 var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  background: "var(--surface-container)",
  color: "var(--on-surface)",
  fontWeight: 700,
  cursor: "pointer"
};

const noticeStyle: CSSProperties = {
  padding: "var(--space-sm) var(--space-md)",
  border: "1px solid var(--outline)",
  borderRadius: "var(--radius)",
  background: "var(--surface-container-high)",
  color: "var(--on-surface)",
  lineHeight: "var(--lh-body)"
};

const chatSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-sm)",
  flex: 1,
  minHeight: 0
};

// 대화는 상자에 가두지 않는다 — 다이얼로그 바탕 위에 말풍선이 바로 뜬다.
const transcriptStyle: CSSProperties = {
  display: "grid",
  gap: "var(--space-sm)",
  alignContent: "start",
  flex: 1,
  minHeight: 120,
  overflow: "auto",
  padding: "var(--space-xs) 0"
};

const chatRowStyle: CSSProperties = {
  display: "grid"
};

const chatBubbleStyle: CSSProperties = {
  maxWidth: "min(78ch, 88%)",
  display: "grid",
  gap: "var(--space-xs)",
  padding: "var(--space-sm) var(--space-md)",
  borderRadius: "var(--radius-md)",
  lineHeight: "var(--lh-body)"
};

const receiptStyle: CSSProperties = {
  display: "grid",
  gap: "var(--space-xs)",
  justifySelf: "start",
  padding: "var(--space-sm) var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--surface-container-high)",
  color: "var(--on-surface)",
  lineHeight: "var(--lh-body)"
};

const receiptMarkerStyle: CSSProperties = {
  color: "var(--primary)",
  fontWeight: 700,
  fontSize: "var(--fs-caption)"
};

const formStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "var(--space-sm)",
  alignItems: "end"
};

const inputLabelStyle: CSSProperties = {
  display: "grid",
  gap: "var(--space-xs)",
  color: "var(--on-surface)",
  fontWeight: 700
};

const textAreaStyle: CSSProperties = {
  width: "100%",
  minHeight: 84,
  resize: "vertical",
  padding: "var(--space-sm) var(--space-md)",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
  color: "var(--input-text)",
  font: "inherit",
  lineHeight: "var(--lh-body)"
};

const sendButtonStyle: CSSProperties = {
  minHeight: "var(--touch-target)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-xs)",
  padding: "0 var(--space-lg)",
  border: "1.5px solid var(--primary)",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  fontWeight: 700,
  cursor: "pointer"
};
