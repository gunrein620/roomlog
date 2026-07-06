import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type IkeaKind = "bed" | "dining-table" | "chair" | "sofa" | "desk" | "drawer" | "wardrobe";

type JsonLdProduct = {
  "@graph"?: JsonLdProduct[];
  "@type"?: string | string[];
  brand?: string | { name?: string };
  category?: string;
  color?: string;
  depth?: string;
  height?: string;
  image?: string | Array<string | { contentUrl?: string }>;
  name?: string;
  mpn?: string;
  offers?: {
    lowPrice?: string | number;
    offers?: Array<{ price?: string | number }>;
    price?: string | number;
    priceCurrency?: string;
  };
  sku?: string;
  url?: string;
  width?: string;
};

type IkeaSitemapProduct = {
  imageUrls: string[];
  sourceUrl: string;
};

type CrawledIkeaItem = {
  brand: "IKEA";
  category: string;
  color: string;
  currency: "KRW";
  depthMm: number;
  heightMm: number;
  id: string;
  imageUrls: string[];
  kind: IkeaKind;
  name: string;
  priceKrw: number;
  raw: {
    jsonLd: JsonLdProduct;
    sitemapImageUrls: string[];
  };
  source: string;
  sourceProductId: string;
  sourceUrl: string;
  syncedAt: string;
  thumbnailUrl?: string;
  widthMm: number;
};

const IKEA_KO_PRODUCT_SITEMAPS = [
  "https://www.ikea.com/sitemaps/prod-ko-KR_1.xml",
  "https://www.ikea.com/sitemaps/prod-ko-KR_2.xml",
  "https://www.ikea.com/sitemaps/prod-ko-KR_3.xml",
  "https://www.ikea.com/sitemaps/prod-ko-KR_4.xml"
];
const KINDS: IkeaKind[] = ["bed", "dining-table", "chair", "sofa", "desk", "drawer", "wardrobe"];
const KIND_LABELS: Record<IkeaKind, string> = {
  bed: "침대",
  chair: "의자",
  desk: "책상",
  "dining-table": "식탁",
  drawer: "서랍",
  sofa: "소파",
  wardrobe: "옷장"
};
const OUTPUT_DIR = join(__dirname, "../../../..", "data/furniture-crawl/ikea");

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parsePositiveInteger(value: string | number | undefined, fallback: number) {
  const parsed = Number(String(value ?? "").replace(/[^\d]/g, ""));

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseMmFromDimension(value: string | undefined) {
  const match = String(value ?? "").match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/i);
  if (!match) return undefined;

  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const unit = match[2]?.toLowerCase();
  if (unit === "m") return Math.round(amount * 1000);
  if (unit === "mm") return Math.round(amount);

  return Math.round(amount * 10);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function seedIndex(seed: string, length: number) {
  return [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % length;
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

  const strongestRule = rules
    .filter((rule) => rule.value !== "" && path.startsWith(rule.value))
    .sort((left, right) => right.value.length - left.value.length)[0];

  return strongestRule?.directive !== "disallow";
}

function parseSitemapProducts(xml: string): IkeaSitemapProduct[] {
  const productBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];

  return productBlocks
    .map((block) => {
      const sourceUrl = decodeHtmlEntities(block.match(/<loc>(https:\/\/www\.ikea\.com\/kr\/ko\/p\/[^<]+)<\/loc>/)?.[1] ?? "");
      const imageUrls = [...block.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((match) => decodeHtmlEntities(match[1]));

      return { imageUrls, sourceUrl };
    })
    .filter((product) => product.sourceUrl);
}

function findJsonLdProducts(value: unknown): JsonLdProduct[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(findJsonLdProducts);

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

function priceFromJsonLdProduct(product: JsonLdProduct) {
  return parsePositiveInteger(product.offers?.price ?? product.offers?.lowPrice ?? product.offers?.offers?.[0]?.price, 0);
}

function imageUrlsFromJsonLd(product: JsonLdProduct) {
  return Array.isArray(product.image)
    ? product.image.map((image) => (typeof image === "string" ? image : image.contentUrl)).filter((url): url is string => Boolean(url))
    : product.image
      ? [product.image]
      : [];
}

function sourceProductIdFromUrl(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const lastPathPart = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const match = lastPathPart.match(/([s]?\d{8,})\/?$/i);

  return match?.[1] ?? `${url.hostname}${url.pathname}`.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const EXCLUDE_BY_KIND: Record<IkeaKind, RegExp> = {
  bed: /소파베드|침대협탁|침대 수납|침대수납|bedside|bed storage|sofa-bed|sofa bed/,
  chair: /방석|쿠션|패드|커버|의자다리|seat pad|chair pad|cushion|cover|legs/,
  desk: /의자|체어|수납콤비네이션|desk and storage|desk-and-storage|desk-chair|desk-and-chair/,
  "dining-table": /식탁보|러너|장식보|커버|tablecloth|runner|cover|coffee-table|side-table|bedside-table/,
  drawer: /서랍앞판|앞판|정리용품|트레이|칸막이|drawer front|organiser|organizer|tray|divider/,
  sofa: /커버|소파 다리|cover|legs for|replacement/,
  wardrobe: /도어|문짝|앞판|레일|손잡이|door|front|rail|knob|handle/
};

const URL_PATTERNS: Record<IkeaKind, RegExp> = {
  bed: /bed|mattress|day-bed|bed-frame|침대|매트리스/,
  chair: /chair|stool|bench|armchair|의자|체어|스툴|벤치/,
  desk: /desk|책상|데스크/,
  "dining-table": /dining-table|table-and-\d|extendable-table|식탁/,
  drawer: /chest-of-drawers|drawer-unit|drawer|drawers|서랍/,
  sofa: /sofa|couch|chaise|소파/,
  wardrobe: /wardrobe|closet|옷장|장롱/
};

const TEXT_PATTERNS: Record<IkeaKind, RegExp> = {
  bed: /침대|매트리스|bed|mattress/,
  chair: /의자|체어|스툴|벤치|chair|stool|bench|armchair/,
  desk: /책상|데스크|desk/,
  "dining-table": /식탁|다이닝|dining table/,
  drawer: /서랍장|서랍유닛|서랍|chest of drawers|drawer unit|drawers/,
  sofa: /소파|sofa|couch|chaise/,
  wardrobe: /옷장|장롱|wardrobe|closet/
};

function shouldVisitUrl(kind: IkeaKind, sourceUrl: string) {
  const text = sourceUrl.toLowerCase();

  return URL_PATTERNS[kind].test(text) && !EXCLUDE_BY_KIND[kind].test(text);
}

function matchesKind(kind: IkeaKind, product: JsonLdProduct, sourceUrl: string) {
  const text = `${product.category ?? ""} ${product.name ?? ""} ${sourceUrl}`.toLowerCase();

  return TEXT_PATTERNS[kind].test(text) && !EXCLUDE_BY_KIND[kind].test(text);
}

function fallbackDimensions(kind: IkeaKind, seed: string) {
  const variants: Record<IkeaKind, Array<{ depthMm: number; heightMm: number; widthMm: number }>> = {
    bed: [
      { widthMm: 900, heightMm: 900, depthMm: 2000 },
      { widthMm: 1200, heightMm: 900, depthMm: 2000 },
      { widthMm: 1500, heightMm: 900, depthMm: 2000 },
      { widthMm: 1800, heightMm: 900, depthMm: 2000 }
    ],
    chair: [
      { widthMm: 520, heightMm: 820, depthMm: 560 },
      { widthMm: 580, heightMm: 780, depthMm: 620 },
      { widthMm: 720, heightMm: 760, depthMm: 760 }
    ],
    desk: [
      { widthMm: 1000, heightMm: 740, depthMm: 600 },
      { widthMm: 1200, heightMm: 740, depthMm: 700 },
      { widthMm: 1400, heightMm: 740, depthMm: 800 },
      { widthMm: 1600, heightMm: 740, depthMm: 800 }
    ],
    "dining-table": [
      { widthMm: 800, heightMm: 740, depthMm: 800 },
      { widthMm: 1200, heightMm: 740, depthMm: 750 },
      { widthMm: 1400, heightMm: 740, depthMm: 800 },
      { widthMm: 1600, heightMm: 740, depthMm: 850 },
      { widthMm: 1800, heightMm: 740, depthMm: 900 }
    ],
    drawer: [
      { widthMm: 600, heightMm: 700, depthMm: 450 },
      { widthMm: 800, heightMm: 900, depthMm: 480 },
      { widthMm: 1000, heightMm: 1100, depthMm: 500 }
    ],
    sofa: [
      { widthMm: 1600, heightMm: 850, depthMm: 900 },
      { widthMm: 2000, heightMm: 850, depthMm: 950 },
      { widthMm: 2400, heightMm: 850, depthMm: 980 }
    ],
    wardrobe: [
      { widthMm: 800, heightMm: 1900, depthMm: 550 },
      { widthMm: 1200, heightMm: 2000, depthMm: 600 },
      { widthMm: 1600, heightMm: 2100, depthMm: 600 }
    ]
  };

  const kindVariants = variants[kind];
  return kindVariants[seedIndex(seed, kindVariants.length)];
}

function dimensionsFromName(name: string, kind: IkeaKind) {
  const text = name.toLowerCase();
  const cmPair = text.match(/(\d{2,4})\s*(?:x|×|\*)\s*(\d{2,4})(?:\s*(?:x|×|\*)\s*(\d{2,4}))?\s*cm/);
  if (!cmPair) return undefined;

  const first = parsePositiveInteger(cmPair[1], 0) * 10;
  const second = parsePositiveInteger(cmPair[2], 0) * 10;
  const third = cmPair[3] ? parsePositiveInteger(cmPair[3], 0) * 10 : 0;
  if (!first || !second) return undefined;

  if (kind === "bed") return { widthMm: clamp(first, 700, 2600), heightMm: 900, depthMm: clamp(second, 1600, 2300) };
  if (kind === "wardrobe") return { widthMm: first, heightMm: third || second, depthMm: third ? second : fallbackDimensions(kind, name).depthMm };
  if (third) return { widthMm: first, heightMm: third, depthMm: second };

  return { widthMm: first, heightMm: fallbackDimensions(kind, name).heightMm, depthMm: second };
}

function normalizeItem(kind: IkeaKind, product: JsonLdProduct, sourceUrl: string, sitemapImageUrls: string[]): CrawledIkeaItem {
  const sourceProductId = String(product.sku ?? product.mpn ?? sourceProductIdFromUrl(sourceUrl)).replace(/[^\dA-Za-z]/g, "");
  const explicitDimensions = {
    widthMm: parseMmFromDimension(product.width),
    heightMm: parseMmFromDimension(product.height),
    depthMm: parseMmFromDimension(product.depth)
  };
  const titleDimensions = dimensionsFromName(product.name ?? "", kind);
  const fallback = fallbackDimensions(kind, sourceProductId);
  const imageUrls = [...imageUrlsFromJsonLd(product), ...sitemapImageUrls].filter((url, index, urls) => Boolean(url) && urls.indexOf(url) === index);
  const source = `ikea-${kind}`;

  return {
    brand: "IKEA",
    category: product.category?.trim() || KIND_LABELS[kind],
    color: typeof product.color === "string" && product.color.trim() ? product.color.trim() : "#f1d17a",
    currency: "KRW",
    depthMm: explicitDimensions.depthMm ?? titleDimensions?.depthMm ?? fallback.depthMm,
    heightMm: explicitDimensions.heightMm ?? titleDimensions?.heightMm ?? fallback.heightMm,
    id: `${source}-${sourceProductId}`,
    imageUrls,
    kind,
    name: product.name ?? `${KIND_LABELS[kind]} ${sourceProductId}`,
    priceKrw: priceFromJsonLdProduct(product),
    raw: { jsonLd: product, sitemapImageUrls },
    source,
    sourceProductId,
    sourceUrl: product.url ?? sourceUrl,
    syncedAt: new Date().toISOString(),
    thumbnailUrl: imageUrls[0],
    widthMm: explicitDimensions.widthMm ?? titleDimensions?.widthMm ?? fallback.widthMm
  };
}

async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R | undefined>, stopWhen: () => boolean) {
  const results: R[] = [];
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < items.length && !stopWhen()) {
        const item = items[nextIndex++];
        const result = await worker(item);
        if (result) results.push(result);
      }
    })
  );

  return results;
}

function databaseUrl() {
  const url = process.env.FURNITURE_CATALOG_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("FURNITURE_CATALOG_DATABASE_URL or DATABASE_URL is required.");

  return url;
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);

  return response.text();
}

async function crawlKind(kind: IkeaKind, limit: number, sitemapProducts: IkeaSitemapProduct[], robotsText: string) {
  const candidates = sitemapProducts.filter((product) => shouldVisitUrl(kind, product.sourceUrl));
  const items: CrawledIkeaItem[] = [];

  await runPool(
    candidates,
    8,
    async (candidate) => {
      if (items.length >= limit) return undefined;

      const pageUrl = new URL(candidate.sourceUrl);
      if (robotsText && !robotsAllows(robotsText, pageUrl.pathname)) return undefined;

      try {
        const product = extractJsonLdProduct(await fetchText(candidate.sourceUrl));
        if (!product?.name || !matchesKind(kind, product, candidate.sourceUrl)) return undefined;

        const item = normalizeItem(kind, product, candidate.sourceUrl, candidate.imageUrls);
        items.push(item);

        return item;
      } catch {
        return undefined;
      }
    },
    () => items.length >= limit
  );

  return items.slice(0, limit);
}

async function upsertItems(prisma: PrismaClient, items: CrawledIkeaItem[]) {
  const asRawJson = (item: CrawledIkeaItem) => JSON.parse(JSON.stringify(item.raw)) as Prisma.InputJsonValue;

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
          id: item.id,
          source: item.source,
          sourceProductId: item.sourceProductId,
          sourceUrl: item.sourceUrl,
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
          raw: asRawJson(item),
          syncedAt: new Date(item.syncedAt)
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
          raw: asRawJson(item),
          sourceUrl: item.sourceUrl,
          syncedAt: new Date(item.syncedAt)
        }
      })
    )
  );
}

async function main() {
  const limit = Number(process.argv[2] ?? 100);
  const selectedKinds = process.argv.slice(3) as IkeaKind[];
  const kinds = selectedKinds.length ? selectedKinds : KINDS;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });
  const robotsText = await fetchText("https://www.ikea.com/robots.txt");
  const sitemapProducts = (
    await Promise.all(IKEA_KO_PRODUCT_SITEMAPS.map(async (url) => parseSitemapProducts(await fetchText(url))))
  ).flat();

  await mkdir(OUTPUT_DIR, { recursive: true });

  try {
    for (const kind of kinds) {
      await prisma.furnitureCatalogItem.deleteMany({ where: { source: `ikea-${kind}` } });
      const items = await crawlKind(kind, limit, sitemapProducts, robotsText);
      await upsertItems(prisma, items);
      await writeFile(`${OUTPUT_DIR}/${kind}.json`, JSON.stringify(items, null, 2));
      console.log(`Synced ${items.length} ${kind} items from IKEA Korea.`);
    }

    const manifest = {
      crawledAt: new Date().toISOString(),
      kinds,
      limit,
      sources: kinds.map((kind) => `ikea-${kind}`)
    };
    await writeFile(`${OUTPUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
