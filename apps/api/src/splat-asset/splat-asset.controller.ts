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
  Query,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { UserAccount, UserRole } from "../roomlog/roomlog.types";
import { RoomlogService } from "../roomlog/roomlog.service";
import { SplatAssetService, type UploadedSplatAssetFile } from "./splat-asset.service";
import {
  parseCreateInput,
  parseIntakeCompleteInput,
  parseIntakeInput,
  parseIntakePresignInput,
  parseRegisterInput,
  parseUpdateFileInput
} from "./splat-asset.types";
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
    // 공개 조회 — ?asset= 링크 방문자용. 연결된 도면 가구를 동봉한다(getForViewer).
    return this.splatAssetService.getForViewer(id);
  }

  @Post()
  create(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    this.requireRole(authorization, ["LANDLORD"]);
    return this.splatAssetService.create(parseCreateInput(body));
  }

  @Post("intake")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 800 * 1024 * 1024 } }))
  async intake(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @UploadedFile() file: UploadedSplatAssetFile | undefined
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    const input = parseIntakeInput(body);
    // 남의 매물에 3D를 접수하지 못하게 서버에서 소유권을 강제한다(intake는 항상 listingId를 가짐).
    await this.splatAssetService.assertListingOwner(input.listingId, user.id);
    return this.splatAssetService.intake(input, file);
  }

  @Post("intake/presign")
  @HttpCode(200)
  async presignIntake(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    const input = parseIntakePresignInput(body);
    await this.splatAssetService.assertListingOwner(input.listingId, user.id);
    return this.splatAssetService.presignIntake(input);
  }

  @Post("intake/complete")
  async completeIntake(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    const input = parseIntakeCompleteInput(body);
    await this.splatAssetService.assertListingOwner(input.listingId, user.id);
    return this.splatAssetService.completeIntake(input);
  }

  @Patch(":id/registration")
  async register(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    await this.splatAssetService.assertAssetOwner(id, user.id);
    return this.splatAssetService.register(id, parseRegisterInput(body));
  }

  @Patch(":id/file")
  async updateFile(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-worker-secret") workerSecret: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    // 워커 시크릿(콜백)은 시스템 주체라 소유권 면제. 사람(LANDLORD) 경로만 소유권을 강제한다.
    if (!workerSecretMatches(workerSecret)) {
      const user = this.requireRole(authorization, ["LANDLORD"]);
      await this.splatAssetService.assertAssetOwner(id, user.id);
    }
    return this.splatAssetService.updateFile(id, parseUpdateFileInput(body));
  }

  @Patch(":id/requeue")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 800 * 1024 * 1024 } }))
  async requeueReconstruction(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-worker-secret") workerSecret: string | undefined,
    @Param("id") id: string,
    @UploadedFile() file: UploadedSplatAssetFile | undefined
  ) {
    // 워커 시크릿은 시스템 주체라 소유권 면제. 사람(LANDLORD)은 자산의 매물 소유권을 강제한다.
    if (!workerSecretMatches(workerSecret)) {
      const user = this.requireRole(authorization, ["LANDLORD"]);
      const asset = await this.splatAssetService.getById(id);
      await this.splatAssetService.assertListingOwner(asset.listingId, user.id);
    }
    return this.splatAssetService.requeueReconstruction(id, file);
  }

  @Delete(":id")
  async remove(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    await this.splatAssetService.assertAssetOwner(id, user.id);
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
