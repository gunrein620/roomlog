import { randomUUID } from "node:crypto";
import { basename, extname, resolve } from "node:path";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
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
  | { kind: "video"; extension: string; fileKind: "video" }
  | { kind: "capture"; extension: ".zip"; fileKind: "record3d-zip" };

function classifyIntakeFile(file: UploadedSplatAssetFile): IntakeFileClassification {
  const extension = extname(file.originalname).toLowerCase();
  if (SPLAT_EXTENSIONS.includes(extension)) {
    return { kind: "splat", extension, fileKind: extension.slice(1) };
  }

  if (extension === ".zip") {
    return { kind: "capture", extension: ".zip", fileKind: "record3d-zip" };
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

  throw new BadRequestException("영상, 캡처 zip 또는 스플랫 파일만 접수할 수 있습니다.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON 값이 배열이면 그대로(가구 배열), 아니면 null. 항목 검증은 웹(isValidPlacedFurniture)이 맡는다. */
function asFurnitureArray(value: unknown): unknown[] | null {
  return Array.isArray(value) && value.length > 0 ? value : null;
}

/**
 * 공개 뷰어 노출용 가구 필터 — `visibleToTenant === false`인 항목을 서버에서 제외한다.
 * 공개 링크는 임차인 시점이므로 그 플래그 의도를 그대로 강제한다(클라가 아니라 여기서).
 * 소스가 이미 확정됐다면 필터 후 비어도 그대로 반환한다(폴백으로 넘어가지 않음).
 */
function filterPublicFurniture(items: unknown[]): unknown[] {
  return items.filter((item) => !(isRecord(item) && item.visibleToTenant === false));
}

/**
 * 매물 도면 스냅샷(TradeListing.floorPlan JSON)에서 furnitures 배열만 뽑는다.
 * 허용 형태: { furnitures: [...] } | { room3d: { furnitures: [...] } }
 * (manager-listing-media.ts의 normalizeManagerListingFloorPlan과 같은 위치를 읽는다).
 */
function furnituresFromListingSnapshot(value: unknown): unknown[] | null {
  if (!isRecord(value)) return null;
  const room3d = isRecord(value.room3d) ? value.room3d : null;
  return asFurnitureArray(value.furnitures ?? room3d?.furnitures);
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

  /**
   * 공개 뷰어(?asset= 링크 방문자)용 조회 — 자산에 연결된 도면 가구를 동봉한다.
   * 공개 엔드포인트이므로 도면 전체·소유자·주소는 노출하지 않고 furnitures 배열만 프로젝션한다.
   * 소스 우선순위: 정합된 도면(floorPlanId) → 매물 스냅샷(listingId.floorPlan). 둘 다 없으면 null.
   */
  async getForViewer(id: string) {
    const asset = await this.getById(id);
    return { ...asset, furnitures: await this.projectFurnitures(asset) };
  }

  private async projectFurnitures(asset: {
    floorPlanId: string | null;
    listingId: string | null;
  }): Promise<unknown[] | null> {
    if (asset.floorPlanId) {
      // 도면 전체가 아니라 furnitures 컬럼만 select — 벽·소유자 정보가 새지 않게 한다.
      const plan = await this.getPrisma().floorPlan.findUnique({
        where: { id: asset.floorPlanId },
        select: { furnitures: true }
      });
      const furnitures = asFurnitureArray(plan?.furnitures);
      if (furnitures) return filterPublicFurniture(furnitures);
    }

    if (asset.listingId) {
      // 폴백: 직접등록 매물의 도면 스냅샷(walls3D/furnitures JSON). 여기서도 furnitures만 뽑는다.
      const listing = await this.getPrisma().tradeListing.findUnique({
        where: { id: asset.listingId },
        select: { floorPlan: true }
      });
      const furnitures = furnituresFromListingSnapshot(listing?.floorPlan);
      if (furnitures) return filterPublicFurniture(furnitures);
    }

    return null;
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

  /** 매물 STEP 02의 영상/캡처 zip/spz 접수 — 원본 소스는 PROCESSING, splat 파일은 UPLOADED로 생성한다. */
  async intake(input: IntakeSplatAssetInput, file: UploadedSplatAssetFile | undefined) {
    if (!file) throw new BadRequestException("접수할 파일이 필요합니다.");
    if (!file.buffer?.length) throw new BadRequestException("업로드할 파일이 비어 있습니다.");
    if (file.buffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException("영상, 캡처 zip 또는 스플랫 파일은 800MB 이하만 접수할 수 있습니다.");
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
        videoUrl: classification.kind === "splat" ? null : stored.fileUrl,
        status: classification.kind === "splat" ? "UPLOADED" : "PROCESSING",
        jobState: classification.kind === "splat" ? null : "QUEUED"
      }
    });
  }

  /** 2점 정합 결과 반영 — transform 저장 + status REGISTERED 승격. */
  async register(id: string, input: RegisterSplatAssetInput) {
    await this.getById(id); // 존재 검증(없으면 404)
    // 정합에 쓴 도면을 자산에 붙여, 공개 뷰어가 그 도면 가구를 동봉받게 한다.
    // 존재하지 않는 도면 id로 정합 자체가 깨지지 않도록 방어적으로 존재를 먼저 확인한다.
    const floorPlanId = await this.resolveLinkableFloorPlanId(input.floorPlanId);
    return this.getPrisma().splatAsset.update({
      where: { id },
      data: {
        transform: input.transform as unknown as Prisma.InputJsonValue,
        registrationPairs: (input.registrationPairs ?? []) as unknown as Prisma.InputJsonValue,
        status: "REGISTERED",
        ...(floorPlanId ? { floorPlanId } : {})
      }
    });
  }

  /** 정합 body의 floorPlanId가 실재하는 도면일 때만 연결값으로 통과시킨다(FK 위반·오타 방어). */
  private async resolveLinkableFloorPlanId(floorPlanId: string | undefined): Promise<string | null> {
    if (!floorPlanId) return null;
    const plan = await this.getPrisma().floorPlan.findUnique({
      where: { id: floorPlanId },
      select: { id: true }
    });
    if (!plan) {
      console.warn(`[splat-asset] 정합 도면 연결 건너뜀 — 존재하지 않는 floorPlanId=${floorPlanId}`);
      return null;
    }
    return plan.id;
  }

  /** GPU 파이프라인이 생성한 spz 파일을 붙이고, 제작 중이면 정합 대기 상태로 승격한다. */
  async updateFile(id: string, input: UpdateSplatAssetFileInput) {
    return this.updateStoredFile(id, input);
  }

  /** GPU 콜백의 spz 바이트를 저장하고 자산을 정합 대기 상태로 승격한다. */
  async attachReconstructedFile(id: string, file: UploadedSplatAssetFile) {
    if (!file.buffer?.length) throw new BadRequestException("재구성 파일이 비어 있습니다.");
    if (extname(file.originalname).toLowerCase() !== ".spz") {
      throw new BadRequestException("재구성 결과는 .spz 파일이어야 합니다.");
    }

    // 저장 전에 존재를 검증해 잘못된 콜백이 고아 파일을 만들지 않게 한다.
    await this.getById(id);
    const stored = await this.storageAdapter.save({
      buffer: file.buffer,
      fileName: safeUploadedFileName("splat-reconstructed", file.originalname, ".spz"),
      mimeType: file.mimetype
    });

    return this.updateStoredFile(
      id,
      { fileUrl: stored.fileUrl, fileKind: "spz", sizeBytes: file.buffer.length },
      { status: "UPLOADED", jobState: "DONE", jobError: null }
    );
  }

  async markReconstructionFailed(id: string, error: string) {
    await this.getById(id);
    return this.getPrisma().splatAsset.update({
      where: { id },
      data: {
        status: "FAILED",
        jobState: "FAILED",
        jobError: error.slice(0, 2048)
      }
    });
  }

  async findListingOwnerId(listingId: string): Promise<string | null> {
    const listing = await this.getPrisma().tradeListing.findUnique({
      where: { id: listingId },
      select: { ownerId: true }
    });
    if (!listing?.ownerId) {
      console.warn(`[splat-asset] 매물 소유자를 찾을 수 없습니다: listing=${listingId}`);
      return null;
    }
    return listing.ownerId;
  }

  /**
   * 자산(id)에 연결된 매물의 소유자만 통과시킨다 — registration/updateFile/delete 게이트.
   * 존재하지 않는 자산은 404, 소유권 위반/확인불가는 403.
   */
  async assertAssetOwner(assetId: string, userId: string): Promise<void> {
    const asset = await this.getById(assetId);
    await this.assertListingOwner(asset.listingId, userId);
  }

  /**
   * 매물 소유권을 서버에서 강제한다(fail-closed). listingId가 없는 자산(roomId 직접 생성)은
   * 소유권 개념 밖이라 통과시켜 기존 동작을 유지한다. 소유자 확인 불가(매물 없음)는 403.
   * 소유자 조회는 prisma TradeListing 프로젝션을 쓴다 — trade 런타임 truth는 JSON 스토어지만
   * 프로젝터가 write-through(원자적)라 커밋된 매물의 ownerId는 신뢰할 수 있다.
   */
  async assertListingOwner(listingId: string | null | undefined, userId: string): Promise<void> {
    if (!listingId) return;
    const ownerId = await this.findListingOwnerId(listingId);
    if (!ownerId || ownerId !== userId) {
      throw new ForbiddenException("본인 매물의 3D 자산만 다룰 수 있습니다.");
    }
  }

  private async updateStoredFile(
    id: string,
    input: UpdateSplatAssetFileInput,
    completion: { status?: "UPLOADED"; jobState?: "DONE"; jobError?: null } = {}
  ) {
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
        status: asset.status === "PROCESSING" || wasRegistered ? "UPLOADED" : asset.status,
        ...completion
      }
    });
  }

  async remove(id: string) {
    await this.getById(id); // 존재 검증(없으면 404)
    await this.getPrisma().splatAsset.delete({ where: { id } });
    return { id, deleted: true };
  }
}
