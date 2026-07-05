import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const detailSource = readFileSync(join(__dirname, "02/page.tsx"), "utf8");
const deliverySource = readFileSync(join(__dirname, "03/page.tsx"), "utf8");
const chatSource = readFileSync(join(__dirname, "04/page.tsx"), "utf8");
const quickLookupSource = readFileSync(join(__dirname, "05/page.tsx"), "utf8");

test("manager report detail page reads and propagates the selected report id", () => {
  assert.match(detailSource, /type SearchParams = Promise<\{ id\?: string \}>/);
  assert.match(detailSource, /const \{ id \} = await searchParams/);
  assert.match(detailSource, /await getReport\(id\)/);
  assert.match(detailSource, /reportHref\("M-RPT-03", report\.id\)/);
  assert.match(detailSource, /reportHref\("M-RPT-04", report\.id\)/);
});

test("manager report delivery page reads the selected report id before loading delivery data", () => {
  assert.match(deliverySource, /type SearchParams = Promise<\{ id\?: string \}>/);
  assert.match(deliverySource, /const \{ id \} = await searchParams/);
  assert.match(deliverySource, /await getReport\(id\)/);
  assert.match(deliverySource, /await getReportDelivery\(report\.id\)/);
  assert.match(deliverySource, /reportHref\("M-RPT-02", report\.id\)/);
});

test("manager report chat page asks against the selected report snapshot", () => {
  assert.match(chatSource, /type SearchParams = Promise<\{ id\?: string; question\?: string \}>/);
  assert.match(chatSource, /const \{ id, question \} = await searchParams/);
  assert.match(chatSource, /await getReportChat\(id, question\)/);
});

test("manager report chat page submits typed questions through a server action", () => {
  assert.match(chatSource, /async function askReportQuestionAction\(formData: FormData\)/);
  assert.match(chatSource, /"use server"/);
  assert.match(chatSource, /formData\.get\("question"\)/);
  assert.match(chatSource, /redirect\(reportHref\("M-RPT-04", reportId, question\)\)/);
  assert.match(chatSource, /<form action=\{askReportQuestionAction\}/);
  assert.match(chatSource, /name="question"/);
});

test("manager report quick lookup sends FAQ queries into the report chatbot", () => {
  assert.match(quickLookupSource, /<FaqButtons faq=\{faq\} targetReportId=\{DEMO_REPORT_ID\} \/>/);
});
