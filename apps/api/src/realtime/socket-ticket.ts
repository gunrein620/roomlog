import { createHmac } from "node:crypto";
import { tokenSecret } from "../roomlog/roomlog-support";

/**
 * 소켓 핸드셰이크용 단기 티켓.
 * 인증 토큰은 httpOnly 쿠키에 있어 브라우저 JS가 읽을 수 없으므로,
 * Next(BFF)가 쿠키 토큰으로 이 티켓을 대신 발급받아 소켓 연결에만 쓴다.
 * 로그인 토큰과 같은 시크릿의 HMAC 서명이며 60초 뒤 만료된다.
 */

const TICKET_TTL_MS = 60_000;

export type SocketTicketPayload = {
  sub: string;
  name: string;
  exp: number;
};

function sign(payload: string): string {
  return createHmac("sha256", tokenSecret).update(`socket:${payload}`).digest("base64url");
}

export function issueSocketTicket(userId: string, name: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, name, exp: Date.now() + TICKET_TTL_MS } satisfies SocketTicketPayload),
    "utf8"
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifySocketTicket(ticket: unknown): SocketTicketPayload | null {
  if (typeof ticket !== "string") return null;
  const [payload, signature] = ticket.split(".");
  if (!payload || !signature || signature !== sign(payload)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SocketTicketPayload;
    if (!decoded.sub || typeof decoded.exp !== "number" || decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}
