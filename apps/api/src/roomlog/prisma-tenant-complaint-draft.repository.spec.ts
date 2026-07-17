import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  expiredDraftDeleteWhere,
  PrismaTenantComplaintDraftRepository
} from "./prisma-tenant-complaint-draft.repository";

const databaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

describe("PrismaTenantComplaintDraftRepository", () => {
  it("conditions lazy expiry deletion on the row still being expired", () => {
    const now = new Date("2026-07-17T03:00:00.000Z");

    assert.deepEqual(expiredDraftDeleteWhere("draft-1", now), {
      id: "draft-1",
      expiresAt: { lte: now }
    });
  });

  it("upserts per tenant-room and deletes only expired drafts", { skip: !databaseUrl }, async () => {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
    const repository = new PrismaTenantComplaintDraftRepository(databaseUrl!);
    const suffix = Date.now().toString(36);
    const tenantA = `draft-tenant-a-${suffix}`;
    const tenantB = `draft-tenant-b-${suffix}`;
    const roomA = `draft-room-a-${suffix}`;
    const roomB = `draft-room-b-${suffix}`;
    const now = new Date("2026-07-17T03:00:00.000Z");

    try {
      await prisma.userAccount.createMany({
        data: [
          { id: tenantA, email: `${tenantA}@roomlog.test`, passwordHash: "salt:hash", name: "A", role: "TENANT" },
          { id: tenantB, email: `${tenantB}@roomlog.test`, passwordHash: "salt:hash", name: "B", role: "TENANT" }
        ]
      });
      await prisma.room.createMany({
        data: [
          { id: roomA, buildingName: `Draft A ${suffix}`, roomNo: "301", address: "서울" },
          { id: roomB, buildingName: `Draft B ${suffix}`, roomNo: "302", address: "서울" }
        ]
      });

      const first = await repository.upsert({
        tenantId: tenantA,
        roomId: roomA,
        category: "민원",
        title: "첫 제목",
        occurredAt: null,
        description: "첫 본문",
        attachmentUrls: [],
        expiresAt: new Date("2026-07-18T03:00:00.000Z")
      });
      const updated = await repository.upsert({
        tenantId: tenantA,
        roomId: roomA,
        category: "하자",
        title: "수정 제목",
        occurredAt: "2026-07-17T02:00:00.000Z",
        description: "수정 본문",
        attachmentUrls: ["/api/files/a.jpg"],
        expiresAt: new Date("2026-07-18T04:00:00.000Z")
      });
      await repository.upsert({
        tenantId: tenantB,
        roomId: roomB,
        category: "민원",
        title: "만료 초안",
        occurredAt: null,
        description: "삭제 대상",
        attachmentUrls: [],
        expiresAt: now
      });

      assert.equal(updated.id, first.id);
      assert.equal(updated.title, "수정 제목");
      assert.deepEqual(updated.attachmentUrls, ["/api/files/a.jpg"]);
      assert.equal(await repository.findActive(tenantB, roomB, now), null);
      assert.equal((await repository.findActive(tenantA, roomA, now))?.tenantId, tenantA);
      assert.equal(await repository.deleteExpired(now), 0);
    } finally {
      await prisma.userAccount.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
      await prisma.room.deleteMany({ where: { id: { in: [roomA, roomB] } } });
      await repository.close();
      await prisma.$disconnect();
    }
  });
});
