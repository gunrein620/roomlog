"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { TRADE_LISTING_NO_PREFIX, tradePriceLabel, type TradeListing } from "@/lib/listing-catalog";
import { tradeChatDisplayMode } from "./trade-chat-display";

// 매물 거래 채팅 센터(당근식) — 매물을 보고 연락하는 사람들의 채팅 채널.
// 세입자↔관리자(입주 후) 소통 채널과는 별개다 — 그쪽은 tenant/manager messaging.
// 구매 희망자(채팅 탭)와 집주인(내놓은 집 마이페이지)이
// 같은 스레드를 양쪽에서 보는 공용 컴포넌트.
// 수신 1차 채널은 웹소켓 "trade:updated" 이벤트. 소켓이 끊기면 원래 폴링
// (목록 8초 · 열린 대화 3초)으로 폴백하고, 연결 중에도 느린 주기(30초) 폴링을
// 안전망으로 유지한다. 데이터 조회는 언제나 기존 REST(/api/trade/*)다.
//
// variant="hub"(문의센터 전용): 데스크톱 브라우저는 목록+대화 2패널,
// 앱(PWA standalone·좁은 화면)은 채팅 목록 단일 패널로 갈라진다.
// 스레드는 최근 메시지순으로 정렬하고, 상대가 보낸 새 메시지는 목록의
// 해당 채팅에 안읽음 뱃지로 표시한다(읽음 기준은 사용자별 localStorage).

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
  status: "proposed" | "accepted" | "declined" | "cancelled" | "terminated";
  tradeType: "월세" | "반전세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
};

function contractTermsLabel(contract: TradeContract): string {
  const deposit = (contract.depositManwon || 0).toLocaleString("ko-KR");
  if (contract.tradeType === "월세" || contract.tradeType === "반전세") {
    return `${contract.tradeType} ${deposit}/${contract.monthlyRentManwon || 0}`;
  }
  return `${contract.tradeType} ${deposit}만`;
}

// 계약 바 스타일은 globals.css의 .contract-bar / .contract-cta 계열 클래스가 담당한다
// — 세입자 수락 버튼의 둥둥 애니메이션(keyframes) 때문에 인라인 스타일 대신 클래스를 쓴다.

// 말풍선 옆 시각 — 날짜는 날짜 구분칩이 담당하므로 시각만
function timeLabel(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(date);
}

// 목록의 마지막 메시지 시각 — 오늘이면 시각, 아니면 날짜(당근식)
function listTimeLabel(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (date.toDateString() === new Date().toDateString()) {
    return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(date);
}

// 대화 중간의 날짜 구분칩 라벨
function dayLabel(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function sortByLatest(items: TradeThreadSummary[]): TradeThreadSummary[] {
  return [...items].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

// 문의센터 허브 레이아웃 — PWA(standalone)로 설치돼 있으면 화면 폭과 무관하게 앱 디자인,
// 일반 브라우저는 데스크톱 폭(기존 웹 포털 분기점 1080px)에서만 2패널 디자인.
function useHubLayout(): "desktop" | "app" {
  const [layout, setLayout] = useState<"desktop" | "app">("app");

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1080px)");
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setLayout(wide.matches && !standalone.matches ? "desktop" : "app");
    update();
    wide.addEventListener("change", update);
    standalone.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      standalone.removeEventListener("change", update);
    };
  }, []);

  return layout;
}

export function TradeChatCenter({
  variant,
  roleFilter,
  emptyText,
  onRequireLogin,
  focusThreadId,
  composeListing,
  lockedThreadId
}: {
  /** hub=문의센터 전용 레이아웃(데스크톱 2패널/앱 목록), 생략=기존 단일 컬럼 */
  variant?: "hub";
  /** buyer=보낸 문의만, owner=받은 문의만, 생략=전부 */
  roleFilter?: "buyer" | "owner";
  emptyText: string;
  onRequireLogin?: () => void;
  /** 값이 바뀌면 해당 스레드를 자동으로 연다(문의 전송 직후 채팅으로 바로 진입). */
  focusThreadId?: string;
  /** 매물 상세의 "문자로 문의하기"가 이 값을 실어 온다 — 기존 대화가 있으면 열고,
   *  없으면 빈 대화(초안)를 열어 첫 메시지를 보낼 때 스레드를 만든다(당근식). */
  composeListing?: { listingNo: string; title: string };
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
  // 상세에서 넘어온 "빈 대화(초안)" 모드 — 아직 스레드가 없어 첫 메시지 전송으로 생성한다.
  const [isCompose, setIsCompose] = useState(false);
  const [isContractBusy, setIsContractBusy] = useState(false);
  const [myUserId, setMyUserId] = useState("");
  const [isSocketLive, setIsSocketLive] = useState(false);
  // 스레드별 "여기까지 읽음" 메시지 개수 — 안읽음 뱃지의 기준
  const [seenCounts, setSeenCounts] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastMessageCountRef = useRef(0);
  const openThreadIdRef = useRef<string | null>(null);
  openThreadIdRef.current = openThreadId;
  const myUserIdRef = useRef("");
  myUserIdRef.current = myUserId;

  const hubLayout = useHubLayout();
  const isHub = variant === "hub";
  const isHubDesktop = isHub && hubLayout === "desktop";

  // 상세에서 온 매물번호(TRADE-<id>)는 서버 매물, 그 외(데모 매물)는 listingId 없이 제목으로 매칭한다.
  const composeListingId = composeListing?.listingNo.startsWith(TRADE_LISTING_NO_PREFIX)
    ? composeListing.listingNo.slice(TRADE_LISTING_NO_PREFIX.length)
    : null;

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
      setThreads(
        sortByLatest(lockedThreadId ? roleFiltered.filter((item) => item.id === lockedThreadId) : roleFiltered)
      );
    } catch {
      // 네트워크 일시 오류는 다음 폴링에서 복구
    }
  }, [roleFilter, lockedThreadId]);

  // 응답이 도착했을 때 이미 다른 스레드로 넘어갔다면 버린다 —
  // 늦게 온 이전 스레드 응답이 현재 대화/계약 상태를 덮어쓰는 레이스 방지.
  const loadOpenThread = useCallback(async (threadId: string) => {
    try {
      const res = await fetch(`/api/trade/threads/${threadId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as TradeThread;
      if (openThreadIdRef.current === threadId) setOpenThread(data);
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
      if (openThreadIdRef.current === threadId) setOpenContract(data && data.id ? data : null);
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

  // 상세의 "문자로 문의하기" 진입 — 이미 이 매물로 나눈 대화가 있으면 그걸 열고,
  // 없으면 빈 대화(초안)를 연다. 목록이 로드된 뒤에 판단한다.
  useEffect(() => {
    if (!composeListing || threads === null) return;
    const existing = threads.find((thread) =>
      composeListingId ? thread.listingId === composeListingId : thread.listingTitle === composeListing.title
    );
    if (existing) {
      setIsCompose(false);
      setOpenThreadId(existing.id);
    } else {
      setIsCompose(true);
      setOpenThreadId(null);
      setOpenThread(null);
    }
    // 첫 진입 시 한 번만 판단 — 이후 목록 폴링이 모드를 되돌리지 않게 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeListing?.listingNo, threads !== null]);

  // 내 userId — 말풍선 좌/우 구분용
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => setMyUserId(me?.userId ?? ""))
      .catch(() => undefined);
  }, []);

  // 읽음 기준은 사용자별로 저장 — 같은 브라우저에서 계정을 바꿔도 뱃지가 섞이지 않는다.
  useEffect(() => {
    if (!myUserId) return;
    try {
      const raw = window.localStorage.getItem(`woozuTradeSeen:${myUserId}`);
      setSeenCounts(raw ? (JSON.parse(raw) as Record<string, number>) : {});
    } catch {
      setSeenCounts({});
    }
  }, [myUserId]);

  const markThreadSeen = useCallback((threadId: string, count: number) => {
    setSeenCounts((current) => {
      if ((current[threadId] ?? 0) >= count) return current;
      const next = { ...current, [threadId]: count };
      if (myUserIdRef.current) {
        try {
          window.localStorage.setItem(`woozuTradeSeen:${myUserIdRef.current}`, JSON.stringify(next));
        } catch {
          // 저장 실패는 뱃지가 다시 보이는 것뿐 — 무시
        }
      }
      return next;
    });
  }, []);

  // 대화를 보고 있는 동안 도착한 메시지는 즉시 읽음 처리
  useEffect(() => {
    if (!openThreadId || !openThread || openThread.id !== openThreadId) return;
    markThreadSeen(openThreadId, openThread.messages.length);
  }, [openThread, openThreadId, markThreadSeen]);

  // 상대가 보낸 마지막 메시지를 아직 읽지 않았으면 그 개수(기준 없으면 최소 1)
  const unreadCount = (thread: TradeThreadSummary): number => {
    if (!myUserId || !thread.lastSenderId || thread.lastSenderId === myUserId) return 0;
    const seen = seenCounts[thread.id];
    if (seen === undefined) return 1;
    return Math.max(0, thread.messageCount - seen);
  };

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

  // 스레드가 바뀌면 이전 대화·계약 상태를 즉시 비운다 — 데스크톱 허브처럼 목록을
  // 거치지 않고 스레드 간 직행할 때 이전 스레드의 계약 바가 남던 문제 방지.
  useEffect(() => {
    setOpenThread(null);
    setOpenContract(null);
  }, [openThreadId]);

  useEffect(() => {
    if (!openThreadId) return;
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

  // 빈 대화(초안)에서의 첫 전송 — 서버가 스레드를 만들거나(신규) 같은 매물의 기존 스레드를 재사용한다.
  const sendComposeMessage = async () => {
    if (!composeListing || !draft.trim() || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch("/api/trade/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: composeListingId,
          listingTitle: composeListing.title,
          message: draft.trim()
        })
      });
      if (res.status === 401) {
        setNeedsLogin(true);
        return;
      }
      if (res.ok) {
        const thread = (await res.json()) as TradeThread;
        setDraft("");
        setIsCompose(false);
        setOpenThreadId(thread.id);
        setOpenThread(thread);
        loadThreads();
      }
    } finally {
      setIsSending(false);
    }
  };

  const openThreadFromList = (thread: TradeThreadSummary) => {
    setOpenThreadId(thread.id);
    // 목록 요약만으로 즉시 읽음 처리 — 대화 로딩을 기다리지 않고 뱃지를 끈다.
    markThreadSeen(thread.id, thread.messageCount);
  };

  // 스레드 우클릭 컨텍스트 메뉴 — 간단한 매물 정보와 "채팅방 나가기"를 띄운다.
  const [threadMenu, setThreadMenu] = useState<{ x: number; y: number; thread: TradeThreadSummary } | null>(null);
  // 메뉴에 보여줄 매물 정보 — 직접등록 매물이면 공개 목록에서 찾는다(데모 매물은 제목만).
  const [menuListing, setMenuListing] = useState<TradeListing | null>(null);
  const [isLeavingThread, setIsLeavingThread] = useState(false);

  useEffect(() => {
    if (!threadMenu) return;
    const close = () => setThreadMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [threadMenu]);

  useEffect(() => {
    setMenuListing(null);
    const listingId = threadMenu?.thread.listingId;
    if (!listingId) return;
    let cancelled = false;
    fetch("/api/trade/listings/public", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TradeListing[]) => {
        if (cancelled || !Array.isArray(data)) return;
        setMenuListing(data.find((listing) => listing.id === listingId) ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [threadMenu?.thread.listingId]);

  const openThreadMenu = (event: React.MouseEvent, thread: TradeThreadSummary) => {
    event.preventDefault();
    // 메뉴가 화면 밖으로 나가지 않게 대략적인 크기만큼 클램프한다.
    const x = Math.min(event.clientX, window.innerWidth - 280);
    const y = Math.min(event.clientY, window.innerHeight - 220);
    setThreadMenu({ x, y, thread });
  };

  const leaveThread = async (thread: Pick<TradeThreadSummary, "id" | "listingTitle">) => {
    if (isLeavingThread) return;
    if (!window.confirm(`'${thread.listingTitle}' 채팅방을 나갈까요?\n내 목록에서 사라지고, 새 메시지가 오면 다시 나타납니다.`)) return;
    setIsLeavingThread(true);
    try {
      const res = await fetch(`/api/trade/threads/${thread.id}/leave`, { method: "POST" });
      if (!res.ok) {
        window.alert("채팅방 나가기에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      setThreadMenu(null);
      if (openThreadIdRef.current === thread.id) {
        setOpenThreadId(null);
        setOpenThread(null);
        setOpenContract(null);
      }
      loadThreads();
    } finally {
      setIsLeavingThread(false);
    }
  };

  // 우클릭 메뉴 — 매물 요약(직접등록이면 주소·건물명·가격까지) + 채팅방 나가기
  const renderThreadMenu = () => {
    if (!threadMenu) return null;
    const { thread } = threadMenu;
    return (
      <div
        className="trade-thread-menu"
        role="menu"
        style={{ left: threadMenu.x, top: threadMenu.y }}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="trade-thread-menu-info">
          <strong>{thread.listingTitle}</strong>
          {menuListing ? (
            <>
              <small>{[menuListing.location, menuListing.detailAddress].filter(Boolean).join(" ")}</small>
              {menuListing.buildingName ? <small>건물명 · {menuListing.buildingName}</small> : null}
              <small>{tradePriceLabel(menuListing)} · {menuListing.roomType}</small>
            </>
          ) : (
            <small>{thread.role === "buyer" ? "보낸 채팅" : "받은 채팅"} · {thread.counterpartName}님과의 대화</small>
          )}
        </div>
        <button
          type="button"
          role="menuitem"
          className="trade-thread-menu-leave"
          disabled={isLeavingThread}
          onClick={() => leaveThread(thread)}
        >
          채팅방 나가기
        </button>
      </div>
    );
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
        <strong>로그인하면 채팅이 보입니다</strong>
        <p>WOOZU 계정으로 로그인하면 보낸 채팅과 받은 채팅을 이어갈 수 있어요.</p>
        {onRequireLogin ? (
          <button type="button" onClick={onRequireLogin}>로그인하기</button>
        ) : null}
      </div>
    );
  }

  // 열린 대화 화면 — 허브 데스크톱에서는 우측 패널, 그 외에는 단독 화면
  const renderConversation = () => {
    if (!openThreadId || !openThread) return null;
    const iAmOwner = openThread.ownerId === myUserId;
    const counterpart = openThread.buyerId === myUserId ? openThread.ownerName : openThread.buyerName;
    const contractClosed =
      openContract?.status === "declined" ||
      openContract?.status === "cancelled" ||
      openContract?.status === "terminated";
    const canPropose = iAmOwner && Boolean(openThread.listingId) && (!openContract || contractClosed);

    // 계약 바 — 양쪽 모두에게 항상 보인다. 집주인은 "계약 제안하기",
    // 세입자는 "제안 수락"이 잠긴 채 대기하다가 제안이 오면 둥둥 뜨며 활성화된다.
    const contractBar = (() => {
      if (openContract?.status === "accepted") {
        return (
          <div className="contract-bar is-done" role="status">
            <strong className="contract-bar-note">
              ✅ 계약 체결됨 — {contractTermsLabel(openContract)}
              {!iAmOwner ? " · 마이페이지 ‘나의 집’에서 확인하세요" : ""}
            </strong>
          </div>
        );
      }

      if (iAmOwner) {
        if (openContract?.status === "proposed") {
          return (
            <div className="contract-bar is-open" role="status">
              <div className="contract-bar-stack">
                <strong className="contract-bar-note">📋 계약을 제안했어요 — {contractTermsLabel(openContract)}</strong>
                <span className="contract-bar-sub">{openThread.buyerName}님이 수락하면 계약이 체결됩니다.</span>
              </div>
              <button
                type="button"
                className="contract-ghost-btn is-danger"
                disabled={isContractBusy}
                onClick={() =>
                  runContractAction(
                    `/api/trade/contracts/${openContract.id}/cancel`,
                    {},
                    "계약 제안을 취소할까요?"
                  )
                }
              >
                제안 취소
              </button>
            </div>
          );
        }
        if (canPropose) {
          return (
            <div className="contract-bar">
              <span className="contract-bar-sub">마음이 맞았다면 계약을 제안해 보세요 — 상대가 수락하면 체결됩니다.</span>
              <button
                type="button"
                className="contract-cta"
                disabled={isContractBusy}
                onClick={() =>
                  runContractAction(
                    "/api/trade/contracts",
                    { threadId: openThread.id },
                    `${openThread.buyerName}님에게 '${openThread.listingTitle}' 계약을 제안할까요?\n상대가 수락하면 계약이 체결됩니다.`
                  )
                }
              >
                🤝 계약 제안하기
              </button>
            </div>
          );
        }
        return null;
      }

      // 세입자(문의자) 쪽
      if (openContract?.status === "proposed" && openContract.tenantId === myUserId) {
        return (
          <div className="contract-bar is-open" role="status">
            <div className="contract-bar-stack">
              <strong className="contract-bar-note">🤝 집주인이 계약을 제안했어요 — {contractTermsLabel(openContract)}</strong>
              <span className="contract-bar-sub">수락하면 계약이 체결되고, 이 집이 마이페이지 ‘나의 집’으로 연결됩니다.</span>
            </div>
            <div className="contract-bar-actions">
              <button
                type="button"
                className="contract-cta is-live"
                disabled={isContractBusy}
                onClick={() =>
                  runContractAction(
                    `/api/trade/contracts/${openContract.id}/respond`,
                    { accept: true },
                    `'${openContract.listingTitle}' 계약을 수락할까요?\n${contractTermsLabel(openContract)} 조건으로 계약이 체결됩니다.`
                  )
                }
              >
                ✅ 제안 수락
              </button>
              <button
                type="button"
                className="contract-ghost-btn"
                disabled={isContractBusy}
                onClick={() =>
                  runContractAction(
                    `/api/trade/contracts/${openContract.id}/respond`,
                    { accept: false },
                    "계약 제안을 거절할까요?"
                  )
                }
              >
                거절
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="contract-bar" role="status">
          <span className="contract-bar-sub">집주인이 계약을 제안하면 수락 버튼이 켜집니다.</span>
          <button type="button" className="contract-cta" disabled title="집주인의 계약 제안을 기다리는 중">
            제안 수락
          </button>
        </div>
      );
    })();

    let lastDay = "";

    return (
      <section aria-label="채팅 대화" className="trade-chat-room">
        <header className="trade-chat-room-head">
          <div className="trade-chat-room-title">
            {/* 허브는 당근처럼 상대가 제목, 매물이 부제 — 그 외(내놓은 집·계약 채팅)는 매물이 제목 */}
            <strong>{isHub ? counterpart : openThread.listingTitle}</strong>
            <small>{isHub ? openThread.listingTitle : `${counterpart}님과의 대화`}</small>
          </div>
          <div className="trade-chat-room-actions">
            {lockedThreadId || isHubDesktop ? null : (
              <button type="button" className="trade-chat-back" onClick={() => setOpenThreadId(null)}>
                목록으로
              </button>
            )}
            {lockedThreadId ? null : (
              <button
                type="button"
                className="trade-chat-leave"
                disabled={isLeavingThread}
                onClick={() => leaveThread({ id: openThread.id, listingTitle: openThread.listingTitle })}
              >
                채팅방 나가기
              </button>
            )}
          </div>
        </header>
        {contractBar}
        <div ref={scrollRef} className="trade-chat-scroll">
          {openThread.messages.map((message) => {
            const mine = message.senderId === myUserId;
            const day = dayLabel(message.createdAt);
            const showDay = Boolean(day) && day !== lastDay;
            if (showDay) lastDay = day;
            return (
              <Fragment key={message.id}>
                {showDay ? <div className="trade-day-chip">{day}</div> : null}
                <div className={mine ? "trade-msg mine" : "trade-msg"}>
                  <div className="trade-msg-bubble">{message.body}</div>
                  <span className="trade-msg-meta">
                    {message.senderName} · {timeLabel(message.createdAt)}
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
        <form
          className="trade-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="메시지를 입력해주세요"
            aria-label="메시지 입력"
          />
          <button type="submit" disabled={isSending || !draft.trim()}>
            보내기
          </button>
        </form>
      </section>
    );
  };

  // 빈 대화(초안) — 상세 "문자로 문의하기"로 들어왔지만 아직 주고받은 메시지가 없는 상태.
  // 첫 메시지를 보내는 순간 스레드가 만들어져 일반 대화로 전환된다.
  const renderCompose = () => {
    if (!composeListing) return null;
    return (
      <section aria-label="채팅 대화" className="trade-chat-room">
        <header className="trade-chat-room-head">
          <div className="trade-chat-room-title">
            <strong>{composeListing.title}</strong>
            <small>메시지를 보내면 집주인과의 대화가 시작됩니다</small>
          </div>
          {lockedThreadId || isHubDesktop ? null : (
            <button type="button" className="trade-chat-back" onClick={() => setIsCompose(false)}>
              목록으로
            </button>
          )}
        </header>
        <div className="trade-chat-scroll">
          <div className="trade-compose-hint">
            <strong>이 매물로 채팅을 시작해요</strong>
            <p>궁금한 점을 남기면 집주인에게 바로 전달됩니다.</p>
          </div>
        </div>
        <form
          className="trade-chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            sendComposeMessage();
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="메시지를 입력해주세요"
            aria-label="메시지 입력"
            autoFocus
          />
          <button type="submit" disabled={isSending || !draft.trim()}>
            보내기
          </button>
        </form>
      </section>
    );
  };

  // 허브 목록 행(당근식) — 아바타 · 상대 이름 · 매물/시각 메타 · 마지막 메시지 · 안읽음 뱃지
  const renderHubList = (items: TradeThreadSummary[]) => (
    <div className={isHubDesktop ? "trade-hub-list desktop" : "trade-hub-list app"} aria-label="채팅 목록">
      {items.map((thread) => {
        const unread = openThreadId === thread.id ? 0 : unreadCount(thread);
        return (
          <button
            key={thread.id}
            type="button"
            className={openThreadId === thread.id ? "trade-hub-item active" : "trade-hub-item"}
            onClick={() => openThreadFromList(thread)}
            onContextMenu={(event) => openThreadMenu(event, thread)}
          >
            <span className="trade-hub-avatar" aria-hidden="true">
              {(thread.counterpartName || "집").slice(0, 1)}
            </span>
            <span className="trade-hub-item-main">
              <span className="trade-hub-item-top">
                <strong>{thread.counterpartName}</strong>
                <small>
                  {thread.role === "buyer" ? "보낸 채팅" : "받은 채팅"} · {listTimeLabel(thread.lastMessageAt)}
                </small>
              </span>
              <span className="trade-hub-item-listing">{thread.listingTitle}</span>
              <span className="trade-hub-item-preview">{thread.lastMessage}</span>
            </span>
            {unread > 0 ? (
              <span className="trade-hub-unread" aria-label={`새 메시지 ${unread}개`}>
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  // 허브 데스크톱 = 당근채팅 웹처럼 목록·대화를 한 프레임에 — 목록은 항상 왼쪽에 유지
  if (isHubDesktop) {
    if (threads === null) {
      return <div className="listing-empty-card"><p>채팅을 불러오는 중…</p></div>;
    }
    if (threads.length === 0 && !isCompose) {
      return (
        <div className="listing-empty-card">
          <strong>아직 채팅이 없습니다</strong>
          <p>{emptyText}</p>
        </div>
      );
    }
    return (
      <div className="trade-hub-desktop">
        {renderThreadMenu()}
        {renderHubList(threads)}
        <div className="trade-hub-room">
          {openThreadId ? (
            openThread ? (
              renderConversation()
            ) : (
              <div className="trade-hub-placeholder"><p>대화를 불러오는 중…</p></div>
            )
          ) : isCompose ? (
            renderCompose()
          ) : (
            <div className="trade-hub-placeholder">
              <strong>대화를 선택해주세요</strong>
              <p>왼쪽 목록에서 채팅을 고르면 여기에 대화가 열립니다.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 빈 대화(초안) — 앱/단일 레이아웃에서는 대화 화면을 전체로 띄운다.
  if (isCompose && !openThreadId) {
    return renderCompose();
  }

  if (displayMode === "loading") {
    return <div className="listing-empty-card"><p>채팅을 불러오는 중…</p></div>;
  }

  if (displayMode === "empty") {
    return (
      <div className="listing-empty-card">
        <strong>아직 채팅이 없습니다</strong>
        <p>{emptyText}</p>
      </div>
    );
  }

  if (displayMode === "open" && openThreadId && openThread) {
    return renderConversation();
  }

  // 스레드 목록 — 허브(앱)는 당근식 채팅 목록, 그 외는 기존 카드 목록
  const visibleThreads = threads ?? [];
  if (isHub) {
    return (
      <>
        {renderThreadMenu()}
        {renderHubList(visibleThreads)}
      </>
    );
  }
  return (
    <div style={{ display: "grid", gap: 10 }} aria-label="채팅 목록">
      {renderThreadMenu()}
      {visibleThreads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          onClick={() => openThreadFromList(thread)}
          onContextMenu={(event) => openThreadMenu(event, thread)}
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
              {thread.role === "buyer" ? "보낸 채팅" : "받은 채팅"}
            </span>
          </div>
          <span style={{ color: "var(--ink)", fontSize: "0.82rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {thread.lastMessage}
          </span>
          <span style={{ color: "var(--muted)", fontSize: "0.7rem", fontWeight: 800 }}>
            {thread.counterpartName} · {listTimeLabel(thread.lastMessageAt)} · 메시지 {thread.messageCount}개
          </span>
        </button>
      ))}
    </div>
  );
}
