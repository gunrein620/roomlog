import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const api = read("src/lib/contract-manager-api.ts");
const components = read("src/app/manager/contract/_components.tsx");
const review = read("src/app/manager/contract/01/page.tsx");
const detail = read("src/app/manager/contract/03/page.tsx");

test("shows trade acceptance as a contract source", () => {
  assert.match(api, /"trade_acceptance"/);
  assert.match(components, /trade_acceptance:\s*"거래 계약"/);
});

test("requires an explicit review confirmation instead of hard-coding true", () => {
  assert.match(api, /confirmManagerContract\(id: string, confirmNeedsCheck: boolean\)/);
  assert.match(api, /JSON\.stringify\(\{ confirmNeedsCheck \}\)/);
  assert.match(review, /name="confirmNeedsCheck"/);
  assert.match(review, /formData\.get\("confirmNeedsCheck"\) === "on"/);
});

test("keeps the selected contract id while editing dates and returning to review", () => {
  assert.match(detail, /type SearchParams = Promise<\{ id\?: string \}>/);
  assert.match(detail, /getManagerContractDetail\(id\)/);
  assert.match(detail, /name="startDate"/);
  assert.match(detail, /name="endDate"/);
  assert.match(detail, /M-DOC-03[\s\S]*encodeURIComponent\(contractId\)/);
  assert.match(review, /M-DOC-03[\s\S]*encodeURIComponent\(detail\.row\.contract\.id\)/);
});
