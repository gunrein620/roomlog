import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const uiSource = readFileSync(
  join(__dirname, "../app/manager/ticket/_components/ticket-manager-ui.tsx"),
  "utf8",
);
const detailPageSource = readFileSync(
  join(__dirname, "../app/manager/ticket/dash/01/page.tsx"),
  "utf8",
);
const actionSource = readFileSync(
  join(__dirname, "../app/manager/ticket/dash/01/actions.ts"),
  "utf8",
);
const apiSource = readFileSync(join(__dirname, "ticket-manager-api.ts"), "utf8");

describe("manager ticket responsibility card", () => {
  it("keeps AI likelihood separate from the manager decision", () => {
    assert.match(uiSource, /AI 책임 검토는 참고용입니다\./);
    assert.match(uiSource, /OPEN 책임 판단 이의제기/);
    assert.match(uiSource, /관리자 확정/);
    assert.match(uiSource, /name="responsibility"/);
    assert.match(uiSource, /name="note"/);
    assert.match(detailPageSource, /decideResponsibilityAction/);
    assert.match(detailPageSource, /aiFeedback=\{detail\.aiFeedback\}/);
    assert.match(detailPageSource, /responsibilityDecision=\{detail\.responsibilityDecision\}/);
  });

  it("posts the responsibility decision through a server action", () => {
    assert.match(actionSource, /^"use server";/);
    assert.match(actionSource, /decideManagerTicketResponsibility/);
    assert.match(apiSource, /\/responsibility-decision/);
    assert.match(apiSource, /method: "POST"/);
  });
});
