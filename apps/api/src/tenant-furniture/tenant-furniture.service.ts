import { randomUUID } from "node:crypto";
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

type FurnitureDimensionsMm = TenantFurnitureContract.FurnitureDimensionsMm;
type RoomPlanImportObject = TenantFurnitureContract.RoomPlanImportObject;
type RoomPlanImportPayload = TenantFurnitureContract.RoomPlanImportPayload;
type TenantFurniture = TenantFurnitureContract.TenantFurniture;
type TenantFurnitureCategory = TenantFurnitureContract.TenantFurnitureCategory;
type TenantFurniturePlacement = TenantFurnitureContract.TenantFurniturePlacement;
type TenantFurniturePlacementItem = TenantFurnitureContract.TenantFurniturePlacementItem;
type TenantFurnitureSource = TenantFurnitureContract.TenantFurnitureSource;

export const TENANT_FURNITURE_DATABASE_URL = "TENANT_FURNITURE_DATABASE_URL";

export interface TenantFurnitureUpdateInput {
  label?: string | null;
  sizeMm?: FurnitureDimensionsMm;
}

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

  private async requireOwner(id: string, ownerTenantId: string): Promise<PrismaTenantFurniture> {
    const row = await this.getPrisma().tenantFurniture.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`임차인 가구를 찾을 수 없습니다: ${id}`);
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
