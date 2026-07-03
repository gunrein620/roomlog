import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const composeSource = readFileSync(join(__dirname, "../../../../docker-compose.yml"), "utf8");
const productionComposeSource = readFileSync(join(__dirname, "../../../../docker-compose.prod.yml"), "utf8");

test("docker web service uses the api service hostname for server-side API calls", () => {
  assert.match(composeSource, /API_INTERNAL_URL:\s*\$\{API_INTERNAL_URL:-http:\/\/api:4000\}/);
  assert.match(composeSource, /NEXT_PUBLIC_API_URL:\s*\$\{NEXT_PUBLIC_API_URL:-http:\/\/localhost:4000\}/);
});

test("production docker web service provides an absolute internal API URL", () => {
  assert.match(productionComposeSource, /API_INTERNAL_URL:\s*\$\{API_INTERNAL_URL:-http:\/\/api:4000\}/);
  assert.match(productionComposeSource, /NEXT_PUBLIC_API_URL:\s*\$\{NEXT_PUBLIC_API_URL:-\/api\}/);
});
