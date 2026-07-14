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
    assert.match(component, /^"use client";/);
    assert.match(component, /공지사항/);
    assert.match(component, /도움이 필요하신가요/);
    assert.match(component, /AnnouncementDetailDialog/);
    assert.match(component, /useState/);
    assert.match(component, /type="button"/);
    assert.doesNotMatch(component, /tenantAnnouncementDetailHref/);
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
    assert.match(
      component,
      /<Link href="\/living" className=\{styles\.backLink\} aria-label="세입자 홈으로 돌아가기">/,
    );
    assert.doesNotMatch(
      component,
      /<Link href="\/tenant\/home\/00" className=\{styles\.backLink\}/,
    );
    assert.doesNotMatch(
      component,
      /MAIN_NAV_ITEMS|aria-label="세입자 주요 메뉴"|styles\.bottomNav/,
    );
    assert.doesNotMatch(css, /\.(?:bottomNav|navLink|navLinkActive)\b/);
    const contentRule = css.match(/\.content\s*\{[\s\S]*?\}/)?.[0] ?? "";
    assert.doesNotMatch(contentRule, /touch-target/);
    assert.match(css, /@media \(min-width: 768px\)/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /-webkit-line-clamp:\s*1;/);
    assert.doesNotMatch(css, /-webkit-line-clamp:\s*2;/);
    assert.match(css, /\.announcementDialog\s*\{/);
    assert.match(css, /\.announcementDialog::backdrop\s*\{/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  });

  it("opens announcement details in an accessible native dialog", () => {
    assert.equal(existsSync(join(root, "AnnouncementDetailDialog.tsx")), true);
    const dialog = read("AnnouncementDetailDialog.tsx");
    assert.match(dialog, /^"use client";/);
    assert.match(dialog, /<dialog/);
    assert.match(dialog, /showModal\(\)/);
    assert.match(dialog, /onCancel/);
    assert.match(dialog, /\/api\/tenant\/messaging\/announcements\//);
    assert.match(dialog, /\/api\/tenant\/messaging\/threads/);
    for (const label of ["상세 내용", "확인", "읽음", "이 공지 문의"]) {
      assert.match(dialog, new RegExp(label));
    }
  });

  it("keeps the legacy notice entry on detail and routes the living card to the list", () => {
    assert.match(read("../00/page.tsx"), /tenantAnnouncementDetailHref\(announcement\.id\)/);
    const livingPage = read("../../../my/flows/TenantMyPage.tsx");
    assert.match(livingPage, /<Link href="\/tenant\/messaging\/02" className="tenant-announcement-link">/);
    assert.doesNotMatch(livingPage, /tenantAnnouncementDetailHref/);
  });
});
