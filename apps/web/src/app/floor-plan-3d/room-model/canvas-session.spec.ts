import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  centerCanvasScrollPosition,
  createCanvasContentBounds,
  createEmptyFloorPlanExtractionMeta,
  createFreshFloorPlanCanvasSession,
  fitCanvasContentView
} from "./canvas-session";

describe("floor plan canvas session", () => {
  it("centers the scroll shell on the drawing origin", () => {
    assert.deepEqual(
      centerCanvasScrollPosition({
        clientHeight: 600,
        clientWidth: 800,
        scrollHeight: 1200,
        scrollWidth: 1600
      }),
      { left: 400, top: 300 }
    );
  });

  it("does not produce negative scroll offsets when the shell is larger than the canvas", () => {
    assert.deepEqual(
      centerCanvasScrollPosition({
        clientHeight: 1300,
        clientWidth: 1700,
        scrollHeight: 1200,
        scrollWidth: 1600
      }),
      { left: 0, top: 0 }
    );
  });

  it("starts a new floor plan canvas session without stale plan content", () => {
    const session = createFreshFloorPlanCanvasSession();

    assert.deepEqual(session.walls, []);
    assert.deepEqual(session.placedFurnitures, []);
    assert.deepEqual(session.detectedObjects, []);
    assert.deepEqual(session.openingCandidates, []);
    assert.deepEqual(session.fixtureCandidates, []);
    assert.equal(session.pendingFurniture, null);
    assert.equal(session.selectedFurnitureId, null);
    assert.equal(session.selectedObjectId, null);
    assert.equal(session.selectedWall, null);
    assert.equal(session.uploadedImage, null);
    assert.equal(session.uploadedAiImageDataUrl, null);
    assert.equal(session.uploadedFloorPlanSource, null);
    assert.equal(session.floorPlanDraftId, null);
    assert.equal(session.lastExtractionMs, null);
    assert.equal(session.viewMode, "2d");
    assert.deepEqual(session.viewOffset, { x: 0, y: 0 });
    assert.equal(session.viewScale, 1);
    assert.equal(session.objectGraphWallThicknessPx, 12);
    assert.deepEqual(session.extractionMeta, createEmptyFloorPlanExtractionMeta());
  });

  it("returns fresh mutable collections on every new session", () => {
    const firstSession = createFreshFloorPlanCanvasSession();
    const secondSession = createFreshFloorPlanCanvasSession();

    assert.notEqual(firstSession.walls, secondSession.walls);
    assert.notEqual(firstSession.hiddenWallIds, secondSession.hiddenWallIds);
    assert.notEqual(firstSession.placedFurnitures, secondSession.placedFurnitures);
    assert.notEqual(firstSession.extractionMeta, secondSession.extractionMeta);
  });

  it("centers the viewport on the actual wall content instead of the canvas origin", () => {
    const bounds = createCanvasContentBounds([
      { id: "top", start: { x: 150, y: 125 }, end: { x: 725, y: 125 } },
      { id: "right", start: { x: 725, y: 125 }, end: { x: 725, y: 450 } }
    ]);

    assert.deepEqual(bounds, {
      height: 325,
      maxX: 725,
      maxY: 450,
      minX: 150,
      minY: 125,
      width: 575
    });
    assert.deepEqual(fitCanvasContentView(bounds, { height: 444, width: 754 }), {
      viewOffset: { x: -437.5, y: -287.5 },
      viewScale: 1
    });
  });

  it("scales down large floor plan content to keep it visible in the canvas shell", () => {
    const view = fitCanvasContentView(
      { height: 900, maxX: 1100, maxY: 700, minX: -100, minY: -200, width: 1200 },
      { height: 444, width: 754 }
    );

    assert.deepEqual(view.viewOffset, { x: -500, y: -250 });
    assert.equal(view.viewScale, 0.32);
  });
});
