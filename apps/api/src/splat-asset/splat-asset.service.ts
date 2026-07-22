import { randomUUID } from "node:crypto";
import { basename, extname, resolve } from "node:path";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type {
  RoomPlanCaptureFloorPlan,
  SplatIntakeCompleteRequest,
  SplatIntakePresignRequest,
  SplatIntakePresignResponse
} from "@roomlog/types";
import { createFileStorageAdapter, type FileStorageAdapter } from "../roomlog/storage.service";
import {
  fromCaptureFloorPlan,
  fromOwnerFloorPlan,
  matchFloorPlans,
  type MatchResult,
  type WallSegments
} from "../roomlog/services/floor-plan-match";
import { TradeService } from "../trade/trade.service";
import {
  parseCaptureFloorPlanValue,
  type CreateSplatAssetInput,
  type IntakeSplatAssetInput,
  type RegisterSplatAssetInput,
  type SpawnViewInput,
  type UpdateSplatAssetFileInput
} from "./splat-asset.types";
import {
  extractJsonField,
  normalizePublicWalls3D,
  parseOwnerWalls3D
} from "./owner-floor-plan-walls";
import { mitunetToWallSegments } from "./mitunet-floor-plan-walls";

export const SPLAT_ASSET_DATABASE_URL = "SPLAT_ASSET_DATABASE_URL";

export type UploadedSplatAssetFile = { buffer: Buffer; originalname: string; mimetype: string };

/** A4a — previewAutoRegister 응답. floorPlanId는 매칭에 쓴 도면이 서버 FloorPlan row일 때만 값을 갖는다
 *  (TradeListing.floorPlan 스냅샷으로 정합했으면 null — register() 연결 대상이 아니므로). */
export interface AutoRegisterPreviewResult extends MatchResult {
  floorPlanId: string | null;
}

// 멀티파트(서버 경유) 한도 — multer가 파일 전체를 힙에 버퍼링하는 경로라 보수적으로 유지한다.
const MAX_UPLOAD_BYTES = 800 * 1024 * 1024;
const MAX_UPLOAD_MESSAGE = "영상, 캡처 zip 또는 스플랫 파일은 800MB 이하만 접수할 수 있습니다.";
// S3 직접 업로드(presigned PUT) 한도 — 서버는 바이트를 안 만지므로 힙과 무관.
// 상한 근거는 sizeBytes 컬럼(int4, 최대 ~2.147GB)이다. 더 키우려면 BigInt 마이그레이션 필요.
const MAX_DIRECT_UPLOAD_BYTES = 2000 * 1024 * 1024;
const MAX_DIRECT_UPLOAD_MESSAGE = "영상, 캡처 zip 또는 스플랫 파일은 2GB 이하만 접수할 수 있습니다.";
const SPLAT_EXTENSIONS = [".spz", ".sog", ".ply", ".splat"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm"];

type IntakeFileClassification =
  | { kind: "splat"; extension: string; fileKind: string }
  | { kind: "video"; extension: string; fileKind: "video" }
  | { kind: "capture"; extension: ".zip"; fileKind: "record3d-zip" };

function classifyIntakeFile(fileName: string, mimeType?: string | null): IntakeFileClassification {
  const extension = extname(fileName).toLowerCase();
  if (SPLAT_EXTENSIONS.includes(extension)) {
    return { kind: "splat", extension, fileKind: extension.slice(1) };
  }

  if (extension === ".zip") {
    return { kind: "capture", extension: ".zip", fileKind: "record3d-zip" };
  }

  if (VIDEO_EXTENSIONS.includes(extension) || mimeType?.startsWith("video/")) {
    const fallbackByMime: Record<string, string> = {
      "video/mp4": ".mp4",
      "video/quicktime": ".mov",
      "video/webm": ".webm",
      "video/x-m4v": ".m4v"
    };
    return {
      kind: "video",
      extension: VIDEO_EXTENSIONS.includes(extension) ? extension : fallbackByMime[mimeType ?? ""] ?? ".video",
      fileKind: "video"
    };
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

/** 매물 도면 스냅샷에서 공개 뷰어용 3D 벽 후보만 뽑는다(정식 형태는 top-level walls3D). */
function wallsFromListingSnapshot(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  const room3d = isRecord(value.room3d) ? value.room3d : null;
  return value.walls3D ?? room3d?.walls3D ?? room3d?.walls;
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
    databaseUrl?: string,
    // 소유권 조회의 1순위 소스 — trade 도메인의 runtime truth(JSON 스토어).
    // DB 프로젝션(prisma.tradeListing)은 지연/실패할 수 있어 폴백으로만 쓴다(2026-07-16 실측 403).
    @Optional() private readonly tradeService?: TradeService
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
   * 공개 뷰어(?asset= 링크 방문자)용 조회 — 자산에 연결된 도면 가구와 3D 벽을 동봉한다.
   * 공개 엔드포인트이므로 도면 전체·소유자·주소는 노출하지 않고 필요한 JSON만 프로젝션한다.
   * 각 소스 우선순위: 정합된 도면(floorPlanId) → 매물 스냅샷(listingId.floorPlan). 둘 다 없으면 null.
   */
  async getForViewer(id: string) {
    const asset = await this.getById(id);
    const [furnitures, walls] = await Promise.all([
      this.projectFurnitures(asset),
      this.projectWalls(asset)
    ]);
    return { ...asset, furnitures, walls };
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

  private async projectWalls(asset: {
    floorPlanId: string | null;
    listingId: string | null;
  }): Promise<unknown[] | null> {
    if (asset.floorPlanId) {
      // FloorPlan.walls는 2D 편집 벽이다. 뷰어용 3D 벽은 room3d.walls만 좁게 조회한다.
      const plan = await this.getPrisma().floorPlan.findUnique({
        where: { id: asset.floorPlanId },
        select: { room3d: true }
      });
      const walls = normalizePublicWalls3D(extractJsonField(plan?.room3d, "walls"));
      if (walls.length > 0) return walls;
    }

    if (asset.listingId) {
      // 폴백 스냅샷에서도 floorPlan JSON 안의 walls3D만 추출하고 개별 벽 형태를 검증한다.
      const listing = await this.getPrisma().tradeListing.findUnique({
        where: { id: asset.listingId },
        select: { floorPlan: true }
      });
      const walls = normalizePublicWalls3D(wallsFromListingSnapshot(listing?.floorPlan));
      if (walls.length > 0) return walls;
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
      throw new BadRequestException(MAX_UPLOAD_MESSAGE);
    }

    const classification = classifyIntakeFile(file.originalname, file.mimetype);
    const stored = await this.storageAdapter.save({
      buffer: file.buffer,
      fileName: safeUploadedFileName(`splat-${classification.kind}`, file.originalname, classification.extension),
      mimeType: file.mimetype
    });
    return this.createIntakeAsset(input, classification, stored.fileUrl, file.buffer.length);
  }

  /** 브라우저가 원본 바이트를 S3로 직접 PUT할 수 있도록 1시간짜리 서명을 발급한다. */
  async presignIntake(input: SplatIntakePresignRequest): Promise<SplatIntakePresignResponse> {
    const classification = classifyIntakeFile(input.fileName, input.mimeType);
    if (input.sizeBytes === 0) {
      throw new BadRequestException("업로드할 파일이 비어 있습니다.");
    }
    if (!this.storageAdapter.presignUpload) {
      // 멀티파트 폴백으로 보낼 파일은 폴백 경로의 한도(800MB)를 여기서 미리 걸러,
      // 어차피 거부될 대용량 업로드를 클라이언트가 시작조차 하지 않게 한다.
      if (input.sizeBytes > MAX_UPLOAD_BYTES) {
        throw new BadRequestException(MAX_UPLOAD_MESSAGE);
      }
      return { mode: "multipart" };
    }
    if (input.sizeBytes > MAX_DIRECT_UPLOAD_BYTES) {
      throw new BadRequestException(MAX_DIRECT_UPLOAD_MESSAGE);
    }

    const key = `splat-intake/${input.listingId}/${safeUploadedFileName(
      `splat-${classification.kind}`,
      input.fileName,
      classification.extension
    )}`;
    const presigned = await this.storageAdapter.presignUpload({
      key,
      mimeType: input.mimeType?.trim() || "application/octet-stream",
      expiresInSeconds: 3600
    });

    return {
      mode: "direct",
      uploadUrl: presigned.uploadUrl,
      key: presigned.key,
      headers: presigned.headers,
      expiresAt: presigned.expiresAt.toISOString()
    };
  }

  /** S3 직접 업로드를 HEAD로 검증한 뒤 기존 multipart intake와 동일한 자산을 만든다. */
  async completeIntake(input: SplatIntakeCompleteRequest) {
    const expectedPrefix = `splat-intake/${input.listingId}/`;
    if (!input.key.startsWith(expectedPrefix)) {
      throw new ForbiddenException("이 매물에 발급된 업로드 키가 아닙니다.");
    }

    const head = await this.storageAdapter.headObject?.(input.key);
    if (!head || !Number.isFinite(head.sizeBytes) || head.sizeBytes < 0) {
      throw new BadRequestException("업로드가 완료되지 않았습니다.");
    }
    if (head.sizeBytes === 0) {
      throw new BadRequestException("업로드할 파일이 비어 있습니다.");
    }
    if (head.sizeBytes > MAX_DIRECT_UPLOAD_BYTES) {
      throw new BadRequestException(MAX_DIRECT_UPLOAD_MESSAGE);
    }

    const classification = classifyIntakeFile(input.key, head.mimeType);
    let publicUrl = this.storageAdapter.publicUrl?.(input.key);
    // 구형/custom 어댑터가 publicUrl resolver를 아직 제공하지 않으면 presign 결과의 결정적 URL을 쓴다.
    if (!publicUrl && this.storageAdapter.presignUpload) {
      const resolved = await this.storageAdapter.presignUpload({
        key: input.key,
        mimeType: head.mimeType?.trim() || "application/octet-stream",
        expiresInSeconds: 3600
      });
      publicUrl = resolved.publicUrl;
    }
    if (!publicUrl) {
      throw new BadRequestException("직접 업로드를 지원하지 않는 저장소입니다.");
    }

    // 멱등 처리 — complete는 가벼운 JSON POST라 네트워크 재시도·중복 클릭으로 쉽게 반복된다.
    // 같은 객체로 자산을 중복 생성하면 오케스트레이터가 GPU 잡을 그만큼 중복 투하하므로
    // (인스턴스 비용), 이미 이 key로 만든 자산이 있으면 그대로 반환한다.
    const existing = await this.getPrisma().splatAsset.findFirst({
      where: {
        listingId: input.listingId,
        OR: [{ videoUrl: publicUrl }, { fileUrl: publicUrl }]
      },
      orderBy: { createdAt: "asc" }
    });
    if (existing) return existing;

    return this.createIntakeAsset(input, classification, publicUrl, head.sizeBytes, input.captureFloorPlan);
  }

  private async createIntakeAsset(
    input: IntakeSplatAssetInput,
    classification: IntakeFileClassification,
    storedUrl: string,
    sizeBytes: number,
    captureFloorPlan?: RoomPlanCaptureFloorPlan
  ) {
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
        fileUrl: classification.kind === "splat" ? storedUrl : "",
        fileKind: classification.fileKind,
        sizeBytes,
        videoUrl: classification.kind === "splat" ? null : storedUrl,
        // roomplan.json — intake/complete가 메타데이터로 동봉하면 여기 얹는다(A4 자동정합의 읽기 원천).
        captureFloorPlan: captureFloorPlan ? (captureFloorPlan as unknown as Prisma.InputJsonValue) : undefined,
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

  /** 자산별 스폰(투어 진입 초기 카메라) 시점 저장 — 소유자가 "현재 시점을 기본으로 저장"으로 확정한다. */
  async updateSpawnView(id: string, input: SpawnViewInput) {
    await this.getById(id); // 존재 검증(없으면 404)
    return this.getPrisma().splatAsset.update({
      where: { id },
      data: { spawnView: input as unknown as Prisma.InputJsonValue }
    });
  }

  /**
   * A4a — 자산의 소유자 도면(walls3D) × RoomPlan 캡처 도면 자동정합 프리뷰. PREVIEW ONLY(저장 안 함) —
   * 확정은 web이 best/alternatives 중 고른 transform으로 기존 register()를 그대로 호출한다(2점 수동 정합과
   * 동일 저장 경로를 공유해, 매물 소유권 게이트·floorPlanId 연결 로직을 중복하지 않는다).
   * captureFloorPlan 읽기 원천: 우선 자산에 저장된 roomplan.json(SplatAsset.captureFloorPlan — iOS
   * intake/complete가 채움), captureFloorPlanOverride가 오면 그걸 우선한다(요청 body override — 테스트·
   * 구버전 클라 호환용 fallback).
   */
  async previewAutoRegister(
    id: string,
    captureFloorPlanOverride?: RoomPlanCaptureFloorPlan
  ): Promise<AutoRegisterPreviewResult> {
    const asset = await this.getById(id);
    const owner = await this.resolveOwnerFloorPlanWalls(asset);
    if (!owner) {
      throw new BadRequestException("정합할 소유자 도면(벽)이 없습니다 — 먼저 매물에 도면을 등록하세요.");
    }

    const captureFloorPlan = captureFloorPlanOverride ?? this.resolveStoredCaptureFloorPlan(asset);
    if (!captureFloorPlan) {
      throw new BadRequestException(
        "캡처 도면(roomplan.json)이 없습니다 — 앱에서 3D 스캔을 완료한 뒤 다시 시도하세요."
      );
    }

    const capture = fromCaptureFloorPlan(captureFloorPlan);
    if (capture.segments.length === 0) {
      throw new BadRequestException("captureFloorPlan에 유효한 벽이 없습니다.");
    }

    let result: MatchResult;
    try {
      result = matchFloorPlans(capture, owner.walls);
    } catch (error) {
      // matchFloorPlans는 입력 벽이 없으면 RangeError를 던진다 — 검증 실패로 400 처리.
      if (error instanceof RangeError) throw new BadRequestException(error.message);
      throw error;
    }

    return { ...result, floorPlanId: owner.floorPlanId };
  }

  /**
   * 자산에 연결된 소유자 도면을 매처 입력(WallSegments)으로 조회한다 — 우선순위: SplatAsset.floorPlanId가
   * 있으면 FloorPlan.room3d.walls, 없으면 SplatAsset.listingId의 TradeListing.floorPlan.walls3D 스냅샷,
   * 그마저 없으면 도면 이미지 업로드(mitunet) 폴리곤. register 픽 화면의
   * resolveRegisterPlanSource(owner-tour-assets.ts)와 동일한 우선순위를 서버에서 재현한다.
   * 벽이 하나도 없으면(모든 소스가 비었거나 파싱 실패) null.
   */
  private async resolveOwnerFloorPlanWalls(asset: {
    floorPlanId: string | null;
    listingId: string | null;
  }): Promise<{ floorPlanId: string | null; walls: WallSegments } | null> {
    if (asset.floorPlanId) {
      const plan = await this.getPrisma().floorPlan.findUnique({
        where: { id: asset.floorPlanId },
        select: { room3d: true }
      });
      const walls = parseOwnerWalls3D(extractJsonField(plan?.room3d, "walls"));
      if (walls.length > 0) return { floorPlanId: asset.floorPlanId, walls: fromOwnerFloorPlan(walls) };
    }

    if (asset.listingId) {
      const listing = await this.getPrisma().tradeListing.findUnique({
        where: { id: asset.listingId },
        select: { floorPlan: true }
      });
      // 매물 스냅샷은 서버 FloorPlan row가 아니므로 floorPlanId는 null로 반환(register 연결 대상 아님).
      const walls = parseOwnerWalls3D(extractJsonField(listing?.floorPlan, "walls3D"));
      if (walls.length > 0) return { floorPlanId: null, walls: fromOwnerFloorPlan(walls) };

      // walls3D가 비어 있어도 도면 이미지 업로드 경로(mitunet)만 채워진 매물이 있다
      // (trade.service.ts normalizeFloorPlan — 이미지 업로드는 walls3D를 만들지 않는다).
      // mitunet-floor-plan-walls.ts가 폴리곤 변을 그대로 세그먼트로 흘려 자동정합을 계속 진행시킨다
      // (예전엔 폴리곤마다 OBB를 씌워 박스로 근사했으나, 실데이터 다수가 링 위상이라 방 전체를 덮는
      // 상자 하나로 뭉개져 걷어냈다).
      const mitunetSegments = mitunetToWallSegments(extractJsonField(listing?.floorPlan, "mitunet"));
      if (mitunetSegments.segments.length > 0) return { floorPlanId: null, walls: mitunetSegments };
    }

    return null;
  }

  /** SplatAsset.captureFloorPlan(Json?)에 저장된 roomplan.json을 검증해 돌려준다. 없으면 null. */
  private resolveStoredCaptureFloorPlan(asset: { captureFloorPlan: unknown }): RoomPlanCaptureFloorPlan | null {
    if (asset.captureFloorPlan == null) return null;
    return parseCaptureFloorPlanValue(asset.captureFloorPlan);
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

  /** 실패한 재구성 작업을 기존 소스 또는 새 영상/캡처 zip으로 다시 큐에 넣는다. */
  async requeueReconstruction(id: string, file?: UploadedSplatAssetFile) {
    const asset = await this.getById(id);
    if (asset.status !== "FAILED") {
      throw new ConflictException("실패한 3D 재구성 작업만 다시 시도할 수 있습니다.");
    }

    let replacement: { videoUrl: string; fileKind: "video" | "record3d-zip"; sizeBytes: number } | undefined;
    if (file) {
      if (!file.buffer?.length) throw new BadRequestException("업로드할 파일이 비어 있습니다.");
      if (file.buffer.length > MAX_UPLOAD_BYTES) {
        throw new BadRequestException("영상 또는 캡처 zip은 800MB 이하만 접수할 수 있습니다.");
      }

      const classification = classifyIntakeFile(file.originalname, file.mimetype);
      if (classification.kind === "splat") {
        throw new BadRequestException("재구성 재시도에는 영상 또는 캡처 zip 파일만 사용할 수 있습니다.");
      }

      const stored = await this.storageAdapter.save({
        buffer: file.buffer,
        fileName: safeUploadedFileName(`splat-${classification.kind}`, file.originalname, classification.extension),
        mimeType: file.mimetype
      });
      replacement = {
        videoUrl: stored.fileUrl,
        fileKind: classification.fileKind,
        sizeBytes: file.buffer.length
      };
    }

    return this.getPrisma().splatAsset.update({
      where: { id },
      data: {
        ...(replacement ?? {}),
        status: "PROCESSING",
        jobState: "QUEUED",
        jobError: null,
        jobAttempts: 0,
        jobCommandId: null,
        jobStartedAt: null
      }
    });
  }

  async findListingOwnerId(listingId: string): Promise<string | null> {
    // 1순위: trade runtime truth(JSON 스토어) — 프로젝션 지연/실패와 무관하게 최신.
    const live = this.tradeService?.listListings().find((listing) => listing.id === listingId);
    if (live?.ownerId) return live.ownerId;

    // 폴백: DB 프로젝션 (tradeService 미주입 컨텍스트 — 단위테스트 등).
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
