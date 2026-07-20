import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put
} from "@nestjs/common";
// API tsconfig의 node10 해석은 package.json exports를 읽지 못한다. 동결 계약의 정확한
// 서브패스를 유지하며, 이 type-only import는 런타임 require로 emit되지 않는다.
import type * as TenantFurnitureContract from "@roomlog/types/tenant-furniture";
import type { UserAccount, UserRole } from "../roomlog/roomlog.types";
import { RoomlogService } from "../roomlog/roomlog.service";
import { requireWorkerSecret } from "../splat-asset/worker-secret";
import {
  TenantFurnitureService,
  type TenantFurnitureUpdateInput
} from "./tenant-furniture.service";

@Controller("tenant-furniture")
export class TenantFurnitureController {
  constructor(
    private readonly tenantFurnitureService: TenantFurnitureService,
    private readonly roomlogService: RoomlogService
  ) {}

  @Post("roomplan-import")
  async importRoomPlan(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: TenantFurnitureContract.RoomPlanImportPayload
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.tenantFurnitureService.importRoomPlan(user.id, body);
  }

  @Get()
  async list(@Headers("authorization") authorization: string | undefined) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.tenantFurnitureService.list(user.id);
  }

  @Get("placements/:listingId")
  async getPlacement(
    @Headers("authorization") authorization: string | undefined,
    @Param("listingId") listingId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.tenantFurnitureService.getPlacement(user.id, listingId);
  }

  @Put("placements/:listingId")
  async putPlacement(
    @Headers("authorization") authorization: string | undefined,
    @Param("listingId") listingId: string,
    @Body() body: { items: TenantFurnitureContract.TenantFurniturePlacementItem[] }
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.tenantFurnitureService.putPlacement(user.id, listingId, body);
  }

  @Patch(":id")
  async update(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Body() body: TenantFurnitureUpdateInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.tenantFurnitureService.update(id, user.id, body);
  }

  @Delete("batches/:batchId")
  async removeImportBatch(
    @Headers("authorization") authorization: string | undefined,
    @Param("batchId") batchId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.tenantFurnitureService.removeImportBatch(batchId, user.id);
  }

  @Delete(":id")
  async remove(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.tenantFurnitureService.remove(id, user.id);
  }

  // ─── Object Capture(iOS) → S3 직접 업로드 (C-2) ────────────────────────────

  @Post("object-capture/presign")
  @HttpCode(200)
  async presignObjectCapture(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: TenantFurnitureContract.ObjectCapturePresignRequest
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.tenantFurnitureService.presignObjectCapture(user.id, body);
  }

  @Post("object-capture/complete")
  async completeObjectCapture(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: TenantFurnitureContract.ObjectCaptureCompleteRequest
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.tenantFurnitureService.completeObjectCapture(user.id, body);
  }

  // mesh-worker 콜백(워커 시크릿) — 사람(TENANT) 인증이 아니라 시스템 주체. GPU_WORKER_SECRET을
  // reconstruction과 공유한다(둘 다 requireWorkerSecret). splat-asset의 reconstruction.controller.ts와
  // 동일한 콜백 패턴(성공/실패 분리)을 따른다.
  @Post(":id/mesh-conversion/complete")
  async completeMeshConversion(
    @Headers("x-worker-secret") workerSecret: string | undefined,
    @Param("id") id: string,
    @Body() body: { glbUrl?: unknown }
  ) {
    requireWorkerSecret(workerSecret);
    if (typeof body?.glbUrl !== "string" || body.glbUrl.trim() === "") {
      throw new BadRequestException("glbUrl은 비어 있지 않은 문자열이어야 합니다.");
    }
    return this.tenantFurnitureService.completeMeshConversion(id, body.glbUrl.trim());
  }

  @Post(":id/mesh-conversion/failure")
  async failMeshConversion(
    @Headers("x-worker-secret") workerSecret: string | undefined,
    @Param("id") id: string,
    @Body() body: { error?: unknown }
  ) {
    requireWorkerSecret(workerSecret);
    if (typeof body?.error !== "string" || body.error.trim() === "") {
      throw new BadRequestException("error는 비어 있지 않은 문자열이어야 합니다.");
    }
    return this.tenantFurnitureService.markMeshConversionFailed(id, body.error);
  }

  private requireRole(authorization: string | undefined, roles: UserRole[]): UserAccount {
    const user = this.roomlogService.getUserFromToken(authorization);
    const userRoles = this.roomlogService.rolesForUser(user);

    if (!roles.some((role) => userRoles.includes(role))) {
      throw new ForbiddenException("이 역할로 접근할 수 없습니다.");
    }

    return user;
  }
}
