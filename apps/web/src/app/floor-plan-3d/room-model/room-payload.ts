// 저장/스냅샷 payload 정규화 helper. 컨테이너의 인라인 payload 조립과 동일한 구조를 반환한다.
// DOM/React/three.js/plan-extraction import 금지 — 후보/메타 타입은 구조적 제약(generic)으로만 받는다.

import type { PlacedFurniture, Wall, WheretoputWall3D } from "./types";

type DraftStatus = "DRAFT" | "PUBLISHED" | string;

// plan-extraction의 FloorPlanCandidate / ExtractionMeta / UploadedFloorPlanSource를
// 직접 import하면 의존성 규칙(room-model은 폴더 내부만)에 어긋나므로 필요한 모양만 요구한다.
type CandidateLike = { status?: string };

type UploadedSourceLike = { attachmentId?: string; imageUrl?: string };

type RoomPayloadBaseInput<TCandidate extends CandidateLike> = {
  fixtureCandidates: readonly TCandidate[];
  landlordFurnitures: readonly PlacedFurniture[];
  openingCandidates: readonly TCandidate[];
  walls3D: readonly WheretoputWall3D[];
};

type HiddenWallIdsInput = {
  hiddenWallIds: Iterable<string | number>;
};

export function buildRoom3DSnapshot<TCandidate extends CandidateLike>({
  fixtureCandidates,
  hiddenWallCount,
  landlordFurnitures,
  openingCandidates,
  walls3D
}: RoomPayloadBaseInput<TCandidate> & { hiddenWallCount: number }) {
  return {
    fixtures: fixtureCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
    furnitures: [...landlordFurnitures],
    hiddenWallCount,
    openings: openingCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
    walls: [...walls3D],
    wallCount: walls3D.length
  };
}

export function buildFloorPlanDraftPayload<TCandidate extends CandidateLike, TMeta extends object>({
  extractionMeta,
  fixtureCandidates,
  hiddenWallCount,
  hiddenWallIds,
  landlordFurnitures,
  openingCandidates,
  pixelToMmRatio,
  scaleConfirmed,
  status,
  uploadedFloorPlanSource,
  uploadedImage,
  walls,
  walls3D
}: RoomPayloadBaseInput<TCandidate> &
  HiddenWallIdsInput & {
    extractionMeta: TMeta;
    hiddenWallCount: number;
    pixelToMmRatio: number;
    scaleConfirmed: boolean;
    status: DraftStatus;
    uploadedFloorPlanSource?: UploadedSourceLike | null;
    uploadedImage?: string | null;
    walls: readonly Wall[];
  }) {
  const room3d = buildRoom3DSnapshot({
    fixtureCandidates,
    hiddenWallCount,
    landlordFurnitures,
    openingCandidates,
    walls3D
  });
  const nextExtractionMeta = { ...extractionMeta, scaleConfirmed };

  return {
    extractionMeta: nextExtractionMeta,
    fixtures: [...fixtureCandidates],
    furnitures: [...landlordFurnitures],
    hiddenWallIds: Array.from(hiddenWallIds),
    openings: [...openingCandidates],
    pixelToMmRatio,
    room3d,
    sourceAttachmentId: uploadedFloorPlanSource?.attachmentId,
    sourceImageUrl: uploadedFloorPlanSource?.imageUrl ?? uploadedImage ?? undefined,
    status,
    walls: [...walls]
  };
}

export function buildFloorPlanLocalSnapshot<TCandidate extends CandidateLike, TMeta extends object>({
  extractionMeta,
  fixtureCandidates,
  hiddenWallIds,
  landlordFurnitures,
  openingCandidates,
  pixelToMmRatio,
  timestamp,
  walls,
  walls3D
}: RoomPayloadBaseInput<TCandidate> &
  HiddenWallIdsInput & {
    extractionMeta: TMeta;
    pixelToMmRatio: number;
    timestamp: number;
    walls: readonly Wall[];
  }) {
  return {
    extractionMeta,
    fixtures: [...fixtureCandidates],
    furnitures: [...landlordFurnitures],
    hiddenWallIds: Array.from(hiddenWallIds),
    openings: [...openingCandidates],
    pixelToMmRatio,
    room3d: {
      fixtures: fixtureCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
      furnitures: [...landlordFurnitures],
      openings: openingCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
      walls: [...walls3D]
    },
    timestamp,
    walls: [...walls]
  };
}

export function buildResidentDesignPayload<TCandidate extends CandidateLike>({
  fixtureCandidates,
  floorPlanDraftId,
  hiddenWallIds,
  landlordOptionFurnitures,
  openingCandidates,
  pixelToMmRatio,
  residentDesignFurnitures,
  savedAt,
  walls,
  walls3D
}: HiddenWallIdsInput & {
  fixtureCandidates: readonly TCandidate[];
  floorPlanDraftId: string | null;
  landlordOptionFurnitures: readonly PlacedFurniture[];
  openingCandidates: readonly TCandidate[];
  pixelToMmRatio: number;
  residentDesignFurnitures: readonly PlacedFurniture[];
  savedAt: number;
  walls: readonly Wall[];
  walls3D: readonly WheretoputWall3D[];
}) {
  return {
    fixtures: fixtureCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
    furnitures: [...residentDesignFurnitures],
    hiddenWallIds: Array.from(hiddenWallIds),
    lockedFurnitures: [...landlordOptionFurnitures],
    mode: "resident",
    openings: openingCandidates.filter((candidate) => candidate.status === "CONFIRMED"),
    pixelToMmRatio,
    room3d: { walls: [...walls3D] },
    savedAt,
    sourceFloorPlanDraftId: floorPlanDraftId,
    walls: [...walls]
  };
}
