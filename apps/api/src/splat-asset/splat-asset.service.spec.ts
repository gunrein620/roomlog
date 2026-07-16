import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { SplatAssetService, type UploadedSplatAssetFile } from "./splat-asset.service";

function serviceWithFakes(prisma: unknown, storageAdapter: unknown): SplatAssetService {
  const service = new SplatAssetService(undefined);
  (service as any).prisma = prisma;
  (service as any).storageAdapter = storageAdapter;
  return service;
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
});
