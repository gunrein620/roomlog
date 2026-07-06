import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const errorPath = join(__dirname, "error.tsx");
const errorSource = existsSync(errorPath) ? readFileSync(errorPath, "utf8") : "";
const e0Source = readFileSync(join(__dirname, "e0/page.tsx"), "utf8");

test("manager report has a client error boundary that links to M-RPT-E0 recovery", () => {
  assert.equal(existsSync(errorPath), true);
  assert.match(errorSource, /"use client"/);
  assert.match(errorSource, /usePathname/);
  assert.match(errorSource, /useSearchParams/);
  assert.match(errorSource, /const recoveryHref = reportRecoveryHref\(pathname, searchParams\.toString\(\)\)/);
  assert.match(errorSource, /reset\(\)/);
  assert.match(errorSource, /href=\{recoveryHref\}/);
  assert.match(errorSource, /관리 리포트를 다시 불러오지 못했습니다/);
});

test("manager report E0 keeps retry links inside the report route set", () => {
  assert.match(e0Source, /type SearchParams = Promise<\{ from\?: string \}>/);
  assert.match(e0Source, /safeReportRetryHref\(from\)/);
  assert.match(e0Source, /from\.startsWith\("\/manager\/report\/"\)/);
  assert.match(e0Source, /MANAGER_REPORT_ROUTES\["M-RPT-00"\]/);
});
