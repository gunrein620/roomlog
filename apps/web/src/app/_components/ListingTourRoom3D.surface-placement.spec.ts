import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");

test("resolves rich scene hits and only confirms valid placement", () => {
  assert.match(source, /resolveFurniturePlacement/);
  assert.match(source, /lastFurniturePlacementHitRef/);
  assert.match(source, /pendingFurniturePlacementRef\.current\?\.valid/);
  assert.match(source, /onFurniturePlacementHit=\{placePendingFurnitureAtHit\}/);
  assert.match(source, /onFurnitureLatestPlacementHit=\{rememberFurniturePlacementHit\}/);
});

test("routes R removal and protects supports with attached furniture", () => {
  assert.match(source, /function removePendingFurnitureFromShortcut/);
  assert.match(source, /onFurnitureRemove=\{removePendingFurnitureFromShortcut\}/);
  assert.match(source, /hasAttachedFurniture/);
  assert.match(source, /위에 놓인 가구를 먼저 제거하세요/);
});

test("moves attached children and saves attachment metadata", () => {
  assert.match(source, /moveAttachedFurniture/);
  assert.match(source, /placement: furniture\.placement/);
  assert.match(source, /rotateFurnitureForPlacement/);
});
