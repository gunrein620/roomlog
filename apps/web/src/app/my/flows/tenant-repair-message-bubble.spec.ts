import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const cssSource = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

test("tenant repair messages render as left and right chat bubbles by sender", () => {
  assert.match(
    cssSource,
    /\.tenant-defect-messages li\s*\{[^}]*align-self:\s*flex-start;[^}]*max-width:\s*82%;/,
  );
  assert.match(
    cssSource,
    /\.tenant-defect-messages li\[data-sender="TENANT"\]\s*\{[^}]*align-self:\s*flex-end;[^}]*background:\s*color-mix\(in srgb, var\(--blue-soft\)/,
  );
});
