"use client";

// 민원/하자 대화 사이드 패널 — 대시보드에서 행을 누르면 오른쪽 절반이 열린다.
// 모달로 상세 정보를 늘어놓던 것을 접고 "세입자와의 대화" 하나에 집중한다: 티켓 스레드
// (GET manager/tickets/:id → messages)를 그대로 읽고 쓰므로 세입자탭 진행 메시지와 같은 소스다.
// 갱신은 소켓 broadcast(roomlog:activity kind=ticket)로 즉시, 실패 시 폴링으로 폴백한다.
import Link from "next/link";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TicketThreadMessage } from "@roomlog/types";
import { getRealtimeSocket } from "@/lib/realtime-client";
import {
  managerTicketMessageSenderLabel,
  ticketDashHref,
  ticketStatusLabel,
} from "../../_components/ticket-manager-ui";
import {
  resolveManagerAttachmentUrl,
  type DefectDashboardRow,
} from "./ticket-dashboard-model";
import {
  TICKET_LANES,
  canSwitchTicketLane,
  ticketLaneOf,
  type TicketLane,
} from "./ticket-lane";

const POLL_INTERVAL_MS = 15_000;

const ticketTypeLabel = {
  defect: "하자 민원",
  complaint: "일반 민원",
} as const;

function formatMessageTime(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function fetchTicketMessages(ticketId: string): Promise<TicketThreadMessage[]> {
  const response = await fetch(`/api/manager/tickets/${encodeURIComponent(ticketId)}`, {
    cache: "no-store",
  });

  if (!response.ok) throw new Error("대화를 불러오지 못했습니다.");

  const detail = (await response.json()) as { messages?: TicketThreadMessage[] };
  return detail.messages ?? [];
}

function attachmentFileName(url: string) {
  const encodedName = url.split(/[?#]/, 1)[0].split("/").filter(Boolean).at(-1) ?? "첨부 이미지";

  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
}

function MessageBubble({ message }: { message: TicketThreadMessage }) {
  const mine = message.senderRole === "LANDLORD";
  // 데모/만료 URL이 섞여 있어 깨진 이미지 아이콘 대신 파일명 링크로 떨어뜨린다.
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());

  return (
    <article className="manager-ticket-panel__message" data-mine={mine ? "true" : undefined}>
      <header>
        <span>{managerTicketMessageSenderLabel(message.senderRole)}</span>
        <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
      </header>
      {message.messageText.trim() ? <p>{message.messageText}</p> : null}
      {message.attachmentUrls.length > 0 ? (
        <div className="manager-ticket-panel__message-attachments">
          {message.attachmentUrls.map((url) => {
            const previewUrl = resolveManagerAttachmentUrl(url);
            const fileName = attachmentFileName(url);

            return failedUrls.has(url) ? (
              <a
                className="manager-ticket-panel__attachment-fallback"
                key={url}
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                {fileName}
              </a>
            ) : (
              <a key={url} href={previewUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt={`${fileName} 첨부 이미지`}
                  onError={() => setFailedUrls((current) => new Set(current).add(url))}
                />
              </a>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

export function TicketChatPanel({
  row,
  onClose,
}: {
  row: DefectDashboardRow | null;
  onClose: () => void;
}) {
  const ticketId = row?.ticket.id;
  const [messages, setMessages] = useState<TicketThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  // 레인은 서버가 진실이지만 목록 행은 다음 새로고침까지 옛 상태라, 패널 안에서 따로 들고 간다.
  const [lane, setLane] = useState<TicketLane | null>(null);
  const [isSwitchingLane, setIsSwitchingLane] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!ticketId) return;
      if (!options?.silent) setIsLoading(true);

      try {
        setMessages(await fetchTicketMessages(ticketId));
        setError("");
      } catch {
        // 조용한 갱신 실패는 화면에 이미 있는 대화를 남겨두고 다음 주기에 다시 시도한다.
        if (!options?.silent) setError("대화를 불러오지 못했습니다.");
      } finally {
        if (!options?.silent) setIsLoading(false);
      }
    },
    [ticketId],
  );

  useEffect(() => {
    setMessages([]);
    setDraft("");
    setError("");
    setLane(row ? ticketLaneOf(row.ticket.status) : null);
    if (ticketId) void refresh();
    // row는 열 때마다 새 객체라 ticketId만 본다 — 같은 티켓이면 레인을 다시 덮어쓰지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, ticketId]);

  // 실시간: 세입자·업체 쪽 티켓 활동 신호를 받으면 스레드를 다시 읽는다.
  useEffect(() => {
    if (!ticketId) return;

    function onActivity(payload: unknown) {
      const kind =
        payload && typeof payload === "object" ? (payload as { kind?: string }).kind : undefined;
      if (kind === "ticket" || kind === "messaging") void refresh({ silent: true });
    }

    const socket = getRealtimeSocket();
    socket.on("roomlog:activity", onActivity);
    return () => {
      socket.off("roomlog:activity", onActivity);
    };
  }, [refresh, ticketId]);

  // 소켓이 끊긴 환경(프록시·방화벽)에서도 대화가 멈추지 않도록 하는 폴백.
  useEffect(() => {
    if (!ticketId) return;
    const timer = window.setInterval(() => void refresh({ silent: true }), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, ticketId]);

  useEffect(() => {
    if (!ticketId) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, ticketId]);

  useEffect(() => {
    const stream = streamRef.current;
    if (stream) stream.scrollTop = stream.scrollHeight;
  }, [messages.length, ticketId]);

  async function sendMessage() {
    const messageText = draft.trim();
    if (!ticketId || !messageText || isSending) return;

    setIsSending(true);
    setError("");

    try {
      const response = await fetch(
        `/api/manager/tickets/${encodeURIComponent(ticketId)}/replies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageText }),
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => undefined)) as
          | { message?: string }
          | undefined;
        throw new Error(data?.message || "메시지를 보내지 못했습니다.");
      }

      setDraft("");
      await refresh({ silent: true });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "메시지를 보내지 못했습니다.");
    } finally {
      setIsSending(false);
    }
  }

  async function switchLane(nextLane: TicketLane) {
    if (!ticketId || isSwitchingLane || nextLane === lane) return;

    const previousLane = lane;
    setLane(nextLane); // 낙관적 반영 — 실패하면 되돌린다.
    setIsSwitchingLane(true);
    setError("");

    try {
      const response = await fetch(`/api/manager/tickets/${encodeURIComponent(ticketId)}/lane`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lane: nextLane }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => undefined)) as
          | { message?: string }
          | undefined;
        throw new Error(data?.message || "진행 상태를 바꾸지 못했습니다.");
      }
    } catch (laneError) {
      setLane(previousLane);
      setError(laneError instanceof Error ? laneError.message : "진행 상태를 바꾸지 못했습니다.");
    } finally {
      setIsSwitchingLane(false);
    }
  }

  if (!row || !ticketId) return null;
  const { ticket } = row;
  const laneSwitchable = canSwitchTicketLane(ticket.status);

  return (
    <>
      <div className="manager-ticket-panel__scrim" onClick={onClose} aria-hidden="true" />
      <aside
        className="manager-ticket-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="manager-ticket-panel-title"
      >
        <header className="manager-ticket-panel__header">
          <div className="manager-ticket-panel__header-top">
            <div>
              <p className="manager-ticket-panel__badges">
                <span
                  className="manager-defect-dashboard__type-badge"
                  data-ticket-type={ticket.type}
                >
                  {ticketTypeLabel[ticket.type]}
                </span>
              </p>
              <h2 id="manager-ticket-panel-title">{ticket.title}</h2>
              <p className="manager-ticket-panel__meta">
                {row.buildingName ?? "—"} · {ticket.unitId || "호실 미상"}
              </p>
            </div>
            <button type="button" aria-label="대화 패널 닫기" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>

          {/* 진행 상태 토글 — 상태 배지를 대신한다(읽기만 하던 배지를 누를 수 있는 축으로) */}
          <div className="manager-ticket-panel__lanes" role="group" aria-label="진행 상태">
            {laneSwitchable ? (
              TICKET_LANES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={lane === value}
                  disabled={isSwitchingLane}
                  onClick={() => void switchLane(value)}
                >
                  {label}
                </button>
              ))
            ) : (
              <span className="manager-ticket-panel__lanes-locked">
                {ticketStatusLabel[ticket.status]}
              </span>
            )}
          </div>
        </header>

        <div className="manager-ticket-panel__stream" ref={streamRef} aria-label="세입자 대화">
          {/* 접수 본문은 대개 첫 세입자 메시지와 같은 글이라, 스레드가 비어 있을 때만 보여준다. */}
          {messages.length === 0 && ticket.description?.trim() ? (
            <p className="manager-ticket-panel__intake">{ticket.description}</p>
          ) : null}

          {isLoading && messages.length === 0 ? (
            <p className="manager-ticket-panel__placeholder">대화를 불러오는 중입니다.</p>
          ) : null}

          {!isLoading && messages.length === 0 ? (
            <p className="manager-ticket-panel__placeholder">
              아직 주고받은 메시지가 없습니다. 먼저 말을 건네보세요.
            </p>
          ) : null}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>

        <footer className="manager-ticket-panel__composer">
          {error ? (
            <p className="manager-ticket-panel__error" role="alert">
              {error}
            </p>
          ) : null}
          <label className="manager-ticket-panel__sr-only" htmlFor="manager-ticket-panel-draft">
            세입자에게 보낼 메시지
          </label>
          <textarea
            id="manager-ticket-panel-draft"
            value={draft}
            maxLength={1000}
            rows={2}
            placeholder="세입자에게 보낼 메시지를 입력하세요. (Enter 전송 · Shift+Enter 줄바꿈)"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void sendMessage();
            }}
          />
          <div className="manager-ticket-panel__composer-actions">
            <Link href={ticketDashHref("01", ticket.id)}>상세 처리 화면</Link>
            <button type="button" disabled={!draft.trim() || isSending} onClick={() => void sendMessage()}>
              {isSending ? "보내는 중" : "보내기"}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
