import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// 세입자 하자 흐름의 본선은 세입자탭(living)의 TenantMyPage다.
const tenantMyPageSource = readFileSync(
  join(__dirname, "../app/my/flows/TenantMyPage.tsx"),
  "utf8",
);
const globalCssSource = readFileSync(
  join(__dirname, "../app/globals.css"),
  "utf8",
);
const historyDetailStart = tenantMyPageSource.indexOf("{selectedRepairRequest ? (");
const historyDetailEnd = tenantMyPageSource.indexOf("{isRequestSheetOpen ? (", historyDetailStart);

assert.ok(historyDetailStart >= 0, "민원/하자 이력 상세 시작점을 찾을 수 있어야 한다");
assert.ok(historyDetailEnd > historyDetailStart, "민원/하자 이력 상세 끝점을 찾을 수 있어야 한다");

const historyDetailSource = tenantMyPageSource.slice(historyDetailStart, historyDetailEnd);

describe("tenant defect responsibility and urgency wiring (living tab)", () => {
  it("keeps only the submitted title, status and urgency summary, and ticket chat in history detail", () => {
    assert.match(historyDetailSource, /selectedRepairRequest\.title/);
    assert.match(historyDetailSource, /detailStatusLabel/);
    assert.match(historyDetailSource, /긴급도/);
    assert.match(historyDetailSource, /진행 메시지/);
    assert.match(historyDetailSource, /진행 메시지 입력/);

    assert.doesNotMatch(historyDetailSource, /요청 유형/);
    assert.doesNotMatch(historyDetailSource, /발생일시/);
    assert.doesNotMatch(historyDetailSource, /본문 내용/);
    assert.doesNotMatch(historyDetailSource, /발생 위치/);
    assert.doesNotMatch(historyDetailSource, /첨부 이미지/);
    assert.doesNotMatch(historyDetailSource, /TenantVendorWorkflowPanel/);
    assert.doesNotMatch(historyDetailSource, /TenantVendorConnectionCard/);
    assert.doesNotMatch(historyDetailSource, /책임 판단 이의제기/);
    assert.doesNotMatch(historyDetailSource, /AI 추정 · 확정 아님/);
    assert.doesNotMatch(historyDetailSource, /수리 완료 확인/);
  });

  it("passes the optional four-level urgency through complaint creation", () => {
    assert.match(tenantMyPageSource, /긴급도 \(선택\)/);
    assert.match(tenantMyPageSource, /1 즉시/);
    assert.match(tenantMyPageSource, /4 문의성/);
    assert.match(tenantMyPageSource, /urgency: requestUrgency/);
    assert.match(tenantMyPageSource, /\/api\/tenant\/complaints/);
  });

  it("keeps the ticket message mutation inside the detail sheet", () => {
    assert.match(tenantMyPageSource, /\/messages/);
    // 세입자탭에서 하자 모바일 화면(/tenant/defect/**)으로 나가는 링크는 금지.
    assert.doesNotMatch(tenantMyPageSource, /\/tenant\/defect\//);
  });

  it("keeps a five-message-height chat viewport and scrolls longer threads inside it", () => {
    assert.match(historyDetailSource, /detailMessages\.length === 0/);
    assert.match(globalCssSource, /\.tenant-defect-messages ul[\s\S]*height:\s*292px/);
    assert.match(globalCssSource, /\.tenant-defect-messages ul[\s\S]*overflow-y:\s*auto/);
  });

  it("opens history detail as a right sidebar and expands it to full screen on mobile", () => {
    assert.match(historyDetailSource, /tenant-request-detail-backdrop/);
    assert.match(historyDetailSource, /tenant-request-detail-panel/);
    assert.match(historyDetailSource, /aria-label="접수 내용 닫기"/);
    assert.match(globalCssSource, /\.tenant-request-detail-backdrop[\s\S]*justify-content:\s*flex-end/);
    assert.match(globalCssSource, /\.tenant-request-detail-panel[\s\S]*width:\s*min\(50vw, 720px\)/);
    assert.match(globalCssSource, /@media \(max-width: 768px\)[\s\S]*\.tenant-request-detail-panel[\s\S]*width:\s*100%/);
  });
});
