import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ELECTRONICS_CATEGORY = "electronics";

function fileName(relativePath) {
  return path.posix.basename(relativePath);
}

function isOfficialProductImageUrl(value) {
  const url = String(value);
  return /^https:\/\/www\.ikea\.com\/(?:[a-z]{2}\/[a-z]{2}\/)?images\//i.test(url)
    || /^https:\/\/images\.samsung\.com\//i.test(url);
}

function isOfficialProductUrl(value) {
  const url = String(value);
  return /^https:\/\/www\.ikea\.com\/kr\/ko\/p\//i.test(url)
    || /^https:\/\/www\.samsung\.com\/sec\//i.test(url);
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(html).match(new RegExp(`<meta\\s+[^>]*property=["']${escaped}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1]
    ?? String(html).match(new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*property=["']${escaped}["']`, "i"))?.[1];
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

export function extractIkeaProductMetadata(html) {
  const thumbnailUrl = metaContent(html, "og:image");
  const heading = String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const displayNameKo = heading && decodeHtml(heading.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  if (!isOfficialProductImageUrl(thumbnailUrl) || !displayNameKo) return undefined;
  return { displayNameKo, thumbnailUrl };
}

export function extractSamsungProductMetadata(html) {
  const imageValue = metaContent(html, "og:image");
  const thumbnailUrl = imageValue?.startsWith("//") ? `https:${imageValue}` : imageValue;
  const title = decodeHtml(metaContent(html, "og:title") ?? "");
  const displayNameKo = title.split("|")[0]?.trim();
  if (!isOfficialProductImageUrl(thumbnailUrl) || !displayNameKo) return undefined;
  return { displayNameKo, thumbnailUrl };
}

export async function collectOfficialProductPhotos(productUrls, fetcher = fetch) {
  const products = await Promise.all(productUrls.map(async (sourceUrl) => {
    const response = await fetcher(sourceUrl, { headers: { "accept-language": "ko-KR,ko;q=0.9" } });
    if (!response.ok) throw new Error(`Could not load ${sourceUrl} (${response.status}).`);
    const html = await response.text();
    const metadata = new URL(sourceUrl).hostname.endsWith("samsung.com")
      ? extractSamsungProductMetadata(html)
      : extractIkeaProductMetadata(html);
    if (!metadata) throw new Error(`Could not extract product photo metadata from ${sourceUrl}.`);
    return { sourceUrl, ...metadata };
  }));
  return products;
}

export function replaceElectronicsWithProductPhotos(catalog, products, modelChoices) {
  if (!Array.isArray(products) || products.length === 0) throw new Error("At least one product-photo item is required.");
  if (!Array.isArray(modelChoices) || modelChoices.length === 0) throw new Error("At least one GLB model choice is required.");
  if (modelChoices.length !== products.length || new Set(modelChoices.map(model => model?.relativePath)).size !== modelChoices.length) {
    throw new Error("Every product card requires one distinct GLB model.");
  }

  const existingItems = Array.isArray(catalog?.items) ? catalog.items : [];
  const retainedItems = existingItems.filter(item => item?.catalogCategory !== ELECTRONICS_CATEGORY);
  const productItems = products.map((product, index) => {
    if (!isOfficialProductUrl(product?.sourceUrl)) throw new Error(`Product ${index + 1} does not have an official product page.`);
    if (!isOfficialProductImageUrl(product?.thumbnailUrl)) throw new Error(`Product ${index + 1} does not have an official product image.`);
    if (!product?.displayNameKo?.trim()) throw new Error(`Product ${index + 1} does not have a Korean product name.`);

    const model = modelChoices[index];
    return {
      fileName: fileName(model.relativePath),
      relativePath: model.relativePath,
      category: "appliance",
      catalogCategory: ELECTRONICS_CATEGORY,
      catalogCategoryLabel: "가전·전자",
      displayNameKo: product.displayNameKo.trim(),
      sizeMm: model.sizeMm,
      thumbnailUrl: product.thumbnailUrl,
      imageUrls: [product.thumbnailUrl],
      sourceUrl: product.sourceUrl,
      license: "Product image © Inter IKEA Systems B.V.",
      excludedFromCatalog: false,
    };
  });

  return {
    catalog: { ...catalog, items: [...retainedItems, ...productItems] },
    replacedItemCount: existingItems.length - retainedItems.length,
  };
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function runCli(args) {
  const catalogPath = optionValue(args, "--catalog");
  const productsPath = optionValue(args, "--products");
  const modelsPath = optionValue(args, "--models");
  if (!catalogPath || !productsPath || !modelsPath) {
    throw new Error("Usage: node scripts/replace-electronics-with-product-photos.mjs --catalog <catalog.json> --products <products.json> --models <models.json>");
  }

  const [catalog, productInput, modelChoices] = await Promise.all([
    readFile(catalogPath, "utf8").then(JSON.parse),
    readFile(productsPath, "utf8").then(JSON.parse),
    readFile(modelsPath, "utf8").then(JSON.parse),
  ]);
  const products = typeof productInput?.[0] === "string"
    ? await collectOfficialProductPhotos(productInput)
    : productInput;
  const result = replaceElectronicsWithProductPhotos(catalog, products, modelChoices);
  await writeFile(catalogPath, `${JSON.stringify(result.catalog, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ replacedItemCount: result.replacedItemCount, productItemCount: products.length }));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
