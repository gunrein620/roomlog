import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const defectApiSource = readFileSync(join(__dirname, "defect-api.ts"), "utf8");
const detailPageSource = readFileSync(
  join(__dirname, "../app/tenant/defect/11/page.tsx"),
  "utf8",
);
const detailActionSource = readFileSync(
  join(__dirname, "../app/tenant/defect/11/actions.ts"),
  "utf8",
);
const createPageSource = readFileSync(
  join(__dirname, "../app/tenant/defect/01/page.tsx"),
  "utf8",
);
const createActionSource = readFileSync(
  join(__dirname, "../app/tenant/defect/01/actions.ts"),
  "utf8",
);

describe("tenant defect responsibility and urgency wiring", () => {
  it("submits a responsibility appeal and hands off to the existing manager conversation route", () => {
    assert.match(defectApiSource, /submitResponsibilityFeedback/);
    assert.match(defectApiSource, /target: "RESPONSIBILITY"/);
    assert.match(detailActionSource, /submitResponsibilityFeedback/);
    assert.match(detailActionSource, /tenantLandlordThreadHref/);
    assert.match(detailActionSource, /tenantLandlordThreadInput/);
    assert.match(detailPageSource, /책임 판단 이의제기/);
    assert.match(detailPageSource, /관리자와 대화하기/);
    assert.match(detailPageSource, /관리자 확정:/);
  });

  it("passes the optional four-level urgency through complaint creation", () => {
    assert.match(createPageSource, /긴급도 \(선택\)/);
    assert.match(createPageSource, /name="urgency"/);
    assert.match(createPageSource, /1 즉시/);
    assert.match(createPageSource, /4 문의성/);
    assert.match(createActionSource, /createDefectComplaint/);
    assert.match(createActionSource, /urgency/);
    assert.match(defectApiSource, /CreateDefectComplaintInput/);
    assert.match(defectApiSource, /\/tenant\/complaints/);
  });
});
