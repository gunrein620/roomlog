import assert from "node:assert/strict";
import test from "node:test";
import { validateCapture, type FrameLike } from "./capture-validate";
import type { CaptureCheckId } from "./tour-types";

test("accepts sharp, normally exposed moving frames", () => {
  const result = validateCapture(makeSharpMovingFrames());

  assert.equal(result.ok, true);
  assert.equal(result.frameCount, 5);
  assert.equal(getCheck(result, "blur").ok, true);
  assert.equal(getCheck(result, "exposure").ok, true);
  assert.equal(getCheck(result, "parallax").ok, true);
});

test("rejects uniformly blurred frames", () => {
  const result = validateCapture(makeSmoothMovingFrames());

  assert.equal(result.ok, false);
  assert.equal(getCheck(result, "blur").ok, false);
  assert.match(getCheck(result, "blur").reason, /초점이 흐립니다/);
});

test("rejects fully dark frames", () => {
  const result = validateCapture(Array.from({ length: 5 }, () => makeSolidFrame(12)));

  assert.equal(result.ok, false);
  assert.equal(getCheck(result, "exposure").ok, false);
  assert.match(getCheck(result, "exposure").reason, /조명을 켜고/);
});

test("rejects repeated identical frames with no motion", () => {
  const frame = makeSharpFrame(0);
  const result = validateCapture(Array.from({ length: 5 }, () => cloneFrame(frame)));

  assert.equal(result.ok, false);
  assert.equal(getCheck(result, "blur").ok, true);
  assert.equal(getCheck(result, "exposure").ok, true);
  assert.equal(getCheck(result, "parallax").ok, false);
  assert.match(getCheck(result, "parallax").reason, /걸으며 촬영해야/);
});

test("handles empty frame arrays safely", () => {
  const result = validateCapture([]);

  assert.equal(result.ok, false);
  assert.equal(result.frameCount, 0);
  assert.equal(result.checks.length, 3);
  for (const check of result.checks) {
    assert.equal(check.ok, false);
    assert.match(check.reason, /프레임/);
  }
});

test("handles one-frame captures safely", () => {
  const result = validateCapture([makeSharpFrame(0)]);

  assert.equal(result.ok, false);
  assert.equal(result.frameCount, 1);
  assert.equal(getCheck(result, "blur").ok, true);
  assert.equal(getCheck(result, "exposure").ok, true);
  assert.equal(getCheck(result, "parallax").ok, false);
  assert.match(getCheck(result, "parallax").reason, /최소 2프레임/);
});

function getCheck(result: ReturnType<typeof validateCapture>, id: CaptureCheckId) {
  const check = result.checks.find((candidate) => candidate.id === id);
  assert.ok(check, `${id} check is missing`);
  return check;
}

function makeSharpMovingFrames(): FrameLike[] {
  return Array.from({ length: 5 }, (_, index) => makeSharpFrame(index * 3));
}

function makeSmoothMovingFrames(): FrameLike[] {
  return Array.from({ length: 5 }, (_, index) => makeSmoothFrame(index * 8));
}

function makeSharpFrame(offset: number, width = 32, height = 32): FrameLike {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const verticalStripe = (x + offset) % 8 < 4 ? 46 : -46;
      const horizontalStripe = (y + offset) % 10 < 5 ? 26 : -26;
      const lineDetail = (x + offset) % 5 === 0 || (y + offset) % 7 === 0 ? 28 : 0;
      writePixel(data, width, x, y, clamp(128 + verticalStripe + horizontalStripe + lineDetail, 48, 218));
    }
  }

  return { width, height, data };
}

function makeSmoothFrame(offset: number, width = 32, height = 32): FrameLike {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writePixel(data, width, x, y, clamp(92 + x * 2 + y + offset, 48, 218));
    }
  }

  return { width, height, data };
}

function makeSolidFrame(value: number, width = 32, height = 32): FrameLike {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writePixel(data, width, x, y, value);
    }
  }

  return { width, height, data };
}

function cloneFrame(frame: FrameLike): FrameLike {
  return {
    width: frame.width,
    height: frame.height,
    data: new Uint8ClampedArray(frame.data)
  };
}

function writePixel(data: Uint8ClampedArray, width: number, x: number, y: number, value: number): void {
  const index = (y * width + x) * 4;
  const channelValue = clamp(value, 0, 255);
  data[index] = channelValue;
  data[index + 1] = channelValue;
  data[index + 2] = channelValue;
  data[index + 3] = 255;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
