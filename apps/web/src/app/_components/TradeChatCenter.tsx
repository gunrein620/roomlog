"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { tradeChatDisplayMode } from "./trade-chat-display";

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
  listingId: string | null;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  ownerId: string;
  ownerName: string;
  messages: TradeMessage[];
};

type TradeContract = {
  id: string;
  listingId: string;
  listingTitle: string;
  threadId: string;
  landlordId: string;
  tenantId: string;
  status: "proposed" | "accepted" | "declined" | "cancelled";
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
};

function contractTermsLabel(contract: TradeContract): string {
  const deposit = (contract.depositManwon || 0).toLocaleString("ko-KR");
  if (contract.tradeType === "월세") return `월세 ${deposit}/${contract.monthlyRentManwon || 0}`;
  return `${contract.tradeType} ${deposit}만`;
}

const contractBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "9px 14px",
  borderBottom: "1px solid var(--line)",
  fontSize: "0.8rem",
  fontWeight: 800
} as const;

const contractSmallBtnStyle = {
  flex: "none",
  minHeight: 32,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid var(--line)",
  background: "#ffffff",
  fontSize: "0.76rem",
  fontWeight: 900,
  cursor: "pointer"
} as const;

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
  focusThreadId,
  lockedThreadId
}: {
  /** buyer=보낸 문의만, owner=받은 문의만, 생략=전부 */
  roleFilter?: "buyer" | "owner";
  emptyText: string;
  onRequireLogin?: () => void;
  /** 값이 바뀌면 해당 스레드를 자동으로 연다(문의 전송 직후 채팅으로 바로 진입). */
  focusThreadId?: string;
  /** 계약/생활 대시보드처럼 특정 스레드 하나만 보여줄 때 사용한다. */
  lockedThreadId?: string;
}) {
  const [threads, setThreads] = useState<TradeThreadSummary[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [openThread, setOpenThread] = useState<TradeThread | null>(null);
  const [openContract, setOpenContract] = useState<TradeContract | null>(null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isContractBusy, setIsContractBusy] = useState(false);
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
      const roleFiltered = roleFilter ? data.filter((item) => item.role === roleFilter) : data;
      setNeedsLogin(false);
      setThreads(lockedThreadId ? roleFiltered.filter((item) => item.id === lockedThreadId) : roleFiltered);
    } catch {
      // 네트워크 일시 오류는 다음 폴링에서 복구
    }
  }, [roleFilter, lockedThreadId]);

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

  // 스레드의 최신 계약 상태 — 제안 버튼/수락 카드의 근거
  const loadOpenContract = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/trade/threads/${threadId}/contract`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as TradeContract | null;
      setOpenContract(data && data.id ? data : null);
    } catch {
      // 다음 폴링에서 복구
    }
  }, []);

  // 외부에서 특정 스레드를 지목하면(문의 전송 직후/계약 대시보드) 그 대화를 바로 연다.
  useEffect(() => {
    const threadId = lockedThreadId || focusThreadId;
    if (threadId) {
      setOpenThreadId(threadId);
      loadThreads();
    }
  }, [focusThreadId, lockedThreadId, loadThreads]);

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
        loadOpenContract(current);
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
  }, [loadThreads, loadOpenThread, loadOpenContract]);

  useEffect(() => {
    loadThreads();
    // 소켓이 살아 있으면 폴링은 30초 안전망으로만 남긴다.
    const timer = window.setInterval(loadThreads, isSocketLive ? 30000 : 8000);
    return () => window.clearInterval(timer);
  }, [loadThreads, isSocketLive]);

  useEffect(() => {
    if (!openThreadId) {
      setOpenThread(null);
      setOpenContract(null);
      return;
    }
    loadOpenThread(openThreadId);
    loadOpenContract(openThreadId);
    const timer = window.setInterval(() => {
      loadOpenThread(openThreadId);
      loadOpenContract(openThreadId);
    }, isSocketLive ? 30000 : 3000);
    return () => window.clearInterval(timer);
  }, [openThreadId, loadOpenThread, loadOpenContract, isSocketLive]);

  // 새 메시지가 도착했을 때만 맨 아래로 스크롤
  useEffect(() => {
    const count = openThread?.messages.length ?? 0;
    if (count !== lastMessageCountRef.current) {
      lastMessageCountRef.current = count;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [openThread]);

  // 계약 액션 3종 — 성공/실패와 무관하게 스레드·계약 상태를 다시 읽어 화면을 맞춘다.
  const runContractAction = async (path: string, body: Record<string, unknown>, confirmText: string) => {
    if (!openThreadId || isContractBusy) return;
    if (!window.confirm(confirmText)) return;
    setIsContractBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const error = (await res.json().catch(() => null)) as { message?: string } | null;
        window.alert(error?.message ?? "계약 처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
      loadOpenThread(openThreadId);
      loadOpenContract(openThreadId);
      loadThreads();
    } finally {
      setIsContractBusy(false);
    }
  };

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

  const displayMode = tradeChatDisplayMode({
    needsLogin,
    threadsLoaded: threads !== null,
    threadCount: threads?.length ?? 0,
    hasOpenThreadId: Boolean(openThreadId),
    hasOpenThread: Boolean(openThread)
  });

  if (displayMode === "login") {
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

  if (displayMode === "loading") {
    return <div className="listing-empty-card"><p>문의 대화를 불러오는 중…</p></div>;
  }

  if (displayMode === "empty") {
    return (
      <div className="listing-empty-card">
        <strong>아직 문의 대화가 없습니다</strong>
        <p>{emptyText}</p>
      </div>
    );
  }

  // 열린 대화 화면
  if (displayMode === "open" && openThreadId && openThread) {
    const iAmOwner = openThread.ownerId === myUserId;
    const counterpart = openThread.buyerId === myUserId ? openThread.ownerName : openThread.buyerName;
    const contractClosed = openContract?.status === "declined" || openContract?.status === "cancelled";
    const canPropose = iAmOwner && Boolean(openThread.listingId) && (!openContract || contractClosed);

    const contractBar = (() => {
      if (openContract?.status === "accepted") {
        return (
          <div style={{ ...contractBarStyle, background: "#e8f7ee", color: "#136c34" }} role="status">
            ✅ 계약 체결됨 — {contractTermsLabel(openContract)}
            {!iAmOwner ? " · 마이페이지 ‘나의 집’에서 확인하세요" : ""}
          </div>
        );
      }
      if (openContract?.status === "proposed" && iAmOwner) {
        return (
          <div style={{ ...contractBarStyle, background: "#eef2fb", color: "#31406a" }} role="status">
            <span style={{ minWidth: 0 }}>📋 계약 제안 중 — {contractTermsLabel(openContract)} · {openThread.buyerName}님 수락 대기</span>
            <button
              type="button"
              disabled={isContractBusy}
              onClick={() =>
                runContractAction(
                  `/api/trade/contracts/${openContract.id}/cancel`,
                  {},
                  "계약 제안을 취소할까요?"
                )
              }
              style={{ ...contractSmallBtnStyle, color: "#b42222", borderColor: "#e6b3b3" }}
            >
              제안 취소
            </button>
          </div>
        );
      }
      if (openContract?.status === "proposed" && openContract.tenantId === myUserId) {
        return (
          <div style={{ display: "grid", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--line)", background: "#eef2fb" }} role="status">
            <strong style={{ fontSize: "0.88rem", color: "#31406a" }}>🤝 집주인이 계약을 제안했어요 — {contractTermsLabel(openContract)}</strong>
            <span style={{ color: "var(--muted)", fontSize: "0.76rem", fontWeight: 700 }}>
              수락하면 계약이 체결되고, 이 집이 마이페이지 ‘나의 집’으로 연결됩니다.
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                disabled={isContractBusy}
                onClick={() =>
                  runContractAction(
                    `/api/trade/contracts/${openContract.id}/respond`,
                    { accept: true },
                    `'${openContract.listingTitle}' 계약을 수락할까요?\n${contractTermsLabel(openContract)} 조건으로 계약이 체결됩니다.`
                  )
                }
                style={{ flex: 1, minHeight: 40, borderRadius: 10, background: "var(--blue)", color: "#ffffff", fontWeight: 900, fontSize: "0.84rem", opacity: isContractBusy ? 0.5 : 1 }}
              >
                수락하기
              </button>
              <button
                type="button"
                disabled={isContractBusy}
                onClick={() =>
                  runContractAction(
                    `/api/trade/contracts/${openContract.id}/respond`,
                    { accept: false },
                    "계약 제안을 거절할까요?"
                  )
                }
                style={{ ...contractSmallBtnStyle, minHeight: 40, padding: "0 16px" }}
              >
                거절
              </button>
            </div>
          </div>
        );
      }
      if (canPropose) {
        return (
          <div style={{ ...contractBarStyle, background: "var(--paper)" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.76rem", fontWeight: 700 }}>
              이 분과 계약을 진행하시겠어요?
            </span>
            <button
              type="button"
              disabled={isContractBusy}
              onClick={() =>
                runContractAction(
                  "/api/trade/contracts",
                  { threadId: openThread.id },
                  `${openThread.buyerName}님에게 '${openThread.listingTitle}' 계약을 제안할까요?\n상대가 수락하면 계약이 체결됩니다.`
                )
              }
              style={{ ...contractSmallBtnStyle, background: "var(--blue)", color: "#ffffff", border: "none" }}
            >
              🤝 이 분과 계약하기
            </button>
          </div>
        );
      }
      return null;
    })();

    return (
      <section aria-label="문의 대화" style={{ border: "1px solid var(--line)", borderRadius: 18, background: "var(--paper)", overflow: "hidden" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{openThread.listingTitle}</div>
            <div style={{ color: "var(--muted)", fontSize: "0.74rem", fontWeight: 800 }}>{counterpart}님과의 대화</div>
          </div>
          {lockedThreadId ? null : (
            <button
              type="button"
              onClick={() => setOpenThreadId(null)}
              style={{ flex: "none", minHeight: 32, padding: "0 12px", borderRadius: 999, border: "1px solid var(--line)", background: "var(--paper)", fontSize: "0.76rem", fontWeight: 900 }}
            >
              목록으로
            </button>
          )}
        </header>
        {contractBar}
        <div ref={scrollRef} style={{ maxHeight: "min(62vh, 560px)", minHeight: 220, overflowY: "auto", padding: 14, display: "grid", gap: 8, background: "var(--canvas)" }}>
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
  const visibleThreads = threads ?? [];
  return (
    <div style={{ display: "grid", gap: 10 }} aria-label="문의 대화 목록">
      {visibleThreads.map((thread) => (
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
