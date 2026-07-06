"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRealtimeSocket } from "@/lib/realtime-client";

// 거래 문의 채팅 센터 — 구매 희망자(문의센터 탭)와 집주인(내놓은 집 마이페이지)이
// 같은 스레드를 양쪽에서 보는 공용 컴포넌트.
// 수신 1차 채널은 웹소켓 "trade:updated" 이벤트. 소켓이 끊기면 원래 폴링
// (목록 8초 · 열린 대화 3초)으로 폴백하고, 연결 중에도 느린 주기(30초) 폴링을
// 안전망으로 유지한다. 데이터 조회는 언제나 기존 REST(/api/trade/*)다.

export type TradeThreadSummary = {
  id: string;
  listingId: string | null;
  listingTitle: string;
  role: "buyer" | "owner";
  counterpartName: string;
  lastMessage: string;
  lastMessageAt: string;
  lastSenderId: string;
  messageCount: number;
};

type TradeMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

type TradeThread = {
  id: string;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  ownerId: string;
  ownerName: string;
  messages: TradeMessage[];
};

function timeLabel(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function TradeChatCenter({
  roleFilter,
  emptyText,
  onRequireLogin,
  focusThreadId
}: {
  /** buyer=보낸 문의만, owner=받은 문의만, 생략=전부 */
  roleFilter?: "buyer" | "owner";
  emptyText: string;
  onRequireLogin?: () => void;
  /** 값이 바뀌면 해당 스레드를 자동으로 연다(문의 전송 직후 채팅으로 바로 진입). */
  focusThreadId?: string;
}) {
  const [threads, setThreads] = useState<TradeThreadSummary[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<TradeThread | null>(null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [myUserId, setMyUserId] = useState("");
  const [isSocketLive, setIsSocketLive] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastMessageCountRef = useRef(0);
  const openThreadIdRef = useRef<string | null>(null);
  openThreadIdRef.current = openThreadId;

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/trade/threads", { cache: "no-store" });
      if (res.status === 401) {
        setNeedsLogin(true);
        setThreads([]);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as TradeThreadSummary[];
      setNeedsLogin(false);
      setThreads(roleFilter ? data.filter((item) => item.role === roleFilter) : data);
    } catch {
      // 네트워크 일시 오류는 다음 폴링에서 복구
    }
  }, [roleFilter]);

  const loadOpenThread = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/trade/threads/${threadId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as TradeThread;
      setOpenThread(data);
    } catch {
      // 다음 폴링에서 복구
    }
  }, []);

  // 외부에서 특정 스레드를 지목하면(문의 전송 직후) 그 대화를 바로 연다.
  useEffect(() => {
    if (focusThreadId) {
      setOpenThreadId(focusThreadId);
      loadThreads();
    }
  }, [focusThreadId, loadThreads]);

  // 내 userId — 말풍선 좌/우 구분용
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => setMyUserId(me?.userId ?? ""))
      .catch(() => undefined);
  }, []);

  // 웹소켓 수신 — 상대가 보낸 즉시 목록과 열린 대화를 갱신한다.
  useEffect(() => {
    const socket = getRealtimeSocket();
    const onConnect = () => setIsSocketLive(true);
    const onDisconnect = () => setIsSocketLive(false);
    const onTradeUpdated = (payload: { threadId?: string }) => {
      loadThreads();
      const current = openThreadIdRef.current;
      if (current && (!payload.threadId || payload.threadId === current)) {
        loadOpenThread(current);
      }
    };

    setIsSocketLive(socket.connected);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("trade:updated", onTradeUpdated);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("trade:updated", onTradeUpdated);
    };
  }, [loadThreads, loadOpenThread]);

  useEffect(() => {
    loadThreads();
    // 소켓이 살아 있으면 폴링은 30초 안전망으로만 남긴다.
    const timer = window.setInterval(loadThreads, isSocketLive ? 30000 : 8000);
    return () => window.clearInterval(timer);
  }, [loadThreads, isSocketLive]);

  useEffect(() => {
    if (!openThreadId) {
      setOpenThread(null);
      return;
    }
    loadOpenThread(openThreadId);
    const timer = window.setInterval(() => loadOpenThread(openThreadId), isSocketLive ? 30000 : 3000);
    return () => window.clearInterval(timer);
  }, [openThreadId, loadOpenThread, isSocketLive]);

  // 새 메시지가 도착했을 때만 맨 아래로 스크롤
  useEffect(() => {
    const count = openThread?.messages.length ?? 0;
    if (count !== lastMessageCountRef.current) {
      lastMessageCountRef.current = count;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [openThread]);

  const sendMessage = async () => {
    if (!openThreadId || !draft.trim() || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/trade/threads/${openThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() })
      });
      if (res.ok) {
        setDraft("");
        setOpenThread((await res.json()) as TradeThread);
        loadThreads();
      }
    } finally {
      setIsSending(false);
    }
  };

  if (needsLogin) {
    return (
      <div className="listing-empty-card" role="status">
        <strong>로그인하면 문의 대화가 보입니다</strong>
        <p>WOOZU 계정으로 로그인하면 보낸 문의와 받은 문의를 채팅으로 이어갈 수 있어요.</p>
        {onRequireLogin ? (
          <button type="button" onClick={onRequireLogin}>로그인하기</button>
        ) : null}
      </div>
    );
  }

  if (threads === null) {
    return <div className="listing-empty-card"><p>문의 대화를 불러오는 중…</p></div>;
  }

  if (threads.length === 0) {
    return (
      <div className="listing-empty-card">
        <strong>아직 문의 대화가 없습니다</strong>
        <p>{emptyText}</p>
      </div>
    );
  }

  // 열린 대화 화면
  if (openThreadId && openThread) {
    const counterpart = openThread.buyerId === myUserId ? openThread.ownerName : openThread.buyerName;
    return (
      <section aria-label="문의 대화" style={{ border: "1px solid var(--line)", borderRadius: 18, background: "var(--paper)", overflow: "hidden" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{openThread.listingTitle}</div>
            <div style={{ color: "var(--muted)", fontSize: "0.74rem", fontWeight: 800 }}>{counterpart}님과의 대화</div>
          </div>
          <button
            type="button"
            onClick={() => setOpenThreadId(null)}
            style={{ flex: "none", minHeight: 32, padding: "0 12px", borderRadius: 999, border: "1px solid var(--line)", background: "#ffffff", fontSize: "0.76rem", fontWeight: 900 }}
          >
            목록으로
          </button>
        </header>
        <div ref={scrollRef} style={{ maxHeight: 360, overflowY: "auto", padding: 14, display: "grid", gap: 8, background: "var(--canvas)" }}>
          {openThread.messages.map((message) => {
            const mine = message.senderId === myUserId;
            return (
              <div key={message.id} style={{ display: "grid", justifyItems: mine ? "end" : "start" }}>
                <div
                  style={{
                    maxWidth: "78%",
                    padding: "9px 12px",
                    borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: mine ? "var(--blue)" : "#ffffff",
                    color: mine ? "#ffffff" : "var(--ink)",
                    border: mine ? "none" : "1px solid var(--line)",
                    fontSize: "0.88rem",
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word"
                  }}
                >
                  {message.body}
                </div>
                <span style={{ marginTop: 3, color: "var(--subtle)", fontSize: "0.62rem", fontWeight: 800 }}>
                  {message.senderName} · {timeLabel(message.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
          style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--line)" }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="메시지를 입력하세요"
            aria-label="메시지 입력"
            style={{ flex: 1, minHeight: 42, padding: "0 12px", border: "1px solid #cbd1dd", borderRadius: 12, fontSize: "0.9rem" }}
          />
          <button
            type="submit"
            disabled={isSending || !draft.trim()}
            style={{ minHeight: 42, padding: "0 16px", borderRadius: 12, background: "var(--blue)", color: "#ffffff", fontWeight: 900, opacity: isSending || !draft.trim() ? 0.5 : 1 }}
          >
            보내기
          </button>
        </form>
      </section>
    );
  }

  // 스레드 목록
  return (
    <div style={{ display: "grid", gap: 10 }} aria-label="문의 대화 목록">
      {threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          onClick={() => setOpenThreadId(thread.id)}
          style={{
            display: "grid",
            gap: 5,
            padding: "12px 14px",
            border: "1px solid var(--line)",
            borderRadius: 16,
            background: "var(--paper)",
            textAlign: "left",
            boxShadow: "0 8px 18px rgba(18, 24, 40, 0.05)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.92rem" }}>
              {thread.listingTitle}
            </strong>
            <span style={{ flex: "none", color: "var(--blue)", fontSize: "0.7rem", fontWeight: 900 }}>
              {thread.role === "buyer" ? "보낸 문의" : "받은 문의"}
            </span>
          </div>
          <span style={{ color: "var(--ink)", fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {thread.lastMessage}
          </span>
          <span style={{ color: "var(--muted)", fontSize: "0.7rem", fontWeight: 800 }}>
            {thread.counterpartName} · {timeLabel(thread.lastMessageAt)} · 메시지 {thread.messageCount}개
          </span>
        </button>
      ))}
    </div>
  );
}
