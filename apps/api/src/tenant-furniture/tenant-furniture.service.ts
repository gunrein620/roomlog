import { randomUUID } from "node:crypto";
import { basename, extname, resolve } from "node:path";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
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

// ─── Object Capture(iOS) → S3 직접 업로드 (C-2) ────────────────────────────
const OBJECT_CAPTURE_EXTENSION = ".usdz";
// "수십 MB" 스캔치고 넉넉한 상한 — splat-asset의 직접업로드 한도(2GB)보다 훨씬 보수적으로 잡는다.
const MAX_OBJECT_CAPTURE_BYTES = 300 * 1024 * 1024;
const MAX_OBJECT_CAPTURE_MESSAGE = "Object Capture 스캔은 300MB 이하만 접수할 수 있습니다.";
// 박스-메시 정합(스케일/방향)은 보류 — Object Capture가 미터 스케일을 주는지 온디바이스 검증 전까지,
// 새로 생성되는 가구는 이 자리표시자 치수로 시작한다(변환 완료 후에도 실측 갱신은 별도 작업, C-2b).
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
  private readonly prisma?: PrismaClient;
  // splat-asset.service와 동일 기본값 — S3_UPLOADS_ENABLED가 켜지면 자동으로 S3 어댑터로 전환된다.
  private readonly storageAdapter: FileStorageAdapter = createFileStorageAdapter(
    process.env,
    resolve(process.env.LOCAL_UPLOAD_DIR || "uploads"),
    process.env.PUBLIC_UPLOAD_BASE_URL || "/api/files"
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

  async remove(id: string, ownerTenantId: string): Promise<{ id: string; deleted: true }> {
    await this.requireOwner(id, ownerTenantId);
    await this.getPrisma().tenantFurniture.delete({ where: { id } });
    return { id, deleted: true };
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
      row = await prisma.tenantFurniture.update({
        where: { id: input.furnitureId },
        data: { usdzUrl }
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
   * USDZ→GLB 변환 잡 훅 — 지금은 상태만 CONVERTING으로 올린다("잡 레코드" = 이 가구 행 자체, 별도
   * 테이블 없음). TODO: GPU 박스에 실제 USDZ→GLB 잡을 디스패치한다(변환 도구 = 인프라, 아직 미설치).
   * reconstruction 모듈의 큐→인스턴스 기동→SSM 잡 패턴(gpu-instance.service.ts,
   * reconstruction-orchestrator.service.ts)을 그대로 재사용할 자리 — 지금은 받는 쪽 배선만 완성해둔다.
   */
  async queueMeshConversion(furniture: PrismaTenantFurniture): Promise<PrismaTenantFurniture> {
    return this.getPrisma().tenantFurniture.update({
      where: { id: furniture.id },
      data: { meshJobState: "CONVERTING" }
    });
  }

  /**
   * GPU 콜백(성공) — GLB URL을 붙이고 source를 object-capture로 승격한다. 업그레이드 대상(기존
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

  /** GPU 콜백(실패) — 잡 상태만 FAILED로 남긴다. 기존 meshUrl(업그레이드 전 값)은 건드리지 않는다. */
  async markMeshConversionFailed(furnitureId: string, error: string): Promise<TenantFurniture> {
    await this.requireExists(furnitureId);
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
