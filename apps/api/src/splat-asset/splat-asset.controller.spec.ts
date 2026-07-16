import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { SplatAssetController } from "./splat-asset.controller";

const originalWorkerSecret = process.env.GPU_WORKER_SECRET;

afterEach(() => {
  if (originalWorkerSecret === undefined) delete process.env.GPU_WORKER_SECRET;
  else process.env.GPU_WORKER_SECRET = originalWorkerSecret;
});

function controllerForRoles(roles: string[]) {
  const calls: string[] = [];
  const service = {
    create: async () => ({ id: "created" }),
    listByRoom: async () => [{ id: "public" }],
    updateFile: async () => {
      calls.push("updateFile");
      return { id: "asset-1" };
    }
  };
  const roomlog = {
    getUserFromToken: (authorization?: string) => {
      if (!authorization) throw new UnauthorizedException("인증 토큰이 필요합니다.");
      return { id: "user-1", role: roles[0] ?? "TENANT" };
    },
    rolesForUser: () => roles
  };
  return { calls, controller: new SplatAssetController(service as any, roomlog as any) };
}

describe("SplatAssetController authorization", () => {
  it("keeps asset reads public", async () => {
    const { controller } = controllerForRoles([]);
    assert.deepEqual(await controller.list("room-1", undefined), [{ id: "public" }]);
  });

  it("requires LANDLORD for creation", async () => {
    const tenant = controllerForRoles(["TENANT"]).controller;
    assert.throws(
      () => tenant.create("Bearer tenant", { roomId: "room-1", fileUrl: "/room.spz" }),
      ForbiddenException
    );

    const landlord = controllerForRoles(["LANDLORD"]).controller;
    assert.deepEqual(
      await landlord.create("Bearer landlord", { roomId: "room-1", fileUrl: "/room.spz" }),
      { id: "created" }
    );
  });

  it("accepts a valid worker secret for PATCH file without a user token", async () => {
    process.env.GPU_WORKER_SECRET = "worker-secret";
    const { calls, controller } = controllerForRoles([]);

    await controller.updateFile(undefined, "worker-secret", "asset-1", { fileUrl: "/result.spz" });

    assert.deepEqual(calls, ["updateFile"]);
  });
});
