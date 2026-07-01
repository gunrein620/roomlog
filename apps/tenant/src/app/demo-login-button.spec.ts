import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TenantApp from "./page";

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("tenant demo login button", () => {
  it("is visible on the initial auth screen even when runtime demo auth is disabled", () => {
    const markup = renderToStaticMarkup(React.createElement(TenantApp));

    assert.match(markup, /테스트 세입자 계정으로 시작/);
    assert.match(markup, /빈 새 테스트 세입자로 시작/);
  });

  it("keeps the login form empty instead of auto-prefilling demo credentials", () => {
    assert.doesNotMatch(pageSource, /setLoginForm\(\s*\(current\)[\s\S]*?demoLogin/);
  });

  it("starts a fresh test tenant through signup instead of reusing seeded demo data", () => {
    assert.match(pageSource, /buildFreshTenantTestSignupPayload/);
    assert.match(pageSource, /apiRequest<AuthResult>\(\"\/auth\/signup\"/);
  });
});
