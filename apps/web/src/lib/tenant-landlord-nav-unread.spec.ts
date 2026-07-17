import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  sumTenantLandlordUnreadCount,
  tenantLandlordNavLabel,
} from "./tenant-landlord-nav-unread";

test("sums only unread general landlord inquiry threads", () => {
  assert.equal(
    sumTenantLandlordUnreadCount([
      { context: "general", unreadCount: 2 },
      { context: "general", unreadCount: 3.9 },
      { context: "general", contextRef: "ticket-1", unreadCount: 8 },
      { context: "repair", unreadCount: 5 },
    ]),
    5,
  );
});

test("ignores invalid unread values and builds an accessible tenant label", () => {
  assert.equal(
    sumTenantLandlordUnreadCount([
      { context: "general", unreadCount: -1 },
      { context: "general", unreadCount: Number.NaN },
      { context: "general", unreadCount: Number.POSITIVE_INFINITY },
    ]),
    0,
  );
  assert.equal(tenantLandlordNavLabel(0), "세입자");
  assert.equal(tenantLandlordNavLabel(5), "세입자, 미확인 메시지 5개");
});

test("wires realtime landlord unread totals to the tenant navigation tab", () => {
  const hookPath = join(__dirname, "use-tenant-landlord-unread-count.ts");
  assert.equal(existsSync(hookPath), true, "tenant landlord unread hook must exist");

  const hookSource = readFileSync(hookPath, "utf8");
  const homeSource = readFileSync(join(__dirname, "../app/HomeApp.tsx"), "utf8");

  assert.match(hookSource, /tenantLandlordConversationPaths\.threads\(\)/);
  assert.match(hookSource, /sumTenantLandlordUnreadCount/);
  assert.match(hookSource, /isTenantLandlordMessagingActivity/);
  assert.match(hookSource, /roomlog:activity/);
  assert.match(hookSource, /addEventListener\("focus"/);
  assert.match(hookSource, /addEventListener\("visibilitychange"/);
  assert.match(hookSource, /removeEventListener\("focus"/);
  assert.match(hookSource, /removeEventListener\("visibilitychange"/);

  assert.match(homeSource, /useTenantLandlordUnreadCount/);
  assert.match(homeSource, /hasCapability\(viewer, "TENANT"\)/);
  assert.match(homeSource, /tenantLandlordNavigationLabel/);
  assert.match(homeSource, /tenantLandlordBadgeText/);
  assert.match(homeSource, /className="nav-badge" aria-hidden="true"/);
});
