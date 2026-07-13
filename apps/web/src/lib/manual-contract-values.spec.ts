import { strict as assert } from "node:assert";
import test from "node:test";
import {
  editableManualTextValue,
  parseOptionalSafeNonNegativeInteger,
} from "./manual-contract-values";

test("parses only optional digit-only safe non-negative integers", () => {
  assert.equal(parseOptionalSafeNonNegativeInteger(null), undefined);
  assert.equal(parseOptionalSafeNonNegativeInteger(""), undefined);
  assert.equal(parseOptionalSafeNonNegativeInteger("   "), undefined);
  assert.equal(parseOptionalSafeNonNegativeInteger("0"), 0);
  assert.equal(parseOptionalSafeNonNegativeInteger("650000"), 650_000);

  for (const invalid of ["-1", "1.5", "1e3", "9007199254740992"]) {
    assert.throws(
      () => parseOptionalSafeNonNegativeInteger(invalid),
      /0 이상의 안전한 정수/,
      `accepted invalid numeric input ${invalid}`,
    );
  }
  assert.throws(
    () => parseOptionalSafeNonNegativeInteger({ name: "not-a-string" } as any),
    /문자열/,
  );
});

test("renders missing-value sentinels as empty editable text", () => {
  assert.equal(editableManualTextValue(undefined), "");
  assert.equal(editableManualTextValue(null), "");
  assert.equal(editableManualTextValue("관리자 수동값 없음"), "");
  assert.equal(editableManualTextValue("  관리자 수동값 없음  "), "");
  assert.equal(editableManualTextValue("10,000,000원"), "10,000,000원");
  assert.equal(editableManualTextValue("국민 123-456"), "국민 123-456");
});
