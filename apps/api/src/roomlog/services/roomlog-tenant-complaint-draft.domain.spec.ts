import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type {
  SaveTenantComplaintDraftInput,
  TenantComplaintDraftRecord,
  TenantComplaintDraftRepository
} from "../tenant-complaint-draft.repository";
import {
  RoomlogTenantComplaintDraftDomain,
  TenantComplaintDraftCleanupWorker
} from "./roomlog-tenant-complaint-draft.domain";

class FakeDraftRepository implements TenantComplaintDraftRepository {
  records = new Map<string, TenantComplaintDraftRecord>();
  deleteExpiredCalls: Date[] = [];

  private key(tenantId: string, roomId: string) {
    return `${tenantId}:${roomId}`;
  }

  async findActive(tenantId: string, roomId: string, now: Date) {
    const key = this.key(tenantId, roomId);
    const record = this.records.get(key) ?? null;
    if (record && record.expiresAt.getTime() <= now.getTime()) {
      this.records.delete(key);
      return null;
    }
    return record;
  }

  async upsert(input: SaveTenantComplaintDraftInput & { tenantId: string; expiresAt: Date }) {
    const key = this.key(input.tenantId, input.roomId);
    const previous = this.records.get(key);
    const record: TenantComplaintDraftRecord = {
      id: previous?.id ?? `draft-${this.records.size + 1}`,
      tenantId: input.tenantId,
      roomId: input.roomId,
      category: input.category,
      title: input.title,
      occurredAt: input.occurredAt,
      description: input.description,
      attachmentUrls: [...input.attachmentUrls],
      createdAt: previous?.createdAt ?? new Date("2026-07-17T00:00:00.000Z"),
      updatedAt: new Date("2026-07-17T00:00:00.000Z"),
      expiresAt: input.expiresAt
    };
    this.records.set(key, record);
    return record;
  }

  async delete(tenantId: string, roomId: string) {
    this.records.delete(this.key(tenantId, roomId));
  }

  async deleteExpired(now: Date) {
    this.deleteExpiredCalls.push(now);
    let count = 0;
    for (const [key, record] of this.records) {
      if (record.expiresAt.getTime() <= now.getTime()) {
        this.records.delete(key);
        count += 1;
      }
    }
    return count;
  }
}

const NOW = new Date("2026-07-17T03:00:00.000Z");

function draftInput(overrides: Partial<SaveTenantComplaintDraftInput> = {}): SaveTenantComplaintDraftInput {
  return {
    roomId: "room-301",
    category: "하자",
    title: "세면대가 깨짐",
    occurredAt: "2026-07-17T02:30:00.000Z",
    description: "세면대 모서리가 깨졌습니다.",
    attachmentUrls: ["/api/files/photo-1.jpg"],
    ...overrides
  };
}

describe("RoomlogTenantComplaintDraftDomain", () => {
  it("saves one tenant-room draft with an expiry exactly 24 hours from the latest save", async () => {
    const repository = new FakeDraftRepository();
    const domain = new RoomlogTenantComplaintDraftDomain(
      repository,
      { canAccessRoom: () => true },
      () => NOW
    );

    const saved = await domain.save("tenant-a", draftInput());

    assert.equal(saved.tenantId, "tenant-a");
    assert.equal(saved.expiresAt.toISOString(), "2026-07-18T03:00:00.000Z");
    assert.deepEqual(saved.attachmentUrls, ["/api/files/photo-1.jpg"]);
  });

  it("rejects saving a draft for a room not linked to the authenticated tenant", async () => {
    const domain = new RoomlogTenantComplaintDraftDomain(
      new FakeDraftRepository(),
      { canAccessRoom: () => false },
      () => NOW
    );

    await assert.rejects(() => domain.save("tenant-a", draftInput()), ForbiddenException);
  });

  it("returns no draft after 24 hours and removes the expired record", async () => {
    const repository = new FakeDraftRepository();
    const domain = new RoomlogTenantComplaintDraftDomain(
      repository,
      { canAccessRoom: () => true },
      () => NOW
    );
    await domain.save("tenant-a", draftInput());

    const afterExpiry = new RoomlogTenantComplaintDraftDomain(
      repository,
      { canAccessRoom: () => true },
      () => new Date("2026-07-18T03:00:00.000Z")
    );

    assert.equal(await afterExpiry.get("tenant-a", "room-301"), null);
    assert.equal(repository.records.size, 0);
  });
});

describe("TenantComplaintDraftCleanupWorker", () => {
  it("deletes expired drafts using the current clock value", async () => {
    const repository = new FakeDraftRepository();
    const worker = new TenantComplaintDraftCleanupWorker(repository, () => NOW);

    assert.equal(await worker.removeExpired(), 0);
    assert.deepEqual(repository.deleteExpiredCalls, [NOW]);
  });

  it("schedules cleanup every 10 minutes and clears the timer on shutdown", async () => {
    const repository = new FakeDraftRepository();
    const scheduled: { callback?: () => void; interval?: number; cleared?: unknown } = {};
    const handle = { unref() {} };
    const scheduler = {
      setInterval(callback: () => void, interval: number) {
        scheduled.callback = callback;
        scheduled.interval = interval;
        return handle;
      },
      clearInterval(value: unknown) {
        scheduled.cleared = value;
      }
    };
    const worker = new TenantComplaintDraftCleanupWorker(repository, () => NOW, scheduler);

    worker.onModuleInit();
    assert.equal(scheduled.interval, 10 * 60 * 1000);
    scheduled.callback?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(repository.deleteExpiredCalls, [NOW]);

    await worker.onModuleDestroy();
    assert.equal(scheduled.cleared, handle);
  });
});
