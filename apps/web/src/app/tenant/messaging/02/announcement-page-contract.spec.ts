import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = __dirname;
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("tenant announcement route boundary", () => {
  it("keeps auth in the shared layout and moves PhoneFrame to legacy screens", () => {
    const layout = read("../layout.tsx");
    assert.match(layout, /requireUser\("TENANT"\)/);
    assert.doesNotMatch(layout, /PhoneFrame/);
    for (const path of ["../00/page.tsx", "../01/page.tsx", "../e0/page.tsx"]) {
      assert.match(read(path), /MessagingPhoneFrame/);
    }
  });

  it("preserves announcement actions in a dynamic detail route", () => {
    assert.equal(existsSync(join(root, "[id]/page.tsx")), true);
    const detail = read("[id]/page.tsx");
    assert.match(detail, /confirmAnnouncement/);
    assert.match(detail, /markAnnouncementRead/);
    assert.match(detail, /createTenantThread/);
    assert.match(detail, /params/);
    const css = read("[id]/AnnouncementDetailPage.module.css");
    assert.match(css, /@media \(min-width: 768px\)/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  });

  it("renders a responsive token-only list at /02", () => {
    const page = read("page.tsx");
    const component = read("AnnouncementListPage.tsx");
    const css = read("AnnouncementListPage.module.css");
    assert.match(page, /listAnnouncements/);
    assert.match(page, /AnnouncementListPage/);
    assert.doesNotMatch(page, /getAnnouncement/);
    assert.match(component, /공지사항/);
    assert.match(component, /도움이 필요하신가요/);
    assert.match(component, /tenantAnnouncementDetailHref/);
    assert.match(
      component,
      /const needsConfirmation = announcement\.confirmRequired && announcement\.state !== "confirmed";/,
    );
    assert.match(
      component,
      /const isOrdinaryUnread = announcement\.state === "unread" && !announcement\.confirmRequired;/,
    );
    assert.match(
      component,
      /\{needsConfirmation && <span className=\{styles\.unread\}>미확인<\/span>\}/,
    );
    assert.match(
      component,
      /\{isOrdinaryUnread && <span className=\{styles\.unread\}>새 공지<\/span>\}/,
    );
    assert.match(component, /<summary aria-label="공지 검색">/);
    assert.doesNotMatch(component, /공지 검색 열기/);
    assert.match(css, /@media \(min-width: 768px\)/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /-webkit-line-clamp:\s*1;/);
    assert.doesNotMatch(css, /-webkit-line-clamp:\s*2;/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  });

  it("routes existing tenant notice entry points to the dynamic detail helper", () => {
    assert.match(read("../00/page.tsx"), /tenantAnnouncementDetailHref\(announcement\.id\)/);
    assert.match(
      read("../../../my/flows/TenantMyPage.tsx"),
      /tenantAnnouncementDetailHref\(announcementState\.announcement\.id\)/,
    );
  });
});
