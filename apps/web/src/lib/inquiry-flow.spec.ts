import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  pickInquiryTargetNo,
  withInquiryReply,
  withNewInquiry,
  type InquiryItem
} from "./inquiry-flow";

const existing: InquiryItem[] = [
  {
    id: 1,
    listingTitle: "방배 루미에르 402호",
    broker: "내방역 푸른공인중개사",
    message: "아직 거래 가능한가요?",
    visitTime: "오늘 3시",
    status: "답변 완료",
    reply: "네, 가능합니다.",
    time: "10분 전"
  }
];

describe("inquiry list updates", () => {
  it("puts a newly submitted inquiry at the top of the inquiry center list", () => {
    // QA 7 회귀 방지: 접수한 문의가 상단 문의 탭에 바로 보여야 한다.
    const next = withNewInquiry(
      existing,
      { listingTitle: "성수 리버뷰 703호", broker: "성수 중개", message: "오늘 방문 가능한가요?", visitTime: "내일 오전" },
      99
    );

    assert.equal(next.length, 2);
    assert.equal(next[0].id, 99);
    assert.equal(next[0].listingTitle, "성수 리버뷰 703호");
    assert.equal(next[0].status, "답변 대기");
    assert.equal(next[0].time, "방금");
    assert.equal(next[1].id, 1);
  });

  it("marks only the replied inquiry as answered", () => {
    const withPending = withNewInquiry(
      existing,
      { listingTitle: "성수 리버뷰 703호", broker: "성수 중개", message: "문의", visitTime: "주말 가능" },
      99
    );
    const replied = withInquiryReply(withPending, 99, "가능합니다.");

    assert.equal(replied[0].status, "답변 완료");
    assert.equal(replied[0].reply, "가능합니다.");
    assert.equal(replied[1].status, "답변 완료");
    assert.equal(replied[1].reply, "네, 가능합니다.");
  });
});

describe("new-inquiry target listing", () => {
  it("prefers the most recently viewed listing", () => {
    assert.equal(pickInquiryTargetNo(["L-3", "L-1"], ["L-9"]), "L-3");
  });

  it("falls back to the first recommended listing when nothing was viewed", () => {
    assert.equal(pickInquiryTargetNo([], ["L-9", "L-8"]), "L-9");
  });

  it("returns undefined when there is no candidate at all", () => {
    assert.equal(pickInquiryTargetNo([], []), undefined);
  });
});
