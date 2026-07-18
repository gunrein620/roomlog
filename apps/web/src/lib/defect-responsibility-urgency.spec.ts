import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// 세입자 하자 흐름의 본선은 세입자탭(living)의 TenantMyPage다 — 모바일(PhoneFrame) 화면이 아니라
// 민원/하자 이력에 붙은 상세 시트에서 긴급도·이의제기·확정 표시·채팅이 전부 이루어져야 한다.
const tenantMyPageSource = readFileSync(
  join(__dirname, "../app/my/flows/TenantMyPage.tsx"),
  "utf8",
);

describe("tenant defect responsibility and urgency wiring (living tab)", () => {
  it("submits a responsibility appeal from the history detail sheet and opens the in-tab manager chat", () => {
    assert.match(tenantMyPageSource, /\/ai-feedback/);
    assert.match(tenantMyPageSource, /target: "RESPONSIBILITY"/);
    assert.match(tenantMyPageSource, /책임 판단 이의제기/);
    assert.match(tenantMyPageSource, /관리자와 대화하기/);
    // 대화 핸드오프는 탭 안의 임대인 채팅 시트를 연다 — 모바일 메시징 화면으로 이동하지 않는다.
    assert.match(tenantMyPageSource, /openLandlordConversation\(\)/);
    assert.doesNotMatch(tenantMyPageSource, /tenantLandlordThreadHref/);
  });

  it("shows the manager decision separately from the AI likelihood", () => {
    assert.match(tenantMyPageSource, /관리자 확정 ·/);
    assert.match(tenantMyPageSource, /AI 추정 · 확정 아님/);
    assert.match(tenantMyPageSource, /responsibilityDecision/);
  });

  it("passes the optional four-level urgency through complaint creation", () => {
    assert.match(tenantMyPageSource, /긴급도 \(선택\)/);
    assert.match(tenantMyPageSource, /1 즉시/);
    assert.match(tenantMyPageSource, /4 문의성/);
    assert.match(tenantMyPageSource, /urgency: requestUrgency/);
    assert.match(tenantMyPageSource, /\/api\/tenant\/complaints/);
  });

  it("keeps completion confirmation and thread chat inside the detail sheet", () => {
    assert.match(tenantMyPageSource, /confirm-completion/);
    assert.match(tenantMyPageSource, /수리 완료 확인/);
    assert.match(tenantMyPageSource, /\/messages/);
    assert.match(tenantMyPageSource, /진행 메시지/);
    // 세입자탭에서 하자 모바일 화면(/tenant/defect/**)으로 나가는 링크는 금지.
    assert.doesNotMatch(tenantMyPageSource, /\/tenant\/defect\//);
  });
});
