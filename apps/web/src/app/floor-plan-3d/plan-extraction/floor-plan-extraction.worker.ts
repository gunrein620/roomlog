/// <reference lib="webworker" />

declare const cv: any;

type DetectedLine = {
  fillSupport?: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  orientation: "horizontal" | "vertical";
  thickness?: number;
};
type WorkerRequest =
  | { type: "preload"; opencvUrl: string }
  | { type: "extract"; imageData: ImageData; opencvUrl: string; maxDimension: number };

let opencvReadyPromise: Promise<boolean> | null = null;

function post(payload: Record<string, unknown>) {
  self.postMessage(payload);
}

async function loadOpenCv(opencvUrl: string) {
  if (opencvReadyPromise) return opencvReadyPromise;

  opencvReadyPromise = new Promise((resolve) => {
    try {
      importScripts(opencvUrl);
      if (typeof cv === "undefined") {
        resolve(false);
        return;
      }
      if (cv.Mat) {
        resolve(true);
        return;
      }
      cv.onRuntimeInitialized = () => resolve(true);
      setTimeout(() => resolve(Boolean(cv?.Mat)), 5000);
    } catch {
      resolve(false);
    }
  });

  return opencvReadyPromise;
}

function lineLength(line: DetectedLine) {
  return Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
}

function limitLines(lines: DetectedLine[], maxLines = 40) {
  return [...lines].sort((a, b) => lineLength(b) - lineLength(a)).slice(0, maxLines);
}

function mergeLines(lines: DetectedLine[]) {
  const sorted = lines
    .filter((line) => lineLength(line) >= 28)
    .sort((a, b) => {
      if (a.orientation !== b.orientation) return a.orientation === "horizontal" ? -1 : 1;
      const axisA = a.orientation === "horizontal" ? a.y1 : a.x1;
      const axisB = b.orientation === "horizontal" ? b.y1 : b.x1;
      if (axisA !== axisB) return axisA - axisB;
      return a.orientation === "horizontal" ? a.x1 - b.x1 : a.y1 - b.y1;
    });
  const merged: Array<DetectedLine & { weight: number }> = [];

  for (const line of sorted) {
    const previous = merged.at(-1);
    if (!previous || previous.orientation !== line.orientation) {
      merged.push({ ...line, weight: 1 });
      continue;
    }

    if (line.orientation === "horizontal") {
      if (Math.abs(previous.y1 - line.y1) <= 5 && line.x1 - previous.x2 <= 14) {
        const weight = previous.weight + 1;
        const y = Math.round((previous.y1 * previous.weight + line.y1) / weight);
        previous.x1 = Math.min(previous.x1, line.x1);
        previous.x2 = Math.max(previous.x2, line.x2);
        previous.y1 = y;
        previous.y2 = y;
        previous.thickness = Math.max(Number(previous.thickness ?? previous.weight), Number(line.thickness ?? 1), weight);
        if (Number.isFinite(Number(previous.fillSupport)) || Number.isFinite(Number(line.fillSupport))) {
          previous.fillSupport = Math.max(Number(previous.fillSupport ?? 0), Number(line.fillSupport ?? 0));
        }
        previous.weight = weight;
        continue;
      }
    } else if (Math.abs(previous.x1 - line.x1) <= 5 && line.y1 - previous.y2 <= 14) {
      const weight = previous.weight + 1;
      const x = Math.round((previous.x1 * previous.weight + line.x1) / weight);
      previous.y1 = Math.min(previous.y1, line.y1);
      previous.y2 = Math.max(previous.y2, line.y2);
      previous.x1 = x;
      previous.x2 = x;
      previous.thickness = Math.max(Number(previous.thickness ?? previous.weight), Number(line.thickness ?? 1), weight);
      if (Number.isFinite(Number(previous.fillSupport)) || Number.isFinite(Number(line.fillSupport))) {
        previous.fillSupport = Math.max(Number(previous.fillSupport ?? 0), Number(line.fillSupport ?? 0));
      }
      previous.weight = weight;
      continue;
    }

    merged.push({ ...line, weight: 1 });
  }

  return limitLines(
    merged.map(({ weight, ...line }) => ({
      ...line,
      thickness: Math.max(Number(line.thickness ?? 1), Number(weight ?? 1))
    }))
  );
}

function isFilledInteriorPixel(imageData: ImageData, x: number, y: number) {
  if (x < 0 || y < 0 || x >= imageData.width || y >= imageData.height) return false;
  const offset = (Math.round(y) * imageData.width + Math.round(x)) * 4;
  const red = imageData.data[offset] ?? 255;
  const green = imageData.data[offset + 1] ?? 255;
  const blue = imageData.data[offset + 2] ?? 255;
  const alpha = imageData.data[offset + 3] ?? 255;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const colorSpread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const nearWhite = red > 238 && green > 238 && blue > 238 && colorSpread < 18;

  return alpha > 24 && luminance >= 75 && luminance <= 246 && !nearWhite;
}

function measureLineFillSupport(line: DetectedLine, imageData: ImageData) {
  const length = Math.max(1, lineLength(line));
  const sampleCount = Math.max(8, Math.min(90, Math.round(length / 7)));
  const sideOffset = Math.max(8, Math.round(Number(line.thickness ?? 4) * 1.6));
  let positive = 0;
  let negative = 0;

  for (let index = 0; index <= sampleCount; index += 1) {
    const ratio = index / sampleCount;
    const x = line.x1 + (line.x2 - line.x1) * ratio;
    const y = line.y1 + (line.y2 - line.y1) * ratio;

    if (line.orientation === "horizontal") {
      if (isFilledInteriorPixel(imageData, x, y + sideOffset)) positive += 1;
      if (isFilledInteriorPixel(imageData, x, y - sideOffset)) negative += 1;
    } else {
      if (isFilledInteriorPixel(imageData, x + sideOffset, y)) positive += 1;
      if (isFilledInteriorPixel(imageData, x - sideOffset, y)) negative += 1;
    }
  }

  return Math.round((Math.max(positive, negative) / (sampleCount + 1)) * 1000) / 1000;
}

function annotateFillSupport(lines: DetectedLine[], imageData: ImageData) {
  return lines.map((line) => ({
    ...line,
    fillSupport: measureLineFillSupport(line, imageData)
  }));
}

function overlapLength(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function runOverlapRatio(runA: { start: number; end: number }, runB: { start: number; end: number }) {
  const overlap = overlapLength(runA.start, runA.end, runB.start, runB.end);
  const shortest = Math.max(1, Math.min(runA.end - runA.start, runB.end - runB.start));
  return overlap / shortest;
}

function createBandLine(
  band: { minAxis: number; maxAxis: number; runs: Array<{ start: number; end: number }> },
  orientation: "horizontal" | "vertical",
  options: { width: number; height: number; minRunLength: number; minWallThickness?: number }
) {
  const thickness = band.maxAxis - band.minAxis + 1;
  const minWallThickness = options.minWallThickness ?? Math.max(3, Math.round(Math.min(options.width, options.height) * 0.004));
  if (thickness < minWallThickness) return null;

  const starts = band.runs.map((run) => run.start).sort((a, b) => a - b);
  const ends = band.runs.map((run) => run.end).sort((a, b) => a - b);
  const medianIndex = Math.floor(starts.length / 2);
  const start = Math.round(starts[medianIndex]);
  const end = Math.round(ends[medianIndex]);
  if (end - start < options.minRunLength) return null;

  const axis = Math.round((band.minAxis + band.maxAxis) / 2);
  const confidence = Math.min(0.98, 0.66 + Math.min(0.24, thickness / 40) + Math.min(0.08, band.runs.length / 100));

  if (orientation === "horizontal") {
    return {
      confidence,
      orientation,
      thickness,
      x1: start,
      x2: end,
      y1: axis,
      y2: axis
    };
  }

  return {
    confidence,
    orientation,
    thickness,
    x1: axis,
    x2: axis,
    y1: start,
    y2: end
  };
}

function extractBandsFromRows(
  rows: Array<Array<{ start: number; end: number }>>,
  orientation: "horizontal" | "vertical",
  options: { width: number; height: number; minRunLength: number; minWallThickness?: number }
) {
  const bands: Array<{ lastRun: { start: number; end: number }; maxAxis: number; minAxis: number; runs: Array<{ start: number; end: number }> }> = [];
  let activeBands: typeof bands = [];

  for (let axis = 0; axis < rows.length; axis += 1) {
    const runs = rows[axis].filter((run) => run.end - run.start + 1 >= options.minRunLength);
    const nextActiveBands: typeof bands = [];
    const usedBands = new Set<(typeof bands)[number]>();

    for (const run of runs) {
      let bestBand: (typeof bands)[number] | null = null;
      let bestOverlap = 0;

      for (const band of activeBands) {
        if (axis - band.maxAxis > 2) continue;
        const candidateOverlap = runOverlapRatio(run, band.lastRun);
        if (candidateOverlap > bestOverlap) {
          bestBand = band;
          bestOverlap = candidateOverlap;
        }
      }

      if (bestBand && bestOverlap >= 0.64 && !usedBands.has(bestBand)) {
        bestBand.maxAxis = axis;
        bestBand.lastRun = run;
        bestBand.runs.push(run);
        nextActiveBands.push(bestBand);
        usedBands.add(bestBand);
      } else {
        const band = { lastRun: run, maxAxis: axis, minAxis: axis, runs: [run] };
        nextActiveBands.push(band);
        usedBands.add(band);
      }
    }

    for (const band of activeBands) {
      if (!usedBands.has(band) && axis - band.maxAxis > 1) {
        bands.push(band);
      } else if (!nextActiveBands.includes(band)) {
        nextActiveBands.push(band);
      }
    }

    activeBands = nextActiveBands;
  }

  bands.push(...activeBands);

  return bands
    .map((band) => createBandLine(band, orientation, options))
    .filter(Boolean) as DetectedLine[];
}

function extractWallBandLinesFromMask(mask: boolean[], width: number, height: number) {
  const minRunLength = Math.max(28, Math.round(Math.min(width, height) * 0.06));
  const horizontalRows = Array.from({ length: height }, () => [] as Array<{ start: number; end: number }>);
  const verticalRows = Array.from({ length: width }, () => [] as Array<{ start: number; end: number }>);

  for (let y = 0; y < height; y += 1) {
    let start: number | null = null;
    for (let x = 0; x <= width; x += 1) {
      const isWall = x < width && Boolean(mask[y * width + x]);
      if (isWall && start === null) start = x;
      if ((!isWall || x === width) && start !== null) {
        horizontalRows[y].push({ end: x - 1, start });
        start = null;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let start: number | null = null;
    for (let y = 0; y <= height; y += 1) {
      const isWall = y < height && Boolean(mask[y * width + x]);
      if (isWall && start === null) start = y;
      if ((!isWall || y === height) && start !== null) {
        verticalRows[x].push({ end: y - 1, start });
        start = null;
      }
    }
  }

  const options = { height, minRunLength, width };
  return [...extractBandsFromRows(horizontalRows, "horizontal", options), ...extractBandsFromRows(verticalRows, "vertical", options)];
}

function createDarkWallMask(imageData: ImageData, threshold = 145) {
  const { data, height, width } = imageData;
  return Array.from({ length: width * height }, (_, index) => {
    const offset = index * 4;
    const luminance = (data[offset] ?? 255) * 0.2126 + (data[offset + 1] ?? 255) * 0.7152 + (data[offset + 2] ?? 255) * 0.0722;
    return (data[offset + 3] ?? 255) > 24 && luminance < threshold;
  });
}

function fallbackExtract(imageData: ImageData) {
  const { height, width } = imageData;
  const mask = createDarkWallMask(imageData);
  const bandLines = extractWallBandLinesFromMask(mask, width, height);
  if (bandLines.length >= 3) {
    return annotateFillSupport(mergeLines(bandLines), imageData);
  }
  const lines: DetectedLine[] = [];
  const minRunLength = Math.max(28, Math.round(Math.min(width, height) * 0.06));

  for (let y = 0; y < height; y += 1) {
    let start: number | null = null;
    for (let x = 0; x <= width; x += 1) {
      const isWall = x < width && mask[y * width + x];
      if (isWall && start === null) start = x;
      if ((!isWall || x === width) && start !== null) {
        if (x - start >= minRunLength) lines.push({ x1: start, y1: y, x2: x - 1, y2: y, orientation: "horizontal" });
        start = null;
      }
    }
  }

  for (let x = 0; x < width; x += 1) {
    let start: number | null = null;
    for (let y = 0; y <= height; y += 1) {
      const isWall = y < height && mask[y * width + x];
      if (isWall && start === null) start = y;
      if ((!isWall || y === height) && start !== null) {
        if (y - start >= minRunLength) lines.push({ x1: x, y1: start, x2: x, y2: y - 1, orientation: "vertical" });
        start = null;
      }
    }
  }

  return annotateFillSupport(mergeLines(lines), imageData);
}

function extractWithOpenCv(imageData: ImageData) {
  const maskLines = extractWallBandLinesFromMask(createDarkWallMask(imageData), imageData.width, imageData.height);
  if (maskLines.length >= 3) {
    return annotateFillSupport(mergeLines(maskLines), imageData);
  }

  const source = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const binary = new cv.Mat();
  const closed = new cv.Mat();
  const opened = new cv.Mat();
  const horizontal = new cv.Mat();
  const vertical = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const lines: DetectedLine[] = [];

  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    const closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    const openKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
    cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, closeKernel);
    cv.morphologyEx(closed, opened, cv.MORPH_OPEN, openKernel);
    closeKernel.delete();
    openKernel.delete();

    const horizontalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.max(18, Math.round(imageData.width * 0.04)), 2));
    const verticalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, Math.max(18, Math.round(imageData.height * 0.04))));
    cv.morphologyEx(opened, horizontal, cv.MORPH_OPEN, horizontalKernel);
    cv.morphologyEx(opened, vertical, cv.MORPH_OPEN, verticalKernel);
    horizontalKernel.delete();
    verticalKernel.delete();

    for (const [mat, orientation] of [
      [horizontal, "horizontal"],
      [vertical, "vertical"]
    ] as const) {
      cv.findContours(mat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      for (let index = 0; index < contours.size(); index += 1) {
        const rect = cv.boundingRect(contours.get(index));
        if (orientation === "horizontal" && rect.width >= 28 && rect.width >= rect.height * 4) {
          lines.push({
            x1: rect.x,
            y1: rect.y + Math.round(rect.height / 2),
            x2: rect.x + rect.width,
            y2: rect.y + Math.round(rect.height / 2),
            orientation,
            thickness: Math.max(1, rect.height)
          });
        }
        if (orientation === "vertical" && rect.height >= 28 && rect.height >= rect.width * 4) {
          lines.push({
            x1: rect.x + Math.round(rect.width / 2),
            y1: rect.y,
            x2: rect.x + Math.round(rect.width / 2),
            y2: rect.y + rect.height,
            orientation,
            thickness: Math.max(1, rect.width)
          });
        }
      }
    }

    return annotateFillSupport(mergeLines(lines), imageData);
  } finally {
    source.delete();
    gray.delete();
    binary.delete();
    closed.delete();
    opened.delete();
    horizontal.delete();
    vertical.delete();
    contours.delete();
    hierarchy.delete();
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "preload") {
    post({ ready: await loadOpenCv(request.opencvUrl), type: "ready" });
    return;
  }

  const startedAt = Date.now();
  const ready = await loadOpenCv(request.opencvUrl);
  const lines = ready ? extractWithOpenCv(request.imageData) : fallbackExtract(request.imageData);
  post({
    imageHeight: request.imageData.height,
    imageWidth: request.imageData.width,
    lines,
    processingMs: Date.now() - startedAt,
    ready,
    type: "result"
  });
};
