// @roomlog/types — 임차인 가구 배치 시뮬레이션(트랙 C) 계약.
// 임차인이 자기 가구(RoomPlan 스캔·직접입력·나중에 Object Capture 메시)를 이사갈 방(splat)에
// 넣어보는 도구. 설계: docs/tenant-furniture-fit.md.
//
// 이름 규약: 도메인 접두어 없이 Furniture*/TenantFurniture* — 기존 PlacedFurniture(도면 에디터
// 카탈로그 배치)와 구분한다. TenantFurniture는 "임차인 계정 소유 인벤토리"다.

/** 가구가 어디서 왔나. */
export type TenantFurnitureSource = "roomplan" | "object-capture" | "manual" | "catalog";

/**
 * 가구 카테고리 — 애플 RoomPlan CapturedRoom.Object.Category에 정렬(우리 enum으로 매핑해 저장).
 * unknown은 미분류/폴백. 서버가 RoomPlan 원시 라벨을 이 집합으로 매핑한다(mapRoomPlanCategory).
 */
export type TenantFurnitureCategory =
  | "bed"
  | "sofa"
  | "chair"
  | "table"
  | "storage"
  | "refrigerator"
  | "washerDryer"
  | "stove"
  | "oven"
  | "dishwasher"
  | "television"
  | "sink"
  | "toilet"
  | "bathtub"
  | "fireplace"
  | "stairs"
  | "unknown";

/** 실치수(밀리미터) — collision.ts의 sizeMm 규약과 동일 단위. */
export interface FurnitureDimensionsMm {
  width: number;
  depth: number;
  height: number;
}

/** 임차인 계정 소유 가구 한 점(여러 매물에서 재사용). */
export interface TenantFurniture {
  id: string;
  ownerTenantId: string;
  category: TenantFurnitureCategory;
  /** 사용자 편집 가능한 라벨(없으면 category 기반 표시). */
  label: string | null;
  sizeMm: FurnitureDimensionsMm;
  source: TenantFurnitureSource;
  /** Object Capture 산출 GLB URL(C-2, 없으면 회색 박스로 렌더). */
  meshUrl: string | null;
  createdAt: string;
}

// ─── iOS(RoomPlan) → 서버 import 페이로드 ──────────────────────────────────
// 앱이 RoomCaptureSession 결과(CapturedRoom.objects)에서 카테고리+치수만 뽑아 올린다.
// 현재 방에서의 배치(transform)는 대상 방과 무관하므로 보내지 않는다(품목만 추출).

export interface RoomPlanImportObject {
  /** RoomPlan CapturedRoom.Object.Category의 rawValue 문자열(서버가 매핑). */
  category: string;
  confidence?: "high" | "medium" | "low";
  /** 미터 단위 바운딩 치수(simd_float3 dimensions). */
  dimensions: { w: number; d: number; h: number };
}

export interface RoomPlanImportPayload {
  source: "roomplan";
  /** ISO8601. 선택. */
  capturedAt?: string;
  objects: RoomPlanImportObject[];
}

// ─── 배치안(대상 매물 방에 임차인 가구를 놓은 레이아웃) ─────────────────────
// 미터 프레임 = 그 매물 splat의 정합 프레임(도면 좌표). x/z 평면 배치.

export interface TenantFurniturePlacementItem {
  furnitureId: string;
  /** 방 프레임 미터 좌표(x, z). */
  position: [number, number];
  /** yaw(라디안). */
  rotation: number;
}

export interface TenantFurniturePlacement {
  id: string;
  tenantId: string;
  listingId: string;
  items: TenantFurniturePlacementItem[];
  updatedAt: string;
}
