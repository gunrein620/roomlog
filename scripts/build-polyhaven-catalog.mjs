import { open, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const API_URL = "https://api.polyhaven.com/assets?t=models";
const API_USER_AGENT = "RoomlogCatalog/1.0 (https://woo-zu.com)";

function multiplyMatrix(a, b) {
  const out = Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        out[column * 4 + row] += a[index * 4 + row] * b[column * 4 + index];
      }
    }
  }
  return out;
}

function nodeMatrix(node) {
  if (Array.isArray(node?.matrix) && node.matrix.length === 16) return node.matrix.map(Number);
  const [x, y, z, w] = Array.isArray(node?.rotation) ? node.rotation.map(Number) : [0, 0, 0, 1];
  const [sx, sy, sz] = Array.isArray(node?.scale) ? node.scale.map(Number) : [1, 1, 1];
  const [tx, ty, tz] = Array.isArray(node?.translation) ? node.translation.map(Number) : [0, 0, 0];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function transformedPoint(matrix, point) {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function expandBounds(target, min, max, matrix) {
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const point = transformedPoint(matrix, [x, y, z]);
        for (let axis = 0; axis < 3; axis += 1) {
          target.min[axis] = Math.min(target.min[axis], point[axis]);
          target.max[axis] = Math.max(target.max[axis], point[axis]);
        }
      }
    }
  }
}

async function readGlbJson(filePath) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(20);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(4) !== 2) {
      throw new Error(`Invalid GLB 2.0 header: ${filePath}`);
    }
    const jsonLength = header.readUInt32LE(12);
    if (header.readUInt32LE(16) !== 0x4e4f534a || jsonLength <= 0) {
      throw new Error(`Missing GLB JSON chunk: ${filePath}`);
    }
    const chunk = Buffer.alloc(jsonLength);
    await handle.read(chunk, 0, jsonLength, 20);
    return JSON.parse(chunk.toString("utf8").trim());
  } finally {
    await handle.close();
  }
}

export async function readGlbSizeMm(filePath) {
  const json = await readGlbJson(filePath);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const meshBounds = (json.meshes ?? []).map((mesh) => {
    const meshBound = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION];
      if (!Array.isArray(accessor?.min) || !Array.isArray(accessor?.max)) continue;
      expandBounds(meshBound, accessor.min.map(Number), accessor.max.map(Number), identity);
    }
    return meshBound;
  });

  function visit(nodeIndex, parentMatrix) {
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    const worldMatrix = multiplyMatrix(parentMatrix, nodeMatrix(node));
    const meshBound = meshBounds[node.mesh];
    if (meshBound && Number.isFinite(meshBound.min[0])) {
      expandBounds(bounds, meshBound.min, meshBound.max, worldMatrix);
    }
    for (const child of node.children ?? []) visit(child, worldMatrix);
  }

  const scene = json.scenes?.[json.scene ?? 0];
  if (scene?.nodes?.length) {
    for (const nodeIndex of scene.nodes) visit(nodeIndex, identity);
  } else {
    for (const meshBound of meshBounds) {
      if (Number.isFinite(meshBound.min[0])) expandBounds(bounds, meshBound.min, meshBound.max, identity);
    }
  }

  if (!Number.isFinite(bounds.min[0])) return { width: 1000, height: 1000, depth: 1000 };
  const millimetres = bounds.max.map((value, axis) => Math.max(1, Math.round((value - bounds.min[axis]) * 1000)));
  return { width: millimetres[0], height: millimetres[1], depth: millimetres[2] };
}

export function mapPolyhavenCategory({ category = "", tags = [] } = {}) {
  const text = `${category} ${tags.join(" ")}`.toLowerCase();
  if (/chair|seat|sofa|couch|bench|stool|armchair/.test(text)) return "소파·의자";
  if (/bed|sleep|mattress/.test(text)) return "침실";
  if (/table|desk/.test(text)) return "테이블·책상";
  if (/cabinet|storage|shelf|drawer|wardrobe|bookcase/.test(text)) return "수납";
  if (/kitchen|dining|food|cook|dish|cup|bowl/.test(text)) return "주방·다이닝";
  if (/bath|laundry|toilet|sink|clean/.test(text)) return "욕실·세탁";
  if (/light|lamp|candle|lantern/.test(text)) return "조명";
  if (/electronic|computer|television|radio|camera|phone|appliance|machine/.test(text)) return "가전·전자";
  if (/nature|outdoor|tree|rock|plant|road|street|vehicle|marine/.test(text)) return "야외";
  return "데코";
}

function displayNameFromId(assetId) {
  return assetId.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function buildPolyhavenCatalog({ sourceRoot, apiAssets }) {
  const apiByLowerId = new Map(Object.entries(apiAssets).map(([assetId, metadata]) => [assetId.toLowerCase(), [assetId, metadata]]));
  const fileNames = (await readdir(sourceRoot)).filter((fileName) => fileName.toLowerCase().endsWith(".glb")).sort();
  const items = [];
  for (const fileName of fileNames) {
    const localId = path.basename(fileName, path.extname(fileName));
    const [assetId, metadata] = apiByLowerId.get(localId.toLowerCase()) ?? [localId, {}];
    const filePath = path.join(sourceRoot, fileName);
    const fileStat = await stat(filePath);
    items.push({
      assetId,
      bytes: fileStat.size,
      catalogCategoryLabel: mapPolyhavenCategory(metadata),
      displayName: metadata.name?.trim() || displayNameFromId(assetId),
      fileName,
      license: "CC0-1.0",
      placementCapability: "floor",
      relativePath: `polyhaven-cc0/${fileName}`,
      sizeMm: await readGlbSizeMm(filePath),
      sourceUrl: `https://polyhaven.com/a/${assetId}`,
      tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag) => typeof tag === "string") : [],
      thumbnailPath: `polyhaven-cc0/thumbnails/${assetId}.png`,
      thumbnailSourceUrl: metadata.thumbnail_url,
    });
  }
  const categoryCounts = items.reduce((counts, item) => {
    counts[item.catalogCategoryLabel] = (counts[item.catalogCategoryLabel] ?? 0) + 1;
    return counts;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    source: "https://polyhaven.com/",
    license: "CC0-1.0",
    itemCount: items.length,
    categoryCounts,
    items,
  };
}

async function fetchApiAssets() {
  const response = await fetch(API_URL, { headers: { "User-Agent": API_USER_AGENT } });
  if (!response.ok) throw new Error(`Poly Haven API failed: ${response.status}`);
  return response.json();
}

async function downloadThumbnails(items, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (!item.thumbnailSourceUrl) throw new Error(`Missing thumbnail URL: ${item.assetId}`);
      const response = await fetch(item.thumbnailSourceUrl, { headers: { "User-Agent": API_USER_AGENT } });
      if (!response.ok) throw new Error(`Thumbnail failed ${item.assetId}: ${response.status}`);
      await writeFile(path.join(outputDirectory, `${item.assetId}.png`), Buffer.from(await response.arrayBuffer()));
    }
  }
  await Promise.all(Array.from({ length: 12 }, () => worker()));
}

function cliArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    values[argv[index]] = argv[index + 1];
  }
  return {
    sourceRoot: values["--source"],
    outputPath: values["--output"],
    thumbnailOutput: values["--thumbnail-output"],
  };
}

async function main() {
  const { sourceRoot, outputPath, thumbnailOutput } = cliArguments(process.argv.slice(2));
  if (!sourceRoot || !outputPath || !thumbnailOutput) {
    throw new Error("Usage: node scripts/build-polyhaven-catalog.mjs --source <dir> --output <catalog.json> --thumbnail-output <dir>");
  }
  const catalog = await buildPolyhavenCatalog({ sourceRoot: path.resolve(sourceRoot), apiAssets: await fetchApiAssets() });
  if (catalog.itemCount !== 519) throw new Error(`Expected 519 Poly Haven GLBs, found ${catalog.itemCount}`);
  await downloadThumbnails(catalog.items, path.resolve(thumbnailOutput));
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(path.resolve(outputPath), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Built ${catalog.itemCount} Poly Haven records and thumbnails.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
