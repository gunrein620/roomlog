// splat-pipeline — 매물 업로드 → GPU 재구성 → spz 게시 파이프라인 계약 (web·api 공용)
// 상태 의미는 prisma SplatAssetStatus / SplatReconstructionJobState enum과 1:1.

import type { RoomPlanCaptureFloorPlan } from "./roomplan-capture";

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

// ── S3 직접 업로드(presigned PUT) 계약 — docs/splat-direct-upload.md ──
// 대용량 소스(영상/캡처 zip)가 api 힙을 통과하지 않도록 브라우저가 S3로 직행한다.
// 서버는 presign(서명 발급)과 complete(HEAD 검증 + 자산 생성)만 담당한다.
// 한도: 직접 업로드 2GB(sizeBytes int4 범위) / 멀티파트 폴백 800MB(서버 힙 버퍼링 경로).

/** 매물 3D 투어 소스 직접 업로드 — presign 요청. */
export interface SplatIntakePresignRequest {
  listingId: string;
  fileName: string;
  sizeBytes: number;
  mimeType?: string;
}

/** presign 응답. multipart = S3 비활성 환경 — 기존 멀티파트 intake로 폴백하라는 신호. */
export type SplatIntakePresignResponse =
  | { mode: "multipart" }
  | {
      mode: "direct";
      /** presigned PUT URL — 이 URL로 파일 본체를 PUT (쿠키 미동봉, cross-origin) */
      uploadUrl: string;
      /** S3 object key — complete 호출에 그대로 전달 */
      key: string;
      /** PUT 요청에 반드시 실어야 하는 헤더 (서명에 포함됨) */
      headers: Record<string, string>;
      expiresAt: string;
    };

/** 직접 업로드 완료 통보 — 응답은 기존 intake와 동일한 SplatAsset. */
export interface SplatIntakeCompleteRequest {
  listingId: string;
  key: string;
  title?: string;
  address?: string;
  /** RoomPlan(iOS) 캡처 도면 메타데이터(roomplan.json) — 있으면 SplatAsset에 저장되고
   *  auto-register-preview가 그 자산의 자동정합 입력으로 읽는다(요청 body override는 fallback용). */
  captureFloorPlan?: RoomPlanCaptureFloorPlan;
}
