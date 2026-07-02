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

type ManualFurnitureCsvRow = {
  brand?: string;
  color?: string;
  depthMm?: string;
  heightMm?: string;
  imageUrls?: string;
  name?: string;
  priceKrw?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
  widthMm?: string;
};

type NaverShoppingItem = {
  brand?: string;
  category1?: string;
  category2?: string;
  category3?: string;
  category4?: string;
  hprice?: string;
  image?: string;
  link?: string;
  lprice?: string;
  maker?: string;
  mallName?: string;
  productId?: string | number;
  productType?: string | number;
  title?: string;
};

type JsonLdProduct = {
  "@graph"?: JsonLdProduct[];
  "@type"?: string | string[];
  brand?: string | { name?: string };
  image?: string | string[];
  name?: string;
  offers?: {
    price?: string | number;
    priceCurrency?: string;
  };
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
  raw: DummyJsonProduct | ManualFurnitureCsvRow | NaverShoppingItem;
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

export type ProductCrawlResult =
  | {
      reason: string;
      status: "blocked";
    }
  | {
      item: NormalizedFurnitureCatalogItem;
      status: "importable";
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
const NAVER_SHOPPING_URL = "https://openapi.naver.com/v1/search/shop.json";
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

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(String(value ?? "").replace(/[^\d]/g, ""));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stripHtml(value: string | undefined) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function compactCategory(parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" > ") || "furniture";
}

function extractOhouProductId(sourceUrl: string, fallback: string) {
  const match = sourceUrl.match(/\/productions\/(\d+)/);

  return match?.[1] ?? fallback;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());

  return cells;
}

function parseCsv(source: string) {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);

    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])) as ManualFurnitureCsvRow;
  });
}

function robotsAllows(robotsText: string, path: string) {
  const lines = robotsText.split(/\r?\n/);
  let appliesToWildcard = false;
  const rules: { directive: "allow" | "disallow"; value: string }[] = [];

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const [rawKey, ...rawValueParts] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rawValueParts.join(":").trim();

    if (key === "user-agent") {
      appliesToWildcard = value === "*";
      continue;
    }

    if (!appliesToWildcard) continue;
    if (key === "allow" || key === "disallow") {
      rules.push({ directive: key, value });
    }
  }

  const matchingRules = rules
    .filter((rule) => rule.value !== "" && path.startsWith(rule.value))
    .sort((left, right) => right.value.length - left.value.length);
  const strongestRule = matchingRules[0];

  return strongestRule?.directive !== "disallow";
}

function findJsonLdProducts(value: unknown): JsonLdProduct[] {
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap(findJsonLdProducts);
  }

  const product = value as JsonLdProduct;
  const typeValues = Array.isArray(product["@type"]) ? product["@type"] : [product["@type"]];
  const current = typeValues.includes("Product") ? [product] : [];

  return [...current, ...findJsonLdProducts(product["@graph"])];
}

function extractJsonLdProduct(html: string) {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptPattern.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const product = findJsonLdProducts(parsed)[0];
      if (product?.name) return product;
    } catch {
      continue;
    }
  }

  return undefined;
}

function sourceProductIdFromUrl(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const slug = `${url.hostname}${url.pathname}`.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");

  return slug || "product";
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

  static parseManualCsv(source: string): NormalizedFurnitureCatalogItem[] {
    return parseCsv(source).map((row, index) => {
      const fallbackProductId = String(index + 1).padStart(4, "0");
      const sourceUrl = row.sourceUrl?.trim() || `manual://furniture/${fallbackProductId}`;
      const sourceProductId = extractOhouProductId(sourceUrl, fallbackProductId);
      const imageUrls = String(row.imageUrls ?? "")
        .split("|")
        .map((url) => url.trim())
        .filter(Boolean);

      return {
        id: `manual-ohou-${sourceProductId}`,
        source: "manual-ohou",
        sourceProductId,
        sourceUrl,
        category: "furniture",
        name: row.name?.trim() || `수동 가구 ${index + 1}`,
        brand: row.brand?.trim() || "오늘의집",
        priceKrw: parsePositiveInteger(row.priceKrw, 0),
        currency: "KRW",
        color: row.color?.trim() || catalogColorFor(sourceProductId),
        widthMm: parsePositiveInteger(row.widthMm, 900),
        heightMm: parsePositiveInteger(row.heightMm, 700),
        depthMm: parsePositiveInteger(row.depthMm, 600),
        thumbnailUrl: row.thumbnailUrl?.trim() || undefined,
        imageUrls,
        raw: row,
        syncedAt: new Date()
      };
    });
  }

  static normalizeNaverShoppingItem(product: NaverShoppingItem): NormalizedFurnitureCatalogItem {
    const sourceProductId = String(product.productId ?? sourceProductIdFromUrl(product.link || "https://search.shopping.naver.com/"));
    const thumbnailUrl = product.image?.trim() || undefined;

    return {
      id: `naver-shopping-${sourceProductId}`,
      source: "naver-shopping",
      sourceProductId,
      sourceUrl: product.link?.trim() || `https://search.shopping.naver.com/catalog/${sourceProductId}`,
      category: compactCategory([product.category1, product.category2, product.category3, product.category4]),
      name: stripHtml(product.title) || `네이버 쇼핑 가구 ${sourceProductId}`,
      brand: product.brand?.trim() || product.maker?.trim() || product.mallName?.trim() || "네이버 쇼핑",
      priceKrw: parsePositiveInteger(product.lprice, 0),
      currency: "KRW",
      color: catalogColorFor(sourceProductId),
      widthMm: 900,
      heightMm: 700,
      depthMm: 600,
      thumbnailUrl,
      imageUrls: thumbnailUrl ? [thumbnailUrl] : [],
      raw: product,
      syncedAt: new Date()
    };
  }

  static async fetchNaverShoppingFurniture({
    clientId,
    clientSecret,
    display = 30,
    fetchImpl = fetch,
    query = "가구",
    sort = "sim",
    start = 1
  }: {
    clientId: string;
    clientSecret: string;
    display?: number;
    fetchImpl?: FetchLike;
    query?: string;
    sort?: "sim" | "date" | "asc" | "dsc";
    start?: number;
  }) {
    const url = new URL(NAVER_SHOPPING_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("display", String(Math.min(Math.max(display, 1), 100)));
    url.searchParams.set("start", String(Math.min(Math.max(start, 1), 1000)));
    url.searchParams.set("sort", sort);
    url.searchParams.set("exclude", "used:rental");

    const response = await fetchImpl(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret
      }
    });
    if (!response.ok) {
      throw new Error(`Naver shopping fetch failed: ${response.status}`);
    }

    const payload = (await response.json()) as { items?: NaverShoppingItem[] };

    return (payload.items ?? []).map((item) => FurnitureCatalogService.normalizeNaverShoppingItem(item));
  }

  static async crawlProductPage({
    fetchImpl = fetch,
    pageUrl
  }: {
    fetchImpl?: FetchLike;
    pageUrl: string;
  }): Promise<ProductCrawlResult> {
    const url = new URL(pageUrl);
    const robotsUrl = `${url.origin}/robots.txt`;
    const robotsResponse = await fetchImpl(robotsUrl);
    const robotsText = robotsResponse.ok ? await robotsResponse.text() : "";

    if (robotsText && !robotsAllows(robotsText, url.pathname)) {
      return {
        reason: `robots.txt disallows crawling ${pageUrl} for User-agent *`,
        status: "blocked"
      };
    }

    const pageResponse = await fetchImpl(pageUrl);
    if (!pageResponse.ok) {
      throw new Error(`Product page fetch failed: ${pageResponse.status}`);
    }

    const product = extractJsonLdProduct(await pageResponse.text());
    if (!product?.name) {
      throw new Error("Product JSON-LD was not found on the page.");
    }

    const imageUrls = Array.isArray(product.image) ? product.image : product.image ? [product.image] : [];
    const sourceProductId = sourceProductIdFromUrl(pageUrl);
    const brand = typeof product.brand === "string" ? product.brand : product.brand?.name;

    return {
      item: {
        id: `crawl-jsonld-${sourceProductId}`,
        source: "crawl-jsonld",
        sourceProductId,
        sourceUrl: pageUrl,
        category: "furniture",
        name: product.name,
        brand: brand?.trim() || url.hostname,
        priceKrw: parsePositiveInteger(String(product.offers?.price ?? ""), 0),
        currency: "KRW",
        color: catalogColorFor(sourceProductId),
        widthMm: 900,
        heightMm: 700,
        depthMm: 600,
        thumbnailUrl: imageUrls[0],
        imageUrls,
        raw: {
          brand: brand?.trim(),
          imageUrls: imageUrls.join("|"),
          name: product.name,
          priceKrw: String(product.offers?.price ?? ""),
          sourceUrl: pageUrl,
          thumbnailUrl: imageUrls[0]
        },
        syncedAt: new Date()
      },
      status: "importable"
    };
  }

  async crawlAndImportProductPage(pageUrl: string) {
    const result = await FurnitureCatalogService.crawlProductPage({ pageUrl });
    if (result.status === "blocked") return result;

    await this.upsertItems([result.item]);

    return {
      item: asApiItem(result.item),
      status: "imported" as const
    };
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

    await this.upsertItems(items);

    return {
      items: items.map(asApiItem),
      synced: items.length
    };
  }

  async syncFromNaverShopping({
    clientId = process.env.NAVER_CLIENT_ID,
    clientSecret = process.env.NAVER_CLIENT_SECRET,
    display = 30,
    query = "가구",
    sort = "sim",
    start = 1
  }: {
    clientId?: string;
    clientSecret?: string;
    display?: number;
    query?: string;
    sort?: "sim" | "date" | "asc" | "dsc";
    start?: number;
  } = {}) {
    if (!clientId?.trim() || !clientSecret?.trim()) {
      throw new Error("NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required to sync Naver shopping furniture.");
    }

    const items = await FurnitureCatalogService.fetchNaverShoppingFurniture({
      clientId,
      clientSecret,
      display,
      query,
      sort,
      start
    });

    await this.upsertItems(items);

    return {
      items: items.map(asApiItem),
      synced: items.length
    };
  }

  async importManualCsv(source: string) {
    const items = FurnitureCatalogService.parseManualCsv(source);

    await this.upsertItems(items);

    return {
      items: items.map(asApiItem),
      synced: items.length
    };
  }

  private async upsertItems(items: NormalizedFurnitureCatalogItem[]) {
    const prisma = this.requirePrisma();

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
  }

  private requirePrisma() {
    if (!this.prisma) {
      throw new Error("DATABASE_URL is required to sync furniture catalog data.");
    }

    return this.prisma;
  }
}
