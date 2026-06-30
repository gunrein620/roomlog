import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import VendorApp from "./page";

describe("vendor demo login button", () => {
  it("is visible on the initial auth screen even when runtime demo auth is disabled", () => {
    const markup = renderToStaticMarkup(React.createElement(VendorApp));

    assert.match(markup, /테스트 업체 계정으로 시작/);
  });
});
