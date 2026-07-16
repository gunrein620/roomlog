import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDateTime } from "./messaging-date-time";

describe("manager messaging date time", () => {
  it("formats server and browser output in the fixed Korea time zone", () => {
    assert.match(formatDateTime("2026-07-14T02:13:00.000Z"), /11:13/);
  });
});
