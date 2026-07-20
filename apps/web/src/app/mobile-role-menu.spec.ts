import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const homeSource = readFileSync(join(__dirname, "HomeApp.tsx"), "utf8");
const cssSource = readFileSync(join(__dirname, "globals.css"), "utf8");
const menuPath = join(__dirname, "_components/MobileRoleMenu.tsx");
const menuSource = existsSync(menuPath) ? readFileSync(menuPath, "utf8") : "";
const bottomTabsSource = homeSource.match(/const bottomTabs[\s\S]*?\n\];/)?.[0] ?? "";

test("HomeApp declares the current-location label once", () => {
  assert.equal(
    (homeSource.match(/const CURRENT_LOCATION_AREA_LABEL\s*=/g) ?? []).length,
    1,
  );
});

test("mobile role menu keeps the bottom navigation to five slots", () => {
  assert.equal((bottomTabsSource.match(/key:\s*"/g) ?? []).length, 4);
  assert.doesNotMatch(bottomTabsSource, /key:\s*"(?:living|sell)"/);
  assert.match(homeSource, /<MobileRoleMenu/);
  assert.match(cssSource, /grid-template-columns:\s*repeat\(5,\s*1fr\)/);
});

test("mobile role menu uses an accessible trigger", () => {
  assert.ok(existsSync(menuPath), "MobileRoleMenu component should exist");
  assert.match(menuSource, /<svg[\s\S]*?className="mobile-role-menu__icon"/);
  assert.match(menuSource, /aria-label="역할 메뉴"/);
  assert.match(menuSource, /aria-expanded=\{isOpen\}/);
  assert.match(menuSource, /aria-controls=\{menuId\}/);
});

test("mobile role menu shows a menu label with the same size and baseline as the other bottom tabs", () => {
  assert.doesNotMatch(menuSource, /import\s*\{[^}]*\bMenu\b[^}]*\}\s*from "lucide-react"/);
  assert.match(menuSource, /width=\{22\}[\s\S]*?height=\{22\}[\s\S]*?viewBox="0 0 24 24"/);
  assert.match(menuSource, /x1="2\.5"[\s\S]*?y1="3"[\s\S]*?x2="21\.5"[\s\S]*?y2="3"/);
  assert.match(menuSource, /x1="2\.5"[\s\S]*?y1="12"[\s\S]*?x2="21\.5"[\s\S]*?y2="12"/);
  assert.match(menuSource, /x1="2\.5"[\s\S]*?y1="21"[\s\S]*?x2="21\.5"[\s\S]*?y2="21"/);
  assert.match(menuSource, /<\/svg>\s*메뉴\s*<\/button>/);
  assert.doesNotMatch(menuSource, /mobile-role-menu__alignment-spacer/);
  assert.match(cssSource, /\.mobile-role-menu__trigger\s*\{[\s\S]*?align-content:\s*center;[\s\S]*?gap:\s*3px;[\s\S]*?font-size:\s*0\.72rem;[\s\S]*?font-weight:\s*900;/);
});

test("mobile role menu opens upward with the three role destinations", () => {
  assert.match(menuSource, /className="mobile-role-menu__dropup"/);
  assert.match(menuSource, />\s*세입자\s*</);
  assert.match(menuSource, />\s*매물등록\s*</);
  assert.match(menuSource, />\s*관리\s*</);
  assert.match(homeSource, /onSelectTenant=\{\(\) => activateTab\("living"\)\}/);
  assert.match(homeSource, /onSelectListing=\{\(\) => activateTab\("sell"\)\}/);
  assert.match(homeSource, /onSelectManager=\{\(\) => \{ window\.location\.href = "\/manager\/home\/00"; \}\}/);
});

test("mobile role menu closes on outside pointer and Escape", () => {
  assert.match(menuSource, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(menuSource, /event\.key === "Escape"/);
  assert.match(menuSource, /triggerRef\.current\?\.focus\(\)/);
});

test("mobile role menu colors come from the shared theme", () => {
  const menuCss = cssSource.match(/\.mobile-role-menu\s*\{[\s\S]*?(?=\n\.floor-plan-page)/)?.[0] ?? "";

  assert.match(menuCss, /var\(--primary\)/);
  assert.match(menuCss, /var\(--on-surface\)/);
  assert.match(menuCss, /var\(--on-surface-variant\)/);
  assert.match(menuCss, /var\(--surface-container-lowest\)/);
  assert.match(menuCss, /var\(--border\)/);
  assert.doesNotMatch(menuCss, /#[\da-fA-F]{3,8}/);
});
