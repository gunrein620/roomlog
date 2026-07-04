import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const layoutSource = readFileSync(join(__dirname, "layout.tsx"), "utf8");

test("manager report layout requires an authenticated landlord session", () => {
  assert.match(layoutSource, /import \{ requireUser \} from "@\/lib\/session"/);
  assert.match(layoutSource, /export const dynamic = "force-dynamic"/);
  assert.match(layoutSource, /export default async function ManagerReportLayout/);
  assert.match(layoutSource, /await requireUser\("\/manager\/login", "LANDLORD"\)/);
});
