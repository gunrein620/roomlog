import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDimensionStructureMask,
  classifyEmptyRegions,
  extractWallFaceDimensions,
  formatWallLength,
} from "../viewer/wall-dimensions.mjs";

const createMask = (width, height) => new Uint8Array(width * height);

const fillRectangle = (mask, width, height, x, y, rectangleWidth, rectangleHeight) => {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(width, Math.ceil(x + rectangleWidth));
  const bottom = Math.min(height, Math.ceil(y + rectangleHeight));
  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      mask[row * width + column] = 1;
    }
  }
};

const createWallWithOpeningGap = () => {
  const width = 80;
  const height = 60;
  const mask = createMask(width, height);
  fillRectangle(mask, width, height, 5, 26, 25, 8);
  fillRectangle(mask, width, height, 50, 26, 25, 8);
  return { width, height, mask };
};

for (const kind of ["door", "window"]) {
  test(`a valid attached ${kind} bridges a wall only in the dimension mask`, () => {
    const { width, height, mask } = createWallWithOpeningGap();
    const original = Uint8Array.from(mask);
    const structure = buildDimensionStructureMask(mask, [{
      id: `${kind}-1`,
      kind,
      axis: "horizontal",
      center_x: 40,
      center_y: 30,
      width: 20,
      height: 8,
      valid: true,
    }], width, height);

    assert.deepEqual(mask, original);
    assert.equal(mask[30 * width + 40], 0);
    assert.equal(structure[30 * width + 40], 1);
    assert.equal(structure[26 * width + 29], 1);
    assert.equal(structure[26 * width + 50], 1);
  });
}

test("an invalid or detached opening does not bridge the wall", () => {
  const { width, height, mask } = createWallWithOpeningGap();
  const structure = buildDimensionStructureMask(mask, [{
    id: "door-invalid",
    kind: "door",
    axis: "horizontal",
    center_x: 40,
    center_y: 30,
    width: 20,
    height: 8,
    valid: false,
  }], width, height);

  assert.equal(structure[30 * width + 40], 0);
});

test("empty space is classified as exterior or enclosed interior", () => {
  const width = 60;
  const height = 60;
  const structure = createMask(width, height);
  fillRectangle(structure, width, height, 10, 10, 40, 4);
  fillRectangle(structure, width, height, 10, 46, 40, 4);
  fillRectangle(structure, width, height, 10, 10, 4, 40);
  fillRectangle(structure, width, height, 46, 10, 4, 40);

  const classification = classifyEmptyRegions(structure, width, height);
  const exteriorId = classification.regionIds[0];
  const interiorId = classification.regionIds[30 * width + 30];

  assert.notEqual(exteriorId, interiorId);
  assert.equal(classification.regions[exteriorId].exterior, true);
  assert.equal(classification.regions[interiorId].exterior, false);
  assert.equal(classification.regionIds[10 * width + 10], -1);
});

const createClosedWallRectangle = () => {
  const width = 80;
  const height = 70;
  const mask = createMask(width, height);
  fillRectangle(mask, width, height, 10, 10, 60, 5);
  fillRectangle(mask, width, height, 10, 55, 60, 5);
  fillRectangle(mask, width, height, 10, 10, 5, 50);
  fillRectangle(mask, width, height, 65, 10, 5, 50);
  return { width, height, mask };
};

const roundedLengths = dimensions => dimensions
  .map(item => Math.round(item.lengthPixels))
  .sort((first, second) => first - second);

test("a closed wall exposes separate exterior and interior face lengths", () => {
  const { width, height, mask } = createClosedWallRectangle();
  const dimensions = extractWallFaceDimensions(mask, [], width, height, {
    minimumLengthPixels: 12,
    simplifyTolerancePixels: 1,
  });
  const exterior = dimensions.filter(item => item.face === "exterior");
  const interior = dimensions.filter(item => item.face === "interior");

  assert.equal(exterior.length, 4, JSON.stringify(exterior));
  assert.equal(interior.length, 4, JSON.stringify(interior));
  assert.deepEqual(roundedLengths(exterior), [50, 50, 60, 60]);
  assert.deepEqual(roundedLengths(interior), [40, 40, 50, 50]);
});

test("an interior partition exposes both room-facing sides", () => {
  const { width, height, mask } = createClosedWallRectangle();
  fillRectangle(mask, width, height, 38, 15, 5, 40);

  const dimensions = extractWallFaceDimensions(mask, [], width, height, {
    minimumLengthPixels: 12,
    simplifyTolerancePixels: 1,
  });
  const partitionFaces = dimensions.filter(item => {
    const centerX = (item.start.x + item.end.x) / 2;
    const vertical = Math.abs(item.end.y - item.start.y) > Math.abs(item.end.x - item.start.x);
    return item.face === "interior" && vertical && centerX >= 37 && centerX <= 44 &&
      item.lengthPixels >= 38;
  });

  assert.equal(partitionFaces.length, 2, JSON.stringify(partitionFaces));
  assert.ok(partitionFaces.some(item => item.normal.x < -0.9));
  assert.ok(partitionFaces.some(item => item.normal.x > 0.9));
  assert.notEqual(partitionFaces[0].regionId, partitionFaces[1].regionId);
});

const createWallRectangleWithTopGap = () => {
  const { width, height, mask } = createClosedWallRectangle();
  for (let y = 10; y < 15; y += 1) {
    for (let x = 32; x < 48; x += 1) {
      mask[y * width + x] = 0;
    }
  }
  return { width, height, mask };
};

for (const kind of ["door", "window"]) {
  test(`an attached ${kind} keeps the exterior wall face as one dimension`, () => {
    const { width, height, mask } = createWallRectangleWithTopGap();
    const dimensions = extractWallFaceDimensions(mask, [{
      id: `${kind}-top`,
      kind,
      axis: "horizontal",
      center_x: 40,
      center_y: 12.5,
      width: 16,
      height: 5,
      valid: true,
    }], width, height, {
      minimumLengthPixels: 12,
      simplifyTolerancePixels: 1,
    });
    const fullTopFace = dimensions.find(item =>
      item.face === "exterior" &&
      Math.abs(item.end.x - item.start.x) > Math.abs(item.end.y - item.start.y) &&
      Math.min(item.start.y, item.end.y) <= 10 &&
      item.lengthPixels >= 59,
    );

    assert.ok(fullTopFace, JSON.stringify(dimensions));
  });
}

test("an invalid opening leaves the exterior wall face split", () => {
  const { width, height, mask } = createWallRectangleWithTopGap();
  const dimensions = extractWallFaceDimensions(mask, [{
    id: "door-invalid-top",
    kind: "door",
    axis: "horizontal",
    center_x: 40,
    center_y: 12.5,
    width: 16,
    height: 5,
    valid: false,
  }], width, height, {
    minimumLengthPixels: 12,
    simplifyTolerancePixels: 1,
  });

  assert.equal(dimensions.some(item =>
    item.face === "exterior" &&
    Math.abs(item.end.x - item.start.x) > Math.abs(item.end.y - item.start.y) &&
    Math.min(item.start.y, item.end.y) <= 10 &&
    item.lengthPixels >= 59,
  ), false);
});

test("wall lengths are rounded and formatted in millimeters", () => {
  assert.equal(formatWallLength(4068.4), "4,068 mm");
  assert.equal(formatWallLength(999.5), "1,000 mm");
  assert.equal(formatWallLength(Number.NaN), "");
  assert.equal(formatWallLength(-1), "");
});
