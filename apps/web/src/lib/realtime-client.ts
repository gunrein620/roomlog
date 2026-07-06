"use client";

import { io, type Socket } from "socket.io-client";

/**
 * 실시간 소켓 클라이언트 (브라우저 전용 싱글턴).
 * - 연결 주소: NEXT_PUBLIC_SOCKET_URL(프로덕션 https://api.woo-zu.com) →
 *   없으면 NEXT_PUBLIC_API_URL이 절대주소일 때 그 오리진 → 로컬 기본 :4000.
 * - 인증: /api/socket-ticket(BFF)에서 60초 단기 티켓을 받아 핸드셰이크에 싣는다.
 *   재연결 때마다 auth 콜백이 새 티켓을 발급받으므로 만료 걱정이 없다.
 * - 실패 시 null을 돌려주고, 호출측(채팅 컴포넌트)은 기존 폴링 주기로 폴백한다.
 */

function socketBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const api = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
  if (/^https?:\/\//.test(api)) return new URL(api).origin;

  return "http://localhost:4000";
}

async function fetchTicket(): Promise<string | null> {
  try {
    const res = await fetch("/api/socket-ticket", { method: "POST", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: string };
    return data.ticket ?? null;
  } catch {
    return null;
  }
}

let socket: Socket | null = null;

export function getRealtimeSocket(): Socket {
  if (socket) return socket;

  socket = io(socketBaseUrl(), {
    transports: ["websocket"],
    // 연결·재연결마다 새 티켓 발급 — 티켓 TTL(60초)과 무관하게 항상 유효
    auth: (setAuth) => {
      void fetchTicket().then((ticket) => setAuth({ ticket: ticket ?? "" }));
    },
    reconnectionDelay: 2000,
    reconnectionDelayMax: 15000
  });

  return socket;
}

/** 로그아웃/계정 전환 시 기존 연결을 버리고 다음 사용부터 새로 연결한다. */
export function resetRealtimeSocket() {
  socket?.disconnect();
  socket = null;
}
