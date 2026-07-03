// plan-extraction 계약 타입 — 도면 이미지에서 추출된 결과(선/후보/축척)의 형태.
// RoomlogFloorPlanEditor(컨테이너)가 이 타입을 소비한다. 변경 전 팀 공유가 필요하다.

import type { Point } from "../room-model/types";

export type CandidateStatus = "CANDIDATE" | "CONFIRMED" | "REJECTED";

export type DetectedLine = {
  confidence?: number;
  fillSupport?: number;
  markers?: string[];
  orientation?: "horizontal" | "vertical";
  thickness?: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

export type FloorPlanCandidate = {
  confidence?: number;
  id: string;
  label?: string;
  movable?: boolean;
  position: Point;
  sizeMm?: { depth?: number; width?: number };
  source: string;
  status: CandidateStatus;
  type: string;
  widthMm?: number;
};

export type FloorPlanObjectCategory = "opening" | "fixture" | "structure";
export type FloorPlanObjectType =
  | "swingDoor"
  | "doubleSwingDoor"
  | "slidingDoor"
  | "pocketDoor"
  | "window"
  | "balconyWindow"
  | "toilet"
  | "sink"
  | "bathtub"
  | "showerBooth"
  | "floorDrain"
  | "kitchenSink"
  | "gasRange"
  | "refrigerator"
  | "stairs"
  | "elevator"
  | "column";

export type FloorPlanObject = {
  attachedWallId?: string;
  category: FloorPlanObjectCategory;
  center: Point;
  confidence?: number;
  evidence?: string;
  id: string;
  label?: string;
  rotationDeg: number;
  size: { height: number; width: number };
  sizeMm?: { depth: number; width: number };
  source: string;
  spanOnWall?: { end: Point; start: Point };
  status: CandidateStatus;
  swing?: { hinge: "start" | "end"; opensTowards: Point };
  type: FloorPlanObjectType;
};

export type ScaleCandidate = {
  confidence: number;
  line?: DetectedLine;
  pixelLength: number;
  pixelToMmRatio: number;
  realLengthMm: number;
  source: string;
};

export type ExtractionMeta = {
  annotationCandidateCount?: number;
  detectedWallCount: number;
  dimensionCandidateCount?: number;
  aiCandidateReviewCount?: number;
  aiGeneratedWallCount?: number;
  aiObjectCount?: number;
  aiObjectGraphStatus?: string;
  aiModel?: string;
  aiNoiseFlags?: { decorativeHatching: boolean; watermark: boolean };
  aiPhase1Status?: string;
  aiPhase2Status?: string;
  aiPhaseRoomStructureStatus?: string;
  aiPlanStyle?: string;
  aiRawText?: string;
  aiRejectedWallCandidateCount?: number;
  aiRoomCount?: number;
  aiRoomStructureSummary?: string;
  aiSummary?: string;
  aiTextDetections?: Array<{ confidence?: number; text: string }>;
  mainPlanBounds?: { height: number; width: number; x: number; y: number };
  needsReview?: boolean;
  ocrStatus: "ready" | "failed" | "manual-scale-required";
  processingMs?: number;
  removedNoiseCount: number;
  scaleCandidates: ScaleCandidate[];
  scaleConfirmed: boolean;
};

export type DetectedWallResult = {
  annotationCandidates?: Array<{ confidence: number; line: DetectedLine; source: string }>;
  dimensionCandidates?: Array<{ confidence: number; line: DetectedLine; source: string; text?: string }>;
  imageHeight: number;
  imageUrl: string;
  imageWidth: number;
  lines: DetectedLine[];
  mainPlanBounds?: { maxX: number; maxY: number; minX: number; minY: number } | null;
  needsReview?: boolean;
  removedNoiseCount?: number;
  scaleCandidates?: ScaleCandidate[];
  processingMs?: number;
};

export type UploadedFloorPlanSource = { attachmentId?: string; imageUrl?: string };
