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
  /** RoomPlan 한 번의 스캔으로 생성된 행을 함께 되돌리기 위한 배치 ID. 그 외 출처는 null. */
  importBatchId: string | null;
  category: TenantFurnitureCategory;
  /** 사용자 편집 가능한 라벨(없으면 category 기반 표시). */
  label: string | null;
  sizeMm: FurnitureDimensionsMm;
  source: TenantFurnitureSource;
  /** Object Capture 산출 GLB URL(C-2, 없으면 회색 박스로 렌더). */
  meshUrl: string | null;
  /** 업로드된 원본 USDZ(S3) URL — 변환 전/실패 상태에서도 원본을 참조할 수 있게 남긴다. */
  usdzUrl: string | null;
  /** USDZ→GLB 변환 진행 상태. null = 변환 파이프라인 무관(roomplan/manual/catalog 등). */
  meshJobState: TenantFurnitureMeshJobState | null;
  /** 정사각 썸네일 이미지 URL. 없으면 카테고리 아이콘으로 폴백. */
  thumbnailUrl: string | null;
  createdAt: string;
}

// ─── Object Capture(iOS) → S3 직접 업로드 (C-2) ────────────────────────────
// 대용량 USDZ(수십 MB)가 api 힙을 통과하지 않도록 splat-pipeline의 presigned PUT과 동일 패턴을 쓴다.
// 서버는 presign(서명 발급)과 complete(메타데이터 기록 + 변환 큐잉)만 담당한다.
// 실제 USDZ→GLB 변환은 GPU 박스에서 별도로 수행 — 서버는 잡 상태만 들고 콜백을 받는다.

/** USDZ→GLB 변환 잡 상태 — TenantFurniture.meshJobState. */
export type TenantFurnitureMeshJobState =
  | "CONVERTING" // USDZ 접수됨, GPU 변환 대기/진행
  | "DONE" // GLB 콜백 수신, meshUrl 채워짐
  | "FAILED"; // 변환 실패 — meshUrl은 이전 상태 유지(있었다면)

/**
 * Object Capture USDZ 업로드 — presign 요청. furnitureId가 있으면 기존 가구(예: roomplan/manual로
 * 만든 항목)의 메시를 업그레이드하는 것이고, 없으면 이 업로드로 새 가구를 만든다(complete가 생성).
 */
export interface ObjectCapturePresignRequest {
  furnitureId?: string;
  fileName: string;
  sizeBytes: number;
  mimeType?: string;
}

/** presign 응답 — splat-pipeline.SplatIntakePresignResponse와 동일 shape(direct|multipart). */
export type ObjectCapturePresignResponse =
  | { mode: "multipart" }
  | {
      mode: "direct";
      /** presigned PUT URL — 이 URL로 USDZ 본체를 PUT (쿠키 미동봉, cross-origin) */
      uploadUrl: string;
      /** S3 object key — complete 호출에 그대로 전달 */
      key: string;
      /** PUT 요청에 반드시 실어야 하는 헤더 (서명에 포함됨) */
      headers: Record<string, string>;
      expiresAt: string;
    };

/** 업로드 완료 통보 — USDZ가 S3에 있음을 알리고 변환을 큐잉한다. */
export interface ObjectCaptureCompleteRequest {
  furnitureId?: string;
  key: string;
  /** furnitureId 없이 새로 만들 때만 쓴다 — 미지정이면 unknown(추후 사용자가 수정). */
  category?: TenantFurnitureCategory;
  label?: string;
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
