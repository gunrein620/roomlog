import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  confirmationFieldsFromMessage,
  contractConfirmationIssues,
  parseConfirmationFields,
} from "./contract-confirmation";

describe("manager contract confirmation validation", () => {
  it("returns every missing required contract value at once", () => {
    const issues = contractConfirmationIssues({}, "2026-07-14");

    assert.deepEqual(
      issues.map((issue) => issue.field),
      ["startDate", "endDate", "monthlyRent", "maintenanceFee"],
    );
  });

  it("requires a payment day only when the monthly total is positive", () => {
    const base = {
      startDate: "2026-07-01",
      endDate: "2027-06-30",
    };

    assert.deepEqual(
      contractConfirmationIssues({ ...base, monthlyRent: 600_000, maintenanceFee: 70_000 }, "2026-07-14")
        .map((issue) => issue.field),
      ["paymentDay"],
    );
    assert.deepEqual(
      contractConfirmationIssues({ ...base, monthlyRent: 0, maintenanceFee: 0 }, "2026-07-14"),
      [],
    );
  });

  it("points invalid periods at the date that must be corrected", () => {
    assert.deepEqual(
      contractConfirmationIssues({
        startDate: "2026-08-01",
        endDate: "2026-07-31",
        monthlyRent: 0,
        maintenanceFee: 0,
      }, "2026-07-14").map((issue) => issue.field),
      ["endDate"],
    );
  });

  it("maps API validation messages and ignores unknown query fields", () => {
    assert.deepEqual(
      confirmationFieldsFromMessage("월세와 관리비를 확인하고 납부일을 입력해주세요."),
      ["monthlyRent", "maintenanceFee", "paymentDay"],
    );
    assert.deepEqual(
      parseConfirmationFields("monthlyRent,unknown,endDate"),
      ["monthlyRent", "endDate"],
    );
  });
});
