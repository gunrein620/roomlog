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
const tenantDetail = read("src/app/tenant/contract/02/page.tsx");
const tenantPrivacy = read("src/app/tenant/contract/04/PrivacyPanel.tsx");

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
    /isTradeAcceptance[\s\S]*거래 당사자가 수락한 조건을 바탕으로 만든 검토 초안입니다\.[\s\S]*<Badge>원본 뷰어<\/Badge>/,
  );
});

test("uses trade-acceptance wording throughout the real trade review branch", () => {
  assert.match(review, /const isTradeAcceptance = detail\.row\.origin === "trade_acceptance"/);
  assert.match(
    review,
    /title=\{isTradeAcceptance \? "거래 계약 조건 검토·확정" : "계약서 OCR 검토·확정"\}/,
  );
  assert.match(review, /isTradeAcceptance \? "거래 수락 조건 정밀 검토 모드" : "원문 대조 정밀 검토 모드"/);
  assert.match(review, /isTradeAcceptance \? "거래 수락 조건" : "추출 10항목 · 인라인 수정"/);
  assert.match(review, /isTradeAcceptance \? "거래 계약 근거" : "원본·OCR 전문"/);
  assert.match(review, /거래 수락 조건을 관리자 검토로 확정/);
});

test("does not offer an original file or document deletion on tenant trade-detail surfaces", () => {
  assert.match(tenantDetail, /const isTradeAcceptance = contract\.id\.startsWith\("ct_trade_"\)/);
  assert.match(tenantDetail, /!isTradeAcceptance && \([\s\S]*원본 보기[\s\S]*\)\}/);
  assert.match(tenantPrivacy, /const isTradeAcceptance = contractId\.startsWith\("ct_trade_"\)/);
  assert.match(tenantPrivacy, /isTradeAcceptance \? "계약 기록 삭제" : "계약서 삭제"/);
  assert.match(tenantPrivacy, /isTradeAcceptance \? "계약 기록 삭제 요청" : "계약서 삭제 요청"/);
});

test("keeps missing contract dates unconfirmed and uses strict form-value helpers", () => {
  assert.match(
    detail,
    /contract\.startDate \? formatDate\(contract\.startDate\) : "미확인"/,
  );
  assert.match(
    detail,
    /contract\.endDate \? formatDate\(contract\.endDate\) : "미확인"/,
  );
  assert.doesNotMatch(detail, /contract\.startDate \?\? contract\.createdAt/);
  assert.doesNotMatch(detail, /contract\.endDate \?\? contract\.updatedAt/);
  assert.match(detail, /parseOptionalSafeNonNegativeInteger\(formData\.get\("monthlyRent"\)\)/);
  assert.match(detail, /parseOptionalSafeNonNegativeInteger\(formData\.get\("maintenanceFee"\)\)/);
  assert.match(detail, /parseOptionalSafeNonNegativeInteger\(formData\.get\("paymentDay"\)\)/);
  assert.match(detail, /editableManualTextValue\(detail\.manualValues\.deposit\)/);
  assert.match(detail, /editableManualTextValue\(detail\.manualValues\.account\)/);
  assert.doesNotMatch(detail, /function numberValue/);
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
