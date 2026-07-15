import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { formatThreadLocation } from "./messaging-thread-location";

const webRoot = path.resolve(__dirname, "..");
const listPage = readFileSync(
  path.join(webRoot, "app/manager/messaging/00/page.tsx"),
  "utf8",
);
const detailPage = readFileSync(
  path.join(webRoot, "app/manager/messaging/04/page.tsx"),
  "utf8",
);

test("formats a messaging thread with its building and unit", () => {
  assert.equal(
    formatThreadLocation({ buildingName: " 테스트 건물1 ", unitId: "101" }),
    "테스트 건물1 · 101호",
  );
});

test("falls back to the unit when a legacy thread has no building", () => {
  assert.equal(formatThreadLocation({ unitId: "102" }), "102호");
});

test("does not duplicate the unit suffix", () => {
  assert.equal(
    formatThreadLocation({ buildingName: "테스트 건물2", unitId: "201호" }),
    "테스트 건물2 · 201호",
  );
});

test("uses the shared location label on manager messaging list and detail pages", () => {
  assert.match(listPage, /formatThreadLocation\(thread\)/);
  assert.match(listPage, /\{locationLabel\}<\/Badge>/);
  assert.match(listPage, /aria-label=\{`\$\{locationLabel\}/);
  assert.match(detailPage, /formatThreadLocation\(thread\)/);
  assert.match(detailPage, /title=\{`\$\{locationLabel\} 채팅 스레드`\}/);
  assert.match(detailPage, /\{locationLabel\}<\/Badge>/);
  assert.match(detailPage, /aria-label=\{`\$\{locationLabel\}/);
});

test("hides the connected-work note while keeping the context title", () => {
  assert.doesNotMatch(detailPage, /연결된 업무:/);
  assert.doesNotMatch(detailPage, /임차인에게도 같은 대화가 표시됩니다\./);
  assert.match(detailPage, /thread\.contextLabel \?\? "일반 문의"/);
});

test("hides secondary context badges while keeping primary context", () => {
  assert.doesNotMatch(detailPage, /<Badge>\{thread\.tenantId\}<\/Badge>/);
  assert.doesNotMatch(detailPage, /<Badge>\{CONTEXT_LABEL\[thread\.context\]\}<\/Badge>/);
  assert.match(detailPage, /<Badge emphasis>\{locationLabel\}<\/Badge>/);
  assert.match(detailPage, /thread\.pendingRequest \? <Badge emphasis>추가요청 대기<\/Badge>/);
  assert.match(detailPage, /thread\.contextLabel \?\? "일반 문의"/);
});

test("keeps the reply-needed badge balanced on exactly two accessible lines", () => {
  assert.match(listPage, /aria-label="답장 필요"/);
  assert.match(listPage, /<span>답장<\/span>/);
  assert.match(listPage, /<span>필요<\/span>/);
  assert.match(listPage, /whiteSpace: "nowrap"/);
});

test("replaces messaging tabs with the building ticket filter", () => {
  assert.doesNotMatch(listPage, /function TabLink/);
  assert.doesNotMatch(listPage, /listAnnouncementDrafts|listAnnouncementResults/);
  assert.match(listPage, /<BuildingFilter/);
  assert.match(listPage, /건물별 · 답장 필요 상단/);
  assert.match(listPage, /이 건물에는 아직 시작된 대화가 없습니다\./);
});

test("loads contract recipients and mounts the new conversation form", () => {
  assert.match(listPage, /listManagerMessagingRecipients/);
  assert.match(listPage, /getBuildingOptions\(threads, recipients\)/);
  assert.match(listPage, /<NewConversationForm/);
});
