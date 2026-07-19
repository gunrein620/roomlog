import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { RoomPlanCaptureFloorPlan } from "@roomlog/types";
import { SplatAssetController } from "./splat-asset.controller";
import { SplatAssetService } from "./splat-asset.service";
import { parseCaptureFloorPlanInput } from "./splat-asset.types";

// A4b — captureFloorPlan은 이제 SplatAsset.captureFloorPlan(intake/complete가 저장한 roomplan.json)에서
// 읽는 게 기본 경로다. previewAutoRegister의 두 번째 인자는 override(요청 body, 주로 테스트·구버전 클라
// fallback)이고, 생략하면 asset에 저장된 값을 읽는다.

// A4a 자동정합 프리뷰 — floor-plan-match.spec.ts와 같은 L자 방(90°/180° 회전 대칭 없음) 픽스처를 써서
// 이 스펙은 SplatAssetService.previewAutoRegister의 배선(소유자 도면 조회 우선순위 · PREVIEW ONLY(저장 안
// 함) · 400/403 게이트)을 검증한다. 매처 자체의 기하 정확도(yaw/translation 복원, ambiguous/failed 분류)는
// floor-plan-match.spec.ts가 이미 커버하므로 여기서는 재검증하지 않는다.

type Pt = [number, number];

/** L자 6모서리 — floor-plan-match.spec.ts의 lShapeCorners()와 동일. */
function lShapeCorners(): Pt[] {
  return [
    [0, 0],
    [6, 0],
    [6, 3],
    [4, 3],
    [4, 4],
    [0, 4]
  ];
}

/** wallCenterlineSegment(floor-plan-match.ts)의 역함수 — 세그먼트에서 WheretoputWall3D 호환 벽 JSON을 만든다. */
function wallFromSegment(id: string, start: Pt, end: Pt) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const width = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  return {
    id,
    position: [(start[0] + end[0]) / 2, 0, (start[1] + end[1]) / 2] as [number, number, number],
    rotation: [0, yaw, 0] as [number, number, number],
    dimensions: { width, height: 2.4, depth: 0.1 }
  };
}

function lShapeOwnerWalls() {
  const corners = lShapeCorners();
  return corners.map((start, i) => wallFromSegment(`wall-${i}`, start, corners[(i + 1) % corners.length]));
}

function lShapeCapture(): RoomPlanCaptureFloorPlan {
  const corners = lShapeCorners();
  return {
    frame: "arkit-metric",
    walls: corners.map((start, i) => ({
      start,
      end: corners[(i + 1) % corners.length],
      height: 2.4,
      thickness: 0.1
    })),
    openings: []
  };
}

function serviceWithFakes(prisma: unknown): SplatAssetService {
  const service = new SplatAssetService(undefined);
  (service as any).prisma = prisma;
  return service;
}

describe("SplatAssetService.previewAutoRegister", () => {
  it("matches an identical capture/owner L-room and echoes the linked FloorPlan id", async () => {
    const asset = { id: "asset-1", floorPlanId: "fp-1", listingId: null };
    const service = serviceWithFakes({
      splatAsset: { findUnique: async () => asset },
      floorPlan: { findUnique: async () => ({ room3d: { walls: lShapeOwnerWalls() } }) }
    });

    const result = await service.previewAutoRegister("asset-1", lShapeCapture());

    assert.equal(result.floorPlanId, "fp-1");
    assert.notEqual(result.confidence, "failed");
    assert.ok(["auto", "ambiguous"].includes(result.confidence));
    assert.ok(Array.isArray(result.alternatives));
    assert.equal(typeof result.best.score, "number");
    assert.equal(result.best.transform.rotationXDegrees, 180);
    assert.equal(result.best.transform.scaleMultiplier, 1);
  });

  it("falls back to the TradeListing.floorPlan.walls3D snapshot and returns floorPlanId: null", async () => {
    const asset = { id: "asset-1", floorPlanId: null, listingId: "listing-1" };
    const service = serviceWithFakes({
      splatAsset: { findUnique: async () => asset },
      tradeListing: { findUnique: async () => ({ floorPlan: { walls3D: lShapeOwnerWalls() } }) }
    });

    const result = await service.previewAutoRegister("asset-1", lShapeCapture());

    // 매물 스냅샷은 서버 FloorPlan row가 아니라 정합에 쓰였어도 register() 연결 대상이 아니다.
    assert.equal(result.floorPlanId, null);
    assert.notEqual(result.confidence, "failed");
  });

  it("prefers the linked FloorPlan over the listing snapshot when both exist", async () => {
    const asset = { id: "asset-1", floorPlanId: "fp-1", listingId: "listing-1" };
    let queriedTradeListing = false;
    const service = serviceWithFakes({
      splatAsset: { findUnique: async () => asset },
      floorPlan: { findUnique: async () => ({ room3d: { walls: lShapeOwnerWalls() } }) },
      tradeListing: {
        findUnique: async () => {
          queriedTradeListing = true;
          return { floorPlan: { walls3D: lShapeOwnerWalls() } };
        }
      }
    });

    const result = await service.previewAutoRegister("asset-1", lShapeCapture());

    assert.equal(result.floorPlanId, "fp-1");
    assert.equal(queriedTradeListing, false); // FloorPlan 연결이 있으면 매물 스냅샷은 조회하지 않는다
  });

  it("rejects when the asset has neither a linked FloorPlan nor a listing snapshot with walls", async () => {
    const asset = { id: "asset-1", floorPlanId: null, listingId: null };
    const service = serviceWithFakes({ splatAsset: { findUnique: async () => asset } });

    await assert.rejects(() => service.previewAutoRegister("asset-1", lShapeCapture()), BadRequestException);
  });

  it("rejects when the resolved owner plan has no valid walls (malformed JSON)", async () => {
    const asset = { id: "asset-1", floorPlanId: "fp-1", listingId: null };
    const service = serviceWithFakes({
      splatAsset: { findUnique: async () => asset },
      floorPlan: { findUnique: async () => ({ room3d: { walls: [{ position: [0, 0, 0] }] } }) } // rotation/dimensions 누락
    });

    await assert.rejects(() => service.previewAutoRegister("asset-1", lShapeCapture()), BadRequestException);
  });

  it("rejects a capture floor plan with no wall segments", async () => {
    const asset = { id: "asset-1", floorPlanId: "fp-1", listingId: null };
    const service = serviceWithFakes({
      splatAsset: { findUnique: async () => asset },
      floorPlan: { findUnique: async () => ({ room3d: { walls: lShapeOwnerWalls() } }) }
    });

    await assert.rejects(
      () => service.previewAutoRegister("asset-1", { frame: "arkit-metric", walls: [], openings: [] }),
      BadRequestException
    );
  });

  it("reads captureFloorPlan from the asset when no override is passed", async () => {
    const asset = { id: "asset-1", floorPlanId: "fp-1", listingId: null, captureFloorPlan: lShapeCapture() };
    const service = serviceWithFakes({
      splatAsset: { findUnique: async () => asset },
      floorPlan: { findUnique: async () => ({ room3d: { walls: lShapeOwnerWalls() } }) }
    });

    const result = await service.previewAutoRegister("asset-1");

    assert.equal(result.floorPlanId, "fp-1");
    assert.notEqual(result.confidence, "failed");
  });

  it("prefers the override over the asset's stored captureFloorPlan when both are given", async () => {
    const asset = { id: "asset-1", floorPlanId: "fp-1", listingId: null, captureFloorPlan: { frame: "arkit-metric", walls: [], openings: [] } };
    const service = serviceWithFakes({
      splatAsset: { findUnique: async () => asset },
      floorPlan: { findUnique: async () => ({ room3d: { walls: lShapeOwnerWalls() } }) }
    });

    // asset.captureFloorPlan has no walls (would reject on its own) — the override must win.
    const result = await service.previewAutoRegister("asset-1", lShapeCapture());

    assert.notEqual(result.confidence, "failed");
  });

  it("rejects when neither an override nor a stored captureFloorPlan is available", async () => {
    const asset = { id: "asset-1", floorPlanId: "fp-1", listingId: null, captureFloorPlan: null };
    const service = serviceWithFakes({
      splatAsset: { findUnique: async () => asset },
      floorPlan: { findUnique: async () => ({ room3d: { walls: lShapeOwnerWalls() } }) }
    });

    await assert.rejects(() => service.previewAutoRegister("asset-1"), BadRequestException);
  });
});

describe("parseCaptureFloorPlanInput", () => {
  it("parses a valid body", () => {
    const parsed = parseCaptureFloorPlanInput({ captureFloorPlan: lShapeCapture() });
    assert.equal(parsed.walls.length, 6);
    assert.equal(parsed.frame, "arkit-metric");
  });

  it("rejects a missing captureFloorPlan", () => {
    assert.throws(() => parseCaptureFloorPlanInput({}), BadRequestException);
  });

  it("rejects the wrong frame", () => {
    assert.throws(
      () => parseCaptureFloorPlanInput({ captureFloorPlan: { ...lShapeCapture(), frame: "other" } }),
      BadRequestException
    );
  });

  it("rejects an empty walls array", () => {
    assert.throws(
      () => parseCaptureFloorPlanInput({ captureFloorPlan: { frame: "arkit-metric", walls: [] } }),
      BadRequestException
    );
  });

  it("rejects malformed wall geometry", () => {
    assert.throws(
      () =>
        parseCaptureFloorPlanInput({
          captureFloorPlan: {
            frame: "arkit-metric",
            walls: [{ start: [0, 0], end: "not-a-point", height: 2.4, thickness: 0.1 }]
          }
        }),
      BadRequestException
    );
  });
});

// 컨트롤러 배선 — 2점 수동 정합(PATCH :id/registration)과 동일한 role-guard/소유권 게이트 패턴을 따르는지.
describe("SplatAssetController auto-register-preview authorization", () => {
  function controllerWith(options: { roles: string[]; owns: boolean }) {
    const calls: string[] = [];
    const denial = new ForbiddenException("본인 매물의 3D 자산만 다룰 수 있습니다.");
    const service = {
      previewAutoRegister: async () => {
        calls.push("previewAutoRegister");
        return { best: { transform: {}, score: 0 }, alternatives: [], confidence: "auto", floorPlanId: null };
      },
      assertAssetOwner: async () => {
        calls.push("assertAssetOwner");
        if (!options.owns) throw denial;
      }
    };
    const roomlog = {
      getUserFromToken: (authorization?: string) => {
        if (!authorization) throw new UnauthorizedException("인증 토큰이 필요합니다.");
        return { id: "user-1", role: options.roles[0] ?? "TENANT" };
      },
      rolesForUser: () => options.roles
    };
    return { calls, controller: new SplatAssetController(service as any, roomlog as any) };
  }

  it("blocks non-LANDLORD roles before touching the service", async () => {
    const { calls, controller } = controllerWith({ roles: ["TENANT"], owns: true });
    await assert.rejects(
      () => controller.autoRegisterPreview("Bearer tenant", "asset-1", { captureFloorPlan: lShapeCapture() }),
      ForbiddenException
    );
    assert.deepEqual(calls, []);
  });

  it("blocks a LANDLORD who does not own the asset's listing", async () => {
    const { calls, controller } = controllerWith({ roles: ["LANDLORD"], owns: false });
    await assert.rejects(
      () => controller.autoRegisterPreview("Bearer landlord", "asset-1", { captureFloorPlan: lShapeCapture() }),
      ForbiddenException
    );
    assert.deepEqual(calls, ["assertAssetOwner"]); // previewAutoRegister는 호출되지 않음
  });

  it("allows the owning LANDLORD through", async () => {
    const { calls, controller } = controllerWith({ roles: ["LANDLORD"], owns: true });
    const result = await controller.autoRegisterPreview("Bearer landlord", "asset-1", {
      captureFloorPlan: lShapeCapture()
    });
    assert.deepEqual(calls, ["assertAssetOwner", "previewAutoRegister"]);
    assert.equal(result.confidence, "auto");
  });

  it("allows an empty body through — captureFloorPlan is now optional (asset is the default source)", async () => {
    const { calls, controller } = controllerWith({ roles: ["LANDLORD"], owns: true });
    const result = await controller.autoRegisterPreview("Bearer landlord", "asset-1", {});
    assert.deepEqual(calls, ["assertAssetOwner", "previewAutoRegister"]);
    assert.equal(result.confidence, "auto");
  });
});
