// 브라우저에서 도면 이미지를 받아 벽 후보를 추출하는 진입점.
// worker(OpenCV) 경로가 기본이고, 실패하면 캔버스 픽셀 기반 fallback으로 내려간다.
// DOM(canvas/Image)에 의존하므로 클라이언트에서만 실행된다.

import {
  detectWallLinesFromImageData,
  estimateScaleCandidateFromDimensions,
  filterCommercialWallCandidates
} from "./wall-detection.mjs";
import type { DetectedLine, DetectedWallResult, ScaleCandidate } from "./types";

export const OPENCV_URL = "https://docs.opencv.org/4.10.0/opencv.js";
export const TESSERACT_OCR_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js";
export const MAX_EXTRACTION_DIMENSION = 1600;

export class WallDetector {
  constructor(private readonly worker: Worker | null = null) {}

  async detectWalls(file: File) {
    if (this.worker) {
      try {
        return await detectWallsWithWorker(this.worker, file);
      } catch {
        return fallbackCanvasWallExtraction(file);
      }
    }

    return fallbackCanvasWallExtraction(file);
  }
}

async function fallbackCanvasWallExtraction(file: File): Promise<DetectedWallResult> {
    const imageUrl = URL.createObjectURL(file);
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) throw new Error("Canvas context is not available");

    const { height, width } = scaledImageSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const startedAt = performance.now();
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const lines = detectWallLinesFromImageData(imageData, {
      darkThreshold: 185,
      maxLines: 40,
      minRunLength: Math.max(28, Math.round(Math.min(canvas.width, canvas.height) * 0.06))
    }) as DetectedLine[];
    const commercialCandidates = filterCommercialWallCandidates(lines, { height: canvas.height, mode: "wall-first", width: canvas.width }) as {
      annotationCandidates: Array<{ confidence: number; line: DetectedLine; source: string }>;
      dimensionCandidates: Array<{ confidence: number; line: DetectedLine; source: string; text?: string }>;
      mainPlanBounds: DetectedWallResult["mainPlanBounds"];
      needsReview: boolean;
      removedNoiseCount: number;
      walls: DetectedLine[];
    };
    const scaleCandidate = estimateScaleCandidateFromDimensions(commercialCandidates.dimensionCandidates) as ScaleCandidate | null;

    return {
      annotationCandidates: commercialCandidates.annotationCandidates,
      dimensionCandidates: commercialCandidates.dimensionCandidates,
      imageHeight: canvas.height,
      imageUrl,
      imageWidth: canvas.width,
      lines: commercialCandidates.walls,
      mainPlanBounds: commercialCandidates.mainPlanBounds,
      needsReview: commercialCandidates.needsReview,
      removedNoiseCount: commercialCandidates.removedNoiseCount,
      scaleCandidates: scaleCandidate ? [scaleCandidate] : [],
      processingMs: Math.round(performance.now() - startedAt)
    };
}

function scaledImageSize(width: number, height: number) {
  const longSide = Math.max(width, height);
  if (longSide <= MAX_EXTRACTION_DIMENSION) return { height, width };

  const scale = MAX_EXTRACTION_DIMENSION / longSide;
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale))
  };
}

export function normalizeMainPlanBounds(bounds: DetectedWallResult["mainPlanBounds"]) {
  if (!bounds) return undefined;
  return {
    height: Math.max(0, bounds.maxY - bounds.minY),
    width: Math.max(0, bounds.maxX - bounds.minX),
    x: bounds.minX,
    y: bounds.minY
  };
}

function detectWallsWithWorker(worker: Worker, file: File): Promise<DetectedWallResult> {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);

    loadImage(imageUrl)
      .then((image) => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas context is not available");

        const { height, width } = scaledImageSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
        canvas.width = width;
        canvas.height = height;
        context.drawImage(image, 0, 0, width, height);

        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type !== "result") return;
          worker.removeEventListener("message", handleMessage);
          const rawLines = Array.isArray(event.data.lines) ? event.data.lines : [];
          const commercialCandidates = filterCommercialWallCandidates(rawLines, {
            height: Number(event.data.imageHeight) || height,
            mode: "wall-first",
            width: Number(event.data.imageWidth) || width
          }) as {
            annotationCandidates: Array<{ confidence: number; line: DetectedLine; source: string }>;
            dimensionCandidates: Array<{ confidence: number; line: DetectedLine; source: string; text?: string }>;
            mainPlanBounds: DetectedWallResult["mainPlanBounds"];
            needsReview: boolean;
            removedNoiseCount: number;
            walls: DetectedLine[];
          };
          const scaleCandidate = estimateScaleCandidateFromDimensions([
            ...commercialCandidates.dimensionCandidates,
            ...(Array.isArray(event.data.dimensionCandidates) ? event.data.dimensionCandidates : [])
          ]) as ScaleCandidate | null;
          resolve({
            annotationCandidates: commercialCandidates.annotationCandidates,
            dimensionCandidates: commercialCandidates.dimensionCandidates,
            imageHeight: Number(event.data.imageHeight) || height,
            imageUrl,
            imageWidth: Number(event.data.imageWidth) || width,
            lines: commercialCandidates.walls,
            mainPlanBounds: commercialCandidates.mainPlanBounds,
            needsReview: commercialCandidates.needsReview,
            removedNoiseCount: commercialCandidates.removedNoiseCount + (Number(event.data.removedNoiseCount) || 0),
            scaleCandidates: scaleCandidate ? [scaleCandidate] : Array.isArray(event.data.scaleCandidates) ? event.data.scaleCandidates : [],
            processingMs: Number(event.data.processingMs) || undefined
          });
        };

        const handleError = (event: ErrorEvent) => {
          worker.removeEventListener("message", handleMessage);
          reject(event.error ?? new Error(event.message));
        };

        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError, { once: true });
        worker.postMessage(
          {
            imageData: context.getImageData(0, 0, width, height),
            maxDimension: MAX_EXTRACTION_DIMENSION,
            opencvUrl: OPENCV_URL,
            tesseractOcrUrl: TESSERACT_OCR_URL,
            type: "extract"
          },
          []
        );
      })
      .catch(reject);
  });
}

export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = source;
  });
}
