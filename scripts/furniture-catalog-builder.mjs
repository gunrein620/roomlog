const CATALOG_CATEGORIES = {
  seating: { key: "seating", label: "소파·의자", included: true },
  tables: { key: "tables", label: "테이블·책상", included: true },
  sleeping: { key: "sleeping", label: "침실", included: true },
  storage: { key: "storage", label: "수납", included: true },
  "kitchen-dining": { key: "kitchen-dining", label: "주방·다이닝", included: true },
  "bathroom-laundry": { key: "bathroom-laundry", label: "욕실·세탁", included: true },
  lighting: { key: "lighting", label: "조명", included: true },
  decor: { key: "decor", label: "데코", included: true },
  outdoor: { key: "outdoor", label: "야외", included: true },
  electronics: { key: "electronics", label: "가전·전자", included: true },
  excluded: { key: "excluded", label: "제외", included: false },
};

const PRODUCT_PART_PATTERN = /(?:drawer-front|^.*\/ikea-[^-]+-door-|\bshelf(?:-|\.glb)|push-opener|cutlery-tray|utensil-tray|\bspatula\b|\bgrater\b|\bknife\b|pizza-cutter|dish-washing-brush|\bwhisk\b|\bzester\b|\bladle\b|\bskimmer\b|wok-spatula|\bmeasuring-jug\b|\bplace-mat\b|\btea-towel\b|\bnapkin\b|\bbuilding-block\b|\babacus\b|\bbead-maze\b|\btoy\b)/i;

function fileNameFromPath(relativePath) {
  return String(relativePath).replaceAll("\\", "/").split("/").at(-1) ?? "";
}

function productIdFromText(text) {
  return String(text).match(/-(?:s)?(\d{8})(?:\.glb)?\/?$/i)?.[1];
}

function categoryForKey(key) {
  return CATALOG_CATEGORIES[key];
}

export function classifyCatalogItem(relativePath) {
  const normalizedPath = String(relativePath).replaceAll("\\", "/").toLowerCase();
  const sourceCategory = normalizedPath.split("/")[0];

  if (PRODUCT_PART_PATTERN.test(normalizedPath)) return categoryForKey("excluded");
  if (/outdoor|parasol|gazebo|sunshade/.test(normalizedPath)) return categoryForKey("outdoor");
  if (/wireless-charger|\bspeaker\b|\bfridge\b|\bwasher\b|\bdryer\b|\bappliance\b/.test(normalizedPath)) {
    return categoryForKey("electronics");
  }
  if (/sofa-bed|\bsofa\b|armchair|\bchair\b|footstool|\bstool\b|\bbench\b/.test(normalizedPath)) {
    return categoryForKey("seating");
  }
  if (/dining-table|coffee-table|side-table|\bdesk\b|\btable\b/.test(normalizedPath)) return categoryForKey("tables");
  if (/bed-frame|\bbed\b|mattress|bedside/.test(normalizedPath)) return categoryForKey("sleeping");
  if (/wardrobe|\bcabinet\b|\bchest-of|bookcase|shelving-unit|tv-storage|shoe-cabinet/.test(normalizedPath)) {
    return categoryForKey("storage");
  }
  if (/\bkitchen\b|\bsink\b|kitchen-island/.test(normalizedPath)) return categoryForKey("kitchen-dining");
  if (/\bbath\b|bathroom|toilet|shower|wash-basin|\bvanity\b/.test(normalizedPath)) {
    return categoryForKey("bathroom-laundry");
  }
  if (/\blamp\b|\blighting\b|\bled\b/.test(normalizedPath)) return categoryForKey("lighting");
  if (/\brug\b|door-mat|\bmirror\b|\bplant\b|\bdecor\b/.test(normalizedPath)) return categoryForKey("decor");

  const sourceFallback = {
    bathroom: "bathroom-laundry",
    bed: "sleeping",
    chair: "seating",
    decor: "decor",
    "desk-table": "tables",
    kitchen: "kitchen-dining",
    lighting: "lighting",
    sofa: "seating",
    storage: "storage",
  }[sourceCategory];
  return categoryForKey(sourceFallback ?? "decor");
}

export function toKoreanProductUrl(productUrl) {
  return String(productUrl).replace("/kr/en/", "/kr/ko/");
}

function productUrlIndex(thumbnailCache) {
  const index = new Map();
  for (const [productUrl, imageData] of Object.entries(thumbnailCache ?? {})) {
    const productId = productIdFromText(productUrl);
    if (!productId || !imageData?.thumbnailUrl || index.has(productId)) continue;
    index.set(productId, { productUrl, thumbnailUrl: imageData.thumbnailUrl });
  }
  return index;
}

function inferredKoreanProductUrl(fileName) {
  if (!/^ikea-/i.test(fileName) || !productIdFromText(fileName)) return undefined;
  return `https://www.ikea.com/kr/ko/p/${fileName.replace(/^ikea-/i, "").replace(/\.glb$/i, "")}/`;
}

function fallbackKoreanName(category) {
  return `이케아 ${category.label}`;
}

function decodeHtml(text) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

function isUsableKoreanProductName(name) {
  return typeof name === "string" && name.trim() !== "" && !["제품", "IKEA", "제품 | IKEA"].includes(name.trim());
}

export function extractKoreanProductName(html) {
  const heading = String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (!heading) return undefined;
  const name = decodeHtml(heading.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return isUsableKoreanProductName(name) ? name : undefined;
}

function itemSourceUrl(item, thumbnailIndex) {
  const relativePath = typeof item?.relativePath === "string" ? item.relativePath.replaceAll("\\", "/") : "";
  const fileName = typeof item?.fileName === "string" ? item.fileName : fileNameFromPath(relativePath);
  const cachedProduct = thumbnailIndex.get(productIdFromText(fileName));
  return cachedProduct ? toKoreanProductUrl(cachedProduct.productUrl) : inferredKoreanProductUrl(fileName);
}

export async function fetchMissingKoreanNames(items, thumbnailCache, koreanNameCache, fetcher = fetch, concurrency = 4, maxNames = Infinity) {
  const thumbnailIndex = productUrlIndex(thumbnailCache);
  const candidates = [...new Set(items.map((item) => itemSourceUrl(item, thumbnailIndex)).filter((url) => url && !isUsableKoreanProductName(koreanNameCache[url])))]
    .slice(0, Math.max(0, maxNames));
  const pending = [...candidates];
  const fetched = {};

  async function worker() {
    while (pending.length > 0) {
      const productUrl = pending.shift();
      if (!productUrl) continue;
      try {
        const response = await fetcher(productUrl, {
          headers: { "accept-language": "ko-KR,ko;q=0.9" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) continue;
        const productName = extractKoreanProductName(await response.text());
        if (productName) fetched[productUrl] = productName;
      } catch {
        // The product remains absent from the cache and gets retried next run.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, candidates.length || 1)) }, worker));
  return { ...koreanNameCache, ...fetched };
}

export function enrichManifest(manifest, thumbnailCache, koreanNameCache = {}) {
  const thumbnailIndex = productUrlIndex(thumbnailCache);
  let matchedThumbnailCount = 0;
  let namedKoreanCount = 0;
  const items = Array.isArray(manifest?.items) ? manifest.items : [];

  const enrichedItems = items.map((item) => {
    const relativePath = typeof item?.relativePath === "string" ? item.relativePath.replaceAll("\\", "/") : "";
    const fileName = typeof item?.fileName === "string" ? item.fileName : fileNameFromPath(relativePath);
    const category = classifyCatalogItem(relativePath);
    const cachedProduct = thumbnailIndex.get(productIdFromText(fileName));
    const sourceUrl = cachedProduct ? toKoreanProductUrl(cachedProduct.productUrl) : inferredKoreanProductUrl(fileName);
    const cachedName = sourceUrl && isUsableKoreanProductName(koreanNameCache[sourceUrl]) ? koreanNameCache[sourceUrl] : undefined;
    const displayNameKo = cachedName || fallbackKoreanName(category);

    if (cachedProduct) matchedThumbnailCount += 1;
    if (cachedName) namedKoreanCount += 1;

    return {
      ...item,
      catalogCategory: category.key,
      catalogCategoryLabel: category.label,
      displayNameKo,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(cachedProduct ? { thumbnailUrl: cachedProduct.thumbnailUrl, imageUrls: [cachedProduct.thumbnailUrl] } : {}),
      excludedFromCatalog: !category.included,
    };
  });

  return {
    manifest: { ...manifest, items: enrichedItems },
    summary: { itemCount: enrichedItems.length, matchedThumbnailCount, namedKoreanCount },
  };
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readJson(filePath, fallback) {
  const { readFile } = await import("node:fs/promises");
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function runCli(args) {
  const manifestPath = optionValue(args, "--manifest");
  const thumbnailCachePath = optionValue(args, "--thumbnail-cache");
  const nameCachePath = optionValue(args, "--name-cache");
  const outputPath = optionValue(args, "--output") ?? manifestPath;
  const fetchNames = args.includes("--fetch-korean-names");
  const concurrency = Number(optionValue(args, "--concurrency") ?? 4);
  const maxNames = Number(optionValue(args, "--max-names") ?? Infinity);

  if (!manifestPath || !thumbnailCachePath || !nameCachePath || !outputPath) {
    throw new Error("Usage: node scripts/furniture-catalog-builder.mjs --manifest <manifest.json> --thumbnail-cache <thumbnail-cache.json> --name-cache <name-cache.json> [--output <catalog-manifest.json>] [--fetch-korean-names] [--concurrency 4] [--max-names 100]");
  }

  const { writeFile } = await import("node:fs/promises");
  const manifest = await readJson(manifestPath, {});
  const thumbnailCache = await readJson(thumbnailCachePath, {});
  let koreanNameCache = await readJson(nameCachePath, {});

  if (fetchNames) {
    koreanNameCache = await fetchMissingKoreanNames(manifest.items ?? [], thumbnailCache, koreanNameCache, fetch, concurrency, maxNames);
    await writeFile(nameCachePath, `${JSON.stringify(koreanNameCache, null, 2)}\n`);
  }

  const { manifest: enrichedManifest, summary } = enrichManifest(manifest, thumbnailCache, koreanNameCache);
  await writeFile(outputPath, `${JSON.stringify(enrichedManifest, null, 2)}\n`);
  console.log(JSON.stringify(summary));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
