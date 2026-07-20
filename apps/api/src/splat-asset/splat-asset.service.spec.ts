import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { SplatAssetService, type UploadedSplatAssetFile } from "./splat-asset.service";

function serviceWithFakes(prisma: unknown, storageAdapter: unknown): SplatAssetService {
  const service = new SplatAssetService(undefined);
  (service as any).prisma = prisma;
  (service as any).storageAdapter = storageAdapter;
  return service;
}

function viewerWall(id: string) {
  return {
    id,
    wall_id: id,
    dimensions: { width: 3, height: 2.4, depth: 0.12 },
    position: [1, 1.2, 2],
    rotation: [0, 0.5, 0]
  };
}

describe("SplatAssetService", () => {
  it("classifies a Record3D zip as a queued capture source", async () => {
    let createdData: Record<string, unknown> | undefined;
    let savedFileName = "";
    const service = serviceWithFakes(
      {
        room: { upsert: async () => ({}) },
        splatAsset: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdData = data;
            return data;
          }
        }
      },
      {
        save: async ({ fileName }: { fileName: string }) => {
          savedFileName = fileName;
          return { fileName, fileUrl: "/api/files/capture.zip" };
        }
      }
    );
    const file: UploadedSplatAssetFile = {
      buffer: Buffer.from("record3d"),
      originalname: "living-room.ZIP",
      mimetype: "application/zip"
    };

    await service.intake({ listingId: "listing-1", title: "거실" }, file);

    assert.match(savedFileName, /^splat-capture-.+\.zip$/);
    assert.equal(createdData?.fileKind, "record3d-zip");
    assert.equal(createdData?.fileUrl, "");
    assert.equal(createdData?.videoUrl, "/api/files/capture.zip");
    assert.equal(createdData?.status, "PROCESSING");
    assert.equal(createdData?.jobState, "QUEUED");
  });

  it("attaches a reconstructed spz, clears stale registration, and marks the job done", async () => {
    const asset = {
      id: "asset-1",
      listingId: "listing-1",
      status: "REGISTERED",
      transform: { offsetX: 1 },
      registrationPairs: [{ splat: { x: 1, y: 1 }, plan: { x: 2, y: 2 } }]
    };
    let updateData: Record<string, unknown> | undefined;
    const service = serviceWithFakes(
      {
        splatAsset: {
          findUnique: async () => asset,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updateData = data;
            return { ...asset, ...data };
          }
        }
      },
      {
        save: async ({ fileName }: { fileName: string }) => ({
          fileName,
          fileUrl: "/api/files/reconstructed.spz"
        })
      }
    );
    const file: UploadedSplatAssetFile = {
      buffer: Buffer.from("spz-result"),
      originalname: "result.spz",
      mimetype: "application/octet-stream"
    };

    const updated = await service.attachReconstructedFile("asset-1", file);

    assert.equal(updated.listingId, "listing-1");
    assert.equal(updateData?.fileUrl, "/api/files/reconstructed.spz");
    assert.equal(updateData?.fileKind, "spz");
    assert.equal(updateData?.sizeBytes, file.buffer.length);
    assert.equal(updateData?.status, "UPLOADED");
    assert.equal(updateData?.jobState, "DONE");
    assert.equal(updateData?.jobError, null);
    assert.equal(updateData?.transform, Prisma.DbNull);
    assert.equal(updateData?.registrationPairs, Prisma.DbNull);
  });

  it("marks reconstruction failure and truncates the persisted error", async () => {
    const asset = { id: "asset-1", listingId: "listing-1", status: "PROCESSING" };
    let updateData: Record<string, unknown> | undefined;
    const service = serviceWithFakes(
      {
        splatAsset: {
          findUnique: async () => asset,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updateData = data;
            return { ...asset, ...data };
          }
        }
      },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );

    const updated = await service.markReconstructionFailed("asset-1", "x".repeat(3000));

    assert.equal(updated.listingId, "listing-1");
    assert.equal(updateData?.status, "FAILED");
    assert.equal(updateData?.jobState, "FAILED");
    assert.equal((updateData?.jobError as string).length, 2048);
  });

  it("projects floor-plan furniture and 3D walls with narrow public selects", async () => {
    const asset = { id: "asset-1", floorPlanId: "fp-1", listingId: "listing-must-not-win" };
    const wall = viewerWall("wall-1");
    const floorPlanQueries: Record<string, unknown>[] = [];
    const service = serviceWithFakes(
      {
        splatAsset: { findUnique: async () => asset },
        floorPlan: {
          findUnique: async (args: Record<string, unknown>) => {
            floorPlanQueries.push(args);
            const select = args.select as Record<string, unknown>;
            return select.furnitures
              ? { furnitures: [{ id: "sofa" }, { id: "bed" }] }
              : { room3d: { walls: [wall] } };
          }
        },
        tradeListing: {
          findUnique: async () => {
            throw new Error("유효한 연결 도면보다 매물 스냅샷을 먼저 조회하면 안 됩니다.");
          }
        }
      },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );

    const result = await service.getForViewer("asset-1");

    assert.deepEqual(floorPlanQueries.map((query) => query.select), [
      { furnitures: true },
      { room3d: true }
    ]);
    // 소유자·주소·도면 전체를 고르지 않고 공개 뷰어에 필요한 두 컬럼만 각각 조회한다.
    for (const query of floorPlanQueries) {
      const select = query.select as Record<string, unknown>;
      assert.equal("ownerId" in select, false);
      assert.equal("owner" in select, false);
      assert.equal("address" in select, false);
      assert.equal("sourceImageUrl" in select, false);
    }
    assert.deepEqual(result.furnitures, [{ id: "sofa" }, { id: "bed" }]);
    assert.deepEqual(result.walls, [wall]);
  });

  it("falls back to the listing snapshot furniture and walls when the asset has no floorPlanId", async () => {
    const asset = { id: "asset-1", floorPlanId: null, listingId: "listing-9" };
    const wall = viewerWall("listing-wall");
    const service = serviceWithFakes(
      {
        splatAsset: { findUnique: async () => asset },
        tradeListing: {
          findUnique: async () => ({ floorPlan: { walls3D: [wall], furnitures: [{ id: "desk" }] } })
        }
      },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );

    const result = await service.getForViewer("asset-1");

    assert.deepEqual(result.furnitures, [{ id: "desk" }]);
    assert.deepEqual(result.walls, [wall]);
  });

  it("returns null furniture and walls when neither floor plan nor listing snapshot yields any", async () => {
    const asset = { id: "asset-1", floorPlanId: null, listingId: null };
    const service = serviceWithFakes(
      { splatAsset: { findUnique: async () => asset } },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );

    const result = await service.getForViewer("asset-1");

    assert.equal(result.furnitures, null);
    assert.equal(result.walls, null);
  });

  it("filters malformed walls and falls back from the linked plan to the listing snapshot", async () => {
    const asset = { id: "asset-1", floorPlanId: "fp-broken", listingId: "listing-9" };
    const wall = { ...viewerWall("listing-valid"), material: "wall", privateNote: "do-not-project" };
    let listingWallQuery: Record<string, unknown> | undefined;
    const service = serviceWithFakes(
      {
        splatAsset: { findUnique: async () => asset },
        floorPlan: {
          findUnique: async ({ select }: { select: Record<string, unknown> }) =>
            select.furnitures
              ? { furnitures: [{ id: "sofa" }] }
              : { room3d: { walls: [{ id: "broken", dimensions: { width: 2 } }] } }
        },
        tradeListing: {
          findUnique: async (args: Record<string, unknown>) => {
            listingWallQuery = args;
            return {
              floorPlan: {
                walls3D: [wall, { ...viewerWall("nan-wall"), position: [Number.NaN, 0, 0] }]
              }
            };
          }
        }
      },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );

    const result = await service.getForViewer("asset-1");

    assert.deepEqual(result.walls, [{
      id: "listing-valid",
      wall_id: "listing-valid",
      dimensions: wall.dimensions,
      position: wall.position,
      rotation: wall.rotation,
      material: "wall"
    }]);
    assert.deepEqual(listingWallQuery?.select, { floorPlan: true });
  });

  it("assigns deterministic public ids to valid legacy walls without identifiers", async () => {
    const asset = { id: "asset-legacy", floorPlanId: "fp-legacy", listingId: null };
    const legacyWall = {
      dimensions: { width: 2.5, height: 2.3, depth: 0.1 },
      position: [0, 1.15, 0],
      rotation: [0, 0, 0]
    };
    const service = serviceWithFakes(
      {
        splatAsset: { findUnique: async () => asset },
        floorPlan: {
          findUnique: async ({ select }: { select: Record<string, unknown> }) =>
            select.furnitures ? { furnitures: [] } : { room3d: { walls: [legacyWall] } }
        }
      },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );

    const result = await service.getForViewer("asset-legacy");

    assert.deepEqual(result.walls, [{ ...legacyWall, id: "wall-1", wall_id: "wall-1" }]);
  });

  it("links a registration to an existing floor plan and promotes to REGISTERED", async () => {
    const asset = { id: "asset-1", status: "UPLOADED" };
    let updateData: Record<string, unknown> | undefined;
    const service = serviceWithFakes(
      {
        splatAsset: {
          findUnique: async () => asset,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updateData = data;
            return { ...asset, ...data };
          }
        },
        floorPlan: { findUnique: async () => ({ id: "fp-1" }) }
      },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );

    await service.register("asset-1", {
      transform: {
        rotationXDegrees: 0,
        rotationYDegrees: 0,
        scaleMultiplier: 1,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0
      },
      floorPlanId: "fp-1"
    });

    assert.equal(updateData?.status, "REGISTERED");
    assert.equal(updateData?.floorPlanId, "fp-1");
  });

  it("excludes visibleToTenant:false furniture from the public projection", async () => {
    const asset = { id: "asset-1", floorPlanId: "fp-1", listingId: null };
    const service = serviceWithFakes(
      {
        splatAsset: { findUnique: async () => asset },
        floorPlan: {
          findUnique: async () => ({
            furnitures: [
              { id: "shown" },
              { id: "hidden", visibleToTenant: false },
              { id: "explicit-visible", visibleToTenant: true }
            ]
          })
        }
      },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );

    const result = await service.getForViewer("asset-1");

    assert.deepEqual((result.furnitures as Array<{ id: string }>).map((item) => item.id), [
      "shown",
      "explicit-visible"
    ]);
  });

  it("enforces listing ownership fail-closed and passes through assets with no listing", async () => {
    const ownerService = serviceWithFakes(
      { tradeListing: { findUnique: async () => ({ ownerId: "user-1" }) } },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );
    // 소유자 일치 → 통과(throw 없음)
    await ownerService.assertListingOwner("listing-1", "user-1");
    // listingId 없으면 소유권 개념 밖 → 통과
    await ownerService.assertListingOwner(null, "user-1");

    // 소유자 불일치 → 403
    await assert.rejects(() => ownerService.assertListingOwner("listing-1", "intruder"), ForbiddenException);

    // 매물 없음(소유자 확인 불가) → fail-closed 403
    const missingService = serviceWithFakes(
      { tradeListing: { findUnique: async () => null } },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );
    await assert.rejects(() => missingService.assertListingOwner("listing-x", "user-1"), ForbiddenException);
  });

  it("resolves the asset's listing before checking ownership", async () => {
    const service = serviceWithFakes(
      {
        splatAsset: { findUnique: async () => ({ id: "asset-1", listingId: "listing-1" }) },
        tradeListing: { findUnique: async () => ({ ownerId: "user-1" }) }
      },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );

    await service.assertAssetOwner("asset-1", "user-1");
    await assert.rejects(() => service.assertAssetOwner("asset-1", "intruder"), ForbiddenException);
  });

  it("skips the floor-plan link when the id does not exist but still registers", async () => {
    const asset = { id: "asset-1", status: "UPLOADED" };
    let updateData: Record<string, unknown> | undefined;
    const service = serviceWithFakes(
      {
        splatAsset: {
          findUnique: async () => asset,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updateData = data;
            return { ...asset, ...data };
          }
        },
        floorPlan: { findUnique: async () => null }
      },
      { save: async () => ({ fileName: "unused", fileUrl: "/unused" }) }
    );

    await service.register("asset-1", {
      transform: {
        rotationXDegrees: 0,
        rotationYDegrees: 0,
        scaleMultiplier: 1,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0
      },
      floorPlanId: "fp-missing"
    });

    assert.equal(updateData?.status, "REGISTERED");
    assert.equal("floorPlanId" in (updateData ?? {}), false);
  });
});
