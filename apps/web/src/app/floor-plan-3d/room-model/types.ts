// room-model 계약 타입 — 세 영역(plan-extraction / room-model / room-scene)이 공유하는 핵심 도메인 타입.
// 이 파일의 타입을 바꾸면 세 영역 모두에 영향이 가므로, 변경 전 팀 공유가 필요하다.

export type Point = { x: number; y: number };

export type Wall = { id: string | number; start: Point; end: Point };

export type WallSummary = { wallCount: number; approximateMeters: number; status: "초안" | "편집중" };

export type ExperienceMode = "landlord" | "resident";

export type ProjectedPoint = { x: number; y: number };

export type WallPanel3D = {
  id: string;
  height: number;
  depth: number;
  path: string;
  topLine: { start: ProjectedPoint; end: ProjectedPoint };
};

export type WallBox3D = {
  id: string;
  height: number;
  depth: number;
  frontPath: string;
  topPath: string;
  startCapPath: string;
  endCapPath: string;
  sortY: number;
  topLine: { start: ProjectedPoint; end: ProjectedPoint };
};

export type ConvertedFloorPlan3D = {
  wallPanels: WallPanel3D[];
  wallBoxes: WallBox3D[];
  floor: { path: string };
};

export type WheretoputSimulatorWall = {
  id: string;
  wall_id: string;
  start: Point;
  end: Point;
  length: number;
  height: number;
  depth: number;
  position: [number, number, number];
  rotation: [number, number, number];
  dimensions: { width: number; height: number; depth: number };
  wall_order: number | null;
};

export type WheretoputWall3D = {
  dimensions: { width: number; height: number; depth: number };
  id: string;
  material?: "wall";
  original2D?: Wall;
  position: [number, number, number];
  rotation: [number, number, number];
  wall_id: string | number;
};

export type RegisteredPlanMetadata = {
  name?: string;
  width?: number;
  height?: number;
};

export type FurnitureCatalogItem = {
  brand: string;
  category?: string;
  color: string;
  furniture_id: string;
  imageUrls?: string[];
  length: [number, number, number];
  modelUrl?: string;
  name: string;
  price: number;
  source?: string;
  sourceUrl?: string;
  thumbnailUrl?: string;
};

export type PlacedFurniture = FurnitureCatalogItem & {
  editableBy?: ["LANDLORD"];
  furnitureId?: string;
  id: string;
  includedInLease?: boolean;
  locked?: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  sizeMm?: { depth: number; height?: number; width: number };
  source?: "LANDLORD_OPTION" | "RESIDENT_DESIGN" | string;
  visibleToTenant?: boolean;
};
