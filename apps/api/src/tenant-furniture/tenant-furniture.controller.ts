import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
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

  @Delete(":id")
  async remove(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.tenantFurnitureService.remove(id, user.id);
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
