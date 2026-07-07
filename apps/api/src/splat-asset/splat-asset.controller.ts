import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SplatAssetService, type UploadedSplatAssetFile } from "./splat-asset.service";
import { parseCreateInput, parseIntakeInput, parseRegisterInput, parseUpdateFileInput } from "./splat-asset.types";

@Controller("splat-assets")
export class SplatAssetController {
  constructor(private readonly splatAssetService: SplatAssetService) {}

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
  create(@Body() body: unknown) {
    return this.splatAssetService.create(parseCreateInput(body));
  }

  @Post("intake")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 800 * 1024 * 1024 } }))
  intake(@Body() body: unknown, @UploadedFile() file: UploadedSplatAssetFile | undefined) {
    return this.splatAssetService.intake(parseIntakeInput(body), file);
  }

  @Patch(":id/registration")
  register(@Param("id") id: string, @Body() body: unknown) {
    return this.splatAssetService.register(id, parseRegisterInput(body));
  }

  @Patch(":id/file")
  updateFile(@Param("id") id: string, @Body() body: unknown) {
    return this.splatAssetService.updateFile(id, parseUpdateFileInput(body));
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.splatAssetService.remove(id);
  }
}
