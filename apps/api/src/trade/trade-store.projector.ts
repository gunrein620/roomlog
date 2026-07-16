import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ListingFloorPlan, TradeListing } from "./trade.service";

/**
 * 직접등록 매물(TradeListing)을 RDS Postgres로 write-through 프로젝션한다.
 * roomlog의 PrismaStoreProjector와 같은 패턴 — JSON 스토어가 런타임 truth이고
 * 이 프로젝터는 부팅 시 하이드레이트(load)와 변경 시 영속화(persist)만 담당한다.
 * Phase 1은 매물(listing)만 — 스레드/계약은 아직 JSON 스토어에 남는다.
 */
export class TradeStoreProjector {
  private readonly prisma: PrismaClient;

  constructor(databaseUrl: string) {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    this.prisma = new PrismaClient({ adapter });
  }

  /** 부팅 하이드레이트 — DB의 매물을 앱 도메인 형태로 되돌린다. DB 미도달 시 undefined(→ JSON 폴백). */
  async load(): Promise<TradeListing[] | undefined> {
    try {
      const rows = await this.prisma.tradeListing.findMany({ orderBy: { createdAt: "desc" } });
      return rows.map((row) => {
        const detailAddress = (row as unknown as { detailAddress?: string | null }).detailAddress?.trim();
        const buildingName = (row as unknown as { buildingName?: string | null }).buildingName?.trim();
        const specRow = row as unknown as {
          exclusiveAreaM2?: number | null;
          floorInfo?: string | null;
          maintenanceFeeManwon?: number | null;
        };
        const floorInfo = specRow.floorInfo?.trim();
        return {
          id: row.id,
          ownerId: row.ownerId,
          ownerName: row.ownerName,
          title: row.title,
          roomType: row.roomType,
          tradeType: normalizeTradeType(row.tradeType),
          depositManwon: row.depositManwon,
          monthlyRentManwon: row.monthlyRentManwon,
          location: row.location,
          ...(detailAddress ? { detailAddress } : {}),
          ...(buildingName ? { buildingName } : {}),
          ...(specRow.exclusiveAreaM2 != null ? { exclusiveAreaM2: specRow.exclusiveAreaM2 } : {}),
          ...(floorInfo ? { floorInfo } : {}),
          ...(specRow.maintenanceFeeManwon != null ? { maintenanceFeeManwon: specRow.maintenanceFeeManwon } : {}),
          description: row.description,
          options: normalizeStringArray((row as unknown as { options?: unknown }).options),
          images: Array.isArray(row.images) ? row.images : [],
          ...(row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : {}),
          ...(row.floorPlan ? { floorPlan: row.floorPlan as unknown as ListingFloorPlan } : {}),
          status: row.status === "계약완료" ? "계약완료" : "노출중",
          createdAt: row.createdAt.toISOString()
        };
      });
    } catch {
      return undefined; // DB 미연결/오류 시 JSON 스토어로 폴백
    }
  }

  /**
   * 매물 전체 스냅샷을 DB에 반영 — 각 매물 upsert 후, 스냅샷에 없는 행은 삭제(내리기 반영).
   * 트랜잭션으로 원자성 보장. roomlog와 동일하게 전체 재프로젝션 방식(매물 수가 적어 충분).
   */
  async persist(listings: TradeListing[]): Promise<void> {
    const ids = listings.map((listing) => listing.id);
    await this.prisma.$transaction(async (tx) => {
      for (const listing of listings) {
        const floorPlan =
          listing.floorPlan != null
            ? (listing.floorPlan as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull;
        const data = {
          ownerId: listing.ownerId,
          ownerName: listing.ownerName,
          title: listing.title,
          roomType: listing.roomType,
          tradeType: listing.tradeType,
          depositManwon: Math.trunc(listing.depositManwon) || 0,
          monthlyRentManwon: Math.trunc(listing.monthlyRentManwon) || 0,
          location: listing.location,
          detailAddress: listing.detailAddress?.trim() || null,
          buildingName: listing.buildingName?.trim() || null,
          exclusiveAreaM2: listing.exclusiveAreaM2 ?? null,
          floorInfo: listing.floorInfo?.trim() || null,
          maintenanceFeeManwon:
            listing.maintenanceFeeManwon != null ? Math.trunc(listing.maintenanceFeeManwon) : null,
          description: listing.description ?? "",
          options: listing.options ?? [],
          images: listing.images ?? [],
          lat: listing.lat ?? null,
          lng: listing.lng ?? null,
          floorPlan,
          status: listing.status
        };
        await tx.tradeListing.upsert({
          where: { id: listing.id },
          create: { id: listing.id, createdAt: new Date(listing.createdAt), ...data },
          update: data
        });
      }
      // 스냅샷에서 사라진 매물(삭제됨)은 DB에서도 제거. ids가 비면 where {} → 전부 삭제.
      await tx.tradeListing.deleteMany({ where: ids.length ? { id: { notIn: ids } } : {} });
    });
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

function normalizeTradeType(value: string): TradeListing["tradeType"] {
  return value === "반전세" || value === "전세" || value === "매매" ? value : "월세";
}

// options 컬럼 추가 이전에 생성된 Prisma client와도 컴파일되도록 unknown으로 받는다.
function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
