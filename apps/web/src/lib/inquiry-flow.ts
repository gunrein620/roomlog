// 문의 작성 흐름 순수 로직 — 홈 카드 "문자문의", 매물 상세 "문의하기",
// 문의 탭 "새 문의"가 전부 같은 작성 sheet로 이어지도록 대상 선택과
// 목록 갱신 규칙을 한 곳에 둔다. (QA 3·4·6·7 회귀 방지의 근거 로직)

export type InquiryStatus = "답변 대기" | "답변 완료";

export type InquiryItem = {
  id: number;
  listingTitle: string;
  broker: string;
  message: string;
  visitTime: string;
  status: InquiryStatus;
  reply?: string;
  time: string;
};

export type InquiryPayload = {
  listingTitle: string;
  broker: string;
  message: string;
  visitTime: string;
};

/** 새 문의는 목록 맨 앞에 답변 대기로 붙는다 — 문의센터 상단에 즉시 보여야 한다. */
export function withNewInquiry(
  current: InquiryItem[],
  payload: InquiryPayload,
  id: number,
  time = "방금"
): InquiryItem[] {
  return [{ id, ...payload, status: "답변 대기", time }, ...current];
}

export function withInquiryReply(current: InquiryItem[], id: number, reply: string): InquiryItem[] {
  return current.map((item) =>
    item.id === id ? { ...item, status: "답변 완료" as InquiryStatus, reply } : item
  );
}

/**
 * "새 문의"의 기본 대상 매물 — 최근 본 매물이 있으면 그중 첫 번째,
 * 없으면 현재 추천 목록의 첫 매물. 아무것도 없으면 undefined(작성 불가 상태).
 */
export function pickInquiryTargetNo(
  viewedListingNos: string[],
  fallbackListingNos: string[]
): string | undefined {
  return viewedListingNos[0] ?? fallbackListingNos[0];
}
