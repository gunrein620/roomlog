import { randomUUID } from "node:crypto";
import { Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  type CreateSplatAssetInput,
  type RegisterSplatAssetInput
} from "./splat-asset.types";

export const SPLAT_ASSET_DATABASE_URL = "SPLAT_ASSET_DATABASE_URL";

@Injectable()
export class SplatAssetService {
  private readonly prisma?: PrismaClient;

  constructor(
    @Optional()
    @Inject(SPLAT_ASSET_DATABASE_URL)
    databaseUrl?: string
  ) {
    const resolvedDatabaseUrl =
      databaseUrl?.trim() || process.env.SPLAT_ASSET_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
    if (resolvedDatabaseUrl) {
      const adapter = new PrismaPg({ connectionString: resolvedDatabaseUrl });
      this.prisma = new PrismaClient({ adapter });
    }
  }

  private getPrisma(): PrismaClient {
    if (!this.prisma) {
      throw new ServiceUnavailableException("DATABASE_URL이 설정되어야 splat 자산을 저장할 수 있습니다.");
    }
    return this.prisma;
  }

  /** 방(Room)의 splat 자산 목록. DB 미설정 시 빈 배열로 안전 저하. */
  async listByRoom(roomId: string) {
    if (!this.prisma) return [];
    return this.prisma.splatAsset.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" }
    });
  }

  async getById(id: string) {
    const asset = await this.getPrisma().splatAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException(`splat 자산을 찾을 수 없습니다: ${id}`);
    return asset;
  }

  /** 업로드된 파일로 자산 생성 — 정합 전(status: UPLOADED). */
  async create(input: CreateSplatAssetInput) {
    return this.getPrisma().splatAsset.create({
      data: {
        id: `splat_${randomUUID()}`,
        roomId: input.roomId,
        fileUrl: input.fileUrl,
        floorPlanId: input.floorPlanId ?? null,
        fileKind: input.fileKind ?? "spz",
        sizeBytes: input.sizeBytes ?? null,
        capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
        status: "UPLOADED"
      }
    });
  }

  /** 2점 정합 결과 반영 — transform 저장 + status REGISTERED 승격. */
  async register(id: string, input: RegisterSplatAssetInput) {
    await this.getById(id); // 존재 검증(없으면 404)
    return this.getPrisma().splatAsset.update({
      where: { id },
      data: {
        transform: input.transform as unknown as Prisma.InputJsonValue,
        registrationPairs: (input.registrationPairs ?? []) as unknown as Prisma.InputJsonValue,
        status: "REGISTERED"
      }
    });
  }

  async remove(id: string) {
    await this.getById(id); // 존재 검증(없으면 404)
    await this.getPrisma().splatAsset.delete({ where: { id } });
    return { id, deleted: true };
  }
}
