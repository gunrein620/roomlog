import { ReviewDocument } from "./review-document.mjs";
import {
  extractWallFaceDimensions,
  formatWallLength,
} from "./wall-dimensions.mjs";
import { extractRoomAreas, formatRoomArea } from "./room-areas.mjs";

const INTERNAL_SIZE = 1024;
export const DEFAULT_VIEWPORT_ZOOM = 0.88;
const MIN_OPENING_LENGTH = 8;
const OPENING_THICKNESS = 12;
const HANDLE_SIZE = 10;
const GRID_STEPS_MM = Object.freeze([100, 200, 500, 1000, 2000, 5000, 10000]);
const SYNTHETIC_POINTER_ID = Symbol("review-editor-synthetic-pointer");

export const CLASS_COLORS = Object.freeze({
  wall: "rgba(37, 99, 235, 0.48)",
  door: "rgba(245, 158, 11, 0.48)",
  window: "rgba(239, 68, 68, 0.48)",
});

export function openingBounds(opening) {
  return {
    left: opening.center_x - opening.width / 2,
    right: opening.center_x + opening.width / 2,
    top: opening.center_y - opening.height / 2,
    bottom: opening.center_y + opening.height / 2,
  };
}

export function hitTestOpening(openings, x, y, padding = 8) {
  for (let index = openings.length - 1; index >= 0; index -= 1) {
    const bounds = openingBounds(openings[index]);
    if (
      x >= bounds.left - padding &&
      x <= bounds.right + padding &&
      y >= bounds.top - padding &&
      y <= bounds.bottom + padding
    ) {
      return openings[index];
    }
  }
  return null;
}

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

const pointerIdForEvent = event =>
  event.pointerId === undefined ? SYNTHETIC_POINTER_ID : event.pointerId;

export function isEditableKeyboardTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

export function isPointInsideImage(point, width = INTERNAL_SIZE, height = INTERNAL_SIZE) {
  return point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
}

export function calibrationFromMeasurement(start, end, actualMillimeters) {
  const realLength = Number(actualMillimeters);
  const pixelDistance = Math.hypot(end.x - start.x, end.y - start.y);
  if (!Number.isFinite(realLength) || realLength <= 0) {
    throw new RangeError("Actual length must be greater than zero");
  }
  if (!Number.isFinite(pixelDistance) || pixelDistance <= 0) {
    throw new RangeError("Scale points must be different");
  }
  return {
    start: { ...start },
    end: { ...end },
    pixelDistance,
    actualMillimeters: realLength,
    millimetersPerPixel: realLength / pixelDistance,
  };
}

// Standard Korean interior door leaf; detected door openings cluster around
// this width, which makes them a usable scale reference when the user has not
// calibrated manually.
export const ESTIMATED_DOOR_WIDTH_MM = 900;
const ESTIMATED_MM_PER_PIXEL_MIN = 2;
const ESTIMATED_MM_PER_PIXEL_MAX = 80;

export function estimateCalibrationFromDoors(openings = []) {
  const widths = openings
    .filter(opening => opening.kind === "door")
    .map(opening => Math.max(Number(opening.width), Number(opening.height)))
    .filter(width => Number.isFinite(width) && width > 0)
    .sort((a, b) => a - b);
  if (widths.length === 0) return null;

  const middle = Math.floor(widths.length / 2);
  const medianWidth = widths.length % 2 === 0
    ? (widths[middle - 1] + widths[middle]) / 2
    : widths[middle];
  const millimetersPerPixel = ESTIMATED_DOOR_WIDTH_MM / medianWidth;
  if (
    millimetersPerPixel < ESTIMATED_MM_PER_PIXEL_MIN ||
    millimetersPerPixel > ESTIMATED_MM_PER_PIXEL_MAX
  ) {
    return null;
  }
  return {
    start: { x: 0, y: 0 },
    end: { x: medianWidth, y: 0 },
    pixelDistance: medianWidth,
    actualMillimeters: ESTIMATED_DOOR_WIDTH_MM,
    millimetersPerPixel,
    estimated: true,
  };
}

export function gridStepMillimeters(millimetersPerPixel, viewScale) {
  const mmPerPixel = Number(millimetersPerPixel);
  const scale = Number(viewScale);
  if (!Number.isFinite(mmPerPixel) || mmPerPixel <= 0 || !Number.isFinite(scale) || scale <= 0) {
    return GRID_STEPS_MM[2];
  }
  return GRID_STEPS_MM.find(step => (step / mmPerPixel) * scale >= 8)
    ?? GRID_STEPS_MM.at(-1);
}

export function reviewGridDefinition(calibration, viewScale) {
  if (!calibration) {
    return {
      calibrated: false,
      minorStepPixels: 32,
      majorEvery: 4,
      origin: { x: 0, y: 0 },
    };
  }
  const minorStepMm = gridStepMillimeters(calibration.millimetersPerPixel, viewScale);
  return {
    calibrated: true,
    minorStepPixels: minorStepMm / calibration.millimetersPerPixel,
    majorEvery: minorStepMm < 1000
      ? Math.max(1, Math.round(1000 / minorStepMm))
      : 5,
    origin: { ...calibration.start },
  };
}

export function binaryMaskFromAlpha(pixels, threshold = 128) {
  const mask = new Uint8Array(Math.floor(pixels.length / 4));
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = pixels[index * 4 + 3] >= threshold ? 1 : 0;
  }
  return mask;
}

export function rasterizeBinarySegment(
  mask,
  width,
  height,
  from,
  to,
  brushSize,
  value,
) {
  const radius = Math.max(0, brushSize / 2);
  const radiusSquared = radius * radius;
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
  const minimumX = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius));
  const maximumX = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + radius));
  const minimumY = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius));
  const maximumY = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + radius));

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const pixelX = x + 0.5;
      const pixelY = y + 0.5;
      const projection = segmentLengthSquared === 0
        ? 0
        : clamp(
          ((pixelX - from.x) * deltaX + (pixelY - from.y) * deltaY) /
            segmentLengthSquared,
          0,
          1,
        );
      const nearestX = from.x + projection * deltaX;
      const nearestY = from.y + projection * deltaY;
      const distanceX = pixelX - nearestX;
      const distanceY = pixelY - nearestY;
      if (distanceX * distanceX + distanceY * distanceY <= radiusSquared) {
        mask[y * width + x] = value ? 1 : 0;
      }
    }
  }
  return mask;
}

export function moveOpening(opening, deltaX, deltaY, width = 1024, height = 1024) {
  return {
    ...opening,
    mask_polygon: [],
    center_x: clamp(
      opening.center_x + deltaX,
      opening.width / 2,
      width - opening.width / 2,
    ),
    center_y: clamp(
      opening.center_y + deltaY,
      opening.height / 2,
      height - opening.height / 2,
    ),
  };
}

export function resizeOpeningLength(opening, endpoint, x, y, minimumLength = 8) {
  const bounds = openingBounds(opening);

  if (opening.axis === "vertical") {
    const fixed = endpoint === "start" ? bounds.bottom : bounds.top;
    const moving = endpoint === "start"
      ? Math.min(y, fixed - minimumLength)
      : Math.max(y, fixed + minimumLength);
    return {
      ...opening,
      mask_polygon: [],
      center_y: (fixed + moving) / 2,
      height: Math.abs(fixed - moving),
    };
  }

  const fixed = endpoint === "start" ? bounds.right : bounds.left;
  const moving = endpoint === "start"
    ? Math.min(x, fixed - minimumLength)
    : Math.max(x, fixed + minimumLength);
  return {
    ...opening,
    mask_polygon: [],
    center_x: (fixed + moving) / 2,
    width: Math.abs(fixed - moving),
  };
}

export function openingTouchesWall(
  wallMask,
  opening,
  width = INTERNAL_SIZE,
  height = INTERNAL_SIZE,
  tolerance = 1,
) {
  if (!wallMask || wallMask.length < width * height) return false;
  const bounds = openingBounds(opening);
  const padding = Math.max(0, tolerance);
  const endpoints = opening.axis === "vertical"
    ? [
      { x: opening.center_x, y: bounds.top },
      { x: opening.center_x, y: bounds.bottom },
    ]
    : [
      { x: bounds.left, y: opening.center_y },
      { x: bounds.right, y: opening.center_y },
    ];

  return endpoints.every((point) => {
    const minimumX = clamp(Math.floor(point.x - padding), 0, width - 1);
    const maximumX = clamp(Math.ceil(point.x + padding), 0, width - 1);
    const minimumY = clamp(Math.floor(point.y - padding), 0, height - 1);
    const maximumY = clamp(Math.ceil(point.y + padding), 0, height - 1);

    for (let y = minimumY; y <= maximumY; y += 1) {
      const row = y * width;
      for (let x = minimumX; x <= maximumX; x += 1) {
        if (wallMask[row + x]) return true;
      }
    }
    return false;
  });
}

const imageDataUrl = value =>
  value.startsWith("data:") ? value : `data:image/png;base64,${value}`;

const loadImage = source => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("Could not decode review image"));
  image.src = source;
});

const createOffscreenCanvas = () => {
  const canvas = document.createElement("canvas");
  canvas.width = INTERNAL_SIZE;
  canvas.height = INTERNAL_SIZE;
  return canvas;
};

const openingHandlePoints = opening => {
  const bounds = openingBounds(opening);
  if (opening.axis === "vertical") {
    return [
      { endpoint: "start", x: opening.center_x, y: bounds.top },
      { endpoint: "end", x: opening.center_x, y: bounds.bottom },
    ];
  }
  return [
    { endpoint: "start", x: bounds.left, y: opening.center_y },
    { endpoint: "end", x: bounds.right, y: opening.center_y },
  ];
};

const cloneOpening = opening => ({ ...opening });

export class ReviewEditor {
  constructor(canvas, { onChange = () => {} } = {}) {
    if (!canvas?.getContext) {
      throw new TypeError("ReviewEditor requires a canvas element");
    }

    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.onChange = onChange;
    this.document = null;
    this.inputImage = null;
    this.tool = "select";
    this.brushSize = 18;
    this.selectedId = null;
    this.manualCounter = 1;
    this.gesture = null;
    this.previewOpening = null;
    this.activeWallMask = null;
    this.wallDimensionSegments = [];
    this.roomAreas = [];
    this.scalePoints = [];
    this.calibration = null;
    this.spacePressed = false;
    this.activePointerId = null;
    this.visibility = { wall: true, door: true, window: true };
    this.viewport = {
      width: 1,
      height: 1,
      fitScale: 1,
      scale: 1,
      zoom: DEFAULT_VIEWPORT_ZOOM,
      offsetX: 0,
      offsetY: 0,
    };

    this.maskCanvas = createOffscreenCanvas();
    this.maskContext = this.maskCanvas.getContext("2d", { willReadFrequently: true });
    this.wallLayer = createOffscreenCanvas();
    this.wallLayerContext = this.wallLayer.getContext("2d");

    this.boundPointerDown = event => this.handlePointerDown(event);
    this.boundPointerMove = event => this.handlePointerMove(event);
    this.boundPointerUp = event => this.handlePointerUp(event);
    this.boundPointerCancel = event => this.handlePointerCancel(event);
    this.boundWheel = event => this.handleWheel(event);
    this.boundKeyDown = event => this.handleKeyDown(event);
    this.boundKeyUp = event => this.handleKeyUp(event);
    this.boundResize = () => this.resize();

    this.canvas.style.touchAction = "none";
    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    this.canvas.addEventListener("pointermove", this.boundPointerMove);
    this.canvas.addEventListener("pointerup", this.boundPointerUp);
    this.canvas.addEventListener("pointercancel", this.boundPointerCancel);
    this.canvas.addEventListener("wheel", this.boundWheel, { passive: false });
    window.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("keyup", this.boundKeyUp);
    window.addEventListener("resize", this.boundResize);
    this.resize();
  }

  clear() {
    this.document = null;
    this.inputImage = null;
    this.selectedId = null;
    this.previewOpening = null;
    this.gesture = null;
    this.activeWallMask = null;
    this.wallDimensionSegments = [];
    this.roomAreas = [];
    this.scalePoints = [];
    this.calibration = null;
    this.manualCounter = 1;
    this.maskContext.clearRect(0, 0, INTERNAL_SIZE, INTERNAL_SIZE);
    this.wallLayerContext.clearRect(0, 0, INTERNAL_SIZE, INTERNAL_SIZE);
    this.resetViewport();
    this.render();
    this.onChange(null);
  }

  async load(payload) {
    if (!payload?.input_image_b64 || !payload?.wall_mask_b64) {
      throw new TypeError("Review payload requires input_image_b64 and wall_mask_b64");
    }

    const [inputImage, maskImage] = await Promise.all([
      loadImage(imageDataUrl(payload.input_image_b64)),
      loadImage(imageDataUrl(payload.wall_mask_b64)),
    ]);
    const decodeCanvas = createOffscreenCanvas();
    const decodeContext = decodeCanvas.getContext("2d", { willReadFrequently: true });
    decodeContext.clearRect(0, 0, INTERNAL_SIZE, INTERNAL_SIZE);
    decodeContext.drawImage(maskImage, 0, 0, INTERNAL_SIZE, INTERNAL_SIZE);
    const pixels = decodeContext.getImageData(0, 0, INTERNAL_SIZE, INTERNAL_SIZE).data;
    const wallMask = new Uint8Array(INTERNAL_SIZE * INTERNAL_SIZE);
    for (let index = 0; index < wallMask.length; index += 1) {
      const offset = index * 4;
      wallMask[index] = Math.max(
        pixels[offset],
        pixels[offset + 1],
        pixels[offset + 2],
      ) >= 128 ? 1 : 0;
    }

    this.inputImage = inputImage;
    this.document = new ReviewDocument(wallMask, payload.openings ?? []);
    this.wallDimensionSegments = [];
    this.roomAreas = [];
    this.scalePoints = [];
    // Default to a door-width scale estimate so plans render at real size even
    // before manual calibration; the Scale tool still overrides this.
    this.calibration = estimateCalibrationFromDoors(this.document.openings);
    this.selectedId = null;
    this.previewOpening = null;
    this.gesture = null;
    this.activeWallMask = null;
    this.manualCounter = 1;
    while (this.document.openings.some(item => item.id === `manual-${this.manualCounter}`)) {
      this.manualCounter += 1;
    }
    this.rebuildMaskLayers();
    this.resetViewport();
    this.render();
    return this.document;
  }

  setTool(tool) {
    if (!["select", "pan", "wall", "erase", "door", "window", "scale"].includes(tool)) {
      throw new RangeError(`Unknown review tool: ${tool}`);
    }
    this.tool = tool;
    this.previewOpening = null;
    this.render();
  }

  getScaleSelection() {
    return this.scalePoints.map(point => ({ ...point }));
  }

  getCalibration() {
    return this.calibration ? {
      ...this.calibration,
      start: { ...this.calibration.start },
      end: { ...this.calibration.end },
    } : null;
  }

  applyCalibration(actualMillimeters) {
    if (!this.document || this.scalePoints.length !== 2) {
      throw new Error("Choose two points before applying scale");
    }
    this.calibration = calibrationFromMeasurement(
      this.scalePoints[0],
      this.scalePoints[1],
      actualMillimeters,
    );
    this.document.revision += 1;
    this.refreshWallDimensions();
    this.refreshRoomAreas();
    this.render();
    this.onChange(this.document);
    return this.getCalibration();
  }

  clearCalibration() {
    if (!this.scalePoints.length && !this.calibration) return false;
    this.scalePoints = [];
    this.calibration = null;
    this.wallDimensionSegments = [];
    this.roomAreas = [];
    if (this.document) this.document.revision += 1;
    this.render();
    if (this.document) this.onChange(this.document);
    return true;
  }

  setBrushSize(size) {
    const numeric = Number(size);
    if (!Number.isFinite(numeric)) {
      throw new TypeError("Brush size must be a finite number");
    }
    this.brushSize = clamp(numeric, 1, 256);
  }

  setVisibility(kind, visible) {
    if (!(kind in this.visibility)) {
      throw new RangeError(`Unknown review class: ${kind}`);
    }
    this.visibility[kind] = Boolean(visible);
    this.render();
  }

  undo() {
    return this.applyHistoryChange(() => this.document?.undo());
  }

  redo() {
    return this.applyHistoryChange(() => this.document?.redo());
  }

  reset() {
    return this.applyHistoryChange(() => this.document?.reset(), true);
  }

  deleteSelected() {
    if (!this.document || !this.selectedId || this.gesture) {
      return false;
    }
    const index = this.document.openings.findIndex(item => item.id === this.selectedId);
    if (index < 0) {
      this.selectedId = null;
      this.render();
      return false;
    }

    this.document.beginEdit();
    this.document.openings.splice(index, 1);
    const changed = this.document.commitEdit();
    this.selectedId = null;
    this.finishDocumentChange(changed);
    return changed;
  }

  toggleSelectedType() {
    if (this.gesture) {
      return false;
    }
    const opening = this.selectedOpening();
    if (!opening) {
      return false;
    }

    this.document.beginEdit();
    opening.kind = opening.kind === "door" ? "window" : "door";
    const changed = this.document.commitEdit();
    this.finishDocumentChange(changed);
    return changed;
  }

  getOpenings() {
    return this.document ? this.document.openings.map(cloneOpening) : [];
  }

  async toWallMaskBlob() {
    if (!this.document) {
      throw new Error("Load a review document before exporting its wall mask");
    }
    const canvas = document.createElement("canvas");
    canvas.width = INTERNAL_SIZE;
    canvas.height = INTERNAL_SIZE;
    const context = canvas.getContext("2d");
    const image = context.createImageData(INTERNAL_SIZE, INTERNAL_SIZE);
    for (let index = 0; index < this.document.wallMask.length; index += 1) {
      const value = this.document.wallMask[index] ? 255 : 0;
      const offset = index * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode the wall mask as PNG"));
      }, "image/png");
    });
  }

  resize() {
    const previousCenter = this.viewport.scale > 0
      ? this.screenToImage(this.viewport.width / 2, this.viewport.height / 2)
      : { x: INTERNAL_SIZE / 2, y: INTERNAL_SIZE / 2 };
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || window.innerHeight));
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.viewport.width = width;
    this.viewport.height = height;
    this.viewport.fitScale = Math.min(width / INTERNAL_SIZE, height / INTERNAL_SIZE);
    this.viewport.scale = this.viewport.fitScale * this.viewport.zoom;
    this.viewport.offsetX = width / 2 - previousCenter.x * this.viewport.scale;
    this.viewport.offsetY = height / 2 - previousCenter.y * this.viewport.scale;
    this.render();
  }

  resetViewport() {
    this.viewport.zoom = DEFAULT_VIEWPORT_ZOOM;
    this.viewport.scale = this.viewport.fitScale * DEFAULT_VIEWPORT_ZOOM;
    this.viewport.offsetX = (this.viewport.width - INTERNAL_SIZE * this.viewport.scale) / 2;
    this.viewport.offsetY = (this.viewport.height - INTERNAL_SIZE * this.viewport.scale) / 2;
  }

  zoomAt(zoom, screenX = this.viewport.width / 2, screenY = this.viewport.height / 2) {
    const anchor = this.screenToImage(screenX, screenY);
    this.viewport.zoom = clamp(zoom, 0.5, 8);
    this.viewport.scale = this.viewport.fitScale * this.viewport.zoom;
    this.viewport.offsetX = screenX - anchor.x * this.viewport.scale;
    this.viewport.offsetY = screenY - anchor.y * this.viewport.scale;
    this.render();
  }

  zoomBy(factor) {
    const numeric = Number(factor);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new TypeError("Zoom factor must be a positive finite number");
    }
    this.zoomAt(this.viewport.zoom * numeric);
  }

  fitViewport() {
    this.resetViewport();
    this.render();
  }

  render() {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const context = this.context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, this.viewport.width, this.viewport.height);
    if (!this.document || !this.inputImage) {
      return;
    }

    const { offsetX, offsetY, scale } = this.viewport;
    const extent = INTERNAL_SIZE * scale;
    context.drawImage(this.inputImage, offsetX, offsetY, extent, extent);
    this.drawScaleGrid();
    if (this.visibility.wall) {
      context.drawImage(this.wallLayer, offsetX, offsetY, extent, extent);
    }
    for (const opening of this.document.openings) {
      if (this.visibility[opening.kind]) {
        this.drawOpening(opening, opening.id === this.selectedId);
      }
    }
    if (this.previewOpening) {
      this.drawOpening(this.previewOpening, true);
    }
    const roomAreaLayout = this.buildRoomAreaLabelLayout();
    this.drawWallDimensions();
    this.drawRoomAreaLabels(roomAreaLayout);
    this.drawScaleMeasurement();
  }

  refreshWallDimensions() {
    if (!this.document?.wallMask || !this.calibration || this.calibration.estimated) {
      this.wallDimensionSegments = [];
      return this.wallDimensionSegments;
    }
    this.wallDimensionSegments = extractWallFaceDimensions(
      this.document.wallMask,
      this.document.openings,
      INTERNAL_SIZE,
      INTERNAL_SIZE,
    );
    return this.wallDimensionSegments;
  }

  refreshRoomAreas(width = INTERNAL_SIZE, height = INTERNAL_SIZE) {
    if (!this.document?.wallMask || !this.calibration || this.calibration.estimated) {
      this.roomAreas = [];
      return this.roomAreas;
    }
    this.roomAreas = extractRoomAreas(
      this.document.wallMask,
      this.document.openings,
      width,
      height,
      this.calibration.millimetersPerPixel,
      { minimumAreaM2: 1 },
    );
    return this.roomAreas;
  }

  buildRoomAreaLabelLayout() {
    if (!this.calibration || this.calibration.estimated || !this.roomAreas?.length) return [];
    const context = this.context;
    context.save();
    context.font = "600 12px system-ui, sans-serif";
    const layout = this.roomAreas.map(room => {
      const label = formatRoomArea(room.areaM2);
      const center = this.imageToScreen(room.anchor.x, room.anchor.y);
      const width = context.measureText(label).width + 12;
      const height = 20;
      return {
        room,
        label,
        center,
        bounds: {
          left: center.x - width / 2,
          top: center.y - height / 2,
          right: center.x + width / 2,
          bottom: center.y + height / 2,
        },
      };
    });
    context.restore();
    return layout;
  }

  drawWallDimensions() {
    if (
      !this.calibration ||
      this.calibration.estimated ||
      this.visibility?.wall === false ||
      !this.wallDimensionSegments?.length
    ) return;

    const millimetersPerPixel = Number(this.calibration.millimetersPerPixel);
    if (!Number.isFinite(millimetersPerPixel) || millimetersPerPixel <= 0) return;

    const context = this.context;
    context.save();
    context.font = "600 10px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (const segment of this.wallDimensionSegments) {
      const start = this.imageToScreen(segment.start.x, segment.start.y);
      const end = this.imageToScreen(segment.end.x, segment.end.y);
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const screenLength = Math.hypot(deltaX, deltaY);
      if (!Number.isFinite(screenLength) || screenLength < 2) continue;

      const tangentX = deltaX / screenLength;
      const tangentY = deltaY / screenLength;
      const rawNormalX = Number(segment.normal?.x);
      const rawNormalY = Number(segment.normal?.y);
      const normalLength = Math.hypot(rawNormalX, rawNormalY);
      const normalX = Number.isFinite(normalLength) && normalLength > 0
        ? rawNormalX / normalLength
        : -tangentY;
      const normalY = Number.isFinite(normalLength) && normalLength > 0
        ? rawNormalY / normalLength
        : tangentX;
      const offset = 16;
      const dimensionStart = {
        x: start.x + normalX * offset,
        y: start.y + normalY * offset,
      };
      const dimensionEnd = {
        x: end.x + normalX * offset,
        y: end.y + normalY * offset,
      };
      const arrowLength = Math.min(5, screenLength / 4);
      const arrowHalfWidth = 2.5;

      context.beginPath();
      context.strokeStyle = "rgba(17, 24, 39, 0.4)";
      context.lineWidth = 0.6;
      context.moveTo(start.x, start.y);
      context.lineTo(dimensionStart.x, dimensionStart.y);
      context.moveTo(end.x, end.y);
      context.lineTo(dimensionEnd.x, dimensionEnd.y);
      context.stroke();

      context.beginPath();
      context.strokeStyle = "#111827";
      context.lineWidth = 0.8;
      context.moveTo(dimensionStart.x, dimensionStart.y);
      context.lineTo(dimensionEnd.x, dimensionEnd.y);
      context.moveTo(dimensionStart.x, dimensionStart.y);
      context.lineTo(
        dimensionStart.x + tangentX * arrowLength + normalX * arrowHalfWidth,
        dimensionStart.y + tangentY * arrowLength + normalY * arrowHalfWidth,
      );
      context.moveTo(dimensionStart.x, dimensionStart.y);
      context.lineTo(
        dimensionStart.x + tangentX * arrowLength - normalX * arrowHalfWidth,
        dimensionStart.y + tangentY * arrowLength - normalY * arrowHalfWidth,
      );
      context.moveTo(dimensionEnd.x, dimensionEnd.y);
      context.lineTo(
        dimensionEnd.x - tangentX * arrowLength + normalX * arrowHalfWidth,
        dimensionEnd.y - tangentY * arrowLength + normalY * arrowHalfWidth,
      );
      context.moveTo(dimensionEnd.x, dimensionEnd.y);
      context.lineTo(
        dimensionEnd.x - tangentX * arrowLength - normalX * arrowHalfWidth,
        dimensionEnd.y - tangentY * arrowLength - normalY * arrowHalfWidth,
      );
      context.stroke();

      const label = formatWallLength(segment.lengthPixels * millimetersPerPixel);
      if (!label) continue;
      const centerX = (dimensionStart.x + dimensionEnd.x) / 2;
      const centerY = (dimensionStart.y + dimensionEnd.y) / 2;
      let angle = Math.atan2(deltaY, deltaX);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

      context.save();
      context.translate(centerX, centerY);
      context.rotate(angle);
      context.strokeStyle = "rgba(255, 255, 255, 0.96)";
      context.lineWidth = 3;
      context.lineJoin = "round";
      context.strokeText(label, 0, 0);
      context.fillStyle = "#111827";
      context.fillText(label, 0, 0);
      context.restore();
    }
    context.restore();
  }

  drawRoomAreaLabels(layout) {
    if (!layout?.length) return;
    const context = this.context;
    context.save();
    context.font = "600 12px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const item of layout) {
      context.fillStyle = "rgba(255, 255, 255, 0.9)";
      context.fillRect(
        item.bounds.left,
        item.bounds.top,
        item.bounds.right - item.bounds.left,
        item.bounds.bottom - item.bounds.top,
      );
      context.fillStyle = "#111827";
      context.fillText(item.label, item.center.x, item.center.y);
    }
    context.restore();
  }

  drawScaleGrid() {
    const context = this.context;
    const grid = reviewGridDefinition(this.calibration, this.viewport.scale);
    const minorStepPx = grid.minorStepPixels;
    const majorEvery = grid.majorEvery;
    const origin = grid.origin;
    const firstXIndex = Math.floor((0 - origin.x) / minorStepPx);
    const lastXIndex = Math.ceil((INTERNAL_SIZE - origin.x) / minorStepPx);
    const firstYIndex = Math.floor((0 - origin.y) / minorStepPx);
    const lastYIndex = Math.ceil((INTERNAL_SIZE - origin.y) / minorStepPx);
    const topLeft = this.imageToScreen(0, 0);
    const bottomRight = this.imageToScreen(INTERNAL_SIZE, INTERNAL_SIZE);

    context.save();
    context.beginPath();
    context.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    context.clip();
    for (let index = firstXIndex; index <= lastXIndex; index += 1) {
      const screenX = this.imageToScreen(origin.x + index * minorStepPx, 0).x;
      context.beginPath();
      context.strokeStyle = index % majorEvery === 0
        ? `rgba(26, 26, 26, ${grid.calibrated ? 0.28 : 0.18})`
        : `rgba(26, 26, 26, ${grid.calibrated ? 0.12 : 0.07})`;
      context.lineWidth = index % majorEvery === 0 ? 1 : 0.75;
      context.moveTo(screenX, topLeft.y);
      context.lineTo(screenX, bottomRight.y);
      context.stroke();
    }
    for (let index = firstYIndex; index <= lastYIndex; index += 1) {
      const screenY = this.imageToScreen(0, origin.y + index * minorStepPx).y;
      context.beginPath();
      context.strokeStyle = index % majorEvery === 0
        ? `rgba(26, 26, 26, ${grid.calibrated ? 0.28 : 0.18})`
        : `rgba(26, 26, 26, ${grid.calibrated ? 0.12 : 0.07})`;
      context.lineWidth = index % majorEvery === 0 ? 1 : 0.75;
      context.moveTo(topLeft.x, screenY);
      context.lineTo(bottomRight.x, screenY);
      context.stroke();
    }
    context.restore();
  }

  drawScaleMeasurement() {
    if (!this.scalePoints.length) return;
    const context = this.context;
    const points = this.scalePoints.map(point => this.imageToScreen(point.x, point.y));
    context.save();
    context.strokeStyle = "#111827";
    context.fillStyle = "#ffffff";
    context.lineWidth = 2;
    if (points.length === 2) {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      context.lineTo(points[1].x, points[1].y);
      context.stroke();
    }
    for (const point of points) {
      context.beginPath();
      context.arc(point.x, point.y, 6, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    if (points.length === 2 && this.calibration) {
      const centerX = (points[0].x + points[1].x) / 2;
      const centerY = (points[0].y + points[1].y) / 2;
      const label = `${Math.round(this.calibration.actualMillimeters)} mm`;
      context.font = "600 12px system-ui, sans-serif";
      const width = context.measureText(label).width + 12;
      context.fillStyle = "rgba(255, 255, 255, 0.94)";
      context.fillRect(centerX - width / 2, centerY - 12, width, 24);
      context.fillStyle = "#111827";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, centerX, centerY);
    }
    context.restore();
  }

  drawOpening(opening, selected) {
    const context = this.context;
    const bounds = openingBounds(opening);
    const topLeft = this.imageToScreen(bounds.left, bounds.top);
    const width = opening.width * this.viewport.scale;
    const height = opening.height * this.viewport.scale;
    const maskPolygon = (opening.mask_polygon ?? []).filter(point => (
      Array.isArray(point) && point.length >= 2 &&
      Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
    ));
    const drawMaskPolygon = () => {
      const first = this.imageToScreen(maskPolygon[0][0], maskPolygon[0][1]);
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of maskPolygon.slice(1)) {
        const screen = this.imageToScreen(point[0], point[1]);
        context.lineTo(screen.x, screen.y);
      }
      context.closePath();
    };
    const hasMaskPolygon = maskPolygon.length >= 3;

    context.save();
    context.fillStyle = CLASS_COLORS[opening.kind] ?? CLASS_COLORS.door;
    if (hasMaskPolygon) {
      drawMaskPolygon();
      context.fill();
    } else {
      context.fillRect(topLeft.x, topLeft.y, width, height);
    }
    if (!opening.valid) {
      context.setLineDash([6, 4]);
      context.strokeStyle = "rgba(0, 0, 0, 0.9)";
      context.lineWidth = 1.5;
      if (hasMaskPolygon) {
        drawMaskPolygon();
        context.stroke();
      } else {
        context.strokeRect(topLeft.x, topLeft.y, width, height);
      }
    }
    if (selected) {
      context.setLineDash([]);
      context.strokeStyle = "white";
      context.lineWidth = 2;
      if (hasMaskPolygon) {
        drawMaskPolygon();
        context.stroke();
      } else {
        context.strokeRect(topLeft.x, topLeft.y, width, height);
      }
      context.fillStyle = "white";
      for (const handle of openingHandlePoints(opening)) {
        const point = this.imageToScreen(handle.x, handle.y);
        context.fillRect(
          point.x - HANDLE_SIZE / 2,
          point.y - HANDLE_SIZE / 2,
          HANDLE_SIZE,
          HANDLE_SIZE,
        );
      }
    }
    context.restore();
  }

  rebuildMaskLayers(mask = this.document?.wallMask) {
    if (!mask) {
      return;
    }
    const image = this.maskContext.createImageData(INTERNAL_SIZE, INTERNAL_SIZE);
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue;
      const offset = index * 4;
      image.data[offset] = 255;
      image.data[offset + 1] = 255;
      image.data[offset + 2] = 255;
      image.data[offset + 3] = 255;
    }
    this.maskContext.clearRect(0, 0, INTERNAL_SIZE, INTERNAL_SIZE);
    this.maskContext.putImageData(image, 0, 0);
    this.refreshWallLayer();
  }

  refreshWallLayer() {
    this.wallLayerContext.clearRect(0, 0, INTERNAL_SIZE, INTERNAL_SIZE);
    this.wallLayerContext.fillStyle = CLASS_COLORS.wall;
    this.wallLayerContext.fillRect(0, 0, INTERNAL_SIZE, INTERNAL_SIZE);
    this.wallLayerContext.globalCompositeOperation = "destination-in";
    this.wallLayerContext.drawImage(this.maskCanvas, 0, 0);
    this.wallLayerContext.globalCompositeOperation = "source-over";
  }

  syncMaskToDocument() {
    if (this.activeWallMask) {
      this.document.wallMask.set(this.activeWallMask);
      return;
    }
    const pixels = this.maskContext.getImageData(
      0,
      0,
      INTERNAL_SIZE,
      INTERNAL_SIZE,
    ).data;
    this.document.wallMask.set(binaryMaskFromAlpha(pixels));
  }

  drawWallSegment(from, to, erase) {
    if (!this.activeWallMask) {
      this.activeWallMask = new Uint8Array(this.document.wallMask);
    }
    rasterizeBinarySegment(
      this.activeWallMask,
      INTERNAL_SIZE,
      INTERNAL_SIZE,
      from,
      to,
      this.brushSize,
      erase ? 0 : 1,
    );
    this.rebuildMaskLayers(this.activeWallMask);
  }

  handlePointerDown(event) {
    if (!this.document || this.gesture || this.activePointerId !== null) return;
    event.preventDefault();
    const screen = this.pointerScreenPoint(event);
    if (
      event.button === 1 ||
      this.spacePressed ||
      (this.tool === "pan" && event.button === 0)
    ) {
      this.gesture = {
        type: "pan",
        startScreen: screen,
        offsetX: this.viewport.offsetX,
        offsetY: this.viewport.offsetY,
      };
      this.capturePointer(event);
      return;
    }
    if (event.button !== 0) return;

    const imagePoint = this.screenToImage(screen.x, screen.y);
    if (!isPointInsideImage(imagePoint)) return;
    const point = this.clampImagePoint(imagePoint);
    if (this.tool === "scale") {
      const selectedPoint = { ...point };
      if (this.scalePoints.length >= 2) {
        this.scalePoints = [selectedPoint];
        this.calibration = null;
        this.wallDimensionSegments = [];
        this.roomAreas = [];
      } else if (
        this.scalePoints.length === 1 &&
        Math.hypot(
          selectedPoint.x - this.scalePoints[0].x,
          selectedPoint.y - this.scalePoints[0].y,
        ) < 0.01
      ) {
        return;
      } else {
        this.scalePoints.push(selectedPoint);
      }
      this.render();
      this.onChange(this.document);
      return;
    }
    if (this.tool === "wall" || this.tool === "erase") {
      this.document.beginEdit();
      this.activeWallMask = new Uint8Array(this.document.wallMask);
      this.gesture = { type: "wall", erase: this.tool === "erase", last: point };
      this.drawWallSegment(point, point, this.gesture.erase);
      this.render();
      this.capturePointer(event);
      return;
    }

    if (this.tool === "door" || this.tool === "window") {
      this.document.beginEdit();
      this.gesture = { type: "add", kind: this.tool, start: point };
      this.capturePointer(event);
      return;
    }

    const selected = this.selectedOpening();
    const endpoint = selected ? this.hitTestHandle(selected, point) : null;
    const visibleOpenings = this.document.openings.filter(item => this.visibility[item.kind]);
    const hit = endpoint
      ? selected
      : hitTestOpening(visibleOpenings, point.x, point.y, 8 / this.viewport.scale);
    this.selectedId = hit?.id ?? null;
    if (hit) {
      this.document.beginEdit();
      this.gesture = {
        type: endpoint ? "resize" : "move",
        endpoint,
        start: point,
        opening: cloneOpening(hit),
        changed: false,
      };
      this.capturePointer(event);
    }
    this.render();
  }

  handlePointerMove(event) {
    if (!this.gesture || !this.document || !this.isPointerOwner(event)) return;
    event.preventDefault();
    const screen = this.pointerScreenPoint(event);
    if (this.gesture.type === "pan") {
      this.viewport.offsetX = this.gesture.offsetX + screen.x - this.gesture.startScreen.x;
      this.viewport.offsetY = this.gesture.offsetY + screen.y - this.gesture.startScreen.y;
      this.render();
      return;
    }

    const point = this.clampImagePoint(this.screenToImage(screen.x, screen.y));
    if (this.gesture.type === "wall") {
      this.drawWallSegment(this.gesture.last, point, this.gesture.erase);
      this.gesture.last = point;
      this.render();
      return;
    }
    if (this.gesture.type === "add") {
      this.previewOpening = this.createOpeningPreview(this.gesture.start, point, this.gesture.kind);
      this.render();
      return;
    }

    const deltaX = point.x - this.gesture.start.x;
    const deltaY = point.y - this.gesture.start.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) < 0.01) return;
    const edited = this.gesture.type === "resize"
      ? resizeOpeningLength(
        this.gesture.opening,
        this.gesture.endpoint,
        point.x,
        point.y,
        MIN_OPENING_LENGTH,
      )
      : moveOpening(this.gesture.opening, deltaX, deltaY, INTERNAL_SIZE, INTERNAL_SIZE);
    edited.valid = openingTouchesWall(this.document.wallMask, edited);
    this.replaceOpening(edited);
    this.gesture.changed = true;
    this.render();
  }

  handlePointerUp(event) {
    if (!this.gesture || !this.document || !this.isPointerOwner(event)) return;
    event.preventDefault();
    this.handlePointerMove(event);
    const gesture = this.gesture;
    this.gesture = null;
    this.releasePointer(event);

    if (gesture.type === "pan") {
      return;
    }
    if (gesture.type === "wall") {
      this.syncMaskToDocument();
      this.revalidateOpenings();
      const changed = this.document.commitEdit();
      this.activeWallMask = null;
      this.rebuildMaskLayers();
      this.finishDocumentChange(changed);
      return;
    }
    if (gesture.type === "add") {
      if (this.previewOpening) {
        this.document.openings.push(this.previewOpening);
        this.selectedId = this.previewOpening.id;
        this.manualCounter += 1;
        this.previewOpening = null;
        this.finishDocumentChange(this.document.commitEdit());
      } else {
        this.document.cancelEdit();
        this.render();
      }
      return;
    }
    if (gesture.changed) {
      this.finishDocumentChange(this.document.commitEdit());
    } else {
      this.document.cancelEdit();
      this.render();
    }
  }

  handlePointerCancel(event) {
    if (!this.gesture || !this.document || !this.isPointerOwner(event)) return;
    const editGesture = this.gesture.type !== "pan";
    this.gesture = null;
    this.previewOpening = null;
    this.releasePointer(event);
    if (editGesture) {
      this.document.cancelEdit();
      this.activeWallMask = null;
      this.rebuildMaskLayers();
    }
    this.render();
  }

  handleWheel(event) {
    if (!this.isActive()) return;
    event.preventDefault();
    const screen = this.pointerScreenPoint(event);
    const zoom = this.viewport.zoom * Math.exp(-event.deltaY * 0.0015);
    this.zoomAt(zoom, screen.x, screen.y);
  }

  handleKeyDown(event) {
    if (!this.isActive() || isEditableKeyboardTarget(event.target)) return;
    if (event.code === "Space") {
      this.spacePressed = true;
      event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.deleteSelected();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (this.gesture) {
        this.handlePointerCancel({ pointerId: this.activePointerId });
      } else {
        this.selectedId = null;
        this.render();
      }
    }
  }

  handleKeyUp(event) {
    if (event.code === "Space") {
      this.spacePressed = false;
    }
  }

  createOpeningPreview(start, end, kind) {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);
    const length = horizontal ? Math.abs(deltaX) : Math.abs(deltaY);
    if (length < MIN_OPENING_LENGTH) {
      return null;
    }
    const opening = {
      id: `manual-${this.manualCounter}`,
      kind,
      confidence: 1,
      center_x: horizontal
        ? (start.x + end.x) / 2
        : clamp(start.x, OPENING_THICKNESS / 2, INTERNAL_SIZE - OPENING_THICKNESS / 2),
      center_y: horizontal
        ? clamp(start.y, OPENING_THICKNESS / 2, INTERNAL_SIZE - OPENING_THICKNESS / 2)
        : (start.y + end.y) / 2,
      width: horizontal ? length : OPENING_THICKNESS,
      height: horizontal ? OPENING_THICKNESS : length,
      axis: horizontal ? "horizontal" : "vertical",
      valid: false,
    };
    opening.valid = openingTouchesWall(this.document.wallMask, opening);
    return opening;
  }

  revalidateOpenings() {
    for (const opening of this.document?.openings ?? []) {
      opening.valid = openingTouchesWall(this.document.wallMask, opening);
    }
  }

  applyHistoryChange(action, clearSelection = false) {
    if (!this.document || this.gesture) return false;
    const changed = Boolean(action());
    if (!changed) return false;
    if (clearSelection || !this.selectedOpening()) {
      this.selectedId = null;
    }
    this.rebuildMaskLayers();
    this.finishDocumentChange(true);
    return true;
  }

  finishDocumentChange(changed) {
    if (!changed) return;
    if (this.calibration && !this.calibration.estimated) {
      this.refreshWallDimensions();
      this.refreshRoomAreas();
    }
    this.render();
    this.onChange(this.document);
  }

  replaceOpening(opening) {
    const index = this.document.openings.findIndex(item => item.id === opening.id);
    if (index >= 0) {
      this.document.openings[index] = opening;
    }
  }

  selectedOpening() {
    return this.document?.openings.find(item => item.id === this.selectedId) ?? null;
  }

  hitTestHandle(opening, point) {
    const radius = HANDLE_SIZE / this.viewport.scale;
    for (const handle of openingHandlePoints(opening)) {
      if (Math.abs(point.x - handle.x) <= radius && Math.abs(point.y - handle.y) <= radius) {
        return handle.endpoint;
      }
    }
    return null;
  }

  pointerScreenPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  screenToImage(x, y) {
    return {
      x: (x - this.viewport.offsetX) / this.viewport.scale,
      y: (y - this.viewport.offsetY) / this.viewport.scale,
    };
  }

  imageToScreen(x, y) {
    return {
      x: this.viewport.offsetX + x * this.viewport.scale,
      y: this.viewport.offsetY + y * this.viewport.scale,
    };
  }

  clampImagePoint(point) {
    return {
      x: clamp(point.x, 0, INTERNAL_SIZE),
      y: clamp(point.y, 0, INTERNAL_SIZE),
    };
  }

  capturePointer(event) {
    const pointerId = pointerIdForEvent(event);
    this.activePointerId = pointerId;
    if (pointerId !== SYNTHETIC_POINTER_ID && this.canvas.setPointerCapture) {
      this.canvas.setPointerCapture(pointerId);
    }
  }

  releasePointer() {
    const pointerId = this.activePointerId;
    if (
      pointerId !== null &&
      pointerId !== SYNTHETIC_POINTER_ID &&
      this.canvas.hasPointerCapture?.(pointerId)
    ) {
      this.canvas.releasePointerCapture(pointerId);
    }
    this.activePointerId = null;
  }

  isPointerOwner(event) {
    return this.activePointerId !== null &&
      pointerIdForEvent(event) === this.activePointerId;
  }

  isActive() {
    return Boolean(this.document && !this.canvas.hidden);
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    this.canvas.removeEventListener("pointermove", this.boundPointerMove);
    this.canvas.removeEventListener("pointerup", this.boundPointerUp);
    this.canvas.removeEventListener("pointercancel", this.boundPointerCancel);
    this.canvas.removeEventListener("wheel", this.boundWheel);
    window.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("keyup", this.boundKeyUp);
    window.removeEventListener("resize", this.boundResize);
  }
}
