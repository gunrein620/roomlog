import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("contract OCR important-field scope", () => {
  it("shows OCR registration targets without explanatory copy", () => {
    const registerSource = readFileSync(
      join(process.cwd(), "src/app/manager/contract/02/ContractRegisterForm.tsx"),
      "utf8",
    );

    assert.match(registerSource, /title="보증금 구조" badge="필수"/);
    assert.match(registerSource, /title="특약" badge="선택"/);
    assert.match(registerSource, /title="자동연장·원상복구·수선 책임" badge="선택"/);
    assert.doesNotMatch(registerSource, /note=/);
    assert.doesNotMatch(registerSource, /기본 보증금, 전환보증금, 최종 보증금/);
    assert.doesNotMatch(registerSource, /계약서에 없으면 문서에 없음으로 확정/);
    assert.doesNotMatch(registerSource, /있으면 원문 기준으로 저장, 없으면 숨김 처리/);
  });

  it("keeps the manager OCR correction form focused on deposit, rent and special clauses", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "src/app/manager/contract/01/page.tsx"),
      "utf8",
    );

    // 청구·확정에 필요한 월세·관리비·납부일·계약기간은 이 화면에서 직접 넣을 수 있어야 한다.
    // 임대인 계좌는 계속 02/03에서만 수정한다.
    for (const fieldName of ["landlordAccount"]) {
      assert.doesNotMatch(pageSource, new RegExp(`name="${fieldName}"`));
    }

    for (const fieldName of [
      "deposit",
      "monthlyRent",
      "maintenanceFee",
      "paymentDay",
      "startDate",
      "endDate",
      "specialTerms",
      "autoRenewal",
      "restorationDuty",
      "repairDuty",
    ]) {
      assert.match(pageSource, new RegExp(`name="${fieldName}"`));
    }

    assert.doesNotMatch(pageSource, /기존 DB 계약값 불러오기/);
    assert.match(pageSource, /월 임대료·관리비·계약 기간·납부일/);
    assert.doesNotMatch(pageSource, /계약서에 적힌 보증금 구조와 월 단위 임대료/);
    assert.doesNotMatch(pageSource, /분쟁 기준이 되는 조항만 원문 기준으로 정리합니다/);
    assert.doesNotMatch(pageSource, /월 임대료, 월 임차료, 차임처럼/);
    assert.match(pageSource, /paymentDay:\s*numberValue\(formData, "paymentDay"\)/);
    assert.match(pageSource, /paymentDay:\s*paymentDayInputCandidate/);
  });

  it("shows absent optional clauses as not applicable rather than missing", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "src/app/manager/contract/01/page.tsx"),
      "utf8",
    );

    assert.match(pageSource, /DOCUMENT_ABSENT_VALUE = "문서에 없음"/);
    assert.match(pageSource, /initialMissingOcrLeftover/);
    assert.match(pageSource, /status: documentAbsent \? "해당 없음"/);
    assert.match(pageSource, /원문에 해당 조항 없음/);
  });

  it("keeps the contract OCR schema free of DB-held contract field keys", () => {
    const apiSource = readFileSync(
      join(process.cwd(), "../../apps/api/src/roomlog/services/roomlog-contract.domain.ts"),
      "utf8",
    );

    for (const fieldKey of [
      "rentBaseAmount",
      "rentConversionAmount",
      "landlordAccount",
      "address",
    ]) {
      assert.doesNotMatch(apiSource, new RegExp(`"${fieldKey}"`));
    }

    assert.doesNotMatch(apiSource, /maintenanceFee\?:\s*OpenAiContractOcrField/);

    for (const fieldKey of ["depositBaseAmount", "depositConversionAmount", "depositFinalAmount", "paymentDay", "contractStartDate", "contractEndDate", "specialTerms"]) {
      assert.match(apiSource, new RegExp(`"${fieldKey}"`));
    }
  });
});
