import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { SplatAssetController } from "./splat-asset.controller";
import { SplatAssetService } from "./splat-asset.service";

const MAX_UPLOAD_BYTES = 800 * 1024 * 1024;
const MAX_DIRECT_UPLOAD_BYTES = 2000 * 1024 * 1024;

function serviceWithFakes(prisma: unknown, storageAdapter: unknown): SplatAssetService {
  const service = new SplatAssetService(undefined);
  (service as any).prisma = prisma;
  (service as any).storageAdapter = storageAdapter;
  return service;
}

function hasStatus(error: unknown, status: number): boolean {
  return error instanceof Error && "getStatus" in error && (error as { getStatus(): number }).getStatus() === status;
}

describe("Splat direct upload presign", () => {
  it("declares HTTP 200 instead of Nest's default POST 201", () => {
    assert.equal(
      Reflect.getMetadata(HTTP_CODE_METADATA, SplatAssetController.prototype.presignIntake),
      200
    );
  });

  it("rejects a landlord who does not own the listing before issuing a presign", async () => {
    const calls: string[] = [];
    const service = {
      assertListingOwner: async () => {
        calls.push("assertListingOwner");
        throw new ForbiddenException("본인 매물의 3D 자산만 다룰 수 있습니다.");
      },
      presignIntake: async () => {
        calls.push("presignIntake");
        return { mode: "multipart" };
      }
    };
    const roomlog = {
      getUserFromToken: (authorization?: string) => {
        if (!authorization) throw new UnauthorizedException("인증 토큰이 필요합니다.");
        return { id: "landlord-2", role: "LANDLORD" };
      },
      rolesForUser: () => ["LANDLORD"]
    };
    const controller = new SplatAssetController(service as any, roomlog as any);

    await assert.rejects(
      () =>
        controller.presignIntake("Bearer landlord-2", {
          listingId: "listing-1",
          fileName: "tour.mp4",
          sizeBytes: 1024,
          mimeType: "video/mp4"
        }),
      (error: unknown) => hasStatus(error, 403)
    );
    assert.deepEqual(calls, ["assertListingOwner"]);
  });

  it("rejects an unsupported extension", async () => {
    const service = serviceWithFakes({}, {
      presignUpload: async () => assert.fail("거부할 파일에 presign을 발급하면 안 됩니다.")
    });

    await assert.rejects(
      () =>
        service.presignIntake({
          listingId: "listing-1",
          fileName: "payload.exe",
          sizeBytes: 1024,
          mimeType: "application/octet-stream"
        }),
      (error: unknown) => error instanceof BadRequestException && hasStatus(error, 400)
    );
  });

  it("rejects a direct upload larger than 2GB", async () => {
    const service = serviceWithFakes({}, {
      presignUpload: async () => assert.fail("상한 초과 파일에 presign을 발급하면 안 됩니다.")
    });

    await assert.rejects(
      () =>
        service.presignIntake({
          listingId: "listing-1",
          fileName: "tour.mp4",
          sizeBytes: MAX_DIRECT_UPLOAD_BYTES + 1,
          mimeType: "video/mp4"
        }),
      (error: unknown) => error instanceof BadRequestException && hasStatus(error, 400)
    );
  });

  it("allows a direct upload between 800MB and 2GB", async () => {
    // 직접 업로드 한도(2GB)는 멀티파트 한도(800MB)보다 넓다 — 고해상도 영상 실험 경로.
    const service = serviceWithFakes({}, {
      presignUpload: async (input: { key: string; mimeType: string; expiresInSeconds: number }) => ({
        uploadUrl: "https://bucket.example/presigned",
        key: input.key,
        headers: { "Content-Type": input.mimeType },
        expiresAt: new Date("2026-07-17T01:00:00.000Z"),
        publicUrl: `https://cdn.example/${input.key}`
      })
    });

    const result = await service.presignIntake({
      listingId: "listing-1",
      fileName: "tour.mp4",
      sizeBytes: MAX_UPLOAD_BYTES + 1,
      mimeType: "video/mp4"
    });

    assert.equal(result.mode, "direct");
  });

  it("rejects a file over the multipart limit up front when falling back to multipart mode", async () => {
    // S3 비활성 환경에서 800MB 초과 파일에 multipart 모드를 돌려주면, 클라이언트가
    // 어차피 거부될 대용량 멀티파트 업로드를 시작하게 된다 — presign 단계에서 차단.
    const service = serviceWithFakes({}, {
      save: async () => ({ fileName: "unused", fileUrl: "/unused" }),
      read: async () => null
    });

    await assert.rejects(
      () =>
        service.presignIntake({
          listingId: "listing-1",
          fileName: "tour.mp4",
          sizeBytes: MAX_UPLOAD_BYTES + 1,
          mimeType: "video/mp4"
        }),
      (error: unknown) => error instanceof BadRequestException && hasStatus(error, 400)
    );
  });

  it("rejects an empty file before issuing a presign", async () => {
    const service = serviceWithFakes({}, {
      presignUpload: async () => assert.fail("빈 파일에 presign을 발급하면 안 됩니다.")
    });

    await assert.rejects(
      () =>
        service.presignIntake({
          listingId: "listing-1",
          fileName: "tour.mp4",
          sizeBytes: 0,
          mimeType: "video/mp4"
        }),
      (error: unknown) => error instanceof BadRequestException && hasStatus(error, 400)
    );
  });

  it("returns multipart mode when the storage adapter cannot presign", async () => {
    const service = serviceWithFakes({}, {
      save: async () => ({ fileName: "unused", fileUrl: "/unused" }),
      read: async () => null
    });

    const result = await service.presignIntake({
      listingId: "listing-1",
      fileName: "tour.mp4",
      sizeBytes: 1024,
      mimeType: "video/mp4"
    });

    assert.deepEqual(result, { mode: "multipart" });
  });

  it("binds a direct upload key to the listing and returns the adapter signature", async () => {
    const expiresAt = new Date("2026-07-17T01:00:00.000Z");
    let received: { key: string; mimeType: string; expiresInSeconds: number } | undefined;
    const service = serviceWithFakes({}, {
      presignUpload: async (input: { key: string; mimeType: string; expiresInSeconds: number }) => {
        received = input;
        return {
          uploadUrl: "https://bucket.example/presigned",
          key: input.key,
          headers: { "Content-Type": input.mimeType },
          expiresAt,
          publicUrl: `https://cdn.example/${input.key}`
        };
      }
    });

    const result = await service.presignIntake({
      listingId: "listing-1",
      fileName: "living room.mp4",
      sizeBytes: 1024,
      mimeType: "video/mp4"
    });

    assert.equal(result.mode, "direct");
    if (result.mode !== "direct") assert.fail("direct 응답이어야 합니다.");
    assert.match(result.key, /^splat-intake\/listing-1\/splat-video-.+\.mp4$/);
    assert.equal(result.uploadUrl, "https://bucket.example/presigned");
    assert.deepEqual(result.headers, { "Content-Type": "video/mp4" });
    assert.equal(result.expiresAt, expiresAt.toISOString());
    assert.equal(received?.key, result.key);
    assert.equal(received?.mimeType, "video/mp4");
    assert.equal(received?.expiresInSeconds, 3600);
  });
});

describe("Splat direct upload complete", () => {
  it("rejects a key issued for another listing before HEAD", async () => {
    const service = serviceWithFakes({}, {
      headObject: async () => assert.fail("listingId가 다른 key를 HEAD하면 안 됩니다.")
    });

    await assert.rejects(
      () =>
        service.completeIntake({
          listingId: "listing-1",
          key: "splat-intake/listing-2/tour.mp4"
        }),
      (error: unknown) => error instanceof ForbiddenException && hasStatus(error, 403)
    );
  });

  it("rejects completion when HEAD cannot find the uploaded object", async () => {
    const service = serviceWithFakes({}, {
      headObject: async () => null,
      publicUrl: (key: string) => `https://cdn.example/${key}`
    });

    await assert.rejects(
      () =>
        service.completeIntake({
          listingId: "listing-1",
          key: "splat-intake/listing-1/tour.mp4"
        }),
      (error: unknown) => error instanceof BadRequestException && hasStatus(error, 400)
    );
  });

  it("rejects an uploaded object larger than 2GB after HEAD", async () => {
    const service = serviceWithFakes({}, {
      headObject: async () => ({ sizeBytes: MAX_DIRECT_UPLOAD_BYTES + 1, mimeType: "video/mp4" }),
      publicUrl: (key: string) => `https://cdn.example/${key}`
    });

    await assert.rejects(
      () =>
        service.completeIntake({
          listingId: "listing-1",
          key: "splat-intake/listing-1/tour.mp4"
        }),
      (error: unknown) => error instanceof BadRequestException && hasStatus(error, 400)
    );
  });

  it("rejects an empty uploaded object after HEAD", async () => {
    const service = serviceWithFakes({}, {
      headObject: async () => ({ sizeBytes: 0, mimeType: "video/mp4" }),
      publicUrl: (key: string) => `https://cdn.example/${key}`
    });

    await assert.rejects(
      () =>
        service.completeIntake({
          listingId: "listing-1",
          key: "splat-intake/listing-1/tour.mp4"
        }),
      (error: unknown) => error instanceof BadRequestException && hasStatus(error, 400)
    );
  });

  it("creates the same queued video asset shape as multipart intake", async () => {
    let upsertArgs: Record<string, unknown> | undefined;
    let createdData: Record<string, unknown> | undefined;
    const service = serviceWithFakes(
      {
        room: {
          upsert: async (args: Record<string, unknown>) => {
            upsertArgs = args;
            return {};
          }
        },
        splatAsset: {
          findFirst: async () => null,
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdData = data;
            return data;
          }
        }
      },
      {
        headObject: async () => ({ sizeBytes: 4096, mimeType: "video/mp4" }),
        publicUrl: (key: string) => `https://cdn.example/${key}`
      }
    );
    const key = "splat-intake/listing-1/splat-video-abc123-tour.mp4";

    const result = await service.completeIntake({
      listingId: "listing-1",
      key,
      title: "거실 투어",
      address: "서울시 중구"
    });

    assert.deepEqual(upsertArgs, {
      where: { id: "trade-listing-1" },
      create: {
        id: "trade-listing-1",
        buildingName: "거실 투어",
        roomNo: "listing-1",
        address: "서울시 중구"
      },
      update: {
        buildingName: "거실 투어",
        address: "서울시 중구"
      }
    });
    assert.equal(createdData?.fileUrl, "");
    assert.equal(createdData?.videoUrl, `https://cdn.example/${key}`);
    assert.equal(createdData?.fileKind, "video");
    assert.equal(createdData?.sizeBytes, 4096);
    assert.equal(createdData?.status, "PROCESSING");
    assert.equal(createdData?.jobState, "QUEUED");
    assert.equal(result.status, "PROCESSING");
  });

  it("returns the existing asset instead of duplicating on a repeated complete call", async () => {
    const key = "splat-intake/listing-1/splat-video-abc123-tour.mp4";
    const existing = {
      id: "splat_existing",
      listingId: "listing-1",
      videoUrl: `https://cdn.example/${key}`,
      status: "PROCESSING"
    };
    let findFirstArgs: Record<string, unknown> | undefined;
    const service = serviceWithFakes(
      {
        room: {
          upsert: async () => assert.fail("멱등 반환 경로에서 room을 다시 upsert하면 안 됩니다.")
        },
        splatAsset: {
          findFirst: async (args: Record<string, unknown>) => {
            findFirstArgs = args;
            return existing;
          },
          create: async () => assert.fail("같은 key의 complete 재호출이 자산을 중복 생성하면 안 됩니다.")
        }
      },
      {
        headObject: async () => ({ sizeBytes: 4096, mimeType: "video/mp4" }),
        publicUrl: (assetKey: string) => `https://cdn.example/${assetKey}`
      }
    );

    const result = await service.completeIntake({ listingId: "listing-1", key });

    assert.equal(result, existing);
    assert.deepEqual(findFirstArgs?.where, {
      listingId: "listing-1",
      OR: [{ videoUrl: `https://cdn.example/${key}` }, { fileUrl: `https://cdn.example/${key}` }]
    });
  });
});
