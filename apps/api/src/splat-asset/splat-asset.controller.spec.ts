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

// 소유권 게이트 — 컨트롤러가 소유권 강제 메서드를 호출하고 403을 전파하는지, 워커는 면제되는지.
describe("SplatAssetController ownership gate", () => {
  function ownershipController(options: { owns: boolean }) {
    const calls: string[] = [];
    const denial = new ForbiddenException("본인 매물의 3D 자산만 다룰 수 있습니다.");
    const service = {
      intake: async () => {
        calls.push("intake");
        return { id: "asset-1" };
      },
      register: async () => {
        calls.push("register");
        return { id: "asset-1" };
      },
      updateSpawnView: async () => {
        calls.push("updateSpawnView");
        return { id: "asset-1" };
      },
      updateFile: async () => {
        calls.push("updateFile");
        return { id: "asset-1" };
      },
      remove: async () => {
        calls.push("remove");
        return { id: "asset-1", deleted: true };
      },
      assertListingOwner: async () => {
        calls.push("assertListingOwner");
        if (!options.owns) throw denial;
      },
      assertAssetOwner: async () => {
        calls.push("assertAssetOwner");
        if (!options.owns) throw denial;
      }
    };
    const roomlog = {
      getUserFromToken: (authorization?: string) => {
        if (!authorization) throw new UnauthorizedException("인증 토큰이 필요합니다.");
        return { id: "user-1", role: "LANDLORD" };
      },
      rolesForUser: () => ["LANDLORD"]
    };
    return { calls, controller: new SplatAssetController(service as any, roomlog as any) };
  }

  it("blocks intake into a listing the landlord does not own", async () => {
    const { calls, controller } = ownershipController({ owns: false });
    await assert.rejects(
      () => controller.intake("Bearer landlord", { listingId: "listing-9" }, undefined),
      ForbiddenException
    );
    assert.deepEqual(calls, ["assertListingOwner"]); // intake는 호출되지 않음
  });

  it("allows intake into an owned listing", async () => {
    const { calls, controller } = ownershipController({ owns: true });
    await controller.intake("Bearer landlord", { listingId: "listing-1" }, undefined);
    assert.deepEqual(calls, ["assertListingOwner", "intake"]);
  });

  it("blocks registration and deletion of another landlord's asset", async () => {
    const reg = ownershipController({ owns: false });
    await assert.rejects(() => reg.controller.register("Bearer landlord", "asset-1", { transform: {} }), ForbiddenException);
    assert.deepEqual(reg.calls, ["assertAssetOwner"]);

    const del = ownershipController({ owns: false });
    await assert.rejects(() => del.controller.remove("Bearer landlord", "asset-1"), ForbiddenException);
    assert.deepEqual(del.calls, ["assertAssetOwner"]);
  });

  it("blocks spawn-view update on another landlord's asset, allows it on their own", async () => {
    const spawnView = { position: [0, 1.45, -0.5], target: [0.2, 0.4, -2.5] };

    const denied = ownershipController({ owns: false });
    await assert.rejects(
      () => denied.controller.updateSpawnView("Bearer landlord", "asset-1", { spawnView }),
      ForbiddenException
    );
    assert.deepEqual(denied.calls, ["assertAssetOwner"]); // updateSpawnView는 호출되지 않음

    const allowed = ownershipController({ owns: true });
    await allowed.controller.updateSpawnView("Bearer landlord", "asset-1", { spawnView });
    assert.deepEqual(allowed.calls, ["assertAssetOwner", "updateSpawnView"]);
  });

  it("enforces ownership on the human updateFile path but exempts the worker secret", async () => {
    const human = ownershipController({ owns: false });
    await assert.rejects(
      () => human.controller.updateFile("Bearer landlord", undefined, "asset-1", { fileUrl: "/r.spz" }),
      ForbiddenException
    );
    assert.deepEqual(human.calls, ["assertAssetOwner"]);

    process.env.GPU_WORKER_SECRET = "worker-secret";
    const worker = ownershipController({ owns: false });
    await worker.controller.updateFile(undefined, "worker-secret", "asset-1", { fileUrl: "/r.spz" });
    assert.deepEqual(worker.calls, ["updateFile"]); // 소유권 검사 건너뜀
  });
});
