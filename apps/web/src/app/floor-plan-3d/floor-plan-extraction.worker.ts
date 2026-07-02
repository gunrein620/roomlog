/// <reference lib="webworker" />

declare const cv: any;

type DetectedLine = { x1: number; y1: number; x2: number; y2: number; orientation: "horizontal" | "vertical" };
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

function limitLines(lines: DetectedLine[], maxLines = 24) {
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
      previous.weight = weight;
      continue;
    }

    merged.push({ ...line, weight: 1 });
  }

  return limitLines(merged.map(({ weight: _weight, ...line }) => line));
}

function fallbackExtract(imageData: ImageData) {
  const { data, height, width } = imageData;
  const mask = Array.from({ length: width * height }, (_, index) => {
    const offset = index * 4;
    const luminance = (data[offset] ?? 255) * 0.2126 + (data[offset + 1] ?? 255) * 0.7152 + (data[offset + 2] ?? 255) * 0.0722;
    return (data[offset + 3] ?? 255) > 24 && luminance < 145;
  });
  const lines: DetectedLine[] = [];
  const minRunLength = Math.max(32, Math.round(Math.min(width, height) * 0.08));

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

  return mergeLines(lines);
}

function extractWithOpenCv(imageData: ImageData) {
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
          lines.push({ x1: rect.x, y1: rect.y + Math.round(rect.height / 2), x2: rect.x + rect.width, y2: rect.y + Math.round(rect.height / 2), orientation });
        }
        if (orientation === "vertical" && rect.height >= 28 && rect.height >= rect.width * 4) {
          lines.push({ x1: rect.x + Math.round(rect.width / 2), y1: rect.y, x2: rect.x + Math.round(rect.width / 2), y2: rect.y + rect.height, orientation });
        }
      }
    }

    return mergeLines(lines);
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
