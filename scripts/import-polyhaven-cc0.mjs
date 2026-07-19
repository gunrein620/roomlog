import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_ROOT = path.resolve("runtime-assets/_imports/polyhaven-cc0");
const API_ROOT = "https://api.polyhaven.com";
const USER_AGENT = "roomlog-furniture-catalog/1.0";
const ASSET_IDS = [
  "Camera_01", "CashRegister_01", "Megaphone_01", "Television_01", "alarm_clock_01", "boombox", "cassette_player", "classic_laptop", "electric_stove", "exterior_aircon_unit", "filmstrip_projector_8mm", "gaming_console", "circuit_board", "korean_public_payphone_01", "portable_generator", "power_box_01", "metal_detector", "Drill_01", "industrial_microscope", "portable_searchlight",
  "drain_cleaner", "plunger", "all_purpose_cleaner", "bleach_bottle", "dustpan", "plastic_broom", "multi_cleaner_5_litre", "multi_cleaner_bottle",
  "ClassicConsole_01", "CoffeeTable_01", "SchoolDesk_01", "WoodenTable_01", "WoodenTable_02", "WoodenTable_03", "dining_table", "coffee_table_round_01", "side_table_01", "CoffeeCart_01", "chinese_console_table", "chinese_tea_table", "gallinera_table", "gothic_coffee_table", "industrial_coffee_table", "metal_office_desk", "modern_coffee_table_01", "modern_coffee_table_02", "painted_wooden_table", "round_wooden_table_01", "round_wooden_table_02", "side_table_tall_01", "small_wooden_table_01", "wooden_picnic_table", "outdoor_table_chair_set_01", "modern_wooden_cabinet", "ornate_mirror_01",
  "Chandelier_01", "Chandelier_02", "Chandelier_03", "caged_hanging_light", "desk_lamp_arm_01", "industrial_wall_lamp", "modern_ceiling_lamp_01", "lightbulb_01",
];

async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function getBytes(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function stripExternalTextures(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(stripExternalTextures);
    return;
  }
  for (const key of Object.keys(value)) {
    if (/texture/i.test(key)) delete value[key];
    else stripExternalTextures(value[key]);
  }
}

function makeGlb(json, bin) {
  delete json.images;
  delete json.textures;
  delete json.samplers;
  stripExternalTextures(json.materials);
  for (const buffer of json.buffers ?? []) delete buffer.uri;
  if (!json.buffers?.length) json.buffers = [{}];
  json.buffers[0].byteLength = bin.length;

  const jsonChunk = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPadding = (4 - (jsonChunk.length % 4)) % 4;
  const binPadding = (4 - (bin.length % 4)) % 4;
  const paddedJson = Buffer.concat([jsonChunk, Buffer.alloc(jsonPadding, 0x20)]);
  const paddedBin = Buffer.concat([bin, Buffer.alloc(binPadding)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + paddedJson.length + 8 + paddedBin.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedJson.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedBin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, paddedJson, binHeader, paddedBin]);
}

async function importAsset(assetId) {
  const files = await getJson(`${API_ROOT}/files/${assetId}`);
  const gltf = files.gltf?.["1k"]?.gltf;
  if (!gltf?.url || !gltf.include) throw new Error(`No 1k glTF export for ${assetId}`);
  const bin = Object.entries(gltf.include).find(([name]) => name.toLowerCase().endsWith(".bin"));
  if (!bin) throw new Error(`No binary buffer for ${assetId}`);
  const sourceJson = await (await fetch(gltf.url, { headers: { "User-Agent": USER_AGENT } })).json();
  const binBytes = await getBytes(bin[1].url);
  const outputPath = path.join(OUTPUT_ROOT, `${assetId}.glb`);
  await writeFile(outputPath, makeGlb(sourceJson, binBytes));
  return { assetId, sourceUrl: `https://polyhaven.com/a/${assetId}`, gltfUrl: gltf.url, outputPath: path.relative(process.cwd(), outputPath).replaceAll("\\", "/") };
}

await mkdir(OUTPUT_ROOT, { recursive: true });
const imported = [];
for (const assetId of ASSET_IDS) {
  imported.push(await importAsset(assetId));
  console.log(`imported ${assetId}`);
}
await writeFile(path.join(OUTPUT_ROOT, "source-manifest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), license: "CC0-1.0", source: "https://polyhaven.com/", items: imported }, null, 2)}\n`, "utf8");
