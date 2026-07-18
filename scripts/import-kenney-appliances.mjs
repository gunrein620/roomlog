import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PREVIEW_DIRECTORY = "appliance/kenney-previews";
const KENNEY_SOURCE_URL = "https://kenney.nl/assets/furniture-kit";

export const KENNEY_APPLIANCES = [
  { sourceName: "kitchenFridgeSmall", relativePath: "appliance/kitchenFridgeSmall.glb", displayNameKo: "소형 냉장고", sizeMm: { width: 430, height: 600, depth: 292 } },
  { sourceName: "kitchenFridge", relativePath: "appliance/kenney-kitchen-fridge.glb", displayNameKo: "냉장고", sizeMm: { width: 600, height: 1500, depth: 600 } },
  { sourceName: "kitchenFridgeBuiltIn", relativePath: "appliance/kenney-kitchen-fridge-built-in.glb", displayNameKo: "빌트인 냉장고", sizeMm: { width: 600, height: 1800, depth: 600 } },
  { sourceName: "kitchenFridgeLarge", relativePath: "appliance/kenney-kitchen-fridge-large.glb", displayNameKo: "대형 냉장고", sizeMm: { width: 900, height: 1800, depth: 700 } },
  { sourceName: "washer", relativePath: "appliance/kenney-washer.glb", displayNameKo: "세탁기", sizeMm: { width: 600, height: 850, depth: 600 } },
  { sourceName: "washerDryerStacked", relativePath: "appliance/washerDryerStacked.glb", displayNameKo: "세탁기·건조기 타워", sizeMm: { width: 390, height: 940, depth: 390 } },
  { sourceName: "dryer", relativePath: "appliance/kenney-dryer.glb", displayNameKo: "건조기", sizeMm: { width: 600, height: 850, depth: 600 } },
  { sourceName: "kitchenMicrowave", relativePath: "appliance/kenney-kitchen-microwave.glb", displayNameKo: "전자레인지", sizeMm: { width: 500, height: 300, depth: 400 } },
  { sourceName: "kitchenCoffeeMachine", relativePath: "appliance/kenney-kitchen-coffee-machine.glb", displayNameKo: "커피 머신", sizeMm: { width: 250, height: 350, depth: 350 } },
  { sourceName: "televisionModern", relativePath: "appliance/kenney-television-modern.glb", displayNameKo: "모던 TV", sizeMm: { width: 1000, height: 600, depth: 80 } },
  { sourceName: "televisionVintage", relativePath: "appliance/kenney-television-vintage.glb", displayNameKo: "빈티지 TV", sizeMm: { width: 650, height: 500, depth: 350 } },
  { sourceName: "computerScreen", relativePath: "appliance/kenney-computer-screen.glb", displayNameKo: "컴퓨터 모니터", sizeMm: { width: 600, height: 400, depth: 100 } },
];

function previewRelativePath(sourceName) {
  return `${PREVIEW_DIRECTORY}/${sourceName}.png`;
}

function catalogItemFor(asset) {
  const previewPath = previewRelativePath(asset.sourceName);
  const thumbnailUrl = `/floor-plan-3d/furniture-assets/${previewPath}`;
  return {
    fileName: path.posix.basename(asset.relativePath),
    relativePath: asset.relativePath,
    category: "appliance",
    catalogCategory: "electronics",
    catalogCategoryLabel: "가전·전자",
    displayNameKo: asset.displayNameKo,
    sizeMm: asset.sizeMm,
    thumbnailUrl,
    imageUrls: [thumbnailUrl],
    sourceUrl: KENNEY_SOURCE_URL,
    license: "CC0-1.0",
    excludedFromCatalog: false,
  };
}

export async function importKenneyAppliances({ datasetRoot, kenneyRoot, assets = KENNEY_APPLIANCES }) {
  const catalogPath = path.join(datasetRoot, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

  for (const asset of assets) {
    const sourceModel = path.join(kenneyRoot, "Models", "GLTF format", `${asset.sourceName}.glb`);
    const sourcePreview = path.join(kenneyRoot, "Side", `${asset.sourceName}.png`);
    const destinationModel = path.join(datasetRoot, ...asset.relativePath.split("/"));
    const destinationPreview = path.join(datasetRoot, ...previewRelativePath(asset.sourceName).split("/"));
    await mkdir(path.dirname(destinationModel), { recursive: true });
    await mkdir(path.dirname(destinationPreview), { recursive: true });
    await copyFile(sourceModel, destinationModel);
    await copyFile(sourcePreview, destinationPreview);
  }

  const replacements = new Map(assets.map(asset => [asset.relativePath, catalogItemFor(asset)]));
  const remainingItems = (Array.isArray(catalog.items) ? catalog.items : [])
    .filter(item => !replacements.has(item?.relativePath));
  const importedItems = assets.map(catalogItemFor);
  const items = [...remainingItems, ...importedItems];
  await writeFile(catalogPath, `${JSON.stringify({ ...catalog, items }, null, 2)}\n`, "utf8");

  return { importedItemCount: importedItems.length, catalogItemCount: items.length };
}

async function runCli(args) {
  const source = args.indexOf("--dataset-root");
  const importRoot = args.indexOf("--kenney-root");
  const datasetRoot = source >= 0 ? args[source + 1] : undefined;
  const kenneyRoot = importRoot >= 0 ? args[importRoot + 1] : undefined;
  if (!datasetRoot || !kenneyRoot) {
    throw new Error("Usage: node scripts/import-kenney-appliances.mjs --dataset-root <path> --kenney-root <path>");
  }
  console.log(JSON.stringify(await importKenneyAppliances({ datasetRoot, kenneyRoot })));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
