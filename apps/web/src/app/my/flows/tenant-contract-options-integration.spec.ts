import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const pageSource = readFileSync(
  join(root, "src/app/my/flows/TenantMyPage.tsx"),
  "utf8",
);
const cssSource = readFileSync(join(root, "src/app/globals.css"), "utf8");

test("stores matched listing options on the selected tenancy", () => {
  assert.match(pageSource, /listingOptions:\s*string\[\]/);
  assert.match(
    pageSource,
    /findTenantContractListing\(\s*listings,\s*acceptedListingId,\s*selectedRoom,?\s*\)/,
  );
  assert.match(
    pageSource,
    /listingOptions\s*=\s*tenantContractOptions\(matchedListing\)/,
  );
  assert.match(pageSource, /imageUrl:\s*residenceImageUrl,\s*listingOptions,/);
});

test("renders read-only options after the contract table and before confirm", () => {
  assert.match(
    pageSource,
    /<dl className="detail-info-table contract-sheet-table">[\s\S]*?<\/dl>[\s\S]*?<section[\s\S]*?className="tenant-contract-options"[\s\S]*?<button className="notification-action"/,
  );
  assert.match(pageSource, /옵션 \(선택\)/);
  assert.match(pageSource, /className="tenant-contract-option-list" role="list"/);
  assert.match(pageSource, /등록된 옵션이 없습니다\./);
  assert.match(
    pageSource,
    /tenancy\.listingOptions\.map\(\(option\) => \([\s\S]*?<li key=\{option\}>\{option\}<\/li>/,
  );
});

test("uses token-only responsive styles for the option list", () => {
  const styleStart = cssSource.indexOf(".tenant-contract-options");
  const styleEnd = cssSource.indexOf("/* ── 내 룸로그", styleStart);
  const contractOptionCss = cssSource.slice(
    styleStart,
    styleEnd === -1 ? undefined : styleEnd,
  );

  assert.notEqual(styleStart, -1);
  assert.match(contractOptionCss, /\.tenant-contract-option-list\s*\{/);
  assert.match(contractOptionCss, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(
    cssSource,
    /@media[^{]*max-width:\s*560px[\s\S]*?\.tenant-contract-option-list\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.doesNotMatch(contractOptionCss, /#[0-9a-fA-F]{3,8}|rgba?\(/);
});
