import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("tenant AI intake confirms through chat without a separate filing button", () => {
  const page = readFileSync(join(process.cwd(), "src/app/my/flows/TenantMyPage.tsx"), "utf8");
  const hook = readFileSync(join(process.cwd(), "src/app/my/flows/useTenantAiAssistant.ts"), "utf8");

  assert.doesNotMatch(page, /aria-label="민원 접수 확인"/);
  assert.doesNotMatch(page, />\s*민원 접수\s*</);
  assert.match(hook, /draftForRequest/);
  assert.match(page, /ai\.draftForRequest/);
  assert.match(page, /setIsRequestSheetOpen\(true\)/);
  // 접수 폼은 접수 의사(filingIntent)가 확인된 턴에만 뜬다 — 매 턴 초안이 있다고 열면 안 된다.
  assert.match(hook, /result\.session\.draft\.filingIntent &&/);
  // 일반 질문 턴에도 고정 접수 멘트를 넣지 않는다.
  assert.doesNotMatch(hook, /접수 초안을 작성하겠습니다/);
  assert.doesNotMatch(page, /className="manager-ai-notice"/);
  assert.match(page, /formatTenantRequestDescription/);
  assert.match(page, /\[문제 내용\]/);
  assert.match(page, /\[세부 유형\]/);
  assert.match(page, /\[요청 사항\]/);
});
