#!/usr/bin/env node
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker as NodeWorker } from "node:worker_threads";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(repoRoot, "apps/web");
const webRequire = createRequire(path.join(webRoot, "package.json"));

process.env.TS_NODE_COMPILER_OPTIONS ??= JSON.stringify({ module: "commonjs" });
webRequire("ts-node/register");

const {
  buildCompressionBenchRows,
  formatCompressionBenchTable,
  measureSplatMeshLoading,
  parseLoadingSamples
} = webRequire("./src/app/splat-tour/compression-bench.ts");

const SPZ_PATH = path.join(webRoot, "public/samples/room.spz");
const SOG_PATH = path.join(webRoot, "public/samples/room.sog");
const SOG_CONVERSION_COMMAND = "npx @playcanvas/splat-transform apps/web/public/samples/room.spz apps/web/public/samples/room.sog";

const options = parseArgs(process.argv.slice(2));
const workers = installSparkWorkerShim();

try {
  const assets = [
    {
      format: "spz",
      fileName: "room.spz",
      bytes: statSync(SPZ_PATH).size,
      note: "Spark SplatMesh.initialized measured from local bytes via Node worker shim"
    }
  ];

  if (existsSync(SOG_PATH)) {
    assets.push({
      format: "sog",
      fileName: "room.sog",
      bytes: statSync(SOG_PATH).size,
      note: "SOG file present; loading measurement can be added with --timing sog=<ms>"
    });
  }

  const timingSamples = options.timingText ? parseLoadingSamples(options.timingText) : [];
  if (!options.noLoad) {
    const loading = await measureLocalSplat(SPZ_PATH, options.runs);
    timingSamples.push({ format: "spz", loadingMs: loading.averageMs });
    assets[0].note += ` (${options.runs} run${options.runs === 1 ? "" : "s"}, ${loading.numSplats ?? "unknown"} splats)`;
  }

  const rows = buildCompressionBenchRows(assets, timingSamples);
  console.log(formatCompressionBenchTable(rows));

  if (!existsSync(SOG_PATH)) {
    console.log("");
    console.log(`SOG conversion blocked: ${SOG_PATH} does not exist.`);
    console.log(`Documented command: ${SOG_CONVERSION_COMMAND}`);
  }
} finally {
  await Promise.allSettled(Array.from(workers).map((worker) => worker.terminate()));
}

async function measureLocalSplat(filePath, runs) {
  globalThis.self = { Blob: undefined };
  globalThis.window = { location: { href: "http://localhost/" } };
  globalThis.ProgressEvent ??= class ProgressEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  };

  const { SplatMesh } = await importSparkModule();
  const fileBytes = new Uint8Array(readFileSync(filePath));

  return measureSplatMeshLoading(
    { url: filePath },
    {
      runs,
      createMesh: () =>
        new SplatMesh({
          fileBytes,
          fileName: path.basename(filePath)
        })
    }
  );
}

async function importSparkModule() {
  const sparkCjsPath = webRequire.resolve("@sparkjsdev/spark");
  const sparkModulePath = path.join(path.dirname(sparkCjsPath), "spark.module.js");
  return import(pathToFileURL(sparkModulePath).href);
}

function installSparkWorkerShim() {
  const activeWorkers = new Set();

  class BrowserWorker {
    constructor(script, options = {}) {
      if (typeof script !== "string" || !script.startsWith("data:text/javascript")) {
        throw new Error(`Unsupported worker script: ${String(script).slice(0, 64)}`);
      }

      const encoded = script.slice(script.indexOf(",") + 1);
      const workerCode = decodeURIComponent(encoded);
      const prelude = `
        const { parentPort } = require("node:worker_threads");
        globalThis.self = globalThis;
        self.location = { href: "http://localhost/" };
        self.addEventListener = (type, callback) => {
          if (type === "message") parentPort.on("message", (data) => callback({ data }));
        };
        self.removeEventListener = () => {};
        self.postMessage = (data, transferOrOptions) => {
          const transfer = Array.isArray(transferOrOptions) ? transferOrOptions : transferOrOptions?.transfer;
          parentPort.postMessage(data, transfer || []);
        };
      `;

      this.listeners = new Map();
      this.worker = new NodeWorker(`${prelude}\n${workerCode}`, {
        eval: true,
        name: options.name
      });
      activeWorkers.add(this.worker);
      this.worker.once("exit", () => activeWorkers.delete(this.worker));
      this.worker.on("message", (data) => {
        const event = { data };
        this.onmessage?.(event);
        for (const callback of this.listeners.get("message") ?? []) {
          callback(event);
        }
      });
      this.worker.on("error", (error) => {
        this.onerror?.(error);
        for (const callback of this.listeners.get("error") ?? []) {
          callback(error);
        }
      });
    }

    postMessage(data, transferOrOptions) {
      const transfer = Array.isArray(transferOrOptions) ? transferOrOptions : transferOrOptions?.transfer;
      this.worker.postMessage(data, transfer || []);
    }

    addEventListener(type, callback) {
      const callbacks = this.listeners.get(type) ?? [];
      callbacks.push(callback);
      this.listeners.set(type, callbacks);
    }

    removeEventListener(type, callback) {
      const callbacks = this.listeners.get(type) ?? [];
      this.listeners.set(
        type,
        callbacks.filter((item) => item !== callback)
      );
    }

    terminate() {
      return this.worker.terminate();
    }
  }

  globalThis.Worker = BrowserWorker;
  return activeWorkers;
}

function parseArgs(args) {
  const parsed = {
    runs: 3,
    noLoad: false,
    timingText: ""
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--no-load") {
      parsed.noLoad = true;
    } else if (arg === "--runs") {
      parsed.runs = parsePositiveInteger(args[++index], "--runs");
    } else if (arg.startsWith("--runs=")) {
      parsed.runs = parsePositiveInteger(arg.slice("--runs=".length), "--runs");
    } else if (arg === "--timing") {
      parsed.timingText += `${args[++index] ?? ""}\n`;
    } else if (arg.startsWith("--timing=")) {
      parsed.timingText += `${arg.slice("--timing=".length)}\n`;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function parsePositiveInteger(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive integer`);
  }
  return parsed;
}
