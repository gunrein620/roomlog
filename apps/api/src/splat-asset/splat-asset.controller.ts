import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { UserAccount, UserRole } from "../roomlog/roomlog.types";
import { RoomlogService } from "../roomlog/roomlog.service";
import { SplatAssetService, type UploadedSplatAssetFile } from "./splat-asset.service";
import { parseCreateInput, parseIntakeInput, parseRegisterInput, parseUpdateFileInput } from "./splat-asset.types";
import { workerSecretMatches } from "./worker-secret";

@Controller("splat-assets")
export class SplatAssetController {
  constructor(
    private readonly splatAssetService: SplatAssetService,
    private readonly roomlogService: RoomlogService
  ) {}

  @Get()
  list(@Query("roomId") roomId?: string, @Query("listingId") listingId?: string) {
    // 기존 클라이언트 호환을 위해 roomId와 listingId가 동시에 오면 roomId를 우선한다.
    if (roomId && roomId.trim() !== "") {
      return this.splatAssetService.listByRoom(roomId.trim());
    }
    if (listingId && listingId.trim() !== "") {
      return this.splatAssetService.listByListing(listingId.trim());
    }
    throw new BadRequestException("roomId 또는 listingId 쿼리 파라미터가 필요합니다.");
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.splatAssetService.getById(id);
  }

  @Post()
  create(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    this.requireRole(authorization, ["LANDLORD"]);
    return this.splatAssetService.create(parseCreateInput(body));
  }

  @Post("intake")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 800 * 1024 * 1024 } }))
  intake(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @UploadedFile() file: UploadedSplatAssetFile | undefined
  ) {
    this.requireRole(authorization, ["LANDLORD"]);
    return this.splatAssetService.intake(parseIntakeInput(body), file);
  }

  @Patch(":id/registration")
  register(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    this.requireRole(authorization, ["LANDLORD"]);
    return this.splatAssetService.register(id, parseRegisterInput(body));
  }

  @Patch(":id/file")
  updateFile(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-worker-secret") workerSecret: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    if (!workerSecretMatches(workerSecret)) {
      this.requireRole(authorization, ["LANDLORD"]);
    }
    return this.splatAssetService.updateFile(id, parseUpdateFileInput(body));
  }

  @Delete(":id")
  remove(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    this.requireRole(authorization, ["LANDLORD"]);
    return this.splatAssetService.remove(id);
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
