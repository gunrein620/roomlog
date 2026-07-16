import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { SplatAssetService, type UploadedSplatAssetFile } from "./splat-asset.service";

function serviceWithFakes(prisma: unknown, storageAdapter: unknown): SplatAssetService {
  const service = new SplatAssetService(undefined);
  (service as any).prisma = prisma;
  (service as any).storageAdapter = storageAdapter;
  return service;
}

describe("SplatAssetService requeueReconstruction", () => {
  it("requeues a FAILED asset with its existing source", async () => {
    const asset = {
      id: "asset-1",
      status: "FAILED",
      jobState: "FAILED",
      jobError: "GPU out of memory",
      jobAttempts: 3,
      jobCommandId: "command-1",
      jobStartedAt: new Date("2026-07-16T00:00:00.000Z"),
      videoUrl: "/api/files/original.mp4",
      fileKind: "video"
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
      { save: async () => assert.fail("기존 소스 재시도에서는 파일을 저장하면 안 됩니다.") }
    );

    const updated = await service.requeueReconstruction("asset-1");

    assert.equal(updated.videoUrl, "/api/files/original.mp4");
    assert.equal(updateData?.status, "PROCESSING");
    assert.equal(updateData?.jobState, "QUEUED");
    assert.equal(updateData?.jobError, null);
    assert.equal(updateData?.jobAttempts, 0);
    assert.equal(updateData?.jobCommandId, null);
    assert.equal(updateData?.jobStartedAt, null);
    assert.equal("videoUrl" in (updateData ?? {}), false);
  });

  it("replaces the source with a new Record3D zip and requeues the FAILED asset", async () => {
    const asset = {
      id: "asset-1",
      status: "FAILED",
      jobState: "FAILED",
      videoUrl: "/api/files/old.mp4",
      fileKind: "video"
    };
    let updateData: Record<string, unknown> | undefined;
    let savedFileName = "";
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
        save: async ({ fileName }: { fileName: string }) => {
          savedFileName = fileName;
          return { fileName, fileUrl: "/api/files/new-capture.zip" };
        }
      }
    );
    const file: UploadedSplatAssetFile = {
      buffer: Buffer.from("new-record3d-capture"),
      originalname: "replacement.ZIP",
      mimetype: "application/zip"
    };

    const updated = await service.requeueReconstruction("asset-1", file);

    assert.match(savedFileName, /^splat-capture-.+\.zip$/);
    assert.equal(updated.videoUrl, "/api/files/new-capture.zip");
    assert.equal(updateData?.videoUrl, "/api/files/new-capture.zip");
    assert.equal(updateData?.fileKind, "record3d-zip");
    assert.equal(updateData?.sizeBytes, file.buffer.length);
    assert.equal(updateData?.status, "PROCESSING");
    assert.equal(updateData?.jobState, "QUEUED");
    assert.equal(updateData?.jobError, null);
    assert.equal(updateData?.jobAttempts, 0);
  });

  it("rejects requeue when the asset is not FAILED", async () => {
    let updateCalled = false;
    const service = serviceWithFakes(
      {
        splatAsset: {
          findUnique: async () => ({ id: "asset-1", status: "PROCESSING" }),
          update: async () => {
            updateCalled = true;
          }
        }
      },
      { save: async () => assert.fail("처리 중 자산의 파일을 저장하면 안 됩니다.") }
    );

    await assert.rejects(
      () => service.requeueReconstruction("asset-1"),
      (error: unknown) => error instanceof ConflictException && error.getStatus() === 409
    );
    assert.equal(updateCalled, false);
  });

  it("rejects a replacement .spz file", async () => {
    let updateCalled = false;
    const service = serviceWithFakes(
      {
        splatAsset: {
          findUnique: async () => ({ id: "asset-1", status: "FAILED" }),
          update: async () => {
            updateCalled = true;
          }
        }
      },
      { save: async () => assert.fail("거부할 .spz 파일을 저장하면 안 됩니다.") }
    );
    const file: UploadedSplatAssetFile = {
      buffer: Buffer.from("spz"),
      originalname: "already-reconstructed.spz",
      mimetype: "application/octet-stream"
    };

    await assert.rejects(
      () => service.requeueReconstruction("asset-1", file),
      (error: unknown) => error instanceof BadRequestException && error.getStatus() === 400
    );
    assert.equal(updateCalled, false);
  });
});
