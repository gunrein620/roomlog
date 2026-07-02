import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TenantApp from "./page";

describe("tenant demo login button", () => {
  it("is visible on the initial auth screen even when runtime demo auth is disabled", () => {
    const markup = renderToStaticMarkup(React.createElement(TenantApp));

    assert.match(markup, /테스트 세입자 계정으로 시작/);
  });
});
