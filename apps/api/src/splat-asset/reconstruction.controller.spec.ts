import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ReconstructionController } from "../reconstruction/reconstruction.controller";

const originalWorkerSecret = process.env.GPU_WORKER_SECRET;

afterEach(() => {
  if (originalWorkerSecret === undefined) delete process.env.GPU_WORKER_SECRET;
  else process.env.GPU_WORKER_SECRET = originalWorkerSecret;
});

function createController() {
  const notifications: unknown[][] = [];
  const service = {
    attachReconstructedFile: async (id: string) => ({ id, listingId: "listing-1", status: "UPLOADED" }),
    findListingOwnerId: async () => "owner-1",
    markReconstructionFailed: async (id: string, error: string) => ({
      id,
      error,
      listingId: "listing-1",
      status: "FAILED"
    })
  };
  const realtime = {
    notifyUsers: (...args: unknown[]) => notifications.push(args)
  };
  return {
    controller: new ReconstructionController(service as any, realtime as any),
    notifications
  };
}

describe("ReconstructionController worker authentication", () => {
  it("fails closed with 503 when GPU_WORKER_SECRET is not configured", async () => {
    delete process.env.GPU_WORKER_SECRET;
    const { controller } = createController();

    await assert.rejects(
      () => controller.failure("anything", "asset-1", { error: "failed" }),
      (error: unknown) => error instanceof ServiceUnavailableException && error.getStatus() === 503
    );
  });

  it("rejects a missing worker secret with 401", async () => {
    process.env.GPU_WORKER_SECRET = "worker-secret";
    const { controller } = createController();

    await assert.rejects(
      () => controller.failure(undefined, "asset-1", { error: "failed" }),
      (error: unknown) => error instanceof UnauthorizedException && error.getStatus() === 401
    );
  });

  it("rejects a mismatched worker secret with 403, including different lengths", async () => {
    process.env.GPU_WORKER_SECRET = "worker-secret";
    const { controller } = createController();

    await assert.rejects(
      () => controller.failure("x", "asset-1", { error: "failed" }),
      (error: unknown) => error instanceof ForbiddenException && error.getStatus() === 403
    );
  });

  it("accepts a matching secret and notifies the listing owner", async () => {
    process.env.GPU_WORKER_SECRET = "worker-secret";
    const { controller, notifications } = createController();

    const result = await controller.failure("worker-secret", "asset-1", { error: "gpu failed" });

    assert.equal(result.status, "FAILED");
    assert.deepEqual(notifications, [
      [
        ["owner-1"],
        "splat:asset-updated",
        { assetId: "asset-1", listingId: "listing-1", status: "FAILED" }
      ]
    ]);
  });
});
