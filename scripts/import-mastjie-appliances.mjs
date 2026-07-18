import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PREVIEW_RELATIVE_PATH = "appliance/mastjie-previews/household-goods.png";
const MASTJIE_SOURCE_URL = "https://mastjie.itch.io/low-poly-household-goods";

export const MASTJIE_APPLIANCES = [
  { sourceName: "air_conditioner_01", relativePath: "appliance/mastjie-air-conditioner.glb", displayNameKo: "에어컨", sizeMm: { width: 900, height: 300, depth: 220 } },
  { sourceName: "blender_01", relativePath: "appliance/mastjie-blender.glb", displayNameKo: "블렌더", sizeMm: { width: 220, height: 400, depth: 220 } },
  { sourceName: "ceiling_fan_01", relativePath: "appliance/mastjie-ceiling-fan.glb", displayNameKo: "천장 선풍기", sizeMm: { width: 1200, height: 300, depth: 1200 } },
  { sourceName: "computer_01", relativePath: "appliance/mastjie-desktop-computer.glb", displayNameKo: "데스크톱 컴퓨터", sizeMm: { width: 500, height: 450, depth: 250 } },
  { sourceName: "fridge_01", relativePath: "appliance/mastjie-fridge.glb", displayNameKo: "양문형 냉장고", sizeMm: { width: 900, height: 1800, depth: 700 } },
  { sourceName: "kettle_01", relativePath: "appliance/mastjie-electric-kettle.glb", displayNameKo: "전기 주전자", sizeMm: { width: 220, height: 260, depth: 220 } },
  { sourceName: "laptop_01", relativePath: "appliance/mastjie-laptop.glb", displayNameKo: "노트북", sizeMm: { width: 350, height: 25, depth: 250 } },
  { sourceName: "microwave_01", relativePath: "appliance/mastjie-microwave.glb", displayNameKo: "전자레인지 클래식", sizeMm: { width: 500, height: 300, depth: 400 } },
  { sourceName: "pendaflour_lamp_01", relativePath: "appliance/mastjie-pendant-lamp.glb", displayNameKo: "펜던트 조명", sizeMm: { width: 450, height: 450, depth: 450 } },
  { sourceName: "rice_cooker_01", relativePath: "appliance/mastjie-rice-cooker.glb", displayNameKo: "전기밥솥", sizeMm: { width: 300, height: 280, depth: 300 } },
  { sourceName: "stove_01", relativePath: "appliance/mastjie-stove.glb", displayNameKo: "가스레인지", sizeMm: { width: 600, height: 850, depth: 600 } },
  { sourceName: "toaster_01", relativePath: "appliance/mastjie-toaster.glb", displayNameKo: "토스터", sizeMm: { width: 280, height: 220, depth: 220 } },
  { sourceName: "tv_01", relativePath: "appliance/mastjie-television.glb", displayNameKo: "평면 TV", sizeMm: { width: 1100, height: 650, depth: 100 } },
  { sourceName: "washing_machine_01", relativePath: "appliance/mastjie-washing-machine.glb", displayNameKo: "드럼 세탁기", sizeMm: { width: 600, height: 850, depth: 600 } },
];

function catalogItemFor(asset) {
  const thumbnailUrl = `/floor-plan-3d/furniture-assets/${PREVIEW_RELATIVE_PATH}`;
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
    sourceUrl: MASTJIE_SOURCE_URL,
    license: "CC0-1.0",
    excludedFromCatalog: false,
  };
}

export async function importMastjieAppliances({ datasetRoot, sourceRoot, assets = MASTJIE_APPLIANCES }) {
  const catalogPath = path.join(datasetRoot, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const previewPath = path.join(datasetRoot, ...PREVIEW_RELATIVE_PATH.split("/"));
  await mkdir(path.dirname(previewPath), { recursive: true });
  await copyFile(path.join(sourceRoot, "preview.PNG"), previewPath);

  for (const asset of assets) {
    const destinationModel = path.join(datasetRoot, ...asset.relativePath.split("/"));
    await mkdir(path.dirname(destinationModel), { recursive: true });
    await copyFile(path.join(sourceRoot, "gltf", `${asset.sourceName}.glb`), destinationModel);
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
  const datasetIndex = args.indexOf("--dataset-root");
  const sourceIndex = args.indexOf("--source-root");
  const datasetRoot = datasetIndex >= 0 ? args[datasetIndex + 1] : undefined;
  const sourceRoot = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;
  if (!datasetRoot || !sourceRoot) {
    throw new Error("Usage: node scripts/import-mastjie-appliances.mjs --dataset-root <path> --source-root <path>");
  }
  console.log(JSON.stringify(await importMastjieAppliances({ datasetRoot, sourceRoot })));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
