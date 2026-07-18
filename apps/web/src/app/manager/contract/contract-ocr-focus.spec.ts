import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("contract OCR important-field scope", () => {
  it("keeps the manager OCR correction form focused on deposit, rent and special clauses", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "src/app/manager/contract/01/page.tsx"),
      "utf8",
    );

    // 월세는 관리인이 이 화면에서 직접 넣을 수 있어야 한다. 나머지 DB 보유 필드는 02/03에서만 수정한다.
    for (const fieldName of ["maintenanceFee", "paymentDay", "landlordAccount", "startDate", "endDate"]) {
      assert.doesNotMatch(pageSource, new RegExp(`name="${fieldName}"`));
    }

    for (const fieldName of ["deposit", "monthlyRent", "specialTerms", "autoRenewal", "restorationDuty", "repairDuty"]) {
      assert.match(pageSource, new RegExp(`name="${fieldName}"`));
    }

    assert.doesNotMatch(pageSource, /기존 DB 계약값 불러오기/);
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
      "contractStartDate",
      "contractEndDate",
      "rentBaseAmount",
      "rentConversionAmount",
      "maintenanceFee",
      "paymentDay",
      "landlordAccount",
      "address",
    ]) {
      assert.doesNotMatch(apiSource, new RegExp(`"${fieldKey}"`));
    }

    for (const fieldKey of ["depositBaseAmount", "depositConversionAmount", "depositFinalAmount", "specialTerms"]) {
      assert.match(apiSource, new RegExp(`"${fieldKey}"`));
    }
  });
});
