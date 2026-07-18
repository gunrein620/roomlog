import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Docker Compose web port", () => {
  it("keeps the Next.js container on port 3000 even when .env.local defines PORT", () => {
    const source = readFileSync("docker-compose.yml", "utf8");
    const webService = source.match(/\n  web:\r?\n([\s\S]*?)\r?\n  api:/)?.[1] ?? "";

    assert.match(webService, /\r?\n      PORT:\s*["']?3000["']?/);
  });
});
