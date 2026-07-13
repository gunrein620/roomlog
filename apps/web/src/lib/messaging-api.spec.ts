import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { tenantMessagingPaths } from "./messaging-api";
import {
  managerMessagingPaths,
  translateAnnouncement,
  updateAnnouncementDraft,
} from "./messaging-manager-api";

describe("messaging api path contracts", () => {
  it("routes tenant messaging reads and mutations through the real roomlog API", () => {
    assert.equal(tenantMessagingPaths.threads(), "/tenant/messaging/threads");
    assert.equal(tenantMessagingPaths.thread("mth_1"), "/tenant/messaging/threads/mth_1");
    assert.equal(
      tenantMessagingPaths.threadMessages("mth_1"),
      "/tenant/messaging/threads/mth_1/messages"
    );
    assert.equal(
      tenantMessagingPaths.deleteThread("mth_1"),
      "/tenant/messaging/threads/mth_1"
    );
    assert.equal(tenantMessagingPaths.announcements(), "/tenant/messaging/announcements");
    assert.equal(
      tenantMessagingPaths.announcement("ann_1"),
      "/tenant/messaging/announcements/ann_1"
    );
    assert.equal(
      tenantMessagingPaths.confirmAnnouncement("ann_1"),
      "/tenant/messaging/announcements/ann_1/confirm"
    );
  });

  it("routes manager messaging through manager-scoped API paths", () => {
    assert.equal(managerMessagingPaths.threads(), "/manager/messaging/threads");
    assert.equal(
      managerMessagingPaths.threads("payment"),
      "/manager/messaging/threads?context=payment"
    );
    assert.equal(
      managerMessagingPaths.threadMessages("mth_1"),
      "/manager/messaging/threads/mth_1/messages"
    );
    assert.equal(
      managerMessagingPaths.deleteThread("mth_1"),
      "/manager/messaging/threads/mth_1"
    );
    assert.equal(
      managerMessagingPaths.announcementDrafts(),
      "/manager/messaging/announcement-drafts"
    );
    assert.equal(
      managerMessagingPaths.announcementDraft("draft_1"),
      "/manager/messaging/announcement-drafts/draft_1"
    );
    assert.equal(typeof updateAnnouncementDraft, "function");
    assert.equal(
      managerMessagingPaths.announcementTranslations(),
      "/manager/messaging/announcement-translations"
    );
    assert.equal(typeof translateAnnouncement, "function");
    assert.equal(
      managerMessagingPaths.announcementRecipients("draft_1"),
      "/manager/messaging/announcement-drafts/draft_1/recipients"
    );
    assert.equal(
      managerMessagingPaths.sendAnnouncementDraft("draft_1"),
      "/manager/messaging/announcement-drafts/draft_1/send"
    );
    assert.equal(
      managerMessagingPaths.announcementResult("ann_1"),
      "/manager/messaging/announcement-results/ann_1"
    );
  });
});
