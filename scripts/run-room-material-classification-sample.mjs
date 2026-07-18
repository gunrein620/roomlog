import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const ROOM_TYPES = [
  "LIVING_ROOM",
  "BEDROOM",
  "DRESS_ROOM",
  "KITCHEN_DINING",
  "BATHROOM",
  "LAUNDRY_UTILITY",
  "BALCONY",
  "ENTRY",
  "HALLWAY",
  "UNKNOWN",
];

const IMAGE_EXTENSIONS = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const RESPONSE_SCHEMA = {
  additionalProperties: false,
  properties: {
    noiseFlags: {
      additionalProperties: false,
      properties: {
        decorativeHatching: { type: "boolean" },
        watermark: { type: "boolean" },
      },
      required: ["decorativeHatching", "watermark"],
      type: "object",
    },
    planStyle: { enum: ["solid-filled", "double-line-hollow", "hatched", "gray-fill"], type: "string" },
    rooms: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { maximum: 1, minimum: 0, type: "number" },
          label: { type: "string" },
          roomType: { enum: ROOM_TYPES, type: "string" },
          polygon: {
            items: {
              additionalProperties: false,
              properties: {
                x: { maximum: 1000, minimum: 0, type: "number" },
                y: { maximum: 1000, minimum: 0, type: "number" },
              },
              required: ["x", "y"],
              type: "object",
            },
            maxItems: 12,
            minItems: 4,
            type: "array",
          },
        },
        required: ["label", "roomType", "polygon", "confidence"],
        type: "object",
      },
      maxItems: 40,
      type: "array",
    },
    summary: { type: "string" },
  },
  required: ["summary", "planStyle", "noiseFlags", "rooms"],
  type: "object",
};

const INSTRUCTIONS = [
  "당신은 Roomlog의 도면 방 구조 분석기입니다.",
  "도면 스타일을 solid-filled, double-line-hollow, hatched, gray-fill 중 하나로 분류합니다.",
  "장식 해칭과 워터마크 같은 구조 추출 방해 요소를 noiseFlags에 표시합니다.",
  "각 방의 외곽 polygon을 0~1000 정규화 좌표로 반환합니다. 좌상단 원점, x는 오른쪽, y는 아래이며 이미지 너비/높이 기준입니다.",
  "polygon은 직교 꼭짓점 4~12개만 사용하고, 가구/치수선/텍스트는 방 polygon으로 만들지 않습니다.",
  "응답은 제공된 JSON schema를 엄격히 따릅니다.",
].join("\n");

const BFF_PROMPT = [
  "도면에 표시된 모든 실내 공간의 이름과 닫힌 polygon을 반환하세요.",
  "침실, 거실, 주방/식당, 화장실, 다용도실, 현관, 발코니나 베란다를 망라하세요.",
  "공간명이 없어도 외벽에 연결된 주 출입문 위치, 현관문과 주방 싱크대 바닥 패턴을 근거로 공간 용도를 추정하세요.",
  "특히 주 출입문 근처의 현관 polygon을 반환하되 불확실하면 confidence를 낮추세요.",
  "세대 외부의 공용 복도, 계단실, 엘리베이터 홀은 현관 또는 실내 공간으로 반환하지 마세요. 현관은 주 출입문을 통과한 뒤 세대 내부에 있는 바닥 영역만 반환하세요.",
  "거실과 식당이 열린 하나의 공간이면 거실과 식당 사이에 경계를 임의로 만들지 마세요.",
  "현관 polygon이 열린 거실 영역으로 확장되지 않도록 하고, 연결된 열린 영역의 15% 이내로 제안하세요.",
  "도면 치수를 확인할 수 있으면 현관 polygon을 6m² 이내로 제안하세요.",
  "가구와 치수선은 polygon에서 제외하고 실제 바닥 영역만 포함하세요.",
].join(" ");

function readOption(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function parseEnv(contents, key) {
  const line = contents.split(/\r?\n/).find((value) => new RegExp(`^\\s*${key}\\s*=`).test(value));
  if (!line) return "";
  const value = line.replace(new RegExp(`^\\s*${key}\\s*=\\s*`), "").trim();
  return value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
}

async function loadConfig(rootDirectory) {
  const envPath = resolve(rootDirectory, ".env");
  const env = await readFile(envPath, "utf8");
  const apiKey = process.env.OPENAI_API_KEY || parseEnv(env, "OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return {
    apiKey,
    model: process.env.OPENAI_FLOOR_PLAN_MODEL || parseEnv(env, "OPENAI_FLOOR_PLAN_MODEL")
      || process.env.OPENAI_CHAT_MODEL || parseEnv(env, "OPENAI_CHAT_MODEL") || "gpt-5.4-mini",
  };
}

function responseText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  return Array.isArray(payload?.output)
    ? payload.output.flatMap((item) => item?.content ?? []).map((item) => item?.text ?? "").join("\n")
    : "";
}

async function analyzeImage({ apiKey, effort, filePath, mimeType, model, prompt }) {
  const image = await readFile(filePath);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": "roomlog-floor-material-sample",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort },
      instructions: INSTRUCTIONS,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: `data:${mimeType};base64,${image.toString("base64")}`, detail: "high" },
        ],
      }],
      text: { format: { name: "floor_plan_room_structure", schema: RESPONSE_SCHEMA, strict: true, type: "json_schema" } },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const result = JSON.parse(responseText(body));
  return {
    rooms: Array.isArray(result.rooms) ? result.rooms : [],
    summary: typeof result.summary === "string" ? result.summary : "",
  };
}

const rootDirectory = resolve(import.meta.dirname, "..");
const inputDirectory = resolve(readOption("--input", "C:/Users/smoun/OneDrive/Desktop/도면/naver/naver/images"));
const limit = Math.max(1, Math.min(100, Number.parseInt(readOption("--limit", "30"), 10) || 30));
const outputDirectory = resolve(readOption("--output", join(rootDirectory, "output", "room-material-classification-sample")));
const requestedFiles = String(readOption("--files", "")).split(",").map((value) => value.trim()).filter(Boolean);
const requestedModel = String(readOption("--model", "")).trim();
const effort = String(readOption("--effort", "low")).trim();
const prompt = BFF_PROMPT;
const { apiKey, model: configuredModel } = await loadConfig(rootDirectory);
const model = requestedModel || configuredModel;
const availableEntries = (await readdir(inputDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "en"));
const entries = requestedFiles.length
  ? requestedFiles.filter((fileName) => availableEntries.includes(fileName))
  : availableEntries.slice(0, limit);
if (!entries.length) throw new Error("No requested images were found.");

const totals = Object.fromEntries(ROOM_TYPES.map((roomType) => [roomType, 0]));
const results = [];
await mkdir(outputDirectory, { recursive: true });
async function saveProgress() {
  await writeFile(join(outputDirectory, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(
    join(outputDirectory, "progress.json"),
    `${JSON.stringify({ effort, model, processedImages: results.length, requestedImages: entries.length, roomsByType: totals }, null, 2)}\n`,
  );
}
for (const [index, fileName] of entries.entries()) {
  const filePath = join(inputDirectory, fileName);
  const mimeType = IMAGE_EXTENSIONS.get(extname(fileName).toLowerCase());
  process.stdout.write(`[${index + 1}/${entries.length}] ${fileName}\n`);
  const startedAt = Date.now();
  try {
    const analysis = await analyzeImage({ apiKey, effort, filePath, mimeType, model, prompt });
    for (const room of analysis.rooms) totals[room.roomType] += 1;
    results.push({ elapsedMs: Date.now() - startedAt, fileName, ...analysis });
  } catch (error) {
    results.push({ elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error), fileName, rooms: [], summary: "" });
  }
  await saveProgress();
}

const missingFromResponse = Object.fromEntries(
  ["BATHROOM", "LAUNDRY_UTILITY", "BALCONY", "ENTRY"].map((roomType) => [
    roomType,
    results.filter((result) => !result.error && !result.rooms.some((room) => room.roomType === roomType)).map((result) => result.fileName),
  ]),
);
const summary = {
  completedAt: new Date().toISOString(),
  inputDirectory,
  effort,
  model,
  promptMode: "current-roomlog",
  requestedImages: entries.length,
  processedImages: results.length,
  failedImages: results.filter((result) => result.error).map((result) => ({ error: result.error, fileName: result.fileName })),
  roomsByType: totals,
  missingFromResponse,
};

await writeFile(join(outputDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(
  join(outputDirectory, "summary.md"),
  [
    "# Room Material Classification Sample",
    "",
    `- Model: ${model}`,
    `- Images: ${results.length}`,
    "",
    "## Returned room types",
    "",
    ...Object.entries(totals).map(([roomType, count]) => `- ${roomType}: ${count}`),
    "",
    "## Images without each sensitive type",
    "",
    ...Object.entries(missingFromResponse).map(([roomType, files]) => `- ${roomType}: ${files.length} images`),
  ].join("\n"),
);

console.log(JSON.stringify(summary, null, 2));
