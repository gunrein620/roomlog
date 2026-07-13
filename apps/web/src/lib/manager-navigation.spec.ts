import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MANAGER_NAV_GROUPS,
  getManagerCurrentHref,
  getManagerNavState,
  type ManagerNavItem,
} from "./manager-navigation";

const items: ManagerNavItem[] = MANAGER_NAV_GROUPS.flatMap((group) => [...group.items]);
const hrefs = items.flatMap((item) => [item.href, ...item.children.map((child) => child.href)]);

describe("manager workspace navigation", () => {
  it("contains every manager desktop domain entry", () => {
    assert.deepEqual(items.map((item) => item.id), [
      "dashboard", "listing", "contract", "billing", "cost", "ticket",
      "messaging", "moveout", "vendor", "report", "assistant", "settings",
    ]);
  });

  it("keeps entity-bound routes out of permanent navigation", () => {
    for (const contextualHref of [
      "/manager/contract/01", "/manager/cost/02", "/manager/ticket/dash/01",
      "/manager/messaging/02", "/manager/moveout/01", "/manager/vendor-mgmt/01",
      "/manager/report/02",
    ]) assert.equal(hrefs.includes(contextualHref), false, contextualHref);
  });

  it("selects a parent for contextual routes without inventing a child", () => {
    assert.deepEqual(getManagerNavState("/manager/ticket/dash/04?id=tk_1"), {
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

  it("marks prototype home links", () => {
    const dashboard = items.find((item) => item.id === "dashboard");
    assert.equal(dashboard?.children.find((child) => child.href === "/manager/home/03")?.demo, true);
  });

  it("keeps listing management inside the manager workspace", () => {
    const listing = items.find((item) => item.id === "listing");
    assert.equal(listing?.href, "/manager/listing");
    assert.equal(listing?.external, undefined);
    assert.deepEqual(getManagerNavState("/manager/listing"), {
      activeItemId: "listing",
      activeChildHref: null,
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

  it("matches every permanent child and keeps settings separate from dashboard", () => {
    for (const item of items) {
      for (const child of item.children) {
        assert.deepEqual(getManagerNavState(child.href), { activeItemId: item.id, activeChildHref: child.href });
      }
    }
    assert.deepEqual(getManagerNavState("/manager/home/06"), { activeItemId: "settings", activeChildHref: null });
    assert.deepEqual(getManagerNavState("/manager/listing"), { activeItemId: "listing", activeChildHref: null });
    assert.deepEqual(getManagerNavState("/manager/agent/realtime"), { activeItemId: "assistant", activeChildHref: null });
  });

  it("matches every contextual route to its parent only", () => {
    const cases = [
      ["/manager/contract/01?id=doc", "contract"], ["/manager/billing/bill-1", "billing"],
      ["/manager/cost/03?id=cost", "cost"], ["/manager/messaging/04?id=thread", "messaging"],
      ["/manager/moveout/02?id=moveout", "moveout"], ["/manager/vendor-mgmt/02?id=vendor", "vendor"],
      ["/manager/report/03?id=report", "report"],
    ] as const;
    for (const [pathname, activeItemId] of cases) {
      assert.deepEqual(getManagerNavState(pathname), { activeItemId, activeChildHref: null });
    }
  });
});
