import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MESHY_ORIGIN = "https://www.meshy.ai";

function modelPageUrls(html) {
  return [...new Set([...String(html).matchAll(/href=["'](\/3d-models\/[^"']+)["']/g)].map(match => match[1]))]
    .map(relativeUrl => new URL(relativeUrl, MESHY_ORIGIN).href);
}

function modelFileName(sourceUrl) {
  return `meshy-${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16)}.glb`;
}

function parseJsonLd(html) {
  const values = [];
  for (const match of String(html).matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { values.push(JSON.parse(match[1])); } catch { /* Ignore unrelated JSON-LD blocks. */ }
  }
  return values.flatMap(value => Array.isArray(value) ? value : [value]);
}

function isCc0License(value) {
  return /creativecommons\.org\/publicdomain\/zero\/1\.0/i.test(String(value));
}

function isGlb(buffer) {
  return buffer.length >= 4
    && buffer[0] === 0x67
    && buffer[1] === 0x6c
    && buffer[2] === 0x54
    && buffer[3] === 0x46;
}

function extractMeshyModelMetadata(html, sourceUrl) {
  const model = parseJsonLd(html).find(item => {
    const type = item?.["@type"];
    return type === "3DModel" || (Array.isArray(type) && type.includes("3DModel"));
  });
  const glbUrl = model?.encoding?.find(item => item?.name === "GLB Format")?.contentUrl;
  if (!model?.name || !glbUrl || !isCc0License(model.license)) throw new Error(`Meshy page is missing CC0 GLB metadata: ${sourceUrl}`);
  const slug = new URL(sourceUrl).pathname.replace(/^\/3d-models\//, "");
  return {
    sourceUrl,
    sourceName: model.name,
    glbUrl,
    thumbnailUrl: `${MESHY_ORIGIN}/api/3d-models-og-image/${slug}`,
  };
}

export async function discoverMeshyModels(tags, fetcher = fetch) {
  const discovered = [];
  const knownUrls = new Set();
  for (const tag of tags) {
    const response = await fetcher(`${MESHY_ORIGIN}/tags/${tag.tag}`);
    if (!response.ok) throw new Error(`Could not load Meshy tag: ${tag.tag}`);
    const include = tag.includePattern ? new RegExp(tag.includePattern, "i") : undefined;
    const exclude = tag.excludePattern ? new RegExp(tag.excludePattern, "i") : undefined;
    const selected = modelPageUrls(await response.text())
      .filter(url => !knownUrls.has(url))
      .filter(url => !include || include.test(decodeURIComponent(url)))
      .filter(url => !exclude || !exclude.test(decodeURIComponent(url)))
      .slice(0, tag.limit);
    if (selected.length !== tag.limit) throw new Error(`Meshy tag ${tag.tag} returned only ${selected.length} unique models.`);
    selected.forEach(url => knownUrls.add(url));
    selected.forEach((sourceUrl, index) => discovered.push({ categoryKo: tag.categoryKo, ordinal: index + 1, sourceUrl }));
  }
  return discovered;
}

export async function importMeshyLargeAppliances({ datasetRoot, models, fetcher = fetch }) {
  const catalogPath = path.join(datasetRoot, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const importedItems = [];

  for (const model of models) {
    const pageResponse = await fetcher(model.sourceUrl);
    if (!pageResponse.ok) throw new Error(`Could not load Meshy model: ${model.sourceUrl}`);
    const metadata = extractMeshyModelMetadata(await pageResponse.text(), model.sourceUrl);
    const modelResponse = await fetcher(metadata.glbUrl);
    if (!modelResponse.ok) throw new Error(`Could not download Meshy GLB: ${metadata.glbUrl}`);
    const modelBuffer = Buffer.from(await modelResponse.arrayBuffer());
    if (!isGlb(modelBuffer)) throw new Error(`Downloaded model is not a valid GLB: ${metadata.glbUrl}`);
    const fileName = modelFileName(model.sourceUrl);
    const relativePath = `appliance/${fileName}`;
    const destination = path.join(datasetRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, modelBuffer);
    importedItems.push({
      fileName,
      relativePath,
      category: "appliance",
      catalogCategory: "electronics",
      catalogCategoryLabel: "가전·전자",
      displayNameKo: `${model.categoryKo} ${String(model.ordinal).padStart(2, "0")}`,
      sizeMm: { width: 800, height: 1000, depth: 700 },
      thumbnailUrl: metadata.thumbnailUrl,
      imageUrls: [metadata.thumbnailUrl],
      sourceUrl: metadata.sourceUrl,
      license: "CC0-1.0",
      excludedFromCatalog: false,
    });
  }

  if (new Set(importedItems.map(item => item.relativePath)).size !== importedItems.length) {
    throw new Error("Every imported card must have a distinct GLB model.");
  }
  const retainedItems = (Array.isArray(catalog.items) ? catalog.items : []).filter(item => item?.catalogCategory !== "electronics");
  const items = [...retainedItems, ...importedItems];
  await writeFile(catalogPath, `${JSON.stringify({ ...catalog, items }, null, 2)}\n`, "utf8");
  return { importedItemCount: importedItems.length, catalogItemCount: items.length };
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function runCli(args) {
  const datasetRoot = optionValue(args, "--dataset-root");
  const tagsPath = optionValue(args, "--tags");
  if (!datasetRoot || !tagsPath) throw new Error("Usage: node scripts/import-meshy-large-appliances.mjs --dataset-root <path> --tags <tags.json>");
  const tags = JSON.parse(await readFile(tagsPath, "utf8"));
  const models = await discoverMeshyModels(tags);
  console.log(JSON.stringify(await importMeshyLargeAppliances({ datasetRoot, models })));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
