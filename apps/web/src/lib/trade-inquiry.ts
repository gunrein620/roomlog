// 매물 문의 전송 — SPA(page.tsx)와 상세 라우트(/listing/[id])가 같은 전송 로직을 쓴다.
// 문의는 서버 스레드로 전송된다 — 집주인(또는 데모 임대인) 계정이 실제로 받고, 채팅으로 이어진다.
import { TRADE_LISTING_NO_PREFIX } from "./listing-catalog";
import type { InquiryPayload } from "./inquiry-flow";

export type SubmitInquiryResult = {
  status: "ok" | "auth" | "error";
  /** 서버가 방금 생성/이어붙인 스레드 id — 문의센터 채팅으로 바로 진입(당근식)에 쓴다. */
  threadId?: string;
};

export async function submitTradeInquiry(
  payload: InquiryPayload,
  listingNo?: string
): Promise<SubmitInquiryResult> {
  try {
    const response = await fetch("/api/trade/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingId: listingNo?.startsWith(TRADE_LISTING_NO_PREFIX)
          ? listingNo.slice(TRADE_LISTING_NO_PREFIX.length)
          : null,
        listingTitle: payload.listingTitle,
        message: payload.message,
        visitTime: payload.visitTime
      })
    });
    if (response.status === 401) return { status: "auth" };
    if (!response.ok) return { status: "error" };
    const created = (await response.json().catch(() => ({}))) as { id?: string };
    return { status: "ok", threadId: created.id };
  } catch {
    return { status: "error" };
  }
}
