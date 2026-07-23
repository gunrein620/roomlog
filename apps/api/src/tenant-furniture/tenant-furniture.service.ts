import { randomUUID } from "node:crypto";
import { basename, extname, resolve } from "node:path";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  Prisma,
  PrismaClient,
  type TenantFurniture as PrismaTenantFurniture,
  type TenantFurniturePlacement as PrismaTenantFurniturePlacement
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
// API tsconfig의 node10 해석은 package.json exports를 읽지 못한다. 동결 계약의 정확한
// 서브패스를 유지하며, 이 type-only import는 런타임 require로 emit되지 않는다.
import type * as TenantFurnitureContract from "@roomlog/types/tenant-furniture";
import { createFileStorageAdapter, type FileStorageAdapter } from "../roomlog/storage.service";
import {
  createMeshConversionDispatcher,
  type MeshConversionDispatcher
} from "./mesh-conversion-dispatcher";

type FurnitureDimensionsMm = TenantFurnitureContract.FurnitureDimensionsMm;
type ObjectCaptureCompleteRequest = TenantFurnitureContract.ObjectCaptureCompleteRequest;
type ObjectCapturePresignRequest = TenantFurnitureContract.ObjectCapturePresignRequest;
type ObjectCapturePresignResponse = TenantFurnitureContract.ObjectCapturePresignResponse;
type RoomPlanImportObject = TenantFurnitureContract.RoomPlanImportObject;
type RoomPlanImportPayload = TenantFurnitureContract.RoomPlanImportPayload;
type TenantFurniture = TenantFurnitureContract.TenantFurniture;
type TenantFurnitureCategory = TenantFurnitureContract.TenantFurnitureCategory;
type TenantFurniturePlacement = TenantFurnitureContract.TenantFurniturePlacement;
type TenantFurnitureMeshJobState = TenantFurnitureContract.TenantFurnitureMeshJobState;
type TenantFurniturePlacementItem = TenantFurnitureContract.TenantFurniturePlacementItem;
type TenantFurnitureSource = TenantFurnitureContract.TenantFurnitureSource;

export const TENANT_FURNITURE_DATABASE_URL = "TENANT_FURNITURE_DATABASE_URL";

export interface TenantFurnitureUpdateInput {
  label?: string | null;
  sizeMm?: FurnitureDimensionsMm;
}

/** multer FileInterceptor 산출 — roomlog.controller.ts의 동명 로컬 타입과 형태 동일. */
export interface UploadedImageFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

// ─── 가구 썸네일 업로드 ──────────────────────────────────────────────────
const THUMBNAIL_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

// ─── Object Capture(iOS) → S3 직접 업로드 (C-2) ────────────────────────────
const OBJECT_CAPTURE_EXTENSION = ".usdz";
// "수십 MB" 스캔치고 넉넉한 상한 — splat-asset의 직접업로드 한도(2GB)보다 훨씬 보수적으로 잡는다.
const MAX_OBJECT_CAPTURE_BYTES = 300 * 1024 * 1024;
const MAX_OBJECT_CAPTURE_MESSAGE = "Object Capture 스캔은 300MB 이하만 접수할 수 있습니다.";
// [2026-07-20 해소] Object Capture가 미터 스케일을 주는지 → **준다.** 실캡처 USDZ 검사 결과
// metersPerUnit=1 · xformOp 0개 · extent 0.727×0.806×0.775m 이 줄자 실측과 일치. 앵커 규약도 확정
// (원점=발자국 중심, 바닥=y0, Y-up) → 박스-메시 정렬의 남은 자유도는 yaw 하나.
// 그럼에도 이 값이 남아 있는 이유: **USDZ bbox를 치수로 쓸 수 없다.** X·Z가 촬영 바운딩 박스 벽면에
// 잘려 실물보다 크게 나온다(대칭 extent가 그 증거). 치수의 정본은 RoomPlan 박스이고, RoomPlan 항목
// 없이 들어온 단독 스캔은 아직 실치수 출처가 없다 → 그 경우에만 자리표시자로 시작(C-2b).
const PLACEHOLDER_OBJECT_CAPTURE_SIZE_MM: FurnitureDimensionsMm = { width: 500, depth: 500, height: 500 };

const ROOMPLAN_CATEGORY_BY_NORMALIZED_RAW: Record<string, TenantFurnitureCategory> = {
  bed: "bed",
  sofa: "sofa",
  chair: "chair",
  table: "table",
  storage: "storage",
  refrigerator: "refrigerator",
  washerdryer: "washerDryer",
  stove: "stove",
  oven: "oven",
  dishwasher: "dishwasher",
  television: "television",
  sink: "sink",
  toilet: "toilet",
  bathtub: "bathtub",
  fireplace: "fireplace",
  stairs: "stairs"
};

/** RoomPlan rawValue를 대소문자·공백·구분자에 관대하게 저장 카테고리로 정규화한다. */
export function mapRoomPlanCategory(raw: string): TenantFurnitureCategory {
  const normalized = typeof raw === "string"
    ? raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
  return ROOMPLAN_CATEGORY_BY_NORMALIZED_RAW[normalized] ?? "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestException(`${field}는 비어 있지 않은 문자열이어야 합니다.`);
  }
  return value.trim();
}

function roundedPositiveInt(value: unknown, field: string, multiplier = 1): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${field}는 0보다 큰 유한한 숫자여야 합니다.`);
  }

  const rounded = Math.round(value * multiplier);
  if (rounded <= 0 || !Number.isSafeInteger(rounded) || rounded > 2_147_483_647) {
    throw new BadRequestException(`${field}를 유효한 밀리미터 정수로 변환할 수 없습니다.`);
  }
  return rounded;
}

function roomPlanDimensions(object: RoomPlanImportObject, index: number): FurnitureDimensionsMm {
  if (!isRecord(object) || !isRecord(object.dimensions)) {
    throw new BadRequestException(`objects[${index}].dimensions가 필요합니다.`);
  }

  return {
    width: roundedPositiveInt(object.dimensions.w, `objects[${index}].dimensions.w`, 1000),
    depth: roundedPositiveInt(object.dimensions.d, `objects[${index}].dimensions.d`, 1000),
    height: roundedPositiveInt(object.dimensions.h, `objects[${index}].dimensions.h`, 1000)
  };
}

function validateRoomPlanPayload(payload: RoomPlanImportPayload): RoomPlanImportObject[] {
  if (!isRecord(payload) || payload.source !== "roomplan") {
    throw new BadRequestException("source는 roomplan이어야 합니다.");
  }
  if (!Array.isArray(payload.objects)) {
    throw new BadRequestException("objects는 배열이어야 합니다.");
  }
  if (payload.capturedAt !== undefined) {
    const capturedAt = requireNonEmptyString(payload.capturedAt, "capturedAt");
    if (Number.isNaN(Date.parse(capturedAt))) {
      throw new BadRequestException("capturedAt는 ISO 8601 날짜여야 합니다.");
    }
  }

  return payload.objects.map((object, index) => {
    if (!isRecord(object) || typeof object.category !== "string") {
      throw new BadRequestException(`objects[${index}].category는 문자열이어야 합니다.`);
    }
    roomPlanDimensions(object as RoomPlanImportObject, index);
    return object as unknown as RoomPlanImportObject;
  });
}

function parseUpdateInput(input: TenantFurnitureUpdateInput): TenantFurnitureUpdateInput {
  if (!isRecord(input)) {
    throw new BadRequestException("수정할 label 또는 sizeMm가 필요합니다.");
  }

  const parsed: TenantFurnitureUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(input, "label")) {
    if (input.label !== null && typeof input.label !== "string") {
      throw new BadRequestException("label은 문자열 또는 null이어야 합니다.");
    }
    parsed.label = typeof input.label === "string" ? input.label.trim() || null : null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "sizeMm")) {
    if (!isRecord(input.sizeMm)) {
      throw new BadRequestException("sizeMm는 width, depth, height를 포함해야 합니다.");
    }
    parsed.sizeMm = {
      width: roundedPositiveInt(input.sizeMm.width, "sizeMm.width"),
      depth: roundedPositiveInt(input.sizeMm.depth, "sizeMm.depth"),
      height: roundedPositiveInt(input.sizeMm.height, "sizeMm.height")
    };
  }

  if (!("label" in parsed) && !parsed.sizeMm) {
    throw new BadRequestException("수정할 label 또는 sizeMm가 필요합니다.");
  }
  return parsed;
}

const THUMBNAIL_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

function extensionForThumbnailMime(mimeType: string): string {
  return THUMBNAIL_EXTENSION_BY_MIME[mimeType] ?? ".img";
}

function requireUsdzFileName(fileName: string): void {
  if (extname(fileName).toLowerCase() !== OBJECT_CAPTURE_EXTENSION) {
    throw new BadRequestException("Object Capture 업로드는 .usdz 파일만 접수할 수 있습니다.");
  }
}

function safeObjectCaptureFileName(originalName: string): string {
  const uploadId = randomUUID().slice(0, 12);
  const safeBaseName =
    basename(originalName, extname(originalName))
      .replace(/[^a-zA-Z0-9가-힣_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "object-capture";
  return `object-capture-${uploadId}-${safeBaseName}${OBJECT_CAPTURE_EXTENSION}`;
}

function parsePlacementItems(input: { items: TenantFurniturePlacementItem[] }): TenantFurniturePlacementItem[] {
  if (!isRecord(input) || !Array.isArray(input.items)) {
    throw new BadRequestException("items는 배열이어야 합니다.");
  }

  return input.items.map((item, index) => {
    if (!isRecord(item)) {
      throw new BadRequestException(`items[${index}] 형식이 올바르지 않습니다.`);
    }
    const furnitureId = requireNonEmptyString(item.furnitureId, `items[${index}].furnitureId`);
    if (
      !Array.isArray(item.position) ||
      item.position.length !== 2 ||
      !item.position.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    ) {
      throw new BadRequestException(`items[${index}].position은 유한한 숫자 두 개여야 합니다.`);
    }
    if (typeof item.rotation !== "number" || !Number.isFinite(item.rotation)) {
      throw new BadRequestException(`items[${index}].rotation은 유한한 숫자여야 합니다.`);
    }

    return {
      furnitureId,
      position: [item.position[0], item.position[1]],
      rotation: item.rotation
    };
  });
}

function furnitureView(row: PrismaTenantFurniture): TenantFurniture {
  return {
    id: row.id,
    ownerTenantId: row.ownerTenantId,
    importBatchId: row.importBatchId ?? null,
    category: row.category as TenantFurnitureCategory,
    label: row.label,
    sizeMm: {
      width: row.widthMm,
      depth: row.depthMm,
      height: row.heightMm
    },
    source: row.source as TenantFurnitureSource,
    meshUrl: row.meshUrl,
    usdzUrl: row.usdzUrl,
    meshJobState: row.meshJobState as TenantFurnitureMeshJobState | null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

function placementView(row: PrismaTenantFurniturePlacement): TenantFurniturePlacement {
  return {
    id: row.id,
    tenantId: row.tenantId,
    listingId: row.listingId,
    items: row.items as unknown as TenantFurniturePlacementItem[],
    updatedAt: row.updatedAt.toISOString()
  };
}

@Injectable()
export class TenantFurnitureService {
  private readonly logger = new Logger(TenantFurnitureService.name);
  private readonly prisma?: PrismaClient;
  // splat-asset.service와 동일 기본값 — S3_UPLOADS_ENABLED가 켜지면 자동으로 S3 어댑터로 전환된다.
  private readonly storageAdapter: FileStorageAdapter = createFileStorageAdapter(
    process.env,
    resolve(process.env.LOCAL_UPLOAD_DIR || "uploads"),
    process.env.PUBLIC_UPLOAD_BASE_URL || "/api/files"
  );
  // env에 따라 SSM 또는 기존 HTTP 경로를 고른다. 선택한 경로의 필수값이 비면 dispatch() 즉시 실패하는
  // UnconfiguredMeshConversionDispatcher를 쓴다. 테스트는 이 필드를 직접 교체한다.
  private readonly meshConversionDispatcher: MeshConversionDispatcher = createMeshConversionDispatcher(
    process.env
  );

  constructor(
    @Optional()
    @Inject(TENANT_FURNITURE_DATABASE_URL)
    databaseUrl?: string
  ) {
    const resolvedDatabaseUrl =
      databaseUrl?.trim() ||
      process.env.TENANT_FURNITURE_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim();
    if (resolvedDatabaseUrl) {
      const adapter = new PrismaPg({ connectionString: resolvedDatabaseUrl });
      this.prisma = new PrismaClient({ adapter });
    }
  }

  private getPrisma(): PrismaClient {
    if (!this.prisma) {
      throw new ServiceUnavailableException(
        "DATABASE_URL이 설정되어야 임차인 가구를 저장할 수 있습니다."
      );
    }
    return this.prisma;
  }

  async importRoomPlan(ownerTenantId: string, payload: RoomPlanImportPayload): Promise<TenantFurniture[]> {
    const objects = validateRoomPlanPayload(payload);
    const importBatchId = `tfb_${randomUUID()}`;
    const prepared = objects.map((object, index) => ({
      id: `tf_${randomUUID()}`,
      category: mapRoomPlanCategory(object.category),
      sizeMm: roomPlanDimensions(object, index)
    }));
    const prisma = this.getPrisma();
    const rows = await prisma.$transaction(
      prepared.map((item) =>
        prisma.tenantFurniture.create({
          data: {
            id: item.id,
            ownerTenantId,
            importBatchId,
            category: item.category,
            label: null,
            widthMm: item.sizeMm.width,
            depthMm: item.sizeMm.depth,
            heightMm: item.sizeMm.height,
            source: "roomplan",
            meshUrl: null
          }
        })
      )
    );
    return rows.map(furnitureView);
  }

  async list(ownerTenantId: string): Promise<TenantFurniture[]> {
    const rows = await this.getPrisma().tenantFurniture.findMany({
      where: { ownerTenantId },
      orderBy: { createdAt: "desc" }
    });
    return rows.map(furnitureView);
  }

  async update(
    id: string,
    ownerTenantId: string,
    input: TenantFurnitureUpdateInput
  ): Promise<TenantFurniture> {
    await this.requireOwner(id, ownerTenantId);
    const parsed = parseUpdateInput(input);
    const row = await this.getPrisma().tenantFurniture.update({
      where: { id },
      data: {
        ...(Object.prototype.hasOwnProperty.call(parsed, "label") ? { label: parsed.label } : {}),
        ...(parsed.sizeMm
          ? {
              widthMm: parsed.sizeMm.width,
              depthMm: parsed.sizeMm.depth,
              heightMm: parsed.sizeMm.height
            }
          : {})
      }
    });
    return furnitureView(row);
  }

  /**
   * 정사각 썸네일 이미지를 업로드하고 thumbnailUrl에 기록한다. 같은 가구에 다시 호출하면
   * thumbnailUrl만 새 값으로 교체된다 — 이전 저장 객체 정리(스토리지에서 삭제)는 스코프 밖.
   */
  async uploadThumbnail(
    ownerTenantId: string,
    furnitureId: string,
    file: UploadedImageFile
  ): Promise<TenantFurniture> {
    await this.requireOwner(furnitureId, ownerTenantId);

    if (!THUMBNAIL_ALLOWED_MIME_TYPES.has(file.mimeType)) {
      throw new BadRequestException("썸네일은 jpeg, png, webp 이미지만 업로드할 수 있습니다.");
    }
    if (!file.buffer.length) {
      throw new BadRequestException("업로드할 썸네일 이미지가 비어 있습니다.");
    }
    if (file.buffer.length > MAX_THUMBNAIL_BYTES) {
      throw new BadRequestException("썸네일 이미지는 5MB 이하만 업로드할 수 있습니다.");
    }

    const extension = extensionForThumbnailMime(file.mimeType);
    const fileName = `furniture-thumbnail-${furnitureId}-${randomUUID().slice(0, 8)}${extension}`;
    const storedFile = await this.storageAdapter.save({
      buffer: file.buffer,
      fileName,
      mimeType: file.mimeType,
      keyPrefix: "tenant-furniture-thumbnails"
    });

    const row = await this.getPrisma().tenantFurniture.update({
      where: { id: furnitureId },
      data: { thumbnailUrl: storedFile.fileUrl }
    });
    return furnitureView(row);
  }

  async remove(id: string, ownerTenantId: string): Promise<{ id: string; deleted: true }> {
    await this.requireOwner(id, ownerTenantId);
    await this.getPrisma().tenantFurniture.delete({ where: { id } });
    return { id, deleted: true };
  }

  async removeImportBatch(
    batchId: string,
    ownerTenantId: string
  ): Promise<{ batchId: string; deletedCount: number }> {
    const normalizedBatchId = requireNonEmptyString(batchId, "batchId");
    await this.requireBatchOwner(normalizedBatchId, ownerTenantId);
    const result = await this.getPrisma().tenantFurniture.deleteMany({
      where: { ownerTenantId, importBatchId: normalizedBatchId }
    });
    return { batchId: normalizedBatchId, deletedCount: result.count };
  }

  async getPlacement(tenantId: string, listingId: string): Promise<TenantFurniturePlacement | null> {
    const normalizedListingId = requireNonEmptyString(listingId, "listingId");
    const row = await this.getPrisma().tenantFurniturePlacement.findUnique({
      where: { tenantId_listingId: { tenantId, listingId: normalizedListingId } }
    });
    return row ? placementView(row) : null;
  }

  async putPlacement(
    tenantId: string,
    listingId: string,
    input: { items: TenantFurniturePlacementItem[] }
  ): Promise<TenantFurniturePlacement> {
    const normalizedListingId = requireNonEmptyString(listingId, "listingId");
    const items = parsePlacementItems(input);
    await this.requireOwnedPlacementItems(tenantId, items);

    const row = await this.getPrisma().tenantFurniturePlacement.upsert({
      where: { tenantId_listingId: { tenantId, listingId: normalizedListingId } },
      create: {
        id: `tfp_${randomUUID()}`,
        tenantId,
        listingId: normalizedListingId,
        items: items as unknown as Prisma.InputJsonValue
      },
      update: { items: items as unknown as Prisma.InputJsonValue }
    });
    return placementView(row);
  }

  // ─── Object Capture(iOS) → S3 직접 업로드 (C-2) ────────────────────────────

  /** 브라우저(iOS 앱)가 USDZ 원본을 S3로 직접 PUT할 수 있도록 1시간짜리 서명을 발급한다. */
  async presignObjectCapture(
    ownerTenantId: string,
    input: ObjectCapturePresignRequest
  ): Promise<ObjectCapturePresignResponse> {
    const fileName = requireNonEmptyString(input.fileName, "fileName");
    requireUsdzFileName(fileName);
    if (typeof input.sizeBytes !== "number" || !Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
      throw new BadRequestException("sizeBytes는 0보다 큰 숫자여야 합니다.");
    }
    if (input.sizeBytes > MAX_OBJECT_CAPTURE_BYTES) {
      throw new BadRequestException(MAX_OBJECT_CAPTURE_MESSAGE);
    }
    if (input.furnitureId) {
      // 업그레이드 대상 소유권을 presign 단계에서부터 강제 — 남의 가구에 USDZ를 못 올리게 막는다.
      await this.requireOwner(input.furnitureId, ownerTenantId);
    }

    if (!this.storageAdapter.presignUpload) {
      // 로컬(S3 비활성) 개발 환경 신호 — 이 스코프는 멀티파트 폴백을 구현하지 않는다(원칙: 벌크는 S3 직행).
      return { mode: "multipart" };
    }

    const key = `object-capture/${ownerTenantId}/${safeObjectCaptureFileName(fileName)}`;
    const presigned = await this.storageAdapter.presignUpload({
      key,
      mimeType: input.mimeType?.trim() || "model/vnd.usdz+zip",
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

  /**
   * S3 직접 업로드를 HEAD로 검증한 뒤 USDZ를 가구 행에 기록하고 변환을 큐잉한다.
   * furnitureId가 있으면 기존 가구(roomplan/manual 등)의 메시 업그레이드, 없으면 새 가구를 만든다
   * (치수는 온디바이스 스케일 검증 전까지 자리표시자 — PLACEHOLDER_OBJECT_CAPTURE_SIZE_MM).
   */
  async completeObjectCapture(
    ownerTenantId: string,
    input: ObjectCaptureCompleteRequest
  ): Promise<TenantFurniture> {
    const key = requireNonEmptyString(input.key, "key");
    const expectedPrefix = `object-capture/${ownerTenantId}/`;
    if (!key.startsWith(expectedPrefix)) {
      throw new ForbiddenException("본인에게 발급된 업로드 키가 아닙니다.");
    }
    // 업그레이드 대상 소유권은 S3를 건드리기 전에 먼저 확인한다(키 프리픽스만으로는 furnitureId가
    // 이 테넌트 소유인지 보장 못 함 — 남의 furnitureId를 자기 키에 실어 보낼 수 있어서).
    if (input.furnitureId) {
      await this.requireOwner(input.furnitureId, ownerTenantId);
    }

    const head = await this.storageAdapter.headObject?.(key);
    if (!head || !Number.isFinite(head.sizeBytes) || head.sizeBytes <= 0) {
      throw new BadRequestException("업로드가 완료되지 않았습니다.");
    }
    if (head.sizeBytes > MAX_OBJECT_CAPTURE_BYTES) {
      throw new BadRequestException(MAX_OBJECT_CAPTURE_MESSAGE);
    }

    const usdzUrl = this.storageAdapter.publicUrl?.(key);
    if (!usdzUrl) {
      throw new BadRequestException("직접 업로드를 지원하지 않는 저장소입니다.");
    }

    const prisma = this.getPrisma();
    let row: PrismaTenantFurniture;
    if (input.furnitureId) {
      // iOS 캡처 플로우는 항상 furnitureId를 채워 이 분기로 들어온다 — 이름 화면에서 입력한
      // label도 여기서 반영해야 한다(건너뛰기 시 필드 자체가 안 오므로 undefined면 보존).
      row = await prisma.tenantFurniture.update({
        where: { id: input.furnitureId },
        data: {
          usdzUrl,
          ...(input.label !== undefined ? { label: input.label.trim() || null } : {})
        }
      });
    } else {
      row = await prisma.tenantFurniture.create({
        data: {
          id: `tf_${randomUUID()}`,
          ownerTenantId,
          category: input.category ?? "unknown",
          label: input.label?.trim() || null,
          widthMm: PLACEHOLDER_OBJECT_CAPTURE_SIZE_MM.width,
          depthMm: PLACEHOLDER_OBJECT_CAPTURE_SIZE_MM.depth,
          heightMm: PLACEHOLDER_OBJECT_CAPTURE_SIZE_MM.height,
          source: "object-capture",
          meshUrl: null,
          usdzUrl
        }
      });
    }

    const queued = await this.queueMeshConversion(row);
    return furnitureView(queued);
  }

  /**
   * USDZ→GLB 변환 잡 훅 — 상태를 CONVERTING으로 올린 뒤 mesh-worker에 실제 변환 잡을 디스패치한다
   * ("잡 레코드" = 이 가구 행 자체, 별도 테이블 없음). 변환은 CPU 작업(Blender headless)이며,
   * 디스패처는 GPU 인스턴스의 기동/정지 수명주기를 맡지 않는다. HTTP는 상시 컨테이너에, SSM은 켜져
   * 있고 online인 GPU 박스에서 레포·NVMe·이미지를 먼저 복구한 뒤 일회성 컨테이너에 보낸다
   * (mesh-conversion-dispatcher.ts).
   * 디스패치 자체가 실패하면(워커 미배선·presign 불가 등) CONVERTING에 조용히 머무르지 않고 즉시
   * FAILED로 떨어뜨린다 — "빈 상태·오류를 데모로 은폐 금지" 원칙. 기존 meshUrl(업그레이드 전 값)은
   * 건드리지 않는다.
   */
  async queueMeshConversion(furniture: PrismaTenantFurniture): Promise<PrismaTenantFurniture> {
    const converting = await this.getPrisma().tenantFurniture.update({
      where: { id: furniture.id },
      data: { meshJobState: "CONVERTING" }
    });

    try {
      await this.dispatchMeshConversion(converting);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`메시 변환 디스패치 실패 furniture=${furniture.id}: ${message}`);
      return this.getPrisma().tenantFurniture.update({
        where: { id: furniture.id },
        data: { meshJobState: "FAILED" }
      });
    }

    return converting;
  }

  /** GLB 업로드용 presigned PUT을 발급하고 워커에 잡을 던진다. 실패하면 그대로 던져 호출자가 처리한다. */
  private async dispatchMeshConversion(furniture: PrismaTenantFurniture): Promise<void> {
    if (!furniture.usdzUrl) {
      throw new Error("usdzUrl 없이 변환을 큐잉할 수 없습니다.");
    }
    if (!this.storageAdapter.presignUpload) {
      // 로컬(S3 비활성) 개발 환경 — presignObjectCapture와 동일하게 이 스코프는 멀티파트 폴백을 구현하지 않는다.
      throw new Error("GLB 업로드를 위해 S3 저장소가 필요합니다(로컬 개발 환경은 변환을 지원하지 않습니다).");
    }

    const key = `object-capture-glb/${furniture.ownerTenantId}/${furniture.id}-${randomUUID().slice(0, 8)}.glb`;
    const presigned = await this.storageAdapter.presignUpload({
      key,
      mimeType: "model/gltf-binary",
      expiresInSeconds: 3600
    });

    await this.meshConversionDispatcher.dispatch({
      furnitureId: furniture.id,
      usdzUrl: furniture.usdzUrl,
      glbUploadUrl: presigned.uploadUrl,
      glbUploadHeaders: presigned.headers,
      glbPublicUrl: presigned.publicUrl
    });
  }

  /**
   * mesh-worker 콜백(성공) — GLB URL을 붙이고 source를 object-capture로 승격한다. 업그레이드 대상(기존
   * roomplan/manual 가구)은 변환이 끝나기 전까지 원래 source로 회색 박스를 그대로 렌더해야 하므로,
   * source 전환은 여기(완료 시점)에서만 일어난다 — 새로 만든 가구는 생성 시점에 이미 object-capture라
   * 여기서는 멱등한 재확인이다.
   */
  async completeMeshConversion(furnitureId: string, glbUrl: string): Promise<TenantFurniture> {
    await this.requireExists(furnitureId);
    const row = await this.getPrisma().tenantFurniture.update({
      where: { id: furnitureId },
      data: { meshUrl: glbUrl, source: "object-capture", meshJobState: "DONE" }
    });
    return furnitureView(row);
  }

  /** 워커 콜백(실패) — 잡 상태만 FAILED로 남긴다. 기존 meshUrl(업그레이드 전 값)은 건드리지 않는다. */
  async markMeshConversionFailed(furnitureId: string, error: string): Promise<TenantFurniture> {
    await this.requireExists(furnitureId);
    this.logger.warn(`메시 변환 워커 실패 콜백 furniture=${furnitureId}: ${error}`);
    const row = await this.getPrisma().tenantFurniture.update({
      where: { id: furnitureId },
      data: { meshJobState: "FAILED" }
    });
    return furnitureView(row);
  }

  private async requireExists(id: string): Promise<PrismaTenantFurniture> {
    const row = await this.getPrisma().tenantFurniture.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`임차인 가구를 찾을 수 없습니다: ${id}`);
    return row;
  }

  private async requireOwner(id: string, ownerTenantId: string): Promise<PrismaTenantFurniture> {
    const row = await this.requireExists(id);
    if (row.ownerTenantId !== ownerTenantId) {
      throw new ForbiddenException("본인 소유 가구만 수정하거나 삭제할 수 있습니다.");
    }
    return row;
  }

  private async requireBatchOwner(
    importBatchId: string,
    ownerTenantId: string
  ): Promise<PrismaTenantFurniture> {
    const prisma = this.getPrisma();
    const ownedRow = await prisma.tenantFurniture.findFirst({
      where: { importBatchId, ownerTenantId }
    });
    if (ownedRow) return ownedRow;

    const existingRow = await prisma.tenantFurniture.findFirst({ where: { importBatchId } });
    if (!existingRow) {
      throw new NotFoundException(`RoomPlan 가져오기 배치를 찾을 수 없습니다: ${importBatchId}`);
    }
    throw new ForbiddenException("본인 소유 RoomPlan 가져오기 배치만 삭제할 수 있습니다.");
  }

  private async requireOwnedPlacementItems(
    tenantId: string,
    items: TenantFurniturePlacementItem[]
  ): Promise<void> {
    const ids = [...new Set(items.map((item) => item.furnitureId))];
    if (ids.length === 0) return;

    const owned = await this.getPrisma().tenantFurniture.findMany({
      where: { id: { in: ids }, ownerTenantId: tenantId },
      select: { id: true }
    });
    if (owned.length !== ids.length) {
      throw new ForbiddenException("배치안에는 본인 소유 가구만 포함할 수 있습니다.");
    }
  }
}
