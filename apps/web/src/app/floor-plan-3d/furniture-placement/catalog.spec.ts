import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  FURNITURE_CATALOG,
  IKEA_FURNITURE_CATALOG,
  catalogKind,
  furnitureImageUrl,
  normalizeCatalogItem
} from "./catalog";
import {
  createFurnitureModel,
  finalizeFurnitureDraft,
  createLandlordOptionFurniture,
  createResidentDesignFurniture,
  isLockedFurnitureForResident,
  moveFurnitureDraftToPoint,
  rotateFurnitureQuarterTurn
} from "./placement";
import type { FurnitureCatalogItem, WheretoputWall3D } from "../room-model/types";

const testWall: WheretoputWall3D = {
  dimensions: { depth: 0.12, height: 2.4, width: 4 },
  id: "test-wall",
  material: "wall",
  position: [0, 1.2, 0],
  rotation: [0, 0, 0],
  wall_id: "test-wall"
};

describe("furniture placement catalog", () => {
  it("adds curated IKEA crawl items to the fallback catalog", () => {
    assert.ok(IKEA_FURNITURE_CATALOG.length >= 7);

    const ikeaBed = IKEA_FURNITURE_CATALOG.find((item) => item.furniture_id === "ikea-bed-20411232");
    assert.ok(ikeaBed);
    assert.equal(ikeaBed.brand, "IKEA");
    assert.deepEqual(ikeaBed.length, [970, 1950, 2070]);
    assert.equal(ikeaBed.modelUrl, "/furniture-models/bed-queen.glb");
    assert.equal(catalogKind(ikeaBed), "침대");

    const ikeaChair = IKEA_FURNITURE_CATALOG.find((item) => item.furniture_id === "ikea-chair-10449264");
    assert.ok(ikeaChair);
    assert.equal(catalogKind(ikeaChair), "의자");

    assert.ok(FURNITURE_CATALOG.some((item) => item.furniture_id === "ikea-bed-20411232"));
  });

  it("normalizes API catalog items with placement-ready model metadata", () => {
    const sourceItem = {
      brand: "IKEA",
      category: "책상",
      color: "화이트",
      furniture_id: "ikea-desk-test",
      length: [1200, 740, 600],
      name: "Test desk",
      price: 100000,
      source: "ikea-desk"
    } satisfies FurnitureCatalogItem;

    const normalized = normalizeCatalogItem(sourceItem, 0);

    assert.equal(normalized.modelUrl, "/furniture-models/table-moon.glb");
    assert.equal(normalized.color, "화이트");
    assert.deepEqual(normalized.length, [1200, 740, 600]);
  });

  it("picks the best available furniture image for catalog cards", () => {
    assert.equal(furnitureImageUrl(IKEA_FURNITURE_CATALOG[0]), IKEA_FURNITURE_CATALOG[0].thumbnailUrl);
    assert.equal(
      furnitureImageUrl({
        ...IKEA_FURNITURE_CATALOG[0],
        thumbnailUrl: undefined,
        imageUrls: ["https://example.com/fallback.jpg"]
      }),
      "https://example.com/fallback.jpg"
    );
    assert.equal(furnitureImageUrl({ ...IKEA_FURNITURE_CATALOG[0], imageUrls: [], thumbnailUrl: undefined }), undefined);
  });

  it("keeps landlord option furniture locked for resident mode", () => {
    const placed = createFurnitureModel(IKEA_FURNITURE_CATALOG[0], [1, 0, 2]);
    const landlordOption = createLandlordOptionFurniture(placed);
    const residentDesign = createResidentDesignFurniture(placed);

    assert.equal(landlordOption.source, "LANDLORD_OPTION");
    assert.equal(landlordOption.locked, true);
    assert.equal(isLockedFurnitureForResident(landlordOption, "resident"), true);
    assert.equal(isLockedFurnitureForResident(residentDesign, "resident"), false);
  });

  it("moves, rotates, and finalizes a pending furniture draft explicitly", () => {
    const draft = createFurnitureModel(IKEA_FURNITURE_CATALOG[4], [0, 0, 0]);
    const movedDraft = moveFurnitureDraftToPoint(draft, { x: 1.234, z: -0.456 });
    const rotatedDraft = rotateFurnitureQuarterTurn(movedDraft);
    const finalizedFurniture = finalizeFurnitureDraft(rotatedDraft, "landlord");

    assert.deepEqual(movedDraft.position, [1.23, IKEA_FURNITURE_CATALOG[4].length[1] / 2000, -0.46]);
    assert.deepEqual(rotatedDraft.rotation, [0, Number((Math.PI / 2).toFixed(4)), 0]);
    assert.equal(finalizedFurniture.source, "LANDLORD_OPTION");
    assert.equal(finalizedFurniture.locked, true);
    assert.deepEqual(finalizedFurniture.position, movedDraft.position);
    assert.deepEqual(finalizedFurniture.rotation, rotatedDraft.rotation);
  });

  it("keeps finalized furniture stationary when the floor is clicked", () => {
    const draft = createFurnitureModel(IKEA_FURNITURE_CATALOG[4], [0, 0, 0]);
    const finalizedFurniture = finalizeFurnitureDraft(draft, "landlord");
    const residentFurniture = finalizeFurnitureDraft(draft, "resident");
    const movedFurniture = moveFurnitureDraftToPoint(finalizedFurniture, { x: 1.234, z: -0.456 });
    const movedResidentFurniture = moveFurnitureDraftToPoint(residentFurniture, { x: -2, z: 3 });

    assert.deepEqual(movedFurniture.position, finalizedFurniture.position);
    assert.deepEqual(movedResidentFurniture.position, residentFurniture.position);
  });

  it("keeps pending furniture outside wall thickness", () => {
    const draft = createFurnitureModel(IKEA_FURNITURE_CATALOG[4], [0, 0, 0]);
    const movedDraft = moveFurnitureDraftToPoint(draft, { x: 0, z: 0.01 }, [testWall]);

    assert.deepEqual(movedDraft.position, [0, IKEA_FURNITURE_CATALOG[4].length[1] / 2000, 0.36]);
  });

  it("snaps pending furniture flush to a nearby wall face", () => {
    const draft = createFurnitureModel(IKEA_FURNITURE_CATALOG[4], [0, 0, 0]);
    const movedDraft = moveFurnitureDraftToPoint(draft, { x: 0, z: 0.48 }, [testWall]);

    assert.deepEqual(movedDraft.position, [0, IKEA_FURNITURE_CATALOG[4].length[1] / 2000, 0.36]);
  });
});
