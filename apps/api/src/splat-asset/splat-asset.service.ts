import { randomUUID } from "node:crypto";
import { basename, extname, resolve } from "node:path";
import { BadRequestException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createFileStorageAdapter, type FileStorageAdapter } from "../roomlog/storage.service";
import {
  type CreateSplatAssetInput,
  type IntakeSplatAssetInput,
  type RegisterSplatAssetInput,
  type UpdateSplatAssetFileInput
} from "./splat-asset.types";

export const SPLAT_ASSET_DATABASE_URL = "SPLAT_ASSET_DATABASE_URL";

export type UploadedSplatAssetFile = { buffer: Buffer; originalname: string; mimetype: string };

const MAX_UPLOAD_BYTES = 800 * 1024 * 1024;
const SPLAT_EXTENSIONS = [".spz", ".sog", ".ply", ".splat"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm"];

type IntakeFileClassification =
  | { kind: "splat"; extension: string; fileKind: string }
  | { kind: "video"; extension: string; fileKind: "video" };

function classifyIntakeFile(file: UploadedSplatAssetFile): IntakeFileClassification {
  const extension = extname(file.originalname).toLowerCase();
  if (SPLAT_EXTENSIONS.includes(extension)) {
    return { kind: "splat", extension, fileKind: extension.slice(1) };
  }

  if (VIDEO_EXTENSIONS.includes(extension) || file.mimetype?.startsWith("video/")) {
    const fallbackByMime: Record<string, string> = {
      "video/mp4": ".mp4",
      "video/quicktime": ".mov",
      "video/webm": ".webm",
      "video/x-m4v": ".m4v"
    };
    return { kind: "video", extension: VIDEO_EXTENSIONS.includes(extension) ? extension : fallbackByMime[file.mimetype] ?? ".video", fileKind: "video" };
  }

  throw new BadRequestException("영상 또는 .spz 파일만 접수할 수 있습니다.");
}

function safeUploadedFileName(prefix: string, originalName: string, extension: string): string {
  const uploadId = randomUUID().slice(0, 12);
  const safeBaseName =
    basename(originalName, extname(originalName))
      .replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "splat-asset";

  return `${prefix}-${uploadId}-${safeBaseName}${extension}`;
}

@Injectable()
export class SplatAssetService {
  private readonly prisma?: PrismaClient;
  // trade.service와 동일한 기본값 — S3_UPLOADS_ENABLED가 켜지면 자동으로 S3 어댑터로 전환된다.
  private readonly storageAdapter: FileStorageAdapter = createFileStorageAdapter(
    process.env,
    resolve(process.env.LOCAL_UPLOAD_DIR || "uploads"),
    process.env.PUBLIC_UPLOAD_BASE_URL || "/api/files"
  );

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

  /** 직접등록 매물(TradeListing)에 연결된 splat 자산 목록. roomId가 없는 클라이언트 상태 칩이 소비한다. */
  async listByListing(listingId: string) {
    if (!this.prisma) return [];
    return this.prisma.splatAsset.findMany({
      where: { listingId },
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

  /** 매물 STEP 02의 영상/spz 접수 — 영상은 PROCESSING, splat 파일은 UPLOADED로 생성한다. */
  async intake(input: IntakeSplatAssetInput, file: UploadedSplatAssetFile | undefined) {
    if (!file) throw new BadRequestException("접수할 파일이 필요합니다.");
    if (!file.buffer?.length) throw new BadRequestException("업로드할 파일이 비어 있습니다.");
    if (file.buffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException("영상 또는 .spz 파일은 800MB 이하만 접수할 수 있습니다.");
    }

    const classification = classifyIntakeFile(file);
    const stored = await this.storageAdapter.save({
      buffer: file.buffer,
      fileName: safeUploadedFileName(`splat-${classification.kind}`, file.originalname, classification.extension),
      mimeType: file.mimetype
    });
    const roomId = `trade-${input.listingId}`;
    const roomTitle = input.title?.trim() || "직접등록 매물";
    const roomAddress = input.address?.trim() || "주소 미입력";
    const prisma = this.getPrisma();

    await prisma.room.upsert({
      where: { id: roomId },
      create: {
        id: roomId,
        buildingName: roomTitle,
        roomNo: input.listingId,
        address: roomAddress
      },
      update: {
        buildingName: roomTitle,
        address: roomAddress
      }
    });

    return prisma.splatAsset.create({
      data: {
        id: `splat_${randomUUID()}`,
        roomId,
        listingId: input.listingId,
        fileUrl: classification.kind === "splat" ? stored.fileUrl : "",
        fileKind: classification.fileKind,
        sizeBytes: file.buffer.length,
        videoUrl: classification.kind === "video" ? stored.fileUrl : null,
        status: classification.kind === "video" ? "PROCESSING" : "UPLOADED"
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

  /** GPU 파이프라인이 생성한 spz 파일을 붙이고, 제작 중이면 정합 대기 상태로 승격한다. */
  async updateFile(id: string, input: UpdateSplatAssetFileInput) {
    const asset = await this.getById(id); // 존재 검증(없으면 404)
    // 정합값(transform)은 특정 파일의 지오메트리에 대한 배치라, 파일이 바뀌면 무의미해진다.
    // REGISTERED 자산의 파일 교체는 정합을 리셋해 재정합을 강제한다 — 안 그러면 조용히 어긋난 투어가 나간다.
    const wasRegistered = asset.status === "REGISTERED";
    return this.getPrisma().splatAsset.update({
      where: { id },
      data: {
        fileUrl: input.fileUrl,
        ...(input.fileKind != null ? { fileKind: input.fileKind } : {}),
        ...(input.sizeBytes != null ? { sizeBytes: input.sizeBytes } : {}),
        ...(wasRegistered ? { transform: Prisma.DbNull, registrationPairs: Prisma.DbNull } : {}),
        status: asset.status === "PROCESSING" || wasRegistered ? "UPLOADED" : asset.status
      }
    });
  }

  async remove(id: string) {
    await this.getById(id); // 존재 검증(없으면 404)
    await this.getPrisma().splatAsset.delete({ where: { id } });
    return { id, deleted: true };
  }
}
