import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
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

function serviceWithFakes(prisma: unknown, storageAdapter: unknown): TenantFurnitureService {
  const service = serviceWithPrisma(prisma);
  (service as any).storageAdapter = storageAdapter;
  return service;
}

/** presignUpload를 갖춘 최소 스토리지 페이크 — GLB 업로드 대상 발급까지 필요한 테스트가 재사용한다. */
function fakeStorageAdapterWithPresign(overrides: Record<string, unknown> = {}) {
  return {
    headObject: async () => ({ sizeBytes: 4096, mimeType: "model/vnd.usdz+zip" }),
    publicUrl: (key: string) => `https://cdn.example/${key}`,
    presignUpload: async (input: { key: string; mimeType: string }) => ({
      uploadUrl: `https://s3.example/put/${input.key}`,
      key: input.key,
      headers: { "Content-Type": input.mimeType },
      expiresAt: new Date("2026-07-19T01:00:00.000Z"),
      publicUrl: `https://cdn.example/${input.key}`
    }),
    ...overrides
  };
}

/** dispatch()가 즉시 성공하는 페이크 디스패처를 서비스에 심는다. */
function withNoOpDispatcher(service: TenantFurnitureService): TenantFurnitureService {
  (service as any).meshConversionDispatcher = { dispatch: async () => {} };
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

describe("TenantFurnitureService object-capture presign", () => {
  it("rejects a non-.usdz file name before touching storage", async () => {
    const service = serviceWithFakes(
      {},
      { presignUpload: async () => assert.fail("거부할 파일에 presign을 발급하면 안 됩니다.") }
    );

    await assert.rejects(
      () =>
        service.presignObjectCapture("tenant-1", {
          fileName: "scan.zip",
          sizeBytes: 1024
        }),
      BadRequestException
    );
  });

  it("rejects an oversized upload", async () => {
    const service = serviceWithFakes(
      {},
      { presignUpload: async () => assert.fail("거부할 파일에 presign을 발급하면 안 됩니다.") }
    );

    await assert.rejects(
      () =>
        service.presignObjectCapture("tenant-1", {
          fileName: "scan.usdz",
          sizeBytes: 301 * 1024 * 1024
        }),
      BadRequestException
    );
  });

  it("rejects presigning an upgrade for furniture owned by someone else", async () => {
    const prisma = {
      tenantFurniture: {
        findUnique: async () => ({
          id: "tf-1",
          ownerTenantId: "tenant-owner",
          category: "chair",
          label: null,
          widthMm: 500,
          depthMm: 500,
          heightMm: 500,
          source: "manual",
          meshUrl: null,
          usdzUrl: null,
          meshJobState: null,
          createdAt: new Date("2026-07-19T00:00:00.000Z")
        })
      }
    };
    const service = serviceWithFakes(prisma, {
      presignUpload: async () => assert.fail("소유자가 아니면 presign을 발급하면 안 됩니다.")
    });

    await assert.rejects(
      () =>
        service.presignObjectCapture("tenant-other", {
          furnitureId: "tf-1",
          fileName: "scan.usdz",
          sizeBytes: 1024
        }),
      ForbiddenException
    );
  });

  it("returns a multipart signal when the storage adapter has no presignUpload (local dev)", async () => {
    const service = serviceWithFakes({}, {});

    const result = await service.presignObjectCapture("tenant-1", {
      fileName: "scan.usdz",
      sizeBytes: 1024
    });

    assert.deepEqual(result, { mode: "multipart" });
  });

  it("scopes the presigned key under the tenant and returns the direct-upload shape", async () => {
    let requestedKey = "";
    const service = serviceWithFakes({}, {
      presignUpload: async (input: { key: string; mimeType: string }) => {
        requestedKey = input.key;
        return {
          uploadUrl: "https://s3.example/put",
          key: input.key,
          headers: { "Content-Type": input.mimeType },
          expiresAt: new Date("2026-07-19T01:00:00.000Z"),
          publicUrl: `https://cdn.example/${input.key}`
        };
      }
    });

    const result = await service.presignObjectCapture("tenant-1", {
      fileName: "living-room-chair.usdz",
      sizeBytes: 1024,
      mimeType: "model/vnd.usdz+zip"
    });

    assert.match(requestedKey, /^object-capture\/tenant-1\//);
    assert.deepEqual(result, {
      mode: "direct",
      uploadUrl: "https://s3.example/put",
      key: requestedKey,
      headers: { "Content-Type": "model/vnd.usdz+zip" },
      expiresAt: "2026-07-19T01:00:00.000Z"
    });
  });
});

describe("TenantFurnitureService object-capture complete", () => {
  it("rejects a key that was not issued to this tenant", async () => {
    const service = serviceWithFakes({}, {});

    await assert.rejects(
      () =>
        service.completeObjectCapture("tenant-1", {
          key: "object-capture/tenant-other/whatever.usdz"
        }),
      ForbiddenException
    );
  });

  it("rejects when the S3 object is not there yet (HEAD miss)", async () => {
    const service = serviceWithFakes({}, { headObject: async () => null });

    await assert.rejects(
      () =>
        service.completeObjectCapture("tenant-1", {
          key: "object-capture/tenant-1/scan.usdz"
        }),
      BadRequestException
    );
  });

  it("creates a new furniture row with placeholder sizeMm and queues conversion when no furnitureId is given", async () => {
    const created: Array<Record<string, unknown>> = [];
    const updated: Array<Record<string, unknown>> = [];
    const prisma = {
      tenantFurniture: {
        create: ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve({ ...data, createdAt: new Date("2026-07-19T00:00:00.000Z") });
        },
        update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updated.push({ id: where.id, ...data });
          const base = created.find((row) => row.id === where.id) ?? {};
          return Promise.resolve({
            ...base,
            ...data,
            id: where.id,
            createdAt: new Date("2026-07-19T00:00:00.000Z")
          });
        }
      }
    };
    const service = withNoOpDispatcher(serviceWithFakes(prisma, fakeStorageAdapterWithPresign()));

    const result = await service.completeObjectCapture("tenant-1", {
      key: "object-capture/tenant-1/scan.usdz",
      category: "chair",
      label: "내 의자"
    });

    assert.equal(created.length, 1);
    assert.deepEqual(
      {
        ownerTenantId: created[0].ownerTenantId,
        category: created[0].category,
        label: created[0].label,
        widthMm: created[0].widthMm,
        depthMm: created[0].depthMm,
        heightMm: created[0].heightMm,
        source: created[0].source,
        usdzUrl: created[0].usdzUrl
      },
      {
        ownerTenantId: "tenant-1",
        category: "chair",
        label: "내 의자",
        widthMm: 500,
        depthMm: 500,
        heightMm: 500,
        source: "object-capture",
        usdzUrl: "https://cdn.example/object-capture/tenant-1/scan.usdz"
      }
    );
    // queueMeshConversion이 뒤이어 호출되어 CONVERTING으로 올라간다.
    assert.equal(updated.length, 1);
    assert.equal(updated[0].meshJobState, "CONVERTING");
    assert.equal(result.meshJobState, "CONVERTING");
    assert.equal(result.usdzUrl, "https://cdn.example/object-capture/tenant-1/scan.usdz");
  });

  it("upgrades an existing furniture's usdzUrl but only the worker callback flips source/meshUrl", async () => {
    const existing = {
      id: "tf-1",
      ownerTenantId: "tenant-1",
      category: "chair",
      label: "내 의자",
      widthMm: 600,
      depthMm: 600,
      heightMm: 900,
      source: "manual",
      meshUrl: null,
      usdzUrl: null,
      meshJobState: null,
      createdAt: new Date("2026-07-19T00:00:00.000Z")
    };
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      tenantFurniture: {
        findUnique: async () => existing,
        update: ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          Object.assign(existing, data);
          return Promise.resolve({ ...existing });
        }
      }
    };
    const service = withNoOpDispatcher(serviceWithFakes(prisma, fakeStorageAdapterWithPresign()));

    const result = await service.completeObjectCapture("tenant-1", {
      furnitureId: "tf-1",
      key: "object-capture/tenant-1/scan.usdz"
    });

    // usdzUrl은 붙었지만, source는 아직 manual(워커 콜백 전까지 기존 박스를 그대로 렌더).
    assert.equal(result.source, "manual");
    assert.equal(result.usdzUrl, "https://cdn.example/object-capture/tenant-1/scan.usdz");
    assert.equal(result.meshJobState, "CONVERTING");
    assert.deepEqual(updates.map((d) => Object.keys(d).sort()), [["usdzUrl"], ["meshJobState"]]);
  });

  it("rejects upgrading furniture owned by someone else", async () => {
    const prisma = {
      tenantFurniture: {
        findUnique: async () => ({
          id: "tf-1",
          ownerTenantId: "tenant-owner",
          category: "chair",
          label: null,
          widthMm: 500,
          depthMm: 500,
          heightMm: 500,
          source: "manual",
          meshUrl: null,
          usdzUrl: null,
          meshJobState: null,
          createdAt: new Date("2026-07-19T00:00:00.000Z")
        })
      }
    };
    const service = serviceWithFakes(prisma, {
      headObject: async () => ({ sizeBytes: 4096, mimeType: "model/vnd.usdz+zip" })
    });

    await assert.rejects(
      () =>
        service.completeObjectCapture("tenant-other", {
          furnitureId: "tf-1",
          key: "object-capture/tenant-other/scan.usdz"
        }),
      ForbiddenException
    );
  });
});

describe("TenantFurnitureService.queueMeshConversion dispatch", () => {
  function rowFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: "tf-1",
      ownerTenantId: "tenant-1",
      category: "chair",
      label: null,
      widthMm: 500,
      depthMm: 500,
      heightMm: 500,
      source: "object-capture",
      meshUrl: null,
      usdzUrl: "https://cdn.example/object-capture/tenant-1/scan.usdz",
      meshJobState: "CONVERTING",
      createdAt: new Date("2026-07-19T00:00:00.000Z"),
      ...overrides
    };
  }

  it("dispatches through the injected dispatcher and stays CONVERTING on success", async () => {
    const row = rowFixture();
    const updates: Array<Record<string, unknown>> = [];
    const dispatchedJobs: Array<Record<string, unknown>> = [];
    const service = serviceWithFakes(
      {
        tenantFurniture: {
          update: ({ data }: { data: Record<string, unknown> }) => {
            updates.push(data);
            Object.assign(row, data);
            return Promise.resolve({ ...row });
          }
        }
      },
      fakeStorageAdapterWithPresign()
    );
    (service as any).meshConversionDispatcher = {
      dispatch: async (job: Record<string, unknown>) => {
        dispatchedJobs.push(job);
      }
    };

    const result = await service.queueMeshConversion(row as any);

    assert.equal(result.meshJobState, "CONVERTING");
    // 성공 경로는 CONVERTING 1회만 쓴다 — 실패 시의 추가 FAILED 갱신이 없어야 한다.
    assert.equal(updates.length, 1);
    assert.equal(dispatchedJobs.length, 1);
    assert.equal(dispatchedJobs[0].furnitureId, "tf-1");
    assert.equal(dispatchedJobs[0].usdzUrl, row.usdzUrl);
    assert.match(String(dispatchedJobs[0].glbUploadUrl), /^https:\/\/s3\.example\/put\/object-capture-glb\/tenant-1\//);
    assert.match(String(dispatchedJobs[0].glbPublicUrl), /^https:\/\/cdn\.example\/object-capture-glb\/tenant-1\//);
  });

  it("falls back to FAILED when the dispatcher throws, without touching an existing meshUrl", async () => {
    const row = rowFixture({ meshUrl: "https://cdn.example/glb/old.glb" });
    const service = serviceWithFakes(
      {
        tenantFurniture: {
          update: ({ data }: { data: Record<string, unknown> }) => {
            Object.assign(row, data);
            return Promise.resolve({ ...row });
          }
        }
      },
      fakeStorageAdapterWithPresign()
    );
    (service as any).meshConversionDispatcher = {
      dispatch: async () => {
        throw new Error("mesh-worker 연결 실패");
      }
    };

    const result = await service.queueMeshConversion(row as any);

    assert.equal(result.meshJobState, "FAILED");
    assert.equal(result.meshUrl, "https://cdn.example/glb/old.glb");
  });

  it("falls back to FAILED when the storage adapter cannot presign an upload target (local dev, S3 off)", async () => {
    const row = rowFixture();
    const service = serviceWithFakes(
      {
        tenantFurniture: {
          update: ({ data }: { data: Record<string, unknown> }) => {
            Object.assign(row, data);
            return Promise.resolve({ ...row });
          }
        }
      },
      { headObject: async () => ({ sizeBytes: 4096, mimeType: "model/vnd.usdz+zip" }) } // presignUpload 없음
    );
    (service as any).meshConversionDispatcher = {
      dispatch: async () => assert.fail("presign 없이는 워커를 호출하면 안 됩니다.")
    };

    const result = await service.queueMeshConversion(row as any);

    assert.equal(result.meshJobState, "FAILED");
  });

  it("falls back to FAILED when usdzUrl is missing", async () => {
    const row = rowFixture({ usdzUrl: null });
    const service = serviceWithFakes(
      {
        tenantFurniture: {
          update: ({ data }: { data: Record<string, unknown> }) => {
            Object.assign(row, data);
            return Promise.resolve({ ...row });
          }
        }
      },
      fakeStorageAdapterWithPresign()
    );
    (service as any).meshConversionDispatcher = {
      dispatch: async () => assert.fail("usdzUrl 없이는 워커를 호출하면 안 됩니다.")
    };

    const result = await service.queueMeshConversion(row as any);

    assert.equal(result.meshJobState, "FAILED");
  });
});

describe("TenantFurnitureService mesh conversion callbacks", () => {
  it("completeMeshConversion sets meshUrl, flips source to object-capture, and marks DONE", async () => {
    const row = {
      id: "tf-1",
      ownerTenantId: "tenant-1",
      category: "chair",
      label: null,
      widthMm: 600,
      depthMm: 600,
      heightMm: 900,
      source: "manual",
      meshUrl: null,
      usdzUrl: "https://cdn.example/object-capture/tenant-1/scan.usdz",
      meshJobState: "CONVERTING",
      createdAt: new Date("2026-07-19T00:00:00.000Z")
    };
    const service = serviceWithPrisma({
      tenantFurniture: {
        findUnique: async () => row,
        update: async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })
      }
    });

    const result = await service.completeMeshConversion("tf-1", "https://cdn.example/glb/tf-1.glb");

    assert.equal(result.meshUrl, "https://cdn.example/glb/tf-1.glb");
    assert.equal(result.source, "object-capture");
    assert.equal(result.meshJobState, "DONE");
  });

  it("completeMeshConversion 404s for an unknown furniture id", async () => {
    const service = serviceWithPrisma({
      tenantFurniture: { findUnique: async () => null }
    });

    await assert.rejects(
      () => service.completeMeshConversion("missing", "https://cdn.example/glb/x.glb"),
      (error: unknown) => error instanceof Error && "getStatus" in error && (error as any).getStatus() === 404
    );
  });

  it("markMeshConversionFailed sets FAILED without touching an existing meshUrl", async () => {
    const row = {
      id: "tf-1",
      ownerTenantId: "tenant-1",
      category: "chair",
      label: null,
      widthMm: 600,
      depthMm: 600,
      heightMm: 900,
      source: "object-capture",
      meshUrl: "https://cdn.example/glb/tf-1.glb",
      usdzUrl: "https://cdn.example/object-capture/tenant-1/scan.usdz",
      meshJobState: "CONVERTING",
      createdAt: new Date("2026-07-19T00:00:00.000Z")
    };
    const service = serviceWithPrisma({
      tenantFurniture: {
        findUnique: async () => row,
        update: async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })
      }
    });

    const result = await service.markMeshConversionFailed("tf-1", "usdz parse error");

    assert.equal(result.meshJobState, "FAILED");
    assert.equal(result.meshUrl, "https://cdn.example/glb/tf-1.glb");
  });
});

describe("TenantFurnitureController mesh-conversion worker authentication", () => {
  const originalWorkerSecret = process.env.GPU_WORKER_SECRET;

  afterEach(() => {
    if (originalWorkerSecret === undefined) delete process.env.GPU_WORKER_SECRET;
    else process.env.GPU_WORKER_SECRET = originalWorkerSecret;
  });

  function controllerWithFakeService() {
    const calls: unknown[][] = [];
    const service = {
      completeMeshConversion: async (...args: unknown[]) => {
        calls.push(["complete", ...args]);
        return { id: args[0], meshJobState: "DONE" };
      },
      markMeshConversionFailed: async (...args: unknown[]) => {
        calls.push(["failure", ...args]);
        return { id: args[0], meshJobState: "FAILED" };
      }
    };
    return { controller: new TenantFurnitureController(service as any, {} as any), calls };
  }

  it("fails closed with 503 when GPU_WORKER_SECRET is not configured", async () => {
    delete process.env.GPU_WORKER_SECRET;
    const { controller } = controllerWithFakeService();

    await assert.rejects(
      () => controller.completeMeshConversion(undefined, "tf-1", { glbUrl: "https://cdn.example/x.glb" }),
      ServiceUnavailableException
    );
  });

  it("rejects a mismatched worker secret with 403", async () => {
    process.env.GPU_WORKER_SECRET = "worker-secret";
    const { controller } = controllerWithFakeService();

    await assert.rejects(
      () => controller.completeMeshConversion("wrong", "tf-1", { glbUrl: "https://cdn.example/x.glb" }),
      ForbiddenException
    );
  });

  it("rejects a missing glbUrl once authenticated", async () => {
    process.env.GPU_WORKER_SECRET = "worker-secret";
    const { controller } = controllerWithFakeService();

    await assert.rejects(
      () => controller.completeMeshConversion("worker-secret", "tf-1", {}),
      BadRequestException
    );
  });

  it("accepts a matching secret and forwards to the service", async () => {
    process.env.GPU_WORKER_SECRET = "worker-secret";
    const { controller, calls } = controllerWithFakeService();

    const result = await controller.completeMeshConversion("worker-secret", "tf-1", {
      glbUrl: "https://cdn.example/x.glb"
    });

    assert.equal((result as any).meshJobState, "DONE");
    assert.deepEqual(calls, [["complete", "tf-1", "https://cdn.example/x.glb"]]);
  });

  it("routes failure callbacks to markMeshConversionFailed", async () => {
    process.env.GPU_WORKER_SECRET = "worker-secret";
    const { controller, calls } = controllerWithFakeService();

    const result = await controller.failMeshConversion("worker-secret", "tf-1", { error: "usdz parse error" });

    assert.equal((result as any).meshJobState, "FAILED");
    assert.deepEqual(calls, [["failure", "tf-1", "usdz parse error"]]);
  });
});
