import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const detailSource = readFileSync(join(__dirname, "02/page.tsx"), "utf8");
const deliverySource = readFileSync(join(__dirname, "03/page.tsx"), "utf8");
const chatSource = readFileSync(join(__dirname, "04/page.tsx"), "utf8");
const hubSource = readFileSync(join(__dirname, "00/page.tsx"), "utf8");
const quickLookupSource = readFileSync(join(__dirname, "05/page.tsx"), "utf8");
const componentSource = readFileSync(join(__dirname, "_components.tsx"), "utf8");

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
  assert.match(chatSource, /async function askReportQuestion\(formData: FormData\)/);
  assert.match(chatSource, /const question = String\(formData\.get\("question"\)/);
  assert.match(chatSource, /redirect\(reportHref\("M-RPT-04", reportId, question\)\)/);
  assert.match(chatSource, /<form action=\{askReportQuestion\}/);
  assert.match(chatSource, /name="question"/);
});

test("manager report quick lookup sends FAQ queries into the report chatbot", () => {
  assert.match(componentSource, /export function FaqButtons\(\{ faq, targetReportId, screenId = "M-RPT-04" \}/);
  assert.match(componentSource, /screenId = "M-RPT-04"/);
  assert.match(componentSource, /reportHref\(screenId, targetReportId, item\.query\)/);
  assert.match(quickLookupSource, /targetReportId=\{DEMO_REPORT_ID\}/);
});

test("manager report quick lookup renders the selected FAQ answer inline", () => {
  assert.match(quickLookupSource, /type SearchParams = Promise<\{ question\?: string \}>/);
  assert.match(quickLookupSource, /const \{ question \} = await searchParams/);
  assert.match(quickLookupSource, /const selectedQuestion = question\?\.trim\(\) \|\| faq\[0\]\?\.query/);
  assert.match(quickLookupSource, /await getReportChat\(DEMO_REPORT_ID, selectedQuestion\)/);
  assert.match(quickLookupSource, /screenId="M-RPT-05"/);
  assert.match(quickLookupSource, /<AnswerCard answer=\{answer\} \/>/);
  assert.doesNotMatch(quickLookupSource, /현재 미납은 3세대입니다/);
});

test("manager report hub quick questions carry the latest report id and FAQ query into chat", () => {
  assert.match(hubSource, /const quickReportId = reports\[0\]\?\.id/);
  assert.match(hubSource, /<FaqButtons faq=\{faq\} targetReportId=\{quickReportId\} \/>/);
  assert.doesNotMatch(hubSource, /href=\{MANAGER_REPORT_ROUTES\["M-RPT-04"\]\} variant="secondary">\s*\{item\.label\}/);
});
