import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const globalsSource = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

test("shows a visible horizontal scrollbar below the furniture category chips", () => {
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-tabs\s*\{[^}]*overflow-x:\s*auto;[^}]*scrollbar-color:\s*#8e8e8e\s+#f2f2f2;[^}]*scrollbar-width:\s*thin;[^}]*\}/,
  );
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-tabs::-webkit-scrollbar\s*\{[^}]*height:\s*8px;[^}]*\}/,
  );
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-tabs::-webkit-scrollbar-track\s*\{[^}]*background:\s*#f2f2f2;[^}]*border-radius:\s*999px;[^}]*\}/,
  );
  assert.match(
    globalsSource,
    /\.listing-tour-furniture-category-tabs::-webkit-scrollbar-thumb\s*\{[^}]*background:\s*#8e8e8e;[^}]*border-radius:\s*999px;[^}]*\}/,
  );
});
