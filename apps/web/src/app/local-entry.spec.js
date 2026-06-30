const { describe, it } = require("node:test");
const { strict: assert } = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");
const styleSource = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("local Roomlog entry portal", () => {
  it("directs local testers to real role apps instead of the legacy health page", () => {
    assert.match(pageSource, /로컬 테스트 콘솔/);
    assert.match(pageSource, /AI 상담 접수/);
    assert.match(pageSource, /관리자 운영/);
    assert.match(pageSource, /업체 작업/);
    assert.match(pageSource, /tenant@roomlog\.test/);
    assert.match(pageSource, /manager@roomlog\.test/);
    assert.match(pageSource, /vendor@roomlog\.test/);
    assert.doesNotMatch(pageSource, /Roomlog Frontend|API Health Check/);
  });

  it("keeps the portal dense and operational for local testing", () => {
    assert.match(pageSource, /localhost:3001/);
    assert.match(pageSource, /localhost:3002/);
    assert.match(pageSource, /localhost:3003/);
    assert.match(pageSource, /localhost:4000\/api\/health/);
    assert.match(styleSource, /\.status-grid/);
    assert.match(styleSource, /grid-template-columns:\s*repeat\(4/);
  });
});
