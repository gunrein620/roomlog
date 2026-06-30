import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const pageSource = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("tenant signup form layout", () => {
  it("reviews signup issues after all account fields and before submission", () => {
    const passwordConfirmIndex = pageSource.indexOf("비밀번호 확인");
    const checklistIndex = pageSource.indexOf("signup-checklist");
    const submitIndex = pageSource.indexOf("세입자 계정 만들기");

    assert.ok(passwordConfirmIndex > -1, "expected password confirmation field");
    assert.ok(checklistIndex > -1, "expected signup checklist");
    assert.ok(submitIndex > -1, "expected signup submit button");
    assert.ok(
      passwordConfirmIndex < checklistIndex,
      "signup checklist should appear after password confirmation"
    );
    assert.ok(checklistIndex < submitIndex, "signup checklist should appear before submit");
  });

  it("uses browser autocomplete hints for tenant identity fields", () => {
    assert.match(pageSource, /autoComplete="name"/);
    assert.match(pageSource, /autoComplete="address-line1"/);
  });

  it("offers a cancel action for an accidentally started AI consultation thread", () => {
    assert.match(pageSource, /상담 닫기/);
    assert.match(
      pageSource,
      /tenant\/complaints\/intake\/sessions\/\$\{selectedSession\.id\}\/cancel/
    );
  });
});
