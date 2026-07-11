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
