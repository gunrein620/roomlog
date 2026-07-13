import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const api = read("src/lib/contract-manager-api.ts");
const components = read("src/app/manager/contract/_components.tsx");
const review = read("src/app/manager/contract/01/page.tsx");
const detail = read("src/app/manager/contract/03/page.tsx");
const invite = read("src/app/manager/contract/04/page.tsx");
const privacy = read("src/app/manager/contract/05/page.tsx");

const countOccurrences = (source: string, needle: string) => source.split(needle).length - 1;

function actionForms(source: string, action: string) {
  return source
    .split(`<form action={${action}}`)
    .slice(1)
    .map((fragment) => fragment.split("</form>", 1)[0]);
}

test("shows trade acceptance as a contract source", () => {
  assert.match(api, /"trade_acceptance"/);
  assert.match(components, /trade_acceptance:\s*"거래 계약"/);
});

test("requires an explicit review confirmation instead of hard-coding true", () => {
  assert.match(api, /confirmManagerContract\(id: string, confirmNeedsCheck: boolean\)/);
  assert.match(api, /JSON\.stringify\(\{ confirmNeedsCheck \}\)/);
  assert.match(review, /name="confirmNeedsCheck"/);
  assert.match(review, /formData\.get\("confirmNeedsCheck"\) === "on"/);
  assert.match(review, /<input type="checkbox" name="confirmNeedsCheck" required \/>/);
});

test("shows the no-original explanation only for trade contract drafts", () => {
  assert.match(
    review,
    /detail\.row\.origin === "trade_acceptance"[\s\S]*업로드된 원본 파일은 없습니다\.[\s\S]*<Badge>원본 뷰어<\/Badge>/,
  );
});

test("keeps the selected contract id while editing dates and returning to review", () => {
  const manualPatch = api.slice(
    api.indexOf("export function updateManagerContractManualValues"),
    api.indexOf("export function updateManagerContractInventory"),
  );

  assert.match(detail, /type SearchParams = Promise<\{ id\?: string \}>/);
  assert.match(detail, /getManagerContractDetail\(id\)/);
  assert.match(detail, /name="startDate"/);
  assert.match(detail, /name="endDate"/);
  assert.match(detail, /startDate: String\(formData\.get\("startDate"\) \?\? ""\)/);
  assert.match(detail, /endDate: String\(formData\.get\("endDate"\) \?\? ""\)/);
  assert.match(manualPatch, /startDate\?: string;/);
  assert.match(manualPatch, /endDate\?: string;/);
  assert.match(manualPatch, /body: JSON\.stringify\(input\)/);
  assert.match(detail, /M-DOC-03[\s\S]*encodeURIComponent\(contractId\)/);
  assert.match(review, /M-DOC-03[\s\S]*encodeURIComponent\(detail\.row\.contract\.id\)/);
  assert.match(
    detail,
    /<LinkButton href=\{MANAGER_CONTRACT_ROUTES\["M-DOC-02"\]\} variant="secondary">계약서 추가 등록<\/LinkButton>/,
  );
});

test("keeps the selected contract id through every invite mutation and detail return", () => {
  const createForms = actionForms(invite, "createInviteAction");
  const updateForms = actionForms(invite, "updateInviteAction");
  const inviteRedirect = "const contractHref = `${MANAGER_CONTRACT_ROUTES[\"M-DOC-04\"]}?id=${encodeURIComponent(contractId)}`;";

  assert.match(invite, /type SearchParams = Promise<\{ id\?: string \}>/);
  assert.match(invite, /getManagerContractDetail\(id\)/);
  assert.equal(createForms.length, 1);
  assert.match(createForms[0] ?? "", /name="contractId" value=\{contract\.id\}/);
  assert.equal(updateForms.length, 3);
  updateForms.forEach((form) => {
    assert.match(form, /name="contractId" value=\{contract\.id\}/);
  });
  assert.match(invite, /formData\.get\("contractId"\)/);
  assert.equal(countOccurrences(invite, inviteRedirect), 2);
  assert.match(invite, /M-DOC-03[\s\S]*encodeURIComponent\(contract\.id\)/);
});

test("keeps the selected contract id through every privacy and deletion mutation", () => {
  const deletionForms = actionForms(privacy, "decideDeletionAction");
  const retentionForms = actionForms(privacy, "saveRetentionNoteAction");
  const privacyRedirect = "const contractHref = `${MANAGER_CONTRACT_ROUTES[\"M-DOC-05\"]}?id=${encodeURIComponent(contractId)}`;";

  assert.match(privacy, /type SearchParams = Promise<\{ id\?: string \}>/);
  assert.match(privacy, /getManagerContractDetail\(id\)/);
  assert.equal(deletionForms.length, 3);
  deletionForms.forEach((form) => {
    assert.match(form, /name="contractId" value=\{request\.contractId\}/);
  });
  assert.equal(retentionForms.length, 1);
  assert.match(retentionForms[0] ?? "", /name="contractId" value=\{detail\.row\.contract\.id\}/);
  assert.equal(countOccurrences(privacy, privacyRedirect), 2);
});
