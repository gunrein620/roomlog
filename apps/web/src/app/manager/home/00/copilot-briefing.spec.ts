import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BriefingInput } from "./briefing-input";
import { buildBriefing, buildPresetResponses } from "./copilot-briefing";
import { toManagerCopilotMessages } from "../../_components/manager-assistant-session";

const quietInput: BriefingInput = {
  managerName: "김민지",
  homeCount: 2,
  depositRatePct: 100,
  overdueCount: 0,
  urgentTicketCount: 0,
  openTicketCount: 0,
  expiringContractCount: 0,
  unansweredThreadCount: 0
};

describe("copilot briefing templates", () => {
  it("uses an assuring tone when all operational counts are zero", () => {
    const briefing = buildBriefing(quietInput);

    assert.match(briefing, /오늘은 바로 붙잡아야 할 일이 없습니다/);
    assert.match(briefing, /입금률은 100%/);
    assert.match(briefing, /모두 조용/);
    // 사람 비서는 없는 일을 보고하지 않는다 — 0건 나열 금지.
    assert.doesNotMatch(briefing, /0건/);
  });

  it("prioritizes overdue bills without inventing unit details", () => {
    const briefing = buildBriefing({
      ...quietInput,
      depositRatePct: 62.5,
      overdueCount: 2,
      openTicketCount: 1
    });

    assert.match(briefing, /^김민지님, 미납 2건 확인이 먼저예요\./);
    assert.match(briefing, /입금률은 62.5%/);
    assert.doesNotMatch(briefing, /301호|정글빌라/);
  });

  it("omits the deposit rate sentence fragment when the rate is null", () => {
    const briefing = buildBriefing({
      ...quietInput,
      depositRatePct: null,
      urgentTicketCount: 1,
      openTicketCount: 3
    });

    assert.match(briefing, /긴급 하자 1건부터 봐주세요/);
    assert.match(briefing, /관리 중인 집은 2채입니다/);
    assert.doesNotMatch(briefing, /입금률/);
  });
});

describe("copilot preset responses", () => {
  it("returns the four agreed preset labels", () => {
    const labels = buildPresetResponses(quietInput).map((preset) => preset.label);

    assert.deepEqual(labels, ["이번 달 입금 현황", "미납 있어?", "하자 어떻게 되고 있어?", "이번 주 뭐 해야 해?"]);
  });

  it("does not fabricate a deposit rate when billing data is unavailable", () => {
    const presets = buildPresetResponses({ ...quietInput, depositRatePct: null, overdueCount: 1 });

    assert.equal(
      presets[0].response,
      "이번 달 입금률은 아직 확인되지 않았어요. 연체 청구는 1건입니다."
    );
  });
});

describe("copilot transcript transport", () => {
  it("excludes local-only UI entries and receipts from upstream chat messages", () => {
    const messages = toManagerCopilotMessages([
      { id: "preset-question", kind: "message", role: "user", content: "미납 있어?", localOnly: true },
      { id: "preset-answer", kind: "message", role: "assistant", content: "현재 연체 청구는 0건이에요.", localOnly: true },
      { id: "real-question", kind: "message", role: "user", content: "302호에 안내 보내줘" },
      { id: "real-answer", kind: "message", role: "assistant", content: "발송 전 확인이 필요합니다." },
      { id: "cancel", kind: "message", role: "assistant", content: "취소했어요.", localOnly: true },
      { id: "system", kind: "message", role: "system", content: "네트워크 오류" },
      { id: "receipt", kind: "receipt", receiptKind: "messaging.send_reply", summary: "302호 안내 발송" }
    ]);

    assert.deepEqual(messages, [
      { role: "user", content: "302호에 안내 보내줘" },
      { role: "assistant", content: "발송 전 확인이 필요합니다." }
    ]);
  });
});
