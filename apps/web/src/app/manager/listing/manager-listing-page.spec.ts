import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");
const boardSource = readFileSync(join(__dirname, "ManagerListingBoard.tsx"), "utf8");

test("manager listing page keeps the manager shell and registration entry", () => {
  assert.match(pageSource, /requireUser\("LANDLORD"\)/);
  assert.match(pageSource, /<ManagerAppShell title="매물 관리"/);
  assert.match(pageSource, /href="\/sell"/);
  assert.match(pageSource, />새 매물 등록<\/Link>/);
});

test("manager listing surface renders list, empty, and error states without demo data", () => {
  assert.match(pageSource, /serverFetch<TradeListing\[]>\("\/trade\/listings"\)/);
  assert.match(pageSource, /toManagerListingRows\(listings, user\.userId\)/);
  assert.match(pageSource, /등록한 매물/);
  assert.match(boardSource, /등록된 매물이 없습니다/);
  assert.match(pageSource, /매물 목록을 불러오지 못했습니다/);
  assert.doesNotMatch(pageSource, /demo/i);
  assert.doesNotMatch(boardSource, /demo/i);
});

test("manager listing page delegates interactive rows to the client board", () => {
  assert.match(pageSource, /import \{ ManagerListingBoard \}/);
  assert.match(pageSource, /<ManagerListingBoard initialListings=\{rows\} activeStatus=\{activeStatus\} \/>/);
});
