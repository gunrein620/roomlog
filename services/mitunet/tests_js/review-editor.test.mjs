import test from "node:test";
import assert from "node:assert/strict";

import * as editorModule from "../viewer/review-editor.mjs";

const {
  CLASS_COLORS,
  ReviewEditor,
  calibrationFromMeasurement,
  gridStepMillimeters,
  hitTestOpening,
  moveOpening,
  openingTouchesWall,
  reviewGridDefinition,
  resizeOpeningLength,
} = editorModule;

test("recognition overlays use translucent blue walls yellow doors and red windows", () => {
  assert.deepEqual(CLASS_COLORS, {
    wall: "rgba(37, 99, 235, 0.48)",
    door: "rgba(245, 158, 11, 0.48)",
    window: "rgba(239, 68, 68, 0.48)",
  });
});

const horizontal = {
  id: "door-1",
  kind: "door",
  center_x: 100,
  center_y: 50,
  width: 40,
  height: 10,
  axis: "horizontal",
  valid: true,
};

test("two selected points and a real length calculate millimeters per pixel", () => {
  const calibration = calibrationFromMeasurement(
    { x: 10, y: 20 },
    { x: 310, y: 420 },
    2500,
  );

  assert.equal(calibration.pixelDistance, 500);
  assert.equal(calibration.actualMillimeters, 2500);
  assert.equal(calibration.millimetersPerPixel, 5);
});

test("grid spacing stays legible as the review view zooms", () => {
  assert.equal(gridStepMillimeters(5, 1), 100);
  assert.equal(gridStepMillimeters(5, 0.1), 500);
  assert.equal(gridStepMillimeters(0.5, 8), 100);
});

test("show original has a visible base grid before scale calibration", () => {
  assert.deepEqual(reviewGridDefinition(null, 1), {
    calibrated: false,
    minorStepPixels: 32,
    majorEvery: 4,
    origin: { x: 0, y: 0 },
  });
});

test("applying calibration replaces the base grid with a real millimeter grid", () => {
  const calibration = calibrationFromMeasurement(
    { x: 20, y: 30 },
    { x: 220, y: 30 },
    1000,
  );

  assert.deepEqual(reviewGridDefinition(calibration, 1), {
    calibrated: true,
    minorStepPixels: 20,
    majorEvery: 10,
    origin: { x: 20, y: 30 },
  });
});

test("manual measurements draw every wall label with thin black strokes and room areas", () => {
  const labels = [];
  const strokes = [];
  const textOutlines = [];
  const plates = [];
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() { strokes.push({ strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }); },
    fillRect(...args) { plates.push(args); },
    translate() {},
    rotate() {},
    measureText(label) { return { width: label.length * 7 }; },
    strokeText(label) { textOutlines.push(label); },
    fillText(label) { labels.push(label); },
  };
  const editor = Object.create(ReviewEditor.prototype);
  editor.context = context;
  editor.viewport = { scale: 1, offsetX: 0, offsetY: 0 };
  editor.wallDimensionSegments = [
    {
      start: { x: 10, y: 20 },
      end: { x: 110, y: 20 },
      normal: { x: 0, y: -1 },
      lengthPixels: 100,
      face: "exterior",
      regionId: 0,
    },
    {
      start: { x: 20, y: 30 },
      end: { x: 120, y: 30 },
      normal: { x: 0, y: -1 },
      lengthPixels: 100,
      face: "interior",
      regionId: 1,
    },
  ];
  editor.roomAreas = [{
    regionId: 2,
    pixelCount: 250,
    areaM2: 10.2,
    anchor: { x: 70, y: 80 },
  }];

  editor.calibration = { millimetersPerPixel: 10, estimated: true };
  const estimatedLayout = editor.buildRoomAreaLabelLayout();
  editor.drawWallDimensions(estimatedLayout.map(item => item.bounds));
  editor.drawRoomAreaLabels(estimatedLayout);
  assert.deepEqual(labels, []);

  editor.calibration = { millimetersPerPixel: 10 };
  const roomLayout = editor.buildRoomAreaLabelLayout();
  editor.drawWallDimensions(roomLayout.map(item => item.bounds));
  editor.drawRoomAreaLabels(roomLayout);

  assert.deepEqual(labels.sort(), ["1,000 mm", "1,000 mm", "10.2 m²"].sort());
  assert.deepEqual(textOutlines.sort(), ["1,000 mm", "1,000 mm"].sort());
  assert.equal(plates.length, 1);
  assert.ok(strokes.some(item => item.strokeStyle === "#111827" && item.lineWidth === 0.8));
  assert.ok(strokes.some(item => item.strokeStyle === "rgba(17, 24, 39, 0.4)"));
});

test("estimated calibration never calculates room areas", () => {
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = { wallMask: new Uint8Array(64), openings: [] };
  editor.calibration = { millimetersPerPixel: 100, estimated: true };
  editor.roomAreas = [{ areaM2: 2, anchor: { x: 2, y: 2 } }];

  assert.deepEqual(editor.refreshRoomAreas(8, 8), []);
  assert.deepEqual(editor.roomAreas, []);
});

test("applying manual calibration refreshes wall dimensions and room areas", () => {
  const calls = [];
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = { revision: 0 };
  editor.scalePoints = [{ x: 10, y: 20 }, { x: 110, y: 20 }];
  editor.refreshWallDimensions = () => calls.push("dimensions");
  editor.refreshRoomAreas = () => calls.push("areas");
  editor.render = () => calls.push("render");
  editor.onChange = () => calls.push("change");

  editor.applyCalibration(1000);

  assert.equal(editor.calibration.estimated, undefined);
  assert.deepEqual(calls, ["dimensions", "areas", "render", "change"]);
});

test("hit testing selects a visible opening box", () => {
  assert.equal(hitTestOpening([horizontal], 110, 50)?.id, "door-1");
  assert.equal(hitTestOpening([horizontal], 160, 50), null);
});

test("moving clamps an opening to the 1024 canvas", () => {
  const moved = moveOpening(horizontal, 1000, 1000, 1024, 1024);

  assert.equal(moved.center_x, 1004);
  assert.equal(moved.center_y, 1019);
});

test("moving a segmented opening clears its display-only mask polygon", () => {
  const moved = moveOpening({
    ...horizontal,
    mask_polygon: [[80, 45], [120, 45], [120, 55], [80, 55]],
  }, 20, 0, 1024, 1024);

  assert.deepEqual(moved.mask_polygon, []);
});

test("horizontal resize changes width but preserves thickness", () => {
  const resized = resizeOpeningLength(horizontal, "end", 130, 50);

  assert.equal(resized.width, 50);
  assert.equal(resized.height, 10);
});

test("vertical resize changes height but preserves thickness", () => {
  const vertical = {
    ...horizontal,
    center_x: 50,
    center_y: 50,
    width: 10,
    height: 40,
    axis: "vertical",
  };

  const resized = resizeOpeningLength(vertical, "end", 50, 90);

  assert.equal(resized.height, 60);
  assert.equal(resized.width, 10);
});

test("resize enforces an eight pixel minimum along-wall length", () => {
  const resized = resizeOpeningLength(horizontal, "end", 81, 50);

  assert.equal(resized.width, 8);
  assert.equal(resized.height, 10);
});

test("opening validity requires wall support at both endpoints", () => {
  const mask = new Uint8Array(20 * 10);
  mask[5 * 20 + 6] = 1;
  mask[5 * 20 + 14] = 1;

  assert.equal(openingTouchesWall(mask, {
    ...horizontal,
    center_x: 10,
    center_y: 5,
    width: 8,
    height: 2,
  }, 20, 10, 0), true);

  mask[5 * 20 + 14] = 0;
  assert.equal(openingTouchesWall(mask, {
    ...horizontal,
    center_x: 10,
    center_y: 5,
    width: 8,
    height: 2,
  }, 20, 10, 0), false);
});

test("manual openings are immediately marked valid or invalid from the wall mask", () => {
  const editor = Object.create(ReviewEditor.prototype);
  editor.manualCounter = 1;
  editor.document = { wallMask: new Uint8Array(1024 * 1024) };
  editor.document.wallMask[100 * 1024 + 90] = 1;
  editor.document.wallMask[100 * 1024 + 110] = 1;

  const matched = editor.createOpeningPreview(
    { x: 90, y: 100 },
    { x: 110, y: 100 },
    "door",
  );
  const unmatched = editor.createOpeningPreview(
    { x: 400, y: 400 },
    { x: 440, y: 400 },
    "window",
  );

  assert.equal(matched.valid, true);
  assert.equal(unmatched.valid, false);
});

test("moving an opening away from every wall marks it invalid", () => {
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = {
    wallMask: new Uint8Array(1024 * 1024),
    openings: [{ ...horizontal }],
  };
  editor.gesture = {
    type: "move",
    start: { x: 0, y: 0 },
    opening: { ...horizontal },
    changed: false,
  };
  editor.activePointerId = 1;
  editor.pointerScreenPoint = event => ({ x: event.clientX, y: event.clientY });
  editor.screenToImage = (x, y) => ({ x, y });
  editor.clampImagePoint = point => point;
  editor.render = () => {};

  editor.handlePointerMove(pointerEvent(1, { clientX: 300, clientY: 300 }));

  assert.equal(editor.document.openings[0].valid, false);
});

test("zoom controls preserve the image point under the canvas center", () => {
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = {};
  editor.viewport = {
    width: 400,
    height: 300,
    fitScale: 0.25,
    scale: 0.25,
    zoom: 1,
    offsetX: 72,
    offsetY: 22,
  };
  editor.render = () => {};

  const before = editor.screenToImage(200, 150);
  editor.zoomBy(2);
  const after = editor.screenToImage(200, 150);

  assert.equal(editor.viewport.zoom, 2);
  assert.deepEqual(after, before);

  editor.fitViewport();
  assert.equal(editor.viewport.zoom, 1);
  assert.equal(editor.viewport.scale, editor.viewport.fitScale);
});

test("active pointer transactions block opening commands", () => {
  for (const command of ["deleteSelected", "toggleSelectedType"]) {
    const calls = [];
    const editor = Object.create(ReviewEditor.prototype);
    editor.document = {
      openings: [{ ...horizontal }],
      beginEdit() { calls.push("begin"); },
      commitEdit() { calls.push("commit"); return true; },
    };
    editor.selectedId = horizontal.id;
    editor.gesture = { type: "move" };
    editor.render = () => calls.push("render");
    editor.onChange = () => calls.push("change");

    assert.equal(editor[command](), false, command);
    assert.deepEqual(editor.document.openings, [horizontal], command);
    assert.deepEqual(calls, [], command);
  }
});

test("outside image starts can be rejected before clamping", () => {
  assert.equal(typeof editorModule.isPointInsideImage, "function");

  const isInside = editorModule.isPointInsideImage;
  assert.equal(isInside({ x: 0, y: 0 }), true);
  assert.equal(isInside({ x: 1024, y: 1024 }), true);
  assert.equal(isInside({ x: -0.01, y: 512 }), false);
  assert.equal(isInside({ x: 512, y: 1024.01 }), false);
});

const createScalePointerProbe = () => {
  const calls = [];
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = {};
  editor.tool = "scale";
  editor.gesture = null;
  editor.activePointerId = null;
  editor.spacePressed = false;
  editor.scalePoints = [];
  editor.calibration = { millimetersPerPixel: 10 };
  editor.wallDimensionSegments = [{ lengthPixels: 10 }];
  editor.pointerScreenPoint = event => ({ x: event.clientX, y: event.clientY });
  editor.screenToImage = (x, y) => ({ x, y });
  editor.clampImagePoint = point => ({ ...point });
  editor.render = () => calls.push("render");
  editor.onChange = () => calls.push("change");
  return { editor, calls };
};

test("scale tool stores exact free click coordinates inside the image", () => {
  const { editor } = createScalePointerProbe();

  editor.handlePointerDown(pointerEvent(1, { clientX: 123.25, clientY: 456.75 }));
  editor.handlePointerDown(pointerEvent(1, { clientX: 800.5, clientY: 700.125 }));

  assert.deepEqual(editor.scalePoints, [
    { x: 123.25, y: 456.75 },
    { x: 800.5, y: 700.125 },
  ]);
});

test("scale tool ignores duplicate points and a third click starts a new measurement", () => {
  const { editor } = createScalePointerProbe();

  editor.handlePointerDown(pointerEvent(1, { clientX: 100, clientY: 200 }));
  editor.handlePointerDown(pointerEvent(1, { clientX: 100, clientY: 200 }));
  assert.deepEqual(editor.scalePoints, [{ x: 100, y: 200 }]);

  editor.handlePointerDown(pointerEvent(1, { clientX: 300, clientY: 400 }));
  editor.handlePointerDown(pointerEvent(1, { clientX: 500, clientY: 600 }));

  assert.deepEqual(editor.scalePoints, [{ x: 500, y: 600 }]);
  assert.equal(editor.calibration, null);
  assert.deepEqual(editor.wallDimensionSegments, []);
});

test("scale tool ignores clicks that start outside the image", () => {
  const { editor, calls } = createScalePointerProbe();

  editor.handlePointerDown(pointerEvent(1, { clientX: -0.25, clientY: 500 }));

  assert.deepEqual(editor.scalePoints, []);
  assert.deepEqual(calls, []);
});

test("binary mask threshold treats antialiased alpha consistently at 128", () => {
  assert.equal(typeof editorModule.binaryMaskFromAlpha, "function");

  const pixels = Uint8ClampedArray.from([
    255, 255, 255, 0,
    255, 255, 255, 127,
    255, 255, 255, 128,
    255, 255, 255, 255,
  ]);

  assert.deepEqual(
    [...editorModule.binaryMaskFromAlpha(pixels)],
    [0, 0, 1, 1],
  );
});

test("binary brush and eraser use the same hard pixel footprint", () => {
  assert.equal(typeof editorModule.rasterizeBinarySegment, "function");

  const added = new Uint8Array(25);
  editorModule.rasterizeBinarySegment(
    added,
    5,
    5,
    { x: 1, y: 2 },
    { x: 3, y: 2 },
    2,
    1,
  );

  const erased = new Uint8Array(25).fill(1);
  editorModule.rasterizeBinarySegment(
    erased,
    5,
    5,
    { x: 1, y: 2 },
    { x: 3, y: 2 },
    2,
    0,
  );

  assert.ok(added.some(value => value === 1));
  assert.deepEqual([...added], [...erased].map(value => 1 - value));
});

test("pointer up samples its coordinates before finalizing edit gestures", async t => {
  for (const type of ["wall", "add", "move", "resize"]) {
    await t.test(type, () => {
      const calls = [];
      const editor = Object.create(ReviewEditor.prototype);
      editor.document = {
        openings: [],
        commitEdit() { calls.push("commit"); return true; },
        cancelEdit() { calls.push("cancel"); return true; },
      };
      editor.gesture = { type, changed: false };
      editor.activePointerId = 1;
      editor.previewOpening = null;
      editor.manualCounter = 1;
      editor.selectedId = null;
      editor.handlePointerMove = event => {
        calls.push(`sample:${event.clientX}`);
        if (type === "add") {
          editor.previewOpening = { ...horizontal, id: "manual-1" };
        }
        if (type === "move" || type === "resize") {
          editor.gesture.changed = true;
        }
      };
      editor.releasePointer = () => calls.push("release");
      editor.syncMaskToDocument = () => calls.push("sync");
      editor.rebuildMaskLayers = () => calls.push("rebuild");
      editor.finishDocumentChange = changed => {
        if (changed) calls.push("finish");
      };
      editor.render = () => calls.push("render");

      editor.handlePointerUp({
        clientX: 20,
        pointerId: 1,
        preventDefault() {},
      });

      assert.equal(calls[0], "sample:20");
      assert.ok(calls.includes("commit"));
      if (type === "wall") {
        assert.ok(calls.indexOf("rebuild") > calls.indexOf("commit"));
      }
      if (type === "add") {
        assert.equal(editor.document.openings[0]?.id, "manual-1");
      }
    });
  }
});

const pointerEvent = (pointerId, overrides = {}) => {
  const event = {
    button: 0,
    clientX: 10,
    clientY: 10,
    preventDefault() {},
    ...overrides,
  };
  if (pointerId !== undefined) {
    event.pointerId = pointerId;
  }
  return event;
};

const createWallPointerProbe = () => {
  const calls = [];
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = {
    wallMask: new Uint8Array([0]),
    openings: [],
    beginEdit() { calls.push("begin"); },
    commitEdit() { calls.push("commit"); return true; },
    cancelEdit() { calls.push("cancel"); return true; },
  };
  editor.tool = "wall";
  editor.spacePressed = false;
  editor.gesture = null;
  editor.activePointerId = null;
  editor.activeWallMask = null;
  editor.canvas = {
    setPointerCapture(id) { calls.push(`capture:${id}`); },
    hasPointerCapture() { return true; },
    releasePointerCapture(id) { calls.push(`release:${id}`); },
  };
  editor.pointerScreenPoint = event => ({ x: event.clientX, y: event.clientY });
  editor.screenToImage = (x, y) => ({ x, y });
  editor.clampImagePoint = point => point;
  editor.drawWallSegment = () => calls.push("draw");
  editor.syncMaskToDocument = () => calls.push("sync");
  editor.rebuildMaskLayers = () => calls.push("rebuild");
  editor.calibration = { millimetersPerPixel: 10 };
  editor.refreshWallDimensions = () => calls.push("dimensions");
  editor.finishDocumentChange = changed => {
    if (changed) calls.push("finish");
  };
  editor.render = () => calls.push("render");
  return { editor, calls };
};

test("every committed wall or opening edit refreshes calibrated measurements", () => {
  const calls = [];
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = { wallMask: new Uint8Array([0]), openings: [] };
  editor.calibration = { millimetersPerPixel: 10 };
  editor.refreshWallDimensions = () => calls.push("dimensions");
  editor.refreshRoomAreas = () => calls.push("areas");
  editor.render = () => calls.push("render");
  editor.onChange = () => calls.push("change");

  editor.finishDocumentChange(true);

  assert.deepEqual(calls, ["dimensions", "areas", "render", "change"]);
});

const createPanPointerProbe = () => {
  const calls = [];
  const editor = Object.create(ReviewEditor.prototype);
  editor.document = {};
  editor.spacePressed = false;
  editor.gesture = null;
  editor.activePointerId = null;
  editor.viewport = { offsetX: 0, offsetY: 0 };
  editor.canvas = {
    setPointerCapture(id) { calls.push(`capture:${id}`); },
    hasPointerCapture() { return true; },
    releasePointerCapture(id) { calls.push(`release:${id}`); },
  };
  editor.pointerScreenPoint = event => ({ x: event.clientX, y: event.clientY });
  editor.render = () => calls.push("render");
  return { editor, calls };
};

test("a second pointer cannot replace or finalize the owner transaction", () => {
  const { editor, calls } = createWallPointerProbe();
  const ownerDown = pointerEvent(1);

  editor.handlePointerDown(ownerDown);
  const ownerGesture = editor.gesture;

  editor.handlePointerDown(pointerEvent(2, { clientX: 20 }));
  assert.strictEqual(editor.gesture, ownerGesture);
  assert.equal(editor.activePointerId, 1);
  assert.equal(calls.filter(call => call === "begin").length, 1);

  editor.handlePointerUp(pointerEvent(2, { clientX: 30 }));
  assert.strictEqual(editor.gesture, ownerGesture);
  assert.equal(editor.activePointerId, 1);
  assert.equal(calls.filter(call => call === "commit").length, 0);

  editor.handlePointerUp(pointerEvent(1, { clientX: 40 }));
  assert.equal(editor.gesture, null);
  assert.equal(editor.activePointerId, null);
  assert.equal(calls.filter(call => call === "begin").length, 1);
  assert.equal(calls.filter(call => call === "commit").length, 1);
});

test("non-owner move up and cancel events are ignored", async t => {
  for (const method of ["handlePointerMove", "handlePointerUp", "handlePointerCancel"]) {
    for (const pointerId of [2, undefined]) {
      await t.test(`${method}:${pointerId ?? "synthetic"}`, () => {
        const { editor, calls } = createPanPointerProbe();
        editor.gesture = {
          type: "pan",
          startScreen: { x: 10, y: 10 },
          offsetX: 0,
          offsetY: 0,
        };
        editor.activePointerId = 1;
        const ownerGesture = editor.gesture;

        editor[method](pointerEvent(pointerId, { clientX: 30 }));

        assert.strictEqual(editor.gesture, ownerGesture);
        assert.equal(editor.activePointerId, 1);
        assert.deepEqual(editor.viewport, { offsetX: 0, offsetY: 0 });
        assert.deepEqual(calls, []);
      });
    }
  }
});

test("synthetic pointer events keep one stable owner without mixing native ids", () => {
  const { editor } = createPanPointerProbe();

  editor.handlePointerDown(pointerEvent(undefined, { button: 1 }));
  const syntheticOwner = editor.activePointerId;
  const ownerGesture = editor.gesture;

  assert.notEqual(syntheticOwner, null);
  editor.handlePointerDown(pointerEvent(1, { button: 1, clientX: 15 }));
  editor.handlePointerMove(pointerEvent(1, { clientX: 20 }));
  editor.handlePointerUp(pointerEvent(1, { clientX: 20 }));
  assert.strictEqual(editor.gesture, ownerGesture);
  assert.equal(editor.activePointerId, syntheticOwner);
  assert.deepEqual(editor.viewport, { offsetX: 0, offsetY: 0 });

  editor.handlePointerMove(pointerEvent(undefined, { clientX: 20 }));
  assert.deepEqual(editor.viewport, { offsetX: 10, offsetY: 0 });
  editor.handlePointerUp(pointerEvent(undefined, { clientX: 20 }));
  assert.equal(editor.gesture, null);
  assert.equal(editor.activePointerId, null);
});

test("pan tool starts a one-finger pan gesture", () => {
  const { editor, calls } = createPanPointerProbe();
  editor.tool = "pan";

  editor.handlePointerDown(pointerEvent(7, { button: 0, clientX: 20, clientY: 30 }));

  assert.equal(editor.gesture?.type, "pan");
  assert.equal(editor.activePointerId, 7);
  assert.ok(calls.includes("capture:7"));
});
