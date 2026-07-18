import { access, copyFile, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

function assertDistinctModels(models) {
  if (new Set(models.map(model => model.relativePath)).size !== models.length) {
    throw new Error("Every large-appliance card must use a distinct GLB path.");
  }
}

export async function curateLargeAppliances({ datasetRoot, importRoot, models }) {
  assertDistinctModels(models);
  const catalogPath = path.join(datasetRoot, "catalog.json");

  for (const model of models.filter(model => model.sourceRelativePath)) {
    await copyFile(
      path.join(importRoot, ...model.sourceRelativePath.split("/")),
      path.join(datasetRoot, ...model.relativePath.split("/")),
    );
  }

  for (const model of models) {
    try {
      await access(path.join(datasetRoot, ...model.relativePath.split("/")), constants.R_OK);
    } catch {
      throw new Error(`GLB source is missing: ${model.relativePath}`);
    }
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const retainedItems = (catalog.items ?? []).filter(item => item?.catalogCategory !== "electronics");
  const applianceItems = models.map(model => ({
    fileName: path.posix.basename(model.relativePath),
    relativePath: model.relativePath,
    category: "appliance",
    catalogCategory: "electronics",
    catalogCategoryLabel: "가전·전자",
    displayNameKo: model.displayNameKo,
    sizeMm: model.sizeMm,
    thumbnailUrl: model.thumbnailUrl,
    imageUrls: [model.thumbnailUrl],
    sourceUrl: model.sourceUrl ?? "",
    license: model.license ?? "CC0-1.0",
    excludedFromCatalog: false,
  }));
  const items = [...retainedItems, ...applianceItems];
  await writeFile(catalogPath, `${JSON.stringify({ ...catalog, items }, null, 2)}\n`, "utf8");
  return { applianceCount: applianceItems.length, catalogItemCount: items.length };
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function runCli(args) {
  const datasetRoot = optionValue(args, "--dataset-root");
  const importRoot = optionValue(args, "--import-root");
  const modelsPath = optionValue(args, "--models");
  if (!datasetRoot || !importRoot || !modelsPath) throw new Error("Usage: node scripts/curate-large-appliances.mjs --dataset-root <path> --import-root <path> --models <models.json>");
  const models = JSON.parse(await readFile(modelsPath, "utf8"));
  console.log(JSON.stringify(await curateLargeAppliances({ datasetRoot, importRoot, models })));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
