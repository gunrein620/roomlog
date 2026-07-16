import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SPLAT_ASSET_UPDATED_EVENT, type SplatAssetStatus } from "@roomlog/types";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { SplatAssetService, type UploadedSplatAssetFile } from "../splat-asset/splat-asset.service";
import { requireWorkerSecret } from "../splat-asset/worker-secret";

@Controller("splat-assets/:id/reconstruction")
export class ReconstructionController {
  constructor(
    private readonly splatAssetService: SplatAssetService,
    private readonly realtime: RealtimeGateway
  ) {}

  @Post("complete")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 500 * 1024 * 1024 } }))
  async complete(
    @Headers("x-worker-secret") workerSecret: string | undefined,
    @Param("id") id: string,
    @UploadedFile() file: UploadedSplatAssetFile | undefined
  ) {
    requireWorkerSecret(workerSecret);
    if (!file) throw new BadRequestException("재구성 결과 파일이 필요합니다.");

    const asset = await this.splatAssetService.attachReconstructedFile(id, file);
    await this.notifyOwner(asset.id, asset.listingId, "UPLOADED");
    return asset;
  }

  @Post("failure")
  async failure(
    @Headers("x-worker-secret") workerSecret: string | undefined,
    @Param("id") id: string,
    @Body() body: { error?: unknown }
  ) {
    requireWorkerSecret(workerSecret);
    if (typeof body?.error !== "string" || body.error.trim() === "") {
      throw new BadRequestException("error는 비어 있지 않은 문자열이어야 합니다.");
    }

    const asset = await this.splatAssetService.markReconstructionFailed(id, body.error);
    await this.notifyOwner(asset.id, asset.listingId, "FAILED");
    return asset;
  }

  private async notifyOwner(assetId: string, listingId: string | null, status: SplatAssetStatus) {
    if (!listingId) {
      console.warn(`[reconstruction] 매물 연결이 없어 알림을 생략합니다: asset=${assetId}`);
      return;
    }

    const ownerId = await this.splatAssetService.findListingOwnerId(listingId);
    if (!ownerId) {
      console.warn(`[reconstruction] 매물 소유자가 없어 알림을 생략합니다: asset=${assetId}, listing=${listingId}`);
      return;
    }

    this.realtime.notifyUsers([ownerId], SPLAT_ASSET_UPDATED_EVENT, {
      assetId,
      listingId,
      status
    });
  }
}
