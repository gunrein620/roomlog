import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_FURNITURE_ASSET_PREFIX = "/floor-plan-3d/furniture-assets/";

function assetRelativePath(item) {
  const relativePath = String(item?.relativePath ?? "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!relativePath || relativePath.split("/").includes("..")) return undefined;
  return relativePath;
}

function localPreviewRelativePath(item) {
  const thumbnailUrl = String(item?.thumbnailUrl ?? "");
  if (!thumbnailUrl.startsWith(LOCAL_FURNITURE_ASSET_PREFIX)) return undefined;
  return assetRelativePath({ relativePath: thumbnailUrl.slice(LOCAL_FURNITURE_ASSET_PREFIX.length) });
}

function hasThumbnail(item) {
  return typeof item?.thumbnailUrl === "string" && item.thumbnailUrl.trim() !== "";
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function buildFurnitureUploadPackage({ sourceRoot, destinationRoot }) {
  const catalogPath = path.join(sourceRoot, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const items = Array.isArray(catalog.items) ? catalog.items : [];
  const packageItems = items.filter(item => hasThumbnail(item) && assetRelativePath(item));
  const previewPaths = [...new Set(packageItems.map(localPreviewRelativePath).filter(Boolean))];

  await mkdir(destinationRoot, { recursive: true });
  for (const item of packageItems) {
    const relativePath = assetRelativePath(item);
    const sourceFile = path.resolve(sourceRoot, ...relativePath.split("/"));
    const destinationFile = path.resolve(destinationRoot, ...relativePath.split("/"));
    const sourcePrefix = `${path.resolve(sourceRoot)}${path.sep}`;
    const destinationPrefix = `${path.resolve(destinationRoot)}${path.sep}`;
    if (!sourceFile.startsWith(sourcePrefix) || !destinationFile.startsWith(destinationPrefix)) {
      throw new Error(`Invalid asset path: ${relativePath}`);
    }
    await mkdir(path.dirname(destinationFile), { recursive: true });
    await copyFile(sourceFile, destinationFile);
  }

  for (const relativePath of previewPaths) {
    const sourceFile = path.resolve(sourceRoot, ...relativePath.split("/"));
    const destinationFile = path.resolve(destinationRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(destinationFile), { recursive: true });
    await copyFile(sourceFile, destinationFile);
  }

  await writeFile(
    path.join(destinationRoot, "catalog.json"),
    `${JSON.stringify({ ...catalog, items: packageItems }, null, 2)}\n`,
    "utf8",
  );

  return {
    copiedItemCount: packageItems.length,
    skippedItemCount: items.length - packageItems.length,
    copiedPreviewCount: previewPaths.length,
  };
}

async function runCli(args) {
  const sourceRoot = optionValue(args, "--source");
  const destinationRoot = optionValue(args, "--destination");
  if (!sourceRoot || !destinationRoot) {
    throw new Error("Usage: node scripts/package-furniture-assets.mjs --source <catalog-root> --destination <package-root>");
  }
  console.log(JSON.stringify(await buildFurnitureUploadPackage({ sourceRoot, destinationRoot })));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
