import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const uiSource = readFileSync(
  join(__dirname, "../app/manager/ticket/_components/ticket-manager-ui.tsx"),
  "utf8",
);

describe("manager ticket responsibility card", () => {
  it("guides managers to add information instead of directly editing responsibility", () => {
    assert.match(uiSource, /추가 정보 입력/);
    assert.match(uiSource, /AI 책임 검토는 참고용입니다\./);
    assert.match(
      uiSource,
      /<Card style=\{\{ display: "flex", flexDirection: "column", gap: "var\(--space-sm\)", padding: "var\(--space-md\)" \}\}>/,
    );
    assert.match(
      uiSource,
      /<div style=\{\{ \.\.\.row, justifyContent: "space-between", alignItems: "flex-end" \}\}>[\s\S]*추가 정보 입력[\s\S]*AI 책임 검토는 참고용입니다\./,
    );
    assert.doesNotMatch(uiSource, /확정 아님 · 추가 정보 확인 후 다시 검토할 수 있음/);
    assert.doesNotMatch(uiSource, /책임 가능성 수정/);
  });
});
