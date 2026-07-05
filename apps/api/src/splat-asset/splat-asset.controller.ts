import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SplatAssetService } from "./splat-asset.service";
import { parseCreateInput, parseRegisterInput } from "./splat-asset.types";

@Controller("splat-assets")
export class SplatAssetController {
  constructor(private readonly splatAssetService: SplatAssetService) {}

  @Get()
  list(@Query("roomId") roomId?: string) {
    if (!roomId || roomId.trim() === "") {
      throw new BadRequestException("roomId 쿼리 파라미터가 필요합니다.");
    }
    return this.splatAssetService.listByRoom(roomId.trim());
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.splatAssetService.getById(id);
  }

  @Post()
  create(@Body() body: unknown) {
    return this.splatAssetService.create(parseCreateInput(body));
  }

  @Patch(":id/registration")
  register(@Param("id") id: string, @Body() body: unknown) {
    return this.splatAssetService.register(id, parseRegisterInput(body));
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.splatAssetService.remove(id);
  }
}
