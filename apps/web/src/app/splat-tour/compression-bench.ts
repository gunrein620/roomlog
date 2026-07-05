export type SplatBenchFormat = "spz" | "sog";

export type CompressionBenchStatus = "measured" | "not-measured" | "missing" | "blocked";

export interface CompressionBenchAsset {
  format: SplatBenchFormat;
  fileName: string;
  bytes: number | null;
  loadingMs?: number | null;
  fps?: number | null;
  status?: CompressionBenchStatus;
  note?: string;
}

export interface CompressionBenchRow {
  format: SplatBenchFormat;
  fileName: string;
  bytes: number | null;
  sizeMiB: number | null;
  loadingMs: number | null;
  fps: number | null;
  status: CompressionBenchStatus;
  note: string;
}

export interface LoadingSample {
  format: SplatBenchFormat;
  loadingMs: number;
}

export interface LoadingSummary {
  format: SplatBenchFormat;
  samples: number[];
  averageMs: number;
  minMs: number;
  maxMs: number;
}

export interface SplatLoadingTarget {
  url: string;
  label?: string;
}

export interface SplatMeshLike {
  initialized: Promise<unknown>;
  dispose?: () => void;
  numSplats?: number;
}

export interface SplatLoadingOptions {
  runs?: number;
  now?: () => number;
  createMesh?: (target: SplatLoadingTarget) => SplatMeshLike | Promise<SplatMeshLike>;
}

export interface SplatLoadingResult {
  url: string;
  runs: number;
  samplesMs: number[];
  averageMs: number;
  minMs: number;
  maxMs: number;
  numSplats: number | null;
}

export interface FpsMeasureOptions {
  frameCount?: number;
  now?: () => number;
  requestFrame?: (callback: (time: number) => void) => number;
  onFrame?: (frameIndex: number) => void;
}

export interface FpsMeasureResult {
  frames: number;
  durationMs: number;
  averageFps: number;
}

const MIB = 1024 * 1024;

export function normalizeSplatFormat(value: string): SplatBenchFormat {
  const normalized = value.trim().replace(/^\./, "").toLowerCase();
  if (normalized === "spz" || normalized === "sog") {
    return normalized;
  }
  throw new Error(`Unsupported splat format: ${value}`);
}

export function parseLoadingSamples(source: string): LoadingSample[] {
  const trimmed = source.trim();
  if (!trimmed) return [];

  const jsonSamples = parseJsonLoadingSamples(trimmed);
  if (jsonSamples) return jsonSamples;

  const samples: LoadingSample[] = [];
  for (const rawLine of source.split(/\r?\n|,/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line || /^\|?\s*-+\s*(?:\|\s*-+\s*)*$/.test(line)) continue;

    const sample = parseTextLoadingSample(line);
    if (sample) samples.push(sample);
  }
  return samples;
}

export function summarizeLoadingSamples(samples: LoadingSample[]): LoadingSummary[] {
  const grouped = new Map<SplatBenchFormat, number[]>();
  for (const sample of samples) {
    const values = grouped.get(sample.format) ?? [];
    values.push(sample.loadingMs);
    grouped.set(sample.format, values);
  }

  return Array.from(grouped.entries()).map(([format, values]) => {
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      format,
      samples: values,
      averageMs: total / values.length,
      minMs: Math.min(...values),
      maxMs: Math.max(...values)
    };
  });
}

export function buildCompressionBenchRows(
  assets: CompressionBenchAsset[],
  loadingSamples: LoadingSample[] = []
): CompressionBenchRow[] {
  const loadingByFormat = new Map(
    summarizeLoadingSamples(loadingSamples).map((summary) => [summary.format, summary.averageMs])
  );

  return assets.map((asset) => {
    const bytes = normalizeNullableNumber(asset.bytes, "bytes");
    const loadingMs = normalizeNullableNumber(asset.loadingMs ?? loadingByFormat.get(asset.format) ?? null, "loadingMs");
    const fps = normalizeNullableNumber(asset.fps ?? null, "fps");
    const status = asset.status ?? inferStatus(bytes, loadingMs);

    return {
      format: asset.format,
      fileName: asset.fileName,
      bytes,
      sizeMiB: bytes === null ? null : bytes / MIB,
      loadingMs,
      fps,
      status,
      note: asset.note ?? ""
    };
  });
}

export function formatCompressionBenchTable(rows: CompressionBenchRow[]): string {
  const lines = [
    "| Format | File | Size (bytes) | Size (MiB) | Loading avg (ms) | FPS avg | Status | Note |",
    "|---|---:|---:|---:|---:|---:|---|---|"
  ];

  for (const row of rows) {
    lines.push(
      [
        `.${row.format}`,
        escapeTableCell(row.fileName),
        formatInteger(row.bytes),
        formatDecimal(row.sizeMiB, 2),
        formatDecimal(row.loadingMs, 1),
        formatDecimal(row.fps, 1),
        row.status,
        escapeTableCell(row.note)
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |")
    );
  }

  return lines.join("\n");
}

export function createCompressionBenchReport(rows: CompressionBenchRow[], title = "Splat Compression Bench"): string {
  return [`# ${title}`, "", formatCompressionBenchTable(rows)].join("\n");
}

export async function measureSplatMeshLoading(
  target: SplatLoadingTarget,
  options: SplatLoadingOptions = {}
): Promise<SplatLoadingResult> {
  const runs = options.runs ?? 1;
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error("runs must be a positive integer");
  }

  const now = options.now ?? defaultNow;
  const createMesh = options.createMesh ?? createSparkSplatMesh;
  const samplesMs: number[] = [];
  let numSplats: number | null = null;

  for (let index = 0; index < runs; index += 1) {
    const start = now();
    const mesh = await createMesh(target);
    try {
      await mesh.initialized;
      samplesMs.push(now() - start);
      if (Number.isFinite(mesh.numSplats)) {
        numSplats = mesh.numSplats ?? null;
      }
    } finally {
      mesh.dispose?.();
    }
  }

  return {
    url: target.url,
    runs,
    samplesMs,
    averageMs: average(samplesMs),
    minMs: Math.min(...samplesMs),
    maxMs: Math.max(...samplesMs),
    numSplats
  };
}

export async function measureAverageFps(options: FpsMeasureOptions = {}): Promise<FpsMeasureResult> {
  const frameCount = options.frameCount ?? 120;
  if (!Number.isInteger(frameCount) || frameCount < 2) {
    throw new Error("frameCount must be an integer greater than 1");
  }

  const now = options.now ?? defaultNow;
  const requestFrame =
    options.requestFrame ??
    (globalThis as { requestAnimationFrame?: (callback: (time: number) => void) => number }).requestAnimationFrame;
  if (typeof requestFrame !== "function") {
    throw new Error("requestAnimationFrame is required to measure FPS");
  }

  const start = now();
  for (let frame = 0; frame < frameCount; frame += 1) {
    await new Promise<void>((resolve) => {
      requestFrame(() => resolve());
    });
    options.onFrame?.(frame);
  }
  const durationMs = now() - start;

  return {
    frames: frameCount,
    durationMs,
    averageFps: (frameCount / durationMs) * 1000
  };
}

function parseJsonLoadingSamples(source: string): LoadingSample[] | null {
  if (!source.startsWith("{") && !source.startsWith("[")) return null;

  const parsed = JSON.parse(source) as unknown;
  if (Array.isArray(parsed)) {
    return parsed.map((item) => parseJsonLoadingSample(item));
  }
  if (parsed && typeof parsed === "object") {
    return Object.entries(parsed).flatMap(([format, value]) => {
      if (Array.isArray(value)) {
        return value.map((entry) => ({
          format: normalizeSplatFormat(format),
          loadingMs: normalizeDuration(entry)
        }));
      }
      return [{ format: normalizeSplatFormat(format), loadingMs: normalizeDuration(value) }];
    });
  }

  throw new Error("Loading sample JSON must be an object or array");
}

function parseJsonLoadingSample(item: unknown): LoadingSample {
  if (!item || typeof item !== "object") {
    throw new Error("Loading sample entries must be objects");
  }

  const record = item as Record<string, unknown>;
  const format = normalizeSplatFormat(String(record.format ?? record.ext ?? record.extension ?? ""));
  const value = record.loadingMs ?? record.ms ?? record.loading ?? record.durationMs;
  return { format, loadingMs: normalizeDuration(value) };
}

function parseTextLoadingSample(line: string): LoadingSample | null {
  const keyValueMatch = line.match(/^\.?(spz|sog)\s*(?:=|:|\s)\s*([0-9]+(?:\.[0-9]+)?)\s*(ms|s)?$/i);
  if (keyValueMatch) {
    return {
      format: normalizeSplatFormat(keyValueMatch[1]),
      loadingMs: normalizeDuration(`${keyValueMatch[2]}${keyValueMatch[3] ?? "ms"}`)
    };
  }

  const cells = line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (cells.length >= 2) {
    const formatCell = cells.find((cell) => /^\.?(spz|sog)$/i.test(cell));
    const loadingCell = cells.find((cell) => /(?:^|\s)[0-9]+(?:\.[0-9]+)?\s*(?:ms|s)\b/i.test(cell));
    if (formatCell && loadingCell) {
      return {
        format: normalizeSplatFormat(formatCell),
        loadingMs: normalizeDuration(loadingCell)
      };
    }
  }

  return null;
}

function normalizeDuration(value: unknown): number {
  if (typeof value === "number") {
    return normalizeNonNegativeNumber(value, "loadingMs");
  }
  if (typeof value !== "string") {
    throw new Error("Loading duration must be a number or string");
  }

  const match = value.trim().match(/([0-9]+(?:\.[0-9]+)?)\s*(ms|s)?/i);
  if (!match) {
    throw new Error(`Invalid loading duration: ${value}`);
  }

  const raw = Number(match[1]);
  const multiplier = match[2]?.toLowerCase() === "s" ? 1000 : 1;
  return normalizeNonNegativeNumber(raw * multiplier, "loadingMs");
}

function normalizeNullableNumber(value: number | null | undefined, field: string): number | null {
  if (value === null || value === undefined) return null;
  return normalizeNonNegativeNumber(value, field);
}

function normalizeNonNegativeNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number`);
  }
  return value;
}

function inferStatus(bytes: number | null, loadingMs: number | null): CompressionBenchStatus {
  if (bytes === null) return "missing";
  if (loadingMs === null) return "not-measured";
  return "measured";
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function createSparkSplatMesh(target: SplatLoadingTarget): Promise<SplatMeshLike> {
  const { SplatMesh } = await import("@sparkjsdev/spark");
  return new SplatMesh({ url: target.url });
}

function defaultNow(): number {
  if (typeof globalThis.performance?.now === "function") {
    return globalThis.performance.now();
  }
  return Date.now();
}

function formatInteger(value: number | null): string {
  return value === null ? "n/a" : Math.round(value).toLocaleString("en-US");
}

function formatDecimal(value: number | null, digits: number): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").trim() || "n/a";
}
