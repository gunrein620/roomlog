import type { CaptureCheck, CaptureCheckId, CaptureValidationResult } from "./tour-types";

// TODO(real-video tuning): provisional thresholds calibrated only against
// synthetic unit frames until matched good/bad walkthrough clips are available.
const BLUR_MIN_AVG_LAPLACIAN_VARIANCE = 80;
const EXPOSURE_DARK_BIN_MAX = 32;
const EXPOSURE_BRIGHT_BIN_MIN = 224;
const EXPOSURE_MIN_MIDTONE_FRACTION = 0.5;
const PARALLAX_MIN_MEAN_ABSOLUTE_DELTA = 5;

const NO_FRAMES_REASON = "검증할 프레임이 없습니다.";
const INVALID_FRAME_REASON = "프레임 픽셀 데이터가 올바르지 않습니다.";
const BLUR_REASON = "초점이 흐립니다. 천천히 이동하며 다시 촬영해 주세요";
const EXPOSURE_REASON = "조명을 켜고 다시 촬영해 주세요";
const PARALLAX_REASON = "걸으며 촬영해야 3D가 만들어집니다";

export interface FrameLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function validateCapture(frames: FrameLike[]): CaptureValidationResult {
  const checks = [checkBlur(frames), checkExposure(frames), checkParallax(frames)];

  return {
    ok: checks.every((check) => check.ok),
    frameCount: frames.length,
    checks
  };
}

function checkBlur(frames: FrameLike[]): CaptureCheck {
  if (frames.length === 0) {
    return makeCheck("blur", false, 0, BLUR_MIN_AVG_LAPLACIAN_VARIANCE, NO_FRAMES_REASON);
  }

  if (!frames.every(isUsableFrame)) {
    return makeCheck("blur", false, 0, BLUR_MIN_AVG_LAPLACIAN_VARIANCE, INVALID_FRAME_REASON);
  }

  const metric = mean(frames.map((frame) => laplacianVariance(frame)));
  return makeCheck(
    "blur",
    metric >= BLUR_MIN_AVG_LAPLACIAN_VARIANCE,
    metric,
    BLUR_MIN_AVG_LAPLACIAN_VARIANCE,
    metric >= BLUR_MIN_AVG_LAPLACIAN_VARIANCE ? "초점 품질이 충분합니다." : BLUR_REASON
  );
}

function checkExposure(frames: FrameLike[]): CaptureCheck {
  if (frames.length === 0) {
    return makeCheck("exposure", false, 0, EXPOSURE_MIN_MIDTONE_FRACTION, NO_FRAMES_REASON);
  }

  if (!frames.every(isUsableFrame)) {
    return makeCheck("exposure", false, 0, EXPOSURE_MIN_MIDTONE_FRACTION, INVALID_FRAME_REASON);
  }

  const metric = mean(frames.map((frame) => midtoneFraction(frame)));
  return makeCheck(
    "exposure",
    metric >= EXPOSURE_MIN_MIDTONE_FRACTION,
    metric,
    EXPOSURE_MIN_MIDTONE_FRACTION,
    metric >= EXPOSURE_MIN_MIDTONE_FRACTION ? "밝기 분포가 적정합니다." : EXPOSURE_REASON
  );
}

function checkParallax(frames: FrameLike[]): CaptureCheck {
  if (frames.length === 0) {
    return makeCheck("parallax", false, 0, PARALLAX_MIN_MEAN_ABSOLUTE_DELTA, NO_FRAMES_REASON);
  }

  if (frames.length < 2) {
    return makeCheck("parallax", false, 0, PARALLAX_MIN_MEAN_ABSOLUTE_DELTA, "시차를 확인하려면 최소 2프레임이 필요합니다.");
  }

  if (!frames.every(isUsableFrame)) {
    return makeCheck("parallax", false, 0, PARALLAX_MIN_MEAN_ABSOLUTE_DELTA, INVALID_FRAME_REASON);
  }

  const deltas: number[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    deltas.push(meanAbsoluteLumaDelta(frames[index - 1], frames[index]));
  }

  const metric = mean(deltas);
  return makeCheck(
    "parallax",
    metric >= PARALLAX_MIN_MEAN_ABSOLUTE_DELTA,
    metric,
    PARALLAX_MIN_MEAN_ABSOLUTE_DELTA,
    metric >= PARALLAX_MIN_MEAN_ABSOLUTE_DELTA ? "인접 프레임 이동량이 충분합니다." : PARALLAX_REASON
  );
}

function laplacianVariance(frame: FrameLike): number {
  if (frame.width < 3 || frame.height < 3) return 0;

  const luma = toLuma(frame);
  let count = 0;
  let sum = 0;
  let sumSquares = 0;

  for (let y = 1; y < frame.height - 1; y += 1) {
    for (let x = 1; x < frame.width - 1; x += 1) {
      const index = y * frame.width + x;
      const laplacian =
        4 * luma[index] - luma[index - 1] - luma[index + 1] - luma[index - frame.width] - luma[index + frame.width];

      count += 1;
      sum += laplacian;
      sumSquares += laplacian * laplacian;
    }
  }

  if (count === 0) return 0;

  const average = sum / count;
  return sumSquares / count - average * average;
}

function midtoneFraction(frame: FrameLike): number {
  const luma = toLuma(frame);
  const histogram = Array.from({ length: 256 }, () => 0);

  for (const value of luma) {
    histogram[clamp(Math.round(value), 0, 255)] += 1;
  }

  const darkCount = histogram.slice(0, EXPOSURE_DARK_BIN_MAX + 1).reduce((sum, count) => sum + count, 0);
  const brightCount = histogram.slice(EXPOSURE_BRIGHT_BIN_MIN).reduce((sum, count) => sum + count, 0);
  const extremeCount = darkCount + brightCount;

  return luma.length === 0 ? 0 : 1 - extremeCount / luma.length;
}

function meanAbsoluteLumaDelta(previous: FrameLike, next: FrameLike): number {
  const width = Math.min(previous.width, next.width);
  const height = Math.min(previous.height, next.height);
  if (width <= 0 || height <= 0) return 0;

  const previousLuma = toLuma(previous);
  const nextLuma = toLuma(next);
  let sum = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      sum += Math.abs(previousLuma[y * previous.width + x] - nextLuma[y * next.width + x]);
    }
  }

  return sum / (width * height);
}

function toLuma(frame: FrameLike): Float64Array {
  const pixelCount = frame.width * frame.height;
  const luma = new Float64Array(pixelCount);
  const channels = inferChannelCount(frame);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (channels === 1) {
      luma[pixelIndex] = frame.data[pixelIndex] ?? 0;
      continue;
    }

    const dataIndex = pixelIndex * channels;
    const red = frame.data[dataIndex] ?? 0;
    const green = frame.data[dataIndex + 1] ?? red;
    const blue = frame.data[dataIndex + 2] ?? green;
    luma[pixelIndex] = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  return luma;
}

function inferChannelCount(frame: FrameLike): 1 | 3 | 4 {
  const pixelCount = frame.width * frame.height;
  if (frame.data.length === pixelCount) return 1;
  if (frame.data.length === pixelCount * 3) return 3;
  return 4;
}

function isUsableFrame(frame: FrameLike): boolean {
  return (
    Number.isInteger(frame.width) &&
    Number.isInteger(frame.height) &&
    frame.width > 0 &&
    frame.height > 0 &&
    frame.data instanceof Uint8ClampedArray &&
    frame.data.length >= frame.width * frame.height
  );
}

function makeCheck(id: CaptureCheckId, ok: boolean, metric: number, threshold: number, reason: string): CaptureCheck {
  return {
    id,
    ok,
    metric: roundMetric(metric),
    threshold,
    reason
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundMetric(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : 0;
}
