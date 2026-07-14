import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = __dirname;
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("tenant announcement route boundary", () => {
  it("keeps auth in the shared layout and moves PhoneFrame to legacy screens", () => {
    assert.doesNotMatch(read("../layout.tsx"), /PhoneFrame/);
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
});
