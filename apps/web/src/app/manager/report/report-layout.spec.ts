import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const layoutSource = readFileSync(join(__dirname, "layout.tsx"), "utf8");

test("manager report layout requires an authenticated landlord session", () => {
  assert.match(layoutSource, /import \{ requireUser \} from "@\/lib\/session"/);
  assert.match(layoutSource, /export const dynamic = "force-dynamic"/);
  assert.match(layoutSource, /export default async function ManagerReportLayout/);
  // 통합 로그인: 역할별 로그인 경로 대신 capability 가드만 명시한다(미인증/미연결은 /login으로).
  assert.match(layoutSource, /await requireUser\("LANDLORD"\)/);
});
