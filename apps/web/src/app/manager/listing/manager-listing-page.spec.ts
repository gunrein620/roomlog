import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");
const boardSource = readFileSync(join(__dirname, "ManagerListingBoard.tsx"), "utf8");

test("manager listing page keeps the manager shell and registration entry without header copy", () => {
  assert.match(pageSource, /requireUser\("LANDLORD"\)/);
  assert.match(pageSource, /<ManagerAppShell title="매물 관리"/);
  assert.match(pageSource, /href="\/sell"/);
  assert.match(pageSource, />새 매물 등록<\/Link>/);
  assert.doesNotMatch(pageSource, />등록한 매물<\/h1>/);
  assert.doesNotMatch(pageSource, /현재 노출 상태와 등록 정보를 한곳에서 확인합니다/);

  const registrationHeader = pageSource.slice(
    pageSource.indexOf("<header"),
    pageSource.indexOf("</header>", pageSource.indexOf("<header")),
  );
  assert.match(registrationHeader, /justifyContent:\s*"flex-end"/);
});

test("manager listing surface renders list, empty, and error states without demo data", () => {
  // 소유자 스코프(?mine=1) — 서버가 내 매물만 반환한다(전체 반환 후 클라 필터가 아니라 서버 강제).
  assert.match(pageSource, /serverFetch<TradeListing\[]>\("\/trade\/listings\?mine=1"\)/);
  assert.match(pageSource, /toManagerListingRows\(listings, user\.userId\)/);
  assert.match(boardSource, /등록된 매물이 없습니다/);
  assert.match(pageSource, /매물 목록을 불러오지 못했습니다/);
  assert.doesNotMatch(pageSource, /demo/i);
  assert.doesNotMatch(boardSource, /demo/i);
});

test("manager listing empty state omits the new listing registration action", () => {
  const emptyState = boardSource.slice(
    boardSource.indexOf("{listings.length === 0 ? ("),
    boardSource.indexOf(") : visibleListings.length === 0 ? (", boardSource.indexOf("{listings.length === 0 ? (")),
  );

  assert.match(emptyState, /등록된 매물이 없습니다/);
  assert.doesNotMatch(emptyState, /새 매물 등록/);
});

test("manager listing page delegates interactive rows to the client board", () => {
  assert.match(pageSource, /import \{ ManagerListingBoard \}/);
  assert.match(pageSource, /<ManagerListingBoard initialListings=\{rows\} activeStatus=\{activeStatus\} \/>/);
});
