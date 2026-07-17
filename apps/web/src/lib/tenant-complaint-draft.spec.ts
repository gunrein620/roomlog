import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  createTenantComplaintDraftLoadGuard,
  createTenantComplaintDraftMutationGuard,
  deleteTenantComplaintDraft,
  loadTenantComplaintDraft,
  mergeTenantComplaintDraftImageUrls,
  saveTenantComplaintDraft,
  serializeTenantComplaintDraftOccurredAt,
  type TenantComplaintDraftInput
} from "./tenant-complaint-draft";

const input: TenantComplaintDraftInput = {
  roomId: "room 301",
  category: "하자",
  title: "세면대 파손",
  occurredAt: "2026-07-17T03:00",
  description: "모서리가 깨졌습니다.",
  attachmentUrls: ["/api/files/a.jpg"]
};

describe("tenant complaint draft API", () => {
  it("ignores an older room load and invalidates loads when the modal closes", () => {
    const guard = createTenantComplaintDraftLoadGuard();
    const room301 = guard.begin("room-301");
    const room302 = guard.begin("room-302");

    assert.equal(guard.isCurrent(room301), false);
    assert.equal(guard.isCurrent(room302), true);
    guard.invalidate();
    assert.equal(guard.isCurrent(room302), false);
  });

  it("prevents save and submit operations from overlapping", () => {
    const guard = createTenantComplaintDraftMutationGuard();
    const save = guard.tryBegin("save");

    assert.ok(save);
    assert.equal(guard.tryBegin("submit"), null);
    guard.end(save);
    assert.ok(guard.tryBegin("submit"));
  });

  it("serializes datetime-local input with an explicit timezone", () => {
    const serialized = serializeTenantComplaintDraftOccurredAt("2026-07-17T12:00");

    assert.equal(serialized, new Date("2026-07-17T12:00").toISOString());
    assert.match(serialized ?? "", /Z$/);
    assert.equal(serializeTenantComplaintDraftOccurredAt(""), null);
  });

  it("loads a room-scoped draft without caching", async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const draft = await loadTenantComplaintDraft("room 301", async (url, init) => {
      request = { url: String(url), init };
      return Response.json({
        draft: { ...input, id: "draft-1", expiresAt: "2026-07-18T03:00:00.000Z" }
      });
    });

    assert.equal(request?.url, "/api/tenant/complaints/draft?roomId=room%20301");
    assert.equal(request?.init?.cache, "no-store");
    assert.equal(draft?.id, "draft-1");
  });

  it("saves with PUT and deletes with the room query", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Response.json(init?.method === "DELETE" ? { deleted: true } : { ...input, id: "draft-1" });
    };

    await saveTenantComplaintDraft(input, fetcher);
    await deleteTenantComplaintDraft(input.roomId, fetcher);

    assert.equal(calls[0]?.url, "/api/tenant/complaints/draft");
    assert.equal(calls[0]?.init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), input);
    assert.equal(calls[1]?.url, "/api/tenant/complaints/draft?roomId=room%20301");
    assert.equal(calls[1]?.init?.method, "DELETE");
  });

  it("keeps restored URLs in display order and inserts newly uploaded URLs for file images", () => {
    const images = [
      { id: "persisted", url: "/api/files/old.jpg", uploadedUrl: "/api/files/old.jpg" },
      { id: "new", url: "blob:new", file: {} as File }
    ];

    assert.deepEqual(
      mergeTenantComplaintDraftImageUrls(images, ["/api/files/new.jpg"]),
      ["/api/files/old.jpg", "/api/files/new.jpg"]
    );
  });
});
