import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const sourceDir = join(process.cwd(), "src");

const collectSpecs = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSpecs(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".spec.ts") && entry.name !== "demo-login-button.spec.ts") {
      files.push(fullPath);
    }
  }

  return files;
};

if (!statSync(sourceDir).isDirectory()) {
  throw new Error(`Missing source directory: ${sourceDir}`);
}

const specFiles = collectSpecs(sourceDir)
  .map((file) => relative(process.cwd(), file))
  .sort();

if (specFiles.length === 0) {
  console.log("No TypeScript unit specs found.");
  process.exit(0);
}

const result = spawnSync(process.execPath, ["--test", "-r", "ts-node/register", ...specFiles], {
  env: {
    ...process.env,
    TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: "commonjs" })
  },
  stdio: "inherit",
  windowsHide: true
});

process.exit(result.status ?? 1);
