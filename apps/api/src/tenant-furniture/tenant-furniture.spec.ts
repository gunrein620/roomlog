import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException
} from "@nestjs/common";
import { TenantFurnitureController } from "./tenant-furniture.controller";
import {
  mapRoomPlanCategory,
  TenantFurnitureService
} from "./tenant-furniture.service";

function serviceWithPrisma(prisma: unknown): TenantFurnitureService {
  const service = new TenantFurnitureService(undefined);
  (service as any).prisma = prisma;
  return service;
}

describe("mapRoomPlanCategory", () => {
  it("maps RoomPlan labels case-insensitively and tolerates separators", () => {
    assert.equal(mapRoomPlanCategory("BED"), "bed");
    assert.equal(mapRoomPlanCategory("washer_Dryer"), "washerDryer");
    assert.equal(mapRoomPlanCategory("Tele Vision"), "television");
    assert.equal(mapRoomPlanCategory("not-yet-supported"), "unknown");
  });
});

describe("TenantFurnitureService RoomPlan import", () => {
  it("converts metres to rounded millimetres and returns the shared response shape", async () => {
    const created: Array<Record<string, unknown>> = [];
    const prisma = {
      tenantFurniture: {
        create: ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve({ ...data, createdAt: new Date("2026-07-17T00:00:00.000Z") });
        }
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations)
    };
    const service = serviceWithPrisma(prisma);

    const result = await service.importRoomPlan("tenant-1", {
      source: "roomplan",
      objects: [
        {
          category: "washer_dryer",
          dimensions: { w: 0.6014, d: 0.6546, h: 0.8505 }
        }
      ]
    });

    assert.match(String(created[0].id), /^tf_[0-9a-f-]{36}$/);
    assert.deepEqual(
      {
        ownerTenantId: created[0].ownerTenantId,
        category: created[0].category,
        widthMm: created[0].widthMm,
        depthMm: created[0].depthMm,
        heightMm: created[0].heightMm,
        source: created[0].source
      },
      {
        ownerTenantId: "tenant-1",
        category: "washerDryer",
        widthMm: 601,
        depthMm: 655,
        heightMm: 851,
        source: "roomplan"
      }
    );
    assert.deepEqual(result[0].sizeMm, { width: 601, depth: 655, height: 851 });
    assert.equal(result[0].createdAt, "2026-07-17T00:00:00.000Z");
  });

  it("rejects the whole payload before writes when a dimension is non-positive", async () => {
    let createCalls = 0;
    const service = serviceWithPrisma({
      tenantFurniture: {
        create: async () => {
          createCalls += 1;
          return {};
        }
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations)
    });

    await assert.rejects(
      () =>
        service.importRoomPlan("tenant-1", {
          source: "roomplan",
          objects: [
            { category: "bed", dimensions: { w: 2, d: 1, h: 0.5 } },
            { category: "chair", dimensions: { w: 0, d: 0.5, h: 1 } }
          ]
        }),
      BadRequestException
    );
    assert.equal(createCalls, 0);
  });
});

describe("TenantFurnitureController authentication", () => {
  it("rejects an unauthenticated tenant request", async () => {
    const controller = new TenantFurnitureController({} as any, {
      getUserFromToken: () => {
        throw new UnauthorizedException("인증 토큰이 필요합니다.");
      },
      rolesForUser: () => ["TENANT"]
    } as any);

    await assert.rejects(() => controller.list(undefined), UnauthorizedException);
  });
});

describe("TenantFurnitureService ownership", () => {
  it("allows only the owner to update or delete furniture", async () => {
    const row = {
      id: "tf-owned",
      ownerTenantId: "tenant-owner",
      category: "bed",
      label: null,
      widthMm: 2000,
      depthMm: 1000,
      heightMm: 500,
      source: "manual",
      meshUrl: null,
      createdAt: new Date("2026-07-17T00:00:00.000Z")
    };
    let deleted = false;
    const service = serviceWithPrisma({
      tenantFurniture: {
        findUnique: async () => row,
        update: async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data }),
        delete: async () => {
          deleted = true;
          return row;
        }
      }
    });

    await assert.rejects(
      () => service.update(row.id, "tenant-other", { label: "남의 침대" }),
      ForbiddenException
    );
    await assert.rejects(
      () => service.remove(row.id, "tenant-other"),
      ForbiddenException
    );
    assert.equal(deleted, false);

    const updated = await service.update(row.id, "tenant-owner", { label: "내 침대" });
    assert.equal(updated.label, "내 침대");
    assert.deepEqual(await service.remove(row.id, "tenant-owner"), {
      id: row.id,
      deleted: true
    });
    assert.equal(deleted, true);
  });
});
