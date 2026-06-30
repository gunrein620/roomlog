import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  initialVendorCompletionNote,
  initialVendorEstimateAmount,
  initialVendorEstimateDescription,
  initialVendorMessageText,
  initialVendorScheduleAt
} from "./action-form-state";

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("vendor action form defaults", () => {
  it("starts operational action forms empty", () => {
    assert.equal(initialVendorEstimateAmount(), "");
    assert.equal(initialVendorEstimateDescription(), "");
    assert.equal(initialVendorScheduleAt(), "");
    assert.equal(initialVendorCompletionNote(), "");
    assert.equal(initialVendorMessageText(), "");
  });

  it("does not prefill operational forms with mock repair data", () => {
    assert.doesNotMatch(pageSource, /120000/);
    assert.doesNotMatch(pageSource, /누수 원인 점검 및 실리콘 보강 작업/);
    assert.doesNotMatch(pageSource, /2026-06-30T10:00/);
    assert.doesNotMatch(pageSource, /현장 확인 후 누수 부위 보수 완료/);
    assert.doesNotMatch(pageSource, /현장 도착 전 확인이 필요한 사항을 남깁니다/);
  });
});
