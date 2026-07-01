import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("./src/app/page.tsx", import.meta.url), "utf8");

test("renders a mobile real-estate app shell with search, map list, and listing detail sections", () => {
  for (const label of ["어디에서 방을 찾으세요?", "지도에서 보기", "추천 매물", "매물 상세"]) {
    assert.match(pageSource, new RegExp(label));
  }
});

test("promotes the future 3D room tour as a primary listing detail action", () => {
  assert.match(pageSource, /3D\s*(가상\s*)?투어/);
  assert.match(pageSource, /투어\s*예약/);
});

test("offers social-only sign in with a developer shortcut for local entry", () => {
  for (const label of ["카카오", "네이버", "Apple", "Google", "개발용 로그인"]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /setIsSignedIn\(true\)/);
});

test("borrows mature Zigbang and Dabang product patterns for trust and map search", () => {
  for (const label of ["확인매물", "안심 리포트", "헛걸음 보상", "현장촬영", "그리기", "전체 방", "주변 안전"]) {
    assert.match(pageSource, new RegExp(label));
  }
});
