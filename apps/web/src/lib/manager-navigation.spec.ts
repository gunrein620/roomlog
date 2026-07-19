import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  MANAGER_NAV_GROUPS,
  getManagerCurrentHref,
  getManagerNavState,
  type ManagerNavItem,
} from "./manager-navigation";

const items: ManagerNavItem[] = MANAGER_NAV_GROUPS.flatMap((group) => [...group.items]);
const hrefs = items.flatMap((item) => [item.href, ...item.children.map((child) => child.href)]);
const settingsPagePath = join(process.cwd(), "src/app/manager/home/06/page.tsx");
const voiceHomePath = join(process.cwd(), "src/app/manager/vox/00/page.tsx");

describe("manager workspace navigation", () => {
  it("contains every manager desktop domain entry", () => {
    assert.deepEqual(items.map((item) => item.id), [
      "dashboard", "listing", "contract", "billing", "ticket",
      "messaging", "vendor",
    ]);
  });

  it("removes the unused insight group from the permanent sidebar", () => {
    assert.equal(MANAGER_NAV_GROUPS.some((group) => group.label === "인사이트"), false);
    assert.deepEqual(getManagerNavState("/manager/report/00"), {
      activeItemId: null,
      activeChildHref: null,
    });
    assert.deepEqual(getManagerNavState("/manager/agent/realtime"), {
      activeItemId: null,
      activeChildHref: null,
    });
  });

  it("removes the unused account settings group, route, and voice-home tab", () => {
    const voiceHomeSource = readFileSync(voiceHomePath, "utf8");

    assert.equal(MANAGER_NAV_GROUPS.some((group) => group.label === "계정"), false);
    assert.equal(existsSync(settingsPagePath), false);
    assert.doesNotMatch(voiceHomeSource, /M-HOME-06|key: "settings"|label: "설정"/);
  });

  it("keeps entity-bound routes out of permanent navigation", () => {
    for (const contextualHref of [
      "/manager/contract/01", "/manager/cost/02", "/manager/ticket/dash/01",
      "/manager/messaging/02", "/manager/moveout/01", "/manager/vendor-mgmt/01",
      "/manager/report/02",
    ]) assert.equal(hrefs.includes(contextualHref), false, contextualHref);
  });

  it("selects a parent for contextual routes without inventing a child", () => {
    assert.deepEqual(getManagerNavState("/manager/ticket/dash/01?id=tk_1"), {
      activeItemId: "ticket",
      activeChildHref: null,
    });
    assert.deepEqual(getManagerNavState("/manager/contract/00"), {
      activeItemId: "contract",
      activeChildHref: "/manager/contract/00",
    });
  });

  it("selects only an exact permanent href as the semantic current page", () => {
    assert.equal(getManagerCurrentHref("/manager/contract/02?from=dashboard"), "/manager/contract/02");
    assert.equal(getManagerCurrentHref("/manager/billing/"), "/manager/billing");
    assert.equal(getManagerCurrentHref("/manager/contract/01?id=doc"), null);
    assert.equal(getManagerCurrentHref("/manager/billing/bill-1"), null);
  });

  it("keeps the dashboard as a single at-a-glance page without sub tabs", () => {
    const dashboard = items.find((item) => item.id === "dashboard");
    assert.deepEqual(dashboard?.children, []);
  });

  it("keeps listing management inside the manager workspace", () => {
    const listing = items.find((item) => item.id === "listing");
    assert.equal(listing?.href, "/manager/listing");
    assert.equal(listing?.external, undefined);
    // 매물 관리는 상태별 서브탭(계약완료/미계약)을 가지며, 쿼리 없는 진입은 첫 탭(계약완료)으로 수렴한다.
    assert.deepEqual(listing?.children.map((child) => child.href), [
      "/manager/listing?status=contracted",
      "/manager/listing?status=available",
    ]);
    assert.deepEqual(getManagerNavState("/manager/listing"), {
      activeItemId: "listing",
      activeChildHref: "/manager/listing?status=contracted",
    });
  });

  it("routes ticket children to the dashboard and combined management view", () => {
    const ticket = items.find((item) => item.id === "ticket");

    assert.deepEqual(ticket?.children.map((child) => child.label), [
      "민원 대시보드",
      "민원/하자 관리",
    ]);
    assert.equal(
      ticket?.children.find((child) => child.label === "민원/하자 관리")?.href,
      "/manager/ticket/dash/00?view=management",
    );
    assert.equal(
      ticket?.children.find((child) => child.label === "민원/하자 관리")?.ticketView,
      "management",
    );
  });

  it("matches every permanent child", () => {
    for (const item of items) {
      for (const child of item.children) {
        // 해시 앵커 자식(#report 등)은 별도 테스트에서 다룬다 — pathname 기준 매칭은 해시를 모른다.
        if (child.href.includes("#")) continue;
        assert.deepEqual(getManagerNavState(child.href), { activeItemId: item.id, activeChildHref: child.href });
      }
    }
    assert.deepEqual(getManagerNavState("/manager/home/06"), { activeItemId: null, activeChildHref: null });
    assert.deepEqual(getManagerNavState("/manager/listing"), {
      activeItemId: "listing",
      activeChildHref: "/manager/listing?status=contracted",
    });
    assert.deepEqual(getManagerNavState("/manager/agent/realtime"), { activeItemId: null, activeChildHref: null });
  });

  it("matches every contextual route to its parent only", () => {
    const cases = [
      ["/manager/contract/01?id=doc", "contract"], ["/manager/billing/bill-1", "billing"],
      ["/manager/messaging/04?id=thread", "messaging"], ["/manager/vendor-mgmt/02?id=vendor", "vendor"],
    ] as const;
    for (const [pathname, activeItemId] of cases) {
      assert.deepEqual(getManagerNavState(pathname), { activeItemId, activeChildHref: null });
    }
  });
});
