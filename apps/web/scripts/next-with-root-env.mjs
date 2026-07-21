import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const rootEnvPath = resolve(appDir, "..", "..", ".env");
const rootLocalEnvPath = resolve(appDir, "..", "..", ".env.local");
const nextBin = resolve(appDir, "node_modules", "next", "dist", "bin", "next");
const inheritedEnvKeys = new Set(Object.keys(process.env));

function loadRootEnv(filePath, overrideLoadedValues = false) {
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (inheritedEnvKeys.has(key) || (!overrideLoadedValues && process.env[key] !== undefined)) {
      continue;
    }

    let value = rawValue.trim();
    const quote = value[0];
    if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadRootEnv(rootEnvPath, false);
loadRootEnv(rootLocalEnvPath, true);

const nextArgs = process.argv.slice(2);
if (nextArgs.length === 0) {
  console.error("Usage: node scripts/next-with-root-env.mjs <next-command> [...args]");
  process.exit(1);
}

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  cwd: appDir,
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

