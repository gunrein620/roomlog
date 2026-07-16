// splat-pipeline — 매물 업로드 → GPU 재구성 → spz 게시 파이프라인 계약 (web·api 공용)
// 상태 의미는 prisma SplatAssetStatus / SplatReconstructionJobState enum과 1:1.

/** intake로 접수되는 원본 소스 종류. record3d-zip = 캡처앱 export(rgb/ + depth/ + metadata.json). */
export type SplatSourceKind = "video" | "record3d-zip";

/** GPU 재구성 잡 상태 — SplatAsset.jobState. null(필드 부재) = 파이프라인 무관 자산(직접 spz 업로드). */
export type SplatReconstructionJobState =
  | "QUEUED" // 접수됨, GPU 배정 대기
  | "GPU_STARTING" // 인스턴스 기동/SSM 온라인 대기
  | "RUNNING" // 재구성 실행 중 (jobCommandId로 추적)
  | "DONE" // spz 콜백 수신, 자산 UPLOADED로 승격됨
  | "FAILED"; // 재시도 소진 — jobError에 사유

/** SplatAsset.status — 자산 수명주기 (기존 prisma enum과 동일, 웹 공용으로 승격). */
export type SplatAssetStatus = "PROCESSING" | "UPLOADED" | "REGISTERED" | "FAILED";

/** RealtimeGateway 이벤트명 — 페이로드는 최소 식별자만, 클라이언트는 REST 재조회 원칙. */
export const SPLAT_ASSET_UPDATED_EVENT = "splat:asset-updated";

export interface SplatAssetUpdatedPayload {
  assetId: string;
  listingId: string | null;
  status: SplatAssetStatus;
}
