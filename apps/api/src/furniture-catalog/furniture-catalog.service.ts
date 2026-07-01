import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type DummyJsonProduct = {
  id: number;
  title: string;
  description?: string;
  category: string;
  price: number;
  brand?: string | null;
  dimensions?: {
    width?: number | null;
    height?: number | null;
    depth?: number | null;
  } | null;
  images?: string[] | null;
  thumbnail?: string | null;
};

export type NormalizedFurnitureCatalogItem = {
  id: string;
  source: string;
  sourceProductId: string;
  sourceUrl: string;
  category: string;
  name: string;
  brand: string;
  priceKrw: number;
  currency: "KRW";
  color: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  thumbnailUrl?: string;
  imageUrls: string[];
  raw: DummyJsonProduct;
  syncedAt: Date;
};

export type FurnitureCatalogApiItem = {
  brand: string;
  color: string;
  furniture_id: string;
  imageUrls: string[];
  length: [number, number, number];
  name: string;
  price: number;
  source: string;
  sourceUrl: string;
  thumbnailUrl?: string;
};

type FurnitureCatalogRow = {
  brand: string;
  color: string;
  depthMm: number;
  heightMm: number;
  id: string;
  imageUrls: string[];
  name: string;
  priceKrw: number;
  source: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  widthMm: number;
};

const DUMMYJSON_FURNITURE_URL = "https://dummyjson.com/products/category/furniture";
const DEFAULT_DUMMYJSON_DIMENSION_MM_FACTOR = 100;
const DEFAULT_USD_TO_KRW_RATE = 1350;
const CATALOG_COLORS = ["#8fb5ff", "#f3b36a", "#9ed8b3", "#d6b0ff", "#f1d17a", "#f28f8f"];
export const FURNITURE_CATALOG_DATABASE_URL = "FURNITURE_CATALOG_DATABASE_URL";

function toPositiveMm(value: number | null | undefined, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;

  return Math.max(50, Math.round(numberValue * DEFAULT_DUMMYJSON_DIMENSION_MM_FACTOR));
}

function catalogColorFor(sourceProductId: string) {
  const colorIndex = [...sourceProductId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % CATALOG_COLORS.length;

  return CATALOG_COLORS[colorIndex];
}

function asApiItem(item: {
  brand: string;
  color: string;
  depthMm: number;
  heightMm: number;
  id: string;
  imageUrls: string[];
  name: string;
  priceKrw: number;
  source: string;
  sourceUrl: string;
  thumbnailUrl?: string | null;
  widthMm: number;
}): FurnitureCatalogApiItem {
  return {
    brand: item.brand,
    color: item.color,
    furniture_id: item.id,
    imageUrls: item.imageUrls,
    length: [item.widthMm, item.heightMm, item.depthMm],
    name: item.name,
    price: item.priceKrw,
    source: item.source,
    sourceUrl: item.sourceUrl,
    thumbnailUrl: item.thumbnailUrl ?? undefined
  };
}

@Injectable()
export class FurnitureCatalogService {
  private readonly prisma?: PrismaClient;

  constructor(
    @Optional()
    @Inject(FURNITURE_CATALOG_DATABASE_URL)
    databaseUrl?: string
  ) {
    const resolvedDatabaseUrl =
      databaseUrl?.trim() || process.env.FURNITURE_CATALOG_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
    if (resolvedDatabaseUrl) {
      const adapter = new PrismaPg({ connectionString: resolvedDatabaseUrl });
      this.prisma = new PrismaClient({ adapter });
    }
  }

  static normalizeDummyJsonProduct(product: DummyJsonProduct): NormalizedFurnitureCatalogItem {
    const sourceProductId = String(product.id);
    const imageUrls = (product.images ?? []).filter((url): url is string => Boolean(url));

    return {
      id: `dummyjson-furniture-${sourceProductId}`,
      source: "dummyjson",
      sourceProductId,
      sourceUrl: `https://dummyjson.com/products/${sourceProductId}`,
      category: product.category || "furniture",
      name: product.title,
      brand: product.brand?.trim() || "DummyJSON",
      priceKrw: Math.round(Number(product.price || 0) * DEFAULT_USD_TO_KRW_RATE),
      currency: "KRW",
      color: catalogColorFor(sourceProductId),
      widthMm: toPositiveMm(product.dimensions?.width, 900),
      heightMm: toPositiveMm(product.dimensions?.height, 700),
      depthMm: toPositiveMm(product.dimensions?.depth, 600),
      thumbnailUrl: product.thumbnail ?? undefined,
      imageUrls,
      raw: product,
      syncedAt: new Date()
    };
  }

  static async fetchDummyJsonFurniture({
    fetchImpl = fetch,
    limit = 30
  }: {
    fetchImpl?: FetchLike;
    limit?: number;
  } = {}) {
    const url = new URL(DUMMYJSON_FURNITURE_URL);
    url.searchParams.set("limit", String(limit));

    const response = await fetchImpl(url.toString());
    if (!response.ok) {
      throw new Error(`DummyJSON furniture fetch failed: ${response.status}`);
    }

    const payload = (await response.json()) as { products?: DummyJsonProduct[] };

    return (payload.products ?? [])
      .filter((product) => product.category === "furniture")
      .map((product) => FurnitureCatalogService.normalizeDummyJsonProduct(product));
  }

  async listCatalogItems(): Promise<FurnitureCatalogApiItem[]> {
    if (!this.prisma) return [];

    const items = await this.prisma.$queryRaw<FurnitureCatalogRow[]>`
      SELECT
        "brand",
        "color",
        "depthMm",
        "heightMm",
        "id",
        "imageUrls",
        "name",
        "priceKrw",
        "source",
        "sourceUrl",
        "thumbnailUrl",
        "widthMm"
      FROM "FurnitureCatalogItem"
      ORDER BY "category" ASC, "name" ASC
    `;

    return items.map(asApiItem);
  }

  async syncFromDummyJson({ limit = 30 }: { limit?: number } = {}) {
    const prisma = this.requirePrisma();
    const items = await FurnitureCatalogService.fetchDummyJsonFurniture({ limit });

    await Promise.all(
      items.map((item) =>
        prisma.furnitureCatalogItem.upsert({
          where: {
            source_sourceProductId: {
              source: item.source,
              sourceProductId: item.sourceProductId
            }
          },
          create: {
            ...item,
            raw: item.raw as unknown as Prisma.InputJsonValue
          },
          update: {
            category: item.category,
            name: item.name,
            brand: item.brand,
            priceKrw: item.priceKrw,
            currency: item.currency,
            color: item.color,
            widthMm: item.widthMm,
            heightMm: item.heightMm,
            depthMm: item.depthMm,
            thumbnailUrl: item.thumbnailUrl,
            imageUrls: item.imageUrls,
            raw: item.raw as unknown as Prisma.InputJsonValue,
            sourceUrl: item.sourceUrl,
            syncedAt: item.syncedAt
          }
        })
      )
    );

    return {
      items: items.map(asApiItem),
      synced: items.length
    };
  }

  private requirePrisma() {
    if (!this.prisma) {
      throw new Error("DATABASE_URL is required to sync furniture catalog data.");
    }

    return this.prisma;
  }
}
